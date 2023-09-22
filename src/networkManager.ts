import axios from "axios";
import { Chain } from "@chain-registry/types";
import { Network } from "./blocksWatcher";
import { defaultRegistryUrls, isFulfilled } from "./constants";
import { chains } from "chain-registry";
import { IndexerClient } from "./indexerClient";
import { UnknownChainErr } from "./errors";

export class NetworkManager {
    protected readonly minRequestsToTest: number = 20;
    readonly network: string = "";
    protected clients: IndexerClient[] = [];

    protected constructor(network: string, clients: IndexerClient[]) {
        this.network = network;

        if (clients.length === 0)
            console.log("No rpcs found");

        this.clients = clients;
    }

    static async create(
        network: Network,
        addChainRegistryRpcs: boolean = false,
        syncWindow: number = 0
    ): Promise<NetworkManager> {
        console.log(`Initializing ${network.name} RPCs:`);
        console.group();
        let registryRpcUrls: string[] = [];
        let customRpcUrls = network.rpcUrls || [];
        let onlyIndexingRpcs = network.dataToFetch === "INDEXED_TXS";
        if (addChainRegistryRpcs) {
            console.log(`Searching RPCs for ${network.name} in chain registry...`);
            let { rpc } = await this.getChainRpcs(network.name);
            registryRpcUrls = rpc;
        }

        console.log(`Filtering chain registry ${network.name} RPCs...`);
        registryRpcUrls = await this.filterRpcs(registryRpcUrls, network.fromBlock, onlyIndexingRpcs, syncWindow);
        customRpcUrls = await this.filterRpcs(customRpcUrls, network.fromBlock, onlyIndexingRpcs, syncWindow)

        console.log("Connecting to RPCs...");
        let registryRpcClients = await this.getClients(registryRpcUrls, false);
        let customRpcClients = await this.getClients(customRpcUrls, true);
        console.groupEnd();
        return new NetworkManager(network.name, registryRpcClients.concat(customRpcClients));
    }

    static async filterRpcs(
        urls: string[],
        fromBlock?: number,
        onlyIndexingRpcs?: boolean,
        syncWindow?: number //difference between latest block and now, in milliseconds
    ): Promise<string[]> {
        let result = await Promise.allSettled(urls.map(async (url) => {
            let response;
            try {
                response = await axios({
                    method: "GET",
                    url: `${url}/status`,
                    timeout: 5000
                });
            } catch (_) { return Promise.reject(`${url} is dead`); }

            if (!response || response.status !== 200)
                return Promise.reject(`${url} returned ${response.status} code`);

            let nodeEarliestBlock = Number(response?.data?.result?.sync_info?.earliest_block_height);
            if (!nodeEarliestBlock)
                return Promise.reject(`${url} returned incorrent status`);

            let indexingDisabled = response?.data?.result?.node_info?.other?.tx_index === "off";
            if (onlyIndexingRpcs && indexingDisabled)
                return Promise.reject(`${url} indexing disabled`);

            if (fromBlock && fromBlock < nodeEarliestBlock)
                return Promise.reject(`${url} is alive, but does not have enough block history`);

            let nodeLatestBlockTime = Date.parse(response?.data?.result?.sync_info?.latest_block_time);
            if (syncWindow && syncWindow > 0 && (Date.now() - nodeLatestBlockTime > syncWindow))
                return Promise.reject(`${url} is alive, but has not fully synced`);

            return Promise.resolve(url);

        }));

        //result.forEach(rpc => console.log(isFulfilled(rpc) ? rpc.value + " is alive" : rpc.reason));
        return result.filter(isFulfilled).map(x => x.value!);
    }

    public static async getChainRpcs(chain: string) {
        let chainInfo = await this.getChainInfo(chain);

        return {
            rpc: chainInfo.apis?.rpc?.map(x => x.address)!,
            rest: chainInfo.apis?.rest?.map(x => x.address)!
        };
    }

    getClients(ranked?: boolean): IndexerClient[] {
        let customRpcExists = this.clients.filter(x => x.priority).length > 0;
        if (customRpcExists && ranked === undefined)
            return this.getUnrankedClients();

        if (ranked !== undefined)
            return ranked ? this.getRankedClients() : this.getUnrankedClients();

        return this.getRankedClients();
    }

    private getUnrankedClients(): IndexerClient[] {
        return this.clients.sort((a) => a.priority ? -1 : 1);
    }

    private getRankedClients(): IndexerClient[] {
        let result = this.clients
            .sort((a, b) => a.ok + a.fail > b.ok + b.fail ? 1 : -1);

        let minRequests =
            result.reduce((prev, cur) =>
                prev > cur.ok + cur.fail ? cur.ok + cur.fail : prev, Number.POSITIVE_INFINITY);

        if (minRequests < this.minRequestsToTest)
            return result;

        return result.sort((a, b) => {
            if (a.priority)
                return -1;

            if (a.ok / a.fail <= 1)
                return 1;

            if (b.ok / b.fail <= 1)
                return -1;

            return (a.ok / (a.fail || 1)) > (b.ok / (b.fail || 1)) ? 1 : 0;
        });
    }

    private static async getClients(rpcs: string[], priority: boolean): Promise<IndexerClient[]> {
        let clients = await Promise.allSettled(
            rpcs.map(async (rpcUrl) => {
                try {
                    return await IndexerClient.createIndexer({ rpcUrl, priority });
                } catch {
                    return Promise.reject();
                }
            })
        );

        return clients.filter(isFulfilled).map(x => x.value);
    }

    private static async getChainInfo(chain: string) {
        for (let url of defaultRegistryUrls) {
            try {
                let response = await axios.get<Chain>(
                    `${url}/${chain}/chain.json`,
                    { timeout: 2000 }
                );

                return response.data;
            }
            catch (err: any) { console.warn(`fetchChainsData: ${err?.message}`) }
        }

        let result = chains.find(x => x.chain_name === chain);
        if (!result)
            throw new UnknownChainErr(`fetchChainsData: unknown chain ${chain}`)

        return result;
    }
}