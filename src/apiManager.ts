import { NetworkManager } from "./networkManager";
import { INTERVALS, awaitWithTimeout, isFulfilled, logger } from "./helpers";
import { BlockWithDecodedTxs, BlocksWatcherNetwork } from "./blocksWatcher";
import { IndexedTx, SearchTxQuery } from "@cosmjs/stargate";
import { IndexerStorage } from "./storage";
import { StatusResponse, connectComet } from "@cosmjs/tendermint-rpc";
import { DecodedTxRaw, decodeTxRaw } from "@cosmjs/proto-signing";

export class ApiManager {
    protected readonly manager: NetworkManager;
    protected readonly storage: IndexerStorage;
    protected readonly retryCounts: number;

    protected constructor(manager: NetworkManager, storage: IndexerStorage, retryCounts?: number) {
        this.retryCounts = retryCounts || 3;
        this.manager = manager;
        this.storage = storage;
    }

    static async createApiManager(
        network: BlocksWatcherNetwork,
        storage: IndexerStorage,
        useChainRegistryRpcs: boolean = false,
        retryCounts?: number
    ) {
        let networkManager = await NetworkManager.create(network, useChainRegistryRpcs);
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

        let result: BlockWithDecodedTxs = {
            type: "RAW_TXS",
            header: response.header,
            id: response.id,
            rawTxs: response.txs.map(tx => {
                let decoded = decodeTxRaw(tx);
                if (!this.storage.options.trimIbcProofs)
                    return decoded;

                return this.trimIbcProofsDecodedTx(decoded);
            })
        }

        await this.storage.saveBlock(result);
        return result;
    }

    async fetchIndexedTxs(height: number, chainId: string): Promise<IndexedTx[]> {
        let cached = await this.storage.getTxsByHeight(height)
        if (cached && cached)
            return cached;

        //keep 60s for fat blocks
        let response = await this.fetchTxsWithTimeout(`tx.height=${height}`, INTERVALS.second * 60);

        if (this.storage.options.trimIbcProofs)
            response = await this.trimIbcProofs(response);

        await this.storage.saveTxs(response, height, chainId);
        return response;
    }

    async fetchSearchTxs(query: SearchTxQuery) {
        return await this.fetchTxsWithTimeout(query, INTERVALS.second * 30);
    }

    private trimIbcProofsDecodedTx(tx: DecodedTxRaw): DecodedTxRaw {
        return {
            ...tx,
            body: {
                ...tx.body,
                messages: tx.body.messages.map(msg => {
                    return {
                        typeUrl: msg.typeUrl,
                        value: msg.typeUrl.includes("MsgUpdateClient") || msg.typeUrl.includes("MsgSubmitQueryResponse") ?
                            Uint8Array.from([]) :
                            msg.value
                    }
                })
            }
        }
    }

    private async trimIbcProofs(txs: IndexedTx[]): Promise<IndexedTx[]> {
        return txs
            .map(tx => ({
                tx: tx,
                decoded: decodeTxRaw(tx.tx)
            }))
            //remove IBC signatures, they're too fat and have no useful info
            .map(({ tx, decoded: d }) => ({
                tx: {
                    ...tx,
                    events: tx.events.map(ev => ({
                        ...ev,
                        attributes: ev.attributes.map(a => ({
                            key: a.key,
                            value: a.key === "header" && ev.type === "update_client" && d.body.messages.some(x => x.typeUrl.includes("MsgUpdateClient")) ?
                                "" :
                                a.value
                        }))
                    })),
                    rawLog: Array.isArray(tx.events) && tx.events.length > 0 ? "" : tx.rawLog
                },
                decoded: d
            }))
            //remove ICQ relay tx bodys, they're too fat
            .map(({ tx, decoded: d }) => {
                let isIcqTx =
                    d.body.messages.some(x => x.typeUrl.includes("MsgUpdateClient")) &&
                    d.body.messages.some(x => x.typeUrl.includes("MsgSubmitQueryResponse")) &&
                    d.body.messages.length === 2;

                return {
                    ...tx,
                    tx: isIcqTx ? Uint8Array.from([]) : tx.tx
                }
            })
    }

    private async fetchTxsWithTimeout(query: SearchTxQuery, timeout = INTERVALS.second * 10) {
        let clients = this.manager.getClients(true);
        let retryCount = 0;

        while (retryCount <= this.retryCounts) {
            retryCount++;

            for (const client of clients) {
                try {
                    return await awaitWithTimeout(client.searchTx(query), timeout);
                } catch (err: any) {
                    let msg = `Failed searching txs with query ${query} in ${this.manager.network.name} rpc ${client.rpcUrl} error:`;
                    logger.warn(msg, err);
                }
            }
        }

        let message = `Couldn't get transactions with query ${query} for network ${this.manager.network.name} with endpoints set`;
        logger.error(message, clients.map(x => x.rpcUrl))
        return Promise.reject();
    }
}