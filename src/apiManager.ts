import { NetworkManager } from "./networkManager";
import { isFulfilled } from "./constants";
import { CantGetBlockHeaderErr, CantGetLatestHeightErr } from "./errors";
import { Network } from "./blocksWatcher";
import { Block, IndexedTx } from "@cosmjs/stargate";
import { IndexerStorage } from "./storage";

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
        console.log(`Network ${network.name} endpoint set ${networkManager.getClients().map(x => x.rpcUrl)}`)
        return new ApiManager(networkManager, storage);
    }

    async fetchLatestHeight(lastKnownHeight: number = 0): Promise<number> {
        let clients = this.manager.getClients();

        let results = await Promise.allSettled(
            clients.map(client => client.getHeight())
        );

        let success = results.filter(isFulfilled).map(x => x.value) as number[];
        let result = Math.max(...success, lastKnownHeight);

        if (lastKnownHeight > 0 && result === 0)
            throw new CantGetLatestHeightErr(this.manager.network, clients.map(x => x.rpcUrl));

        return result;
    }

    async fetchBlock(height: number): Promise<Block> {
        let cached = await this.storage.getBlockByHeight(height);
        if (cached) return cached;

        let clients = this.manager.getClients();
        let response;
        for (const client of clients) {
            try {
                response = await client.getBlock(height);
                break;
            } catch (err: any) {
                let msg = `Error fetching block header in ${this.manager.network} rpc ${client.rpcUrl} error : ${err?.message}`;
                console.warn(new Error(msg));
            }
        };

        if (!response)
            throw new CantGetBlockHeaderErr(this.manager.network, height, clients.map(x => x.rpcUrl));

        await this.storage.saveBlock(response);

        return response;
    }

    async fetchIndexedTxs(height: number): Promise<readonly IndexedTx[]> {
        let cached = await this.storage.getTxsByHeight(height);
        if (cached) return cached;

        let clients = this.manager.getClients();
        let response;
        for (const client of clients) {
            try {
                response = await client.searchTx(`tx.height=${height}`);
                break;
            } catch (err: any) {
                let msg = `Error fetching indexed txs in ${this.manager.network} rpc ${client.rpcUrl} error : ${err}`;
                console.log(new Error(msg));
            }
        }
        if (!response)
            throw new CantGetBlockHeaderErr(this.manager.network, height, clients.map(x => x.rpcUrl));

        await this.storage.saveTxs(response, height)

        return response;
    }
}