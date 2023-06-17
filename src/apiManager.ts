import { NetworkManager } from "./networkManager";
import { defaultRegistryUrls, isFulfilled } from "./constants";
import { CantGetBlockHeaderErr, CantGetLatestHeightErr } from "./errors";
import { Network } from "./blocksWatcher";
import { Block, IndexedTx } from "@cosmjs/stargate";

export class ApiManager {
    readonly manager: NetworkManager;

    private constructor(manager: NetworkManager) {
        this.manager = manager;
    }

    static async createApiManager(
        network: Network,
        registryUrls: string[] = defaultRegistryUrls,
        useChainRegistryRpcs: boolean = false
    ) {
        let networkManager = await NetworkManager.create(network, registryUrls, useChainRegistryRpcs);
        return new ApiManager(networkManager);
    }

    async fetchLatestHeight(lastKnownHeight: number = 0): Promise<number> {
        let clients = this.manager.getClients();

        let results = await Promise.allSettled(
            clients.map(async client => {
                return await client.getHeight()
            })        
        );

        let success = results.filter(isFulfilled).map(x => x.value) as number[];
        let result = Math.max(...success, lastKnownHeight);

        if (result === 0) {
            throw new CantGetLatestHeightErr(this.manager.network, clients.map(x => x.rpcUrl));
        }

        return result;
    }

    async fetchBlock(height: number): Promise<Block> {
        let clients = this.manager.getClients();

        for (const client of clients) {
            try {
                return await client.getBlock(height)
            } catch (err: any) {
                let msg = `Error fetching block header in ${this.manager.network} rpc ${client.rpcUrl} error : ${err?.message}`;
                console.log(new Error(msg));
            }
        }

        throw new CantGetBlockHeaderErr(this.manager.network, height, clients.map(x => x.rpcUrl));
    }

    async fetchIndexedTxs(height: number): Promise<readonly IndexedTx[]> {
        let clients = this.manager.getClients();

        for (const client of clients) {
            try {
                return await client.searchTx({ height })
            } catch (err: any) {
                let msg = `Error fetching indexed txs in ${this.manager.network} rpc ${client.rpcUrl} error : ${err?.message}`;
                console.log(new Error(msg));
            }
        }

        throw new CantGetBlockHeaderErr(this.manager.network, height, clients.map(x => x.rpcUrl));
    }
}