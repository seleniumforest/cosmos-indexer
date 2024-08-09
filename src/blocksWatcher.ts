import { ApiManager } from './apiManager';
import { Block, IndexedTx, Event } from '@cosmjs/stargate';
import { Chain } from '@chain-registry/types';
import { chains } from 'chain-registry';
import assert from 'assert';
import { IndexerStorage } from './storage';
import { INTERVALS, logger } from './helpers';
import { StatusResponse } from '@cosmjs/tendermint-rpc';
import { BatchComposer } from './batchComposer';
import { MongoConnectionOptions } from 'typeorm/driver/mongodb/MongoConnectionOptions';
import { DecodedTxRaw } from '@cosmjs/proto-signing';

export class BlocksWatcher {
    chains: BlocksWatcherNetwork[] = [];
    apis: Map<string, ApiManager> = new Map();
    maxBlocksInBatch: number = 1;
    fetchChainRegistryRpcs: boolean;
    cachingOpts: CachingOptions;

    //Builder section
    private constructor() { }

    static create(): BlocksWatcher {
        let ind = new BlocksWatcher();
        return ind;
    }

    useNetwork(network: Partial<BlocksWatcherNetwork>) {
        assert(!!network.name === true, "please specify network name");
        if (network.fromBlock != undefined)
            assert(network.fromBlock > 0, "fromBlock should be positive");
        if (network.lag != undefined)
            assert(network.lag > 0, "lag should be positive");

        this.chains.push({
            ...defaultNetworkProps,
            ...network
        });
        return this;
    }

    useBatchFetching(maxBlocks: number) {
        assert(maxBlocks > 0, "Wrong maxBlocks number");
        this.maxBlocksInBatch = maxBlocks;
        return this;
    }

    useChainRegistryRpcs() {
        this.fetchChainRegistryRpcs = true;
        return this;
    }

    /**
     * 
     * @param lvl 0: silly, 1: trace, 2: debug, 3: info, 4: warn, 5: error, 6: fatal
     */
    useLogLevel(lvl: number) {
        logger.settings.minLevel = lvl;
        return this;
    }

    useBlockCache(opts: CachingOptions) {
        this.cachingOpts = opts;
        return this;
    }

    //for compatibility
    run = this.start;

    //Execution section
    async start(): Promise<void> {
        let chainWorkerDelegate = async (network: BlocksWatcherNetwork) => {
            while (true) {
                try {
                    if (this.cachingOpts)
                        logger.trace(`Initializing DB...`);

                    let storage = await IndexerStorage.create(this.cachingOpts);

                    let apiManager = await ApiManager.createApiManager(
                        network,
                        storage,
                        this.fetchChainRegistryRpcs
                    );

                    this.apis.set(network.name, apiManager);
                    if (network.dataToFetch === "ONLY_HEIGHTS")
                        await this.runNetworkOnlyHeight(network)
                    else
                        await this.runNetwork(network, storage);
                } catch (e) {
                    logger.error("Error occured: ", e);
                    await new Promise(res => setTimeout(res, INTERVALS.minute));
                }
            }
        }

        let chainWorkers = this.chains.map(chainWorkerDelegate);
        await Promise.allSettled(chainWorkers);
    }

    async runNetwork(network: BlocksWatcherNetwork, storage: IndexerStorage): Promise<void> {
        let chainData = chains.find(x => x.chain_name === network.name);
        if (!chainData) {
            let message = `Unknown chain ${network.name}`;
            logger.error(message);
            return Promise.reject();
        }

        let api = this.apis.get(network.name)!;
        let nextHeight = network.fromBlock ? (network.fromBlock || 1) : 0;
        let latestHeight: number = -1;
        let composer = new BatchComposer(network, api, storage);
        let cachingUpNetwork = false;
        let firstLoop = true;

        while (true) {
            if (firstLoop && network.fromBlock)
                logger.info(`Running network ${network.name} from block ${network.fromBlock}`);

            if (!cachingUpNetwork) {
                latestHeight = await api.fetchLatestHeight(nextHeight);
                if (network.lag)
                    latestHeight = Math.max(latestHeight - network.lag, 1);

                if (firstLoop)
                    logger.info(`Latest ${network.name} height is ${latestHeight}` +
                        (network.lag && network.lag > 0 ? ` with lag ${network.lag}` : ""));
                firstLoop = false;
            }

            //no new block commited into network
            if (nextHeight == latestHeight) {
                await new Promise(res => setTimeout(res, INTERVALS.second * 15))
                continue;
            }

            if (nextHeight === 0) {
                nextHeight = latestHeight;
            }

            let blocks = await composer.compose(nextHeight, this.maxBlocksInBatch, latestHeight);

            for (const block of blocks) {
                if (block.header.height !== nextHeight)
                    break;

                try {
                    await network.onDataRecievedCallback({ chain: chainData }, block);
                    nextHeight++;
                } catch (e: any) {
                    throw new Error(`Error executing callback err ${JSON.stringify(e)}`)
                }
            }

            cachingUpNetwork = nextHeight < latestHeight;

            if (!cachingUpNetwork) {
                await new Promise(res => setTimeout(res, INTERVALS.second * 10));
            }
        }
    }

    async runNetworkOnlyHeight(network: BlocksWatcherNetwork) {
        let chainData = chains.find(x => x.chain_name === network.name)!;
        if (!chainData) {
            let message = `Unknown chain ${network.name}`;
            logger.error(message);
            return Promise.reject();
        }

        let api = this.apis.get(network.name)!;
        let currentStatus: StatusResponse | null = null;
        await api.watchLatestHeight(async (newStatus) => {
            let isBlockFresh = !currentStatus ||
                newStatus.syncInfo.latestBlockHeight > currentStatus.syncInfo.latestBlockHeight;
            if (!isBlockFresh) {
                return;
            }

            currentStatus = newStatus;

            let block: IndexerBlock = {
                id: new TextDecoder('utf-8').decode(newStatus.syncInfo.latestBlockHash),
                header: {
                    chainId: newStatus.nodeInfo.network,
                    height: newStatus.syncInfo.latestBlockHeight,
                    time: new Date(newStatus.syncInfo.latestBlockTime.getTime()).toISOString(),
                    version: { app: "", block: "" },
                },
                txs: [],
                type: "ONLY_HEIGHTS"
            };

            await network.onDataRecievedCallback(
                { chain: chainData },
                block
            );
        })
    }
}

export type CachingOptions = MongoConnectionOptions & {
    enabled: boolean,
    trimIbcProofs?: boolean
}

export type Network = {
    name: string,
    rpcUrls?: string[],
    fromBlock?: number,
    dataToFetch?: DataToFetch,
    lag?: number,
}

export type BlocksWatcherNetwork = Network & {
    onDataRecievedCallback: (ctx: BlocksWatcherContext, block: IndexerBlock) => Promise<void>
}

export type LogsWatcherNetwork = Network & {
    onDataRecievedCallback: (ctx: LogsWatcherContext, txs: IndexedTx[]) => Promise<void>
}

const defaultNetworkProps: BlocksWatcherNetwork = {
    name: "",
    fromBlock: undefined,
    dataToFetch: "RAW_TXS",
    rpcUrls: [],
    lag: 0,
    onDataRecievedCallback: () => Promise.reject("No onRecieve callback provided")
}

export type WatcherContext = BlocksWatcherContext | LogsWatcherContext;

export interface BlocksWatcherContext {
    chain: Chain
}

export interface LogsWatcherContext {
    chain: Chain,
    range: [number, number]
}

export type DataToFetch = "RAW_TXS" | "INDEXED_TXS" | "ONLY_HEIGHTS";

export type IndexerBlock =
    BlockWithDecodedTxs |
    BlockWithIndexedTxs |
    (Block & { type: "ONLY_HEIGHTS" });


export type BlockType = { type: DataToFetch };

export type LogsWatcherData = IndexedTx[];

export type DecodedTxRawFull = {
    hash: string,
    code: number;
    tx: DecodedTxRaw;
    events: Event[];
    gasWanted: bigint;
    gasUsed: bigint;
    txIndex: number;
}

export interface BlockWithDecodedTxs extends Omit<Block, "txs"> {
    type: "RAW_TXS",
    txs: DecodedTxRaw[]
}

export interface BlockWithIndexedTxs extends Omit<Block, "txs"> {
    type: "INDEXED_TXS",
    txs: DecodedTxRawFull[]
}
