import { SearchPair } from "@cosmjs/stargate";
import { ApiManager } from "./apiManager";
import { BlocksWatcherNetwork, LogsWatcherNetwork } from "./blocksWatcher";
import { INTERVALS, logger } from "./helpers";
import { chains } from "chain-registry";

export class LogsWatcher {
    chains: (LogsWatcherNetwork & { searchKeys: SearchPair[] })[] = [];
    apis: Map<string, ApiManager> = new Map();
    fetchChainRegistryRpcs: boolean;

    private constructor() {
    }

    static create(): LogsWatcher {
        let ind = new LogsWatcher();
        return ind;
    }

    useChainRegistryRpcs() {
        this.fetchChainRegistryRpcs = true;
        return this;
    }

    useLogLevel(lvl: number) {
        logger.settings.minLevel = lvl;
        return this;
    }

    useNetwork(network: LogsWatcherNetwork, query: SearchPair[]) {
        this.chains.push({
            ...network,
            dataToFetch: "INDEXED_TXS",
            searchKeys: [...query]
        });
        return this;
    }

    async run() {
        let chainWorkerDelegate = async (network: LogsWatcherNetwork & { searchKeys: SearchPair[] }) => {
            let chainData = chains.find(x => x.chain_name === network.name);
            if (!chainData) {
                let message = `Unknown chain ${network.name}`;
                logger.error(message);
                return Promise.reject();
            };

            try {
                let apiManager = await ApiManager.createApiManager(
                    network as any as BlocksWatcherNetwork,
                    undefined,
                    this.fetchChainRegistryRpcs
                );
                this.apis.set(network.name, apiManager);

                let firstRun = true;
                let latestNetworkHeight = await apiManager.fetchLatestHeight();
                let latestCheckHeight = network.fromBlock || latestNetworkHeight;

                while (true) {
                    if (!firstRun)
                        latestNetworkHeight = await apiManager.fetchLatestHeight();

                    if (latestCheckHeight === latestNetworkHeight) {
                        await new Promise(res => setTimeout(res, INTERVALS.minute));
                    }

                    if (latestCheckHeight > latestNetworkHeight) {
                        throw new Error("latestCheckHeight > latestNetworkHeight");
                    }

                    let rawQuery = network.searchKeys
                        .map((t) => {
                            if (typeof t.value === "string")
                                return `${t.key}='${t.value}'`;

                            return `${t.key}=${t.value}`;
                        })
                        .join(" AND ");

                    let txs = await apiManager.fetchSearchTxs(`tx.height >= ${latestCheckHeight} AND tx.height <= ${latestNetworkHeight} AND ${rawQuery}`);
                    await network.onDataRecievedCallback({
                        chain: chainData,
                        range: [latestCheckHeight, latestNetworkHeight]
                    }, txs);
                    latestCheckHeight = latestNetworkHeight + 1;
                    firstRun = false;
                    await new Promise(res => setTimeout(res, INTERVALS.minute));
                }
            } catch (e) {
                logger.error("Error occured: ", e);
                await new Promise(res => setTimeout(res, INTERVALS.minute));
            }
        }

        await Promise.allSettled(this.chains.map(chainWorkerDelegate));
    }
}