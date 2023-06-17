import axios from "axios";
import { Chain } from "@chain-registry/types";
import { Network } from "./blocksWatcher";
import { defaultRegistryUrls, isFulfilled } from "./constants";
import { chains } from "chain-registry";
import { Block, StargateClient } from "@cosmjs/stargate";
import { Tendermint34Client } from "@cosmjs/tendermint-rpc";
import { IndexerClient } from "./indexerClient";

export class NetworkManager {
    readonly minRequestsToTest: number = 20;
    readonly network: string = "";
    clients: IndexerClient[] = [];

    private constructor(network: string, clients: IndexerClient[]) {
        this.network = network;
        this.clients = clients;
    }

    static async create(
        network: Network,
        registryUrls: string[] = defaultRegistryUrls,
        addChainRegistryRpcs: boolean = false
    ): Promise<NetworkManager> {
        let registryRpcUrls: string[] = [];
        let customRpcUrls = network.rpcUrls || [];
        if (addChainRegistryRpcs) {
            let response = await this.fetchChainsData(registryUrls, network.name);
            registryRpcUrls = response?.apis?.rpc?.map(x => x.address)!
        }

        registryRpcUrls = await this.filterRpcs(registryRpcUrls, network.fromBlock);
        customRpcUrls = await this.filterRpcs(customRpcUrls, network.fromBlock)

        let registryRpcClients = await this.getClients(registryRpcUrls, false);
        let customRpcClients = await this.getClients(customRpcUrls, true);

        return new NetworkManager(network.name, registryRpcClients.concat(customRpcClients));
    }

    static async getClients(rpcs: string[], priority: boolean): Promise<IndexerClient[]> {
        let clients = await Promise.allSettled(
            rpcs.map(async (rpcUrl) => {
                try {
                    return await IndexerClient.create({ rpcUrl, priority });
                } catch {
                    return Promise.reject();
                }
            })
        );

        return clients.filter(isFulfilled).map(x => x.value);
    }

    static async filterRpcs(urls: string[], fromBlock?: number): Promise<string[]> {
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

            if (fromBlock && fromBlock < nodeEarliestBlock)
                return Promise.reject(`${url} is alive, but does not have enough block history`);

            return Promise.resolve(url);
        }));

        //result.forEach(rpc => console.log(isFulfilled(rpc) ? rpc.value + " is alive" : rpc.reason));
        return result.filter(isFulfilled).map(x => x.value!);
    }

    static async fetchChainsData(registryUrls: string[], chain: string): Promise<Chain> {
        for (let url of registryUrls) {
            try {
                let response = await axios.get<Chain>(
                    `${url}/${chain}/chain.json`, { timeout: 10000 }
                )

                return response.data;
            }
            catch (err: any) { console.warn(`fetchChainsData: ${err?.message}`) }
        }

        let result = chains.find(x => x.chain_name === chain);
        if (!result)
            throw Error(`fetchChainsData: unknown chain ${chain}`)

        return result;
    }

    getClients(): IndexerClient[] {
        let result = this.clients
            .sort((a, b) => a.ok + a.fail > b.ok + b.fail ? 1 : -1);

        let minRequests =
            result.reduce((prev, cur) =>
                prev > cur.ok + cur.fail ? cur.ok + cur.fail : prev, Number.POSITIVE_INFINITY);

        if (minRequests < this.minRequestsToTest)
            return result
        //.sort((a, _) => a.priority ? -1 : 1)

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
}