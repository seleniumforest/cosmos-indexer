import { ApiManager } from './apiManager';
import { Block, IndexedTx } from '@cosmjs/stargate';
import { Chain } from '@chain-registry/types';
import { chains } from 'chain-registry';
import assert from 'assert';
import { DataSource, DataSourceOptions } from 'typeorm';
import { IndexerStorage, CachedTxs, CachedBlock } from './storage';
import { INTERVALS, isRejected, logger } from './helpers';
import { StatusResponse } from '@cosmjs/tendermint-rpc';

export class BlocksWatcher {
    chains: BlocksWatcherNetwork[] = [];
    apis: Map<string, ApiManager> = new Map();
    maxBlocksInBatch: number = 1;
    fetchChainRegistryRpcs: boolean;
    opts?: DataSourceOptions;

    //Builder section
    private constructor() {
    }

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

    useBlockCache(opts: DataSourceOptions) {
        this.opts = opts;
        return this;
    }

    //Execution section
    async run(): Promise<void> {
        let chainWorkerDelegate = async (network: BlocksWatcherNetwork) => {
            while (true) {
                try {
                    let storage;

                    if (this.opts) {
                        logger.trace(`Initializing DB...`);
                        storage = new IndexerStorage(this.opts);
                    }

                    let apiManager = await ApiManager.createApiManager(
                        network,
                        storage,
                        this.fetchChainRegistryRpcs
                    );

                    this.apis.set(network.name, apiManager);
                    if (network.dataToFetch === "ONLY_HEIGHTS")
                        await this.runNetworkOnlyHeight(network)
                    else
                        await this.runNetwork(network);
                } catch (e) {
                    logger.error("Error occured: ", e);
                    await new Promise(res => setTimeout(res, INTERVALS.minute));
                }
            }
        }

        let chainWorkers = this.chains.map(chainWorkerDelegate);
        await Promise.allSettled(chainWorkers);
    }

    async runNetwork(network: BlocksWatcherNetwork): Promise<void> {
        let chainData = chains.find(x => x.chain_name === network.name);
        if (!chainData) {
            let message = `Unknown chain ${network.name}`;
            logger.error(message);
            return Promise.reject();
        }

        let api = this.apis.get(network.name)!;
        let nextHeight = network.fromBlock ? (network.fromBlock || 1) : 0;
        let latestHeight: number = -1;
        let memoizedBatchBlocks = new Map<number, IndexerBlock>();

        let getBlock = async (height: number) => {
            let memo = memoizedBatchBlocks.get(height);
            if (memo)
                return memo;

            let composed = await composeBlock(height);
            memoizedBatchBlocks.set(getBlockHeight(composed), composed);
            return composed;
        }

        let composeBlock = async (height: number): Promise<IndexerBlock> => {
            // if (network.dataToFetch === "ONLY_HEIGHT")
            //     return height;

            let block = await api.fetchBlock(height);

            if (network.dataToFetch === "RAW_TXS")
                return block;

            if (network.dataToFetch === "INDEXED_TXS")
                return {
                    ...block,
                    txs: block.txs.length === 0 ? [] : await api.fetchIndexedTxs(height, block.header.chainId)
                } as IndexedBlock;

            return block;
        }

        let cachingUpNetwork = false;
        let firstLoop = true;
        while (true) {
            if (firstLoop && network.fromBlock)
                logger.trace(`Running network ${network.name} from block ${network.fromBlock}`);

            if (!cachingUpNetwork) {
                latestHeight = await api.fetchLatestHeight(nextHeight);
                if (network.lag)
                    latestHeight = Math.max(latestHeight - network.lag, 1);

                if (firstLoop)
                    logger.trace(`Latest ${network.name} height is ${latestHeight}` +
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

            let targetBlocks = [...Array(this.maxBlocksInBatch).keys()]
                .map(i => i + nextHeight)
                .filter(x => x <= latestHeight);

            let blockResults = await Promise.allSettled(
                targetBlocks.map(async (num) => await getBlock(num))
            );

            blockResults
                .filter(isRejected)
                .forEach(x =>
                    logger.warn(`targetBlocks ${targetBlocks.at(0)}-${targetBlocks.at(-1)} rejection reason: ${x.reason}`)
                )

            let blocks = blockResults
                .map(b => (b as PromiseFulfilledResult<IndexerBlock>)?.value)
                .sort((a, b) => getBlockHeight(a) > getBlockHeight(b) ? 1 : -1);

            for (const block of blocks) {
                if (getBlockHeight(block) !== nextHeight)
                    break;

                try {
                    await network.onDataRecievedCallback({ chain: chainData }, block);
                    nextHeight++;
                } catch (e: any) {
                    throw new Error("Error executing callback " + e?.message + "\n" + e?.stack)
                }
            }

            cachingUpNetwork = nextHeight < latestHeight;
            if (memoizedBatchBlocks.size > this.maxBlocksInBatch * 2)
                memoizedBatchBlocks.clear();

            if (!cachingUpNetwork)
                await new Promise(res => setTimeout(res, INTERVALS.second * 10));
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
            if (!currentStatus || newStatus.syncInfo.latestBlockHeight > currentStatus.syncInfo.latestBlockHeight) {
                currentStatus = newStatus;
                await network.onDataRecievedCallback(
                    { chain: chainData },
                    [
                        newStatus.syncInfo.latestBlockHeight,
                        new Date(newStatus.syncInfo.latestBlockTime.getTime())
                    ]
                );
            }
        })
    }
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

export type IndexerBlock = Block | IndexedBlock | [height: number, date: Date];

export type LogsWatcherData = IndexedTx[];

export interface IndexedBlock extends Omit<Block, "txs"> {
    txs: IndexedTx[]
}

function getBlockHeight(block: IndexerBlock) {
    return Array.isArray(block) ? block[0] : block.header.height;
}