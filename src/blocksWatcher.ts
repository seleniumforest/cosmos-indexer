import { ApiManager } from './apiManager';
import { Block, IndexedTx } from '@cosmjs/stargate';
import { Chain } from '@chain-registry/types';
import { chains } from 'chain-registry';
import { UnknownChainErr } from './errors';
import assert from 'assert';
import { DataSource, DataSourceOptions } from 'typeorm';
import { IndexerStorage, CachedTxs, CachedBlock } from './storage';
import { isRejected } from './helpers';
import { StatusResponse } from '@cosmjs/tendermint-rpc';

export class BlocksWatcher {
    chains: Network[] = [];
    networks: Map<string, ApiManager> = new Map();
    maxBlocksInBatch: number = 1;
    fetchChainRegistryRpcs: boolean;
    cacheSource?: DataSource;

    //Builder section
    private constructor() {
    }

    static create(): BlocksWatcher {
        let ind = new BlocksWatcher();
        return ind;
    }

    useNetwork(network: Partial<Network>) {
        if (network.fromBlock)
            assert(network.fromBlock > 0, "fromBlock should be positive");
        if (network.lag)
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

    useBlockCache(opts: DataSourceOptions) {
        this.cacheSource = new DataSource({
            ...opts,
            entities: [CachedBlock, CachedTxs]
        })

        return this;
    }

    //Execution section
    async run(): Promise<void> {
        if (this.cacheSource) {
            console.log(`Initializing DB...`);
            await this.cacheSource.initialize();
        }

        let chainWorkerDelegate = async (network: Network) => {
            while (true) {
                try {
                    let apiManager = await ApiManager.createApiManager(
                        network,
                        new IndexerStorage(this.cacheSource),
                        this.fetchChainRegistryRpcs
                    );

                    this.networks.set(network.name, apiManager);
                    if (network.dataToFetch === "ONLY_HEIGHTS")
                        await this.runNetworkOnlyHeight(network)
                    else
                        await this.runNetwork(network);
                } catch (e) {
                    console.log(e);
                    //todo handle other types of errors
                    if (e instanceof UnknownChainErr) {
                        return Promise.reject();
                    };

                    await new Promise(res => setTimeout(res, 30000));
                }
            }
        }

        let chainWorkers = this.chains.map(chainWorkerDelegate);
        await Promise.allSettled(chainWorkers);
    }

    async runNetwork(network: Network): Promise<void> {
        let chainData = chains.find(x => x.chain_name === network.name);
        if (!chainData) {
            throw new UnknownChainErr(network.name);
        }

        let api = this.networks.get(network.name)!;
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
                    txs: block.txs.length === 0 ? [] : await api.fetchIndexedTxs(height)
                } as IndexedBlock;

            return block;
        }

        let cachingUpNetwork = false;
        let firstLoop = true;
        while (true) {
            if (firstLoop && network.fromBlock)
                console.log(`Running network ${network.name} from block ${network.fromBlock}`);

            if (!cachingUpNetwork) {
                latestHeight = await api.fetchLatestHeight(nextHeight);
                if (network.lag)
                    latestHeight = Math.max(latestHeight - network.lag, 1);

                if (firstLoop)
                    console.log(`Latest ${network.name} height is ${latestHeight}` +
                        (network.lag > 0 ? ` with lag ${network.lag}` : ""));
                firstLoop = false;
            }

            //no new block commited into network
            if (nextHeight == latestHeight) {
                await new Promise(res => setTimeout(res, 15000))
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
                    console.warn(`targetBlocks ${targetBlocks.at(0)}-${targetBlocks.at(-1)} rejection reason: ${x.reason}`)
                )

            let blocks = blockResults
                .map(b => (b as PromiseFulfilledResult<IndexerBlock>)?.value)
                .sort((a, b) => getBlockHeight(a) > getBlockHeight(b) ? 1 : -1);

            for (const block of blocks) {
                if (getBlockHeight(block) !== nextHeight)
                    break;

                try {
                    await network.onBlockRecievedCallback({ chain: chainData }, block);
                    nextHeight++;
                } catch (e: any) {
                    throw new Error("Error executing callback " + e?.message + "\n" + e?.stack)
                }
            }

            cachingUpNetwork = nextHeight < latestHeight;
            if (memoizedBatchBlocks.size > this.maxBlocksInBatch * 2)
                memoizedBatchBlocks.clear();

            if (!cachingUpNetwork)
                await new Promise(res => setTimeout(res, 10000));
        }
    }

    async runNetworkOnlyHeight(network: Network) {
        let chainData = chains.find(x => x.chain_name === network.name)!;
        if (!chainData) {
            throw new UnknownChainErr(network.name);
        }

        let api = this.networks.get(network.name)!;
        let currentStatus: StatusResponse | null = null;
        await api.watchLatestHeight(async (newStatus) => {
            if (!currentStatus || newStatus.syncInfo.latestBlockHeight > currentStatus.syncInfo.latestBlockHeight) {
                currentStatus = newStatus;
                await network.onBlockRecievedCallback(
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
    fromBlock?: number,
    dataToFetch: DataToFetch
    rpcUrls: string[],
    lag: number,
    onBlockRecievedCallback: (ctx: WatcherContext, block: IndexerBlock) => Promise<void>
}

const defaultNetworkProps: Network = {
    name: "",
    fromBlock: undefined,
    dataToFetch: "RAW_TXS",
    rpcUrls: [],
    lag: 0,
    onBlockRecievedCallback: () => Promise.reject("No onRecieve callback provided")
}

export interface WatcherContext {
    chain: Chain
}

export type DataToFetch = "RAW_TXS" | "INDEXED_TXS" | "ONLY_HEIGHTS";

export type IndexerBlock = Block | IndexedBlock | [height: number, date: Date];

export interface IndexedBlock extends Omit<Block, "txs"> {
    txs: IndexedTx[]
}

function getBlockHeight(block: IndexerBlock) {
    return Array.isArray(block) ? block[0] : block.header.height;
}