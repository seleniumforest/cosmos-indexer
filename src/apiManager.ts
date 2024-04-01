import { NetworkManager } from "./networkManager";
import { INTERVALS, awaitWithTimeout, isFulfilled, logger } from "./helpers";
import { Network } from "./blocksWatcher";
import { Block, IndexedTx } from "@cosmjs/stargate";
import { IndexerStorage } from "./storage";
import { StatusResponse, connectComet } from "@cosmjs/tendermint-rpc";

export class ApiManager {
    protected readonly manager: NetworkManager;
    protected readonly storage: IndexerStorage;

    protected constructor(manager: NetworkManager, storage: IndexerStorage) {
        this.manager = manager;
        this.storage = storage;
    }

    static async createApiManager(
        network: Network,
        storage: IndexerStorage,
        useChainRegistryRpcs: boolean = false
    ) {
        let networkManager = await NetworkManager.create(network, useChainRegistryRpcs);
        return new ApiManager(networkManager, storage);
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

    async fetchBlock(height: number): Promise<Block> {
        let cached = await this.storage.getBlockByHeight(height);
        if (cached) return cached;

        let clients = this.manager.getClients(true);
        let response;
        for (const client of clients) {
            try {
                response = await awaitWithTimeout(client.getBlock(height), INTERVALS.second * 10);
                break;
            } catch (err: any) {
                let msg = `Error fetching block header on height ${height} in ${this.manager.network.name} rpc ${client.rpcUrl} error : ${err}`;
                logger.warn(new Error(msg));
            }
        };

        if (!response) {
            let message = `Couldn't get latest block header ${height} for network ${this.manager.network.name} with endpoints set}`;
            logger.error(message, clients.map(x => x.rpcUrl))
            return Promise.reject();
        }

        await this.storage.saveBlock(response);

        return response;
    }

    async fetchIndexedTxs(height: number): Promise<readonly IndexedTx[]> {
        let cached = await this.storage.getTxsByHeight(height);
        if (cached) return cached;

        let clients = this.manager.getClients(true);
        let response;
        for (const client of clients) {
            try {
                response = await awaitWithTimeout(client.searchTx(`tx.height=${height}`), INTERVALS.second * 10);
                break;
            } catch (err: any) {
                let msg = `Error fetching indexed txs on height ${height} in ${this.manager.network.name} rpc ${client.rpcUrl} error:`;
                logger.warn(msg, err);
            }
        }

        if (!response) {
            let message = `Couldn't get latest block header ${height} for network ${this.manager.network.name} with endpoints set}`;
            logger.error(message, clients.map(x => x.rpcUrl))
            return Promise.reject();
        }

        await this.storage.saveTxs(response, height)
        return response;
    }
}