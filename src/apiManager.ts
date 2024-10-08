import { NetworkManager } from "./networkManager";
import { INTERVALS, awaitWithTimeout, isFulfilled, logger, waitFor } from "./helpers";
import { BlockWithDecodedTxs, BlocksWatcherNetwork } from "./blocksWatcher";
import { SearchTxQuery } from "@cosmjs/stargate";
import { IndexerStorage } from "./storage";
import { BlockResultsResponse, StatusResponse, connectComet } from "@cosmjs/tendermint-rpc";
import { decodeAndTrimBlock, trimBlockResults } from "./decoder";

export class ApiManager {
    protected readonly retryCounts: number;

    protected constructor(
        public manager: NetworkManager,
        private storage: IndexerStorage,
        retryCounts?: number) {
        this.retryCounts = retryCounts || 3;
    }

    static async createApiManager(
        network: BlocksWatcherNetwork,
        storage: IndexerStorage,
        useChainRegistryRpcs: boolean = false,
        retryCounts?: number
    ) {
        let networkManager = await NetworkManager.create(network, useChainRegistryRpcs, undefined, 2, storage.options.enabled);
        return new ApiManager(networkManager, storage, retryCounts);
    }

    async watchLatestHeight(onHeightRecieve: (status: StatusResponse) => Promise<void>) {
        let handlers = this.manager.getClients().map(async client => {
            let tmClient = await connectComet(client.rpcUrl);

            while (true) {
                try {
                    let status = await tmClient.status();
                    await onHeightRecieve(status);
                } catch { }

                await new Promise(res => setTimeout(res, INTERVALS.second));
            }
        })

        await Promise.allSettled(handlers);
    }

    async fetchLatestHeight(lastKnownHeight: number = 0): Promise<number> {
        let clients = this.manager.getClients();

        if (clients.length === 0 && this.storage.options.enabled) {
            let h = await this.storage.latestSavedHeight() || 1;
            return h;
        }

        let results = await Promise.allSettled(
            clients.map(client => awaitWithTimeout(client.getHeight(), INTERVALS.second * 10))
        );

        let success = results.filter(isFulfilled).map(x => x.value) as number[];
        let result = Math.max(...success, lastKnownHeight);

        if (lastKnownHeight > 0 && result === 0) {
            let message = `Couldn't get latest height for network ${this.manager.network.name} with endpoints set`;
            logger.error(message, clients.map(x => x.rpcUrl));
            return Promise.reject();
        }

        return result;
    }

    async fetchBlock(height: number): Promise<BlockWithDecodedTxs> {
        let cached = await this.storage.getBlockByHeight(height);
        if (cached) return cached;

        let clients = this.manager.getClients(true);
        let response;
        let retryCount = 0;

        while (retryCount <= this.retryCounts) {
            retryCount++;

            for (const client of clients) {
                try {
                    response = await awaitWithTimeout(client.getBlock(height), INTERVALS.second * 15);
                    break;
                } catch (err: any) {
                    let msg = `Error fetching block header on height ${height} in ${this.manager.network.name} rpc ${client.rpcUrl} error : ${err}`;
                    logger.warn(new Error(msg));
                }
            };
        }

        if (!response) {
            let message = `Couldn't get latest block header ${height} for network ${this.manager.network.name} with endpoints set}`;
            logger.error(message, clients.map(x => x.rpcUrl))
            return Promise.reject();
        }

        let trimmed = decodeAndTrimBlock(response, this.storage.options.trimIbcProofs || false);

        await this.storage.saveBlock(trimmed);
        return trimmed;
    }

    async fetchBlockResults(height: number, chainId: string): Promise<BlockResultsResponse> {
        let cached = await this.storage.getBlockResultByHeight(height)
        if (cached && cached)
            return cached;

        //keep 60s for fat blocks
        let response = await this.fetchBlockResultsWithTimeout(height, INTERVALS.minute);

        if (this.storage.options.trimIbcProofs)
            response = trimBlockResults(response);

        (response as any).beginBlockEvents = [];

        await this.storage.saveBlockResults(response, height, chainId);
        return response;
    }

    async fetchSearchTxs(query: SearchTxQuery) {
        return await this.fetchTxsWithTimeout(query, INTERVALS.second * 30);
    }

    private async fetchTxsWithTimeout(query: SearchTxQuery, timeout = INTERVALS.second * 10) {
        let clients = this.manager.getClients(true);
        let retryCount = 0;

        while (retryCount <= this.retryCounts) {
            retryCount++;

            for (const client of clients) {
                try {
                    let result = await awaitWithTimeout(client.searchTx(query), timeout);
                    return result;
                } catch (err: any) {
                    let msg = `Failed searching txs with query ${query} in ${this.manager.network.name} rpc ${client.rpcUrl} error:`;
                    logger.warn(msg, err);
                }
            }
        }

        let message = `Couldn't get transactions with query ${query} for network ${this.manager.network.name} with endpoints set`;
        logger.error(message, clients.map(x => x.rpcUrl))
        return Promise.reject(message);
    }

    private async fetchBlockResultsWithTimeout(height: number, timeout = INTERVALS.second * 10) {
        let clients = this.manager.getClients(true);
        let retryCount = 0;

        while (retryCount <= this.retryCounts) {
            retryCount++;

            for (const client of clients) {
                try {
                    let result = await awaitWithTimeout(client.getBlockResults(height), timeout);
                    return result;
                } catch (err: any) {
                    let msg = `Failed searching block results for height ${height} in ${this.manager.network.name} rpc ${client.rpcUrl} error:`;
                    logger.warn(msg, err);
                }
            }

            await waitFor(INTERVALS.second * 10)
        }

        let message = `Couldn't get block results for height ${height} for network ${this.manager.network.name} with endpoints set`;
        logger.error(message, clients.map(x => x.rpcUrl))
        return Promise.reject(message);
    }
}