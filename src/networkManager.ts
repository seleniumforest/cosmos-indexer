import { Chain } from "@chain-registry/types";
import { Network } from "./blocksWatcher";
import { INTERVALS, awaitWithTimeout, isFulfilled, logger } from "./helpers";
import { chains } from "chain-registry";
import { IndexerClient } from "./indexerClient";
import { CometClient, connectComet } from "@cosmjs/tendermint-rpc";
import { StatusResponse } from "@cosmjs/tendermint-rpc/build/comet38";

export class NetworkManager {
    protected readonly minRequestsToTest: number = 20;
    static readonly chainInfoCache = new Map<string, { timestamp: number, chain: Chain }>();
    static readonly defaultSyncWindow = INTERVALS.second * 30; // 30s

    private constructor(
        public network: Network,
        private addChainRegistryRpcs: boolean = false,
        private syncWindow: number = NetworkManager.defaultSyncWindow,
        private clients: IndexerClient[],
        cachingEnabled: boolean
    ) {

        if (clients.length === 0) {
            if (cachingEnabled) {
                let msg = "No rpcs found, but mongo caching is enabled, will try to take data from cache";
                logger.warn(msg);
            } else {
                let msg = "No rpcs found";
                logger.error(msg);
                throw new Error(msg);
            }
        }

        setInterval(() => this.logStatus(), INTERVALS.hour);
        if (addChainRegistryRpcs) {
            setInterval(() => {
                this.refreshRpcStatus()
            }, INTERVALS.hour);
        }
    }

    /** @internal */
    static async create(
        network: Network,
        addChainRegistryRpcs: boolean = false,
        syncWindow: number = this.defaultSyncWindow,
        logLvl: 0 | 1 | 2 | 3 | 4 | 5 | 6 = 2,
        cachingEnabled: boolean = false
    ): Promise<NetworkManager> {
        logger.settings.minLevel = logLvl;
        let clients = await this.fetchClients(network, addChainRegistryRpcs, syncWindow);
        return new NetworkManager(network, addChainRegistryRpcs, syncWindow, clients, cachingEnabled);
    }

    static async fetchClients(
        network: Network,
        addChainRegistryRpcs: boolean = false,
        syncWindow: number = this.defaultSyncWindow
    ) {
        logger.trace(`Syncing ${network.name} RPCs:`);
        let registryRpcUrls: string[] = [];
        let customRpcUrls = network.rpcUrls || [];
        let onlyIndexingRpcs = network.dataToFetch === "INDEXED_TXS";
        if (addChainRegistryRpcs) {
            logger.trace(`Searching RPCs for ${network.name} in chain registry...`);
            let { rpc } = await this.getChainRpcs(network.name);
            registryRpcUrls = rpc;
            logger.trace(`Found ${rpc.length} rpcs for network ${network.name}`);
        }

        logger.trace(`Checking ${network.name} RPCs...`);
        registryRpcUrls = await this.filterRpcs(network, registryRpcUrls, onlyIndexingRpcs, syncWindow, true);
        customRpcUrls = await this.filterRpcs(network, customRpcUrls, onlyIndexingRpcs, syncWindow, true)

        let registryRpcClients = await this.getClients(registryRpcUrls, false);
        let customRpcClients = await this.getClients(customRpcUrls, true);

        return registryRpcClients.concat(customRpcClients);
    }

    static async filterRpcs(
        network: Network,
        urls: string[],
        onlyIndexingRpcs?: boolean,
        syncWindow?: number, //difference between latest block and now, in seconds
        logResults?: boolean
    ): Promise<string[]> {
        let handler = async (url: string) => {
            let status: StatusResponse;
            try {
                let client = await connectComet(url);
                status = await client.status();
                client.disconnect();
            } catch (err: any) {
                return Promise.reject(`${url} is dead : ${err}`);
            }

            let nodeEarliestBlock = status.syncInfo.earliestBlockHeight;
            if (!nodeEarliestBlock)
                return Promise.reject(`${url} : returned incorrent earliestBlockHeight`);

            let indexingDisabled = status.nodeInfo.other.get("tx_index") === "off";
            if (onlyIndexingRpcs && indexingDisabled)
                return Promise.reject(`${url} : indexing disabled`);

            if (network.fromBlock && network.fromBlock < nodeEarliestBlock)
                return Promise.reject(`${url} is alive, but does not have enough block history`);

            let nodeLatestBlockTime = status.syncInfo.latestBlockTime;
            if (syncWindow && syncWindow > 0 &&
                (new Date().getTime() - nodeLatestBlockTime.getTime() > syncWindow))
                return Promise.reject(`${url} is alive, but has not fully synced`);

            return Promise.resolve(url);
        }

        let handlerWithTimeout = (url: string) =>
            awaitWithTimeout(handler(url), INTERVALS.second * 30, `${url} : Failed by timeout`);

        let result = await Promise.allSettled(urls.map(url => handlerWithTimeout(url)));

        if (result.length > 0 && logResults) {
            logger.info(`RPC Status for network ${network.name}:`);
            result.forEach(rpc => {
                if (isFulfilled(rpc))
                    logger.info("\x1b[32m", `${rpc.value} is alive`, "\x1b[0m")
                else
                    logger.info("\x1b[31m", `${rpc.reason}`, "\x1b[0m")
            });
        }

        return result.filter(isFulfilled).map(x => x.value!);
    }

    public static async getChainRpcs(chain: string) {
        let chainInfo = await this.getChainInfo(chain);

        return {
            rpc: chainInfo.apis?.rpc?.map(x => x.address)!,
            rest: chainInfo.apis?.rest?.map(x => x.address)!
        };
    }

    async refreshRpcStatus() {
        logger.info("Updating rpcs...");
        let newClients = await NetworkManager.fetchClients(this.network, this.addChainRegistryRpcs, this.syncWindow);
        let newRpcSet = [...this.clients];
        for (const newRpc of newClients) {
            if (!!newRpcSet.find(x => x.rpcUrl === newRpc.rpcUrl))
                continue;

            newRpcSet.push(newRpc);
            logger.info(`New RPC ${newRpc.rpcUrl}`);
        }

        this.clients = newRpcSet;
        logger.info("Current Endpoint Set:", this.clients.map(x => x.rpcUrl))
    }

    //<kekw>
    getClients(ranked?: boolean): IndexerClient[] {
        let customRpcExists = this.clients.filter(x => x.priority).length > 0;
        if (customRpcExists && ranked === undefined)
            return this.getUnrankedClients();

        if (ranked !== undefined)
            return ranked ? this.getRankedClients() : this.getUnrankedClients();

        return this.getRankedClients();
    }
    //</kekw>

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
                    return await IndexerClient.createClient({ rpcUrl, priority });
                } catch {
                    return Promise.reject();
                }
            })
        );

        return clients.filter(isFulfilled).map(x => x.value);
    }

    private logStatus() {
        this.clients.forEach(x => logger.info(`${x.rpcUrl}, ok = ${x.ok}, fail = ${x.fail}`))
    }

    static async getChainInfo(chain: string) {
        let cached = this.chainInfoCache.get(chain);
        if (cached && Date.now() - cached.timestamp < INTERVALS.hour) {
            return cached.chain;
        }

        try {
            let resp = await fetch(`https://raw.githubusercontent.com/cosmos/chain-registry/master/${chain}/chain.json`);
            let githubResponse = await resp.json() as Chain;
            this.chainInfoCache.set(chain, { timestamp: Date.now(), chain: githubResponse });
            return githubResponse;
        } catch (e) {
            logger.warn(`Coudn't fetch latest chains info from Github`);
        }

        let result = chains.find(x => x.chain_name === chain);
        if (!result) {
            let message = `Unknown chain ${chain}`;
            logger.error(message);
            return Promise.reject();
        }

        return result;
    }

    static async getAliveRegistryRpcs(
        networkName: string,
        syncWindowMsec: number = NetworkManager.defaultSyncWindow,
        indexing: boolean = false) {
        let rpcs = await this.getChainInfo(networkName);
        let filtered = await this.filterRpcs({ name: networkName }, rpcs.apis?.rpc?.map(x => x.address) || [], indexing, syncWindowMsec, false);
        return filtered;
    }
}