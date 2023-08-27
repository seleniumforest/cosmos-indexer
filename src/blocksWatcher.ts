import { defaultRegistryUrls } from './constants';
import { ApiManager } from './apiManager';
import { Block, IndexedTx } from '@cosmjs/stargate';
import { Chain } from '@chain-registry/types';
import { chains } from 'chain-registry';
import { CantFindChainInfoErr } from './errors';

export class BlocksWatcher {
    chains: Network[] = [];
    networks: Map<string, ApiManager> = new Map();
    onBlockRecievedCallback: (ctx: WatcherContext, block: Block | IndexedBlock) => Promise<void> =
        () => Promise.reject("No onRecieve callback provided");
    maxBlocksInBatch: number = 1;
    fetchChainRegistryRpcs: boolean = false;

    //Builder section
    private constructor() {
    }

    static create(): BlocksWatcher {
        let ind = new BlocksWatcher();
        return ind;
    }

    addNetwork(network: Network) {
        this.chains.push(network);
        return this;
    }

    useBatchFetching(maxBlocks: number) {
        this.maxBlocksInBatch = maxBlocks;
        return this;
    }

    useChainRegistryRpcs() {
        this.fetchChainRegistryRpcs = true;
        return this;
    }

    onBlockRecieved(handler: (ctx: WatcherContext, block: Block | IndexedBlock) => Promise<void>) {
        this.onBlockRecievedCallback = handler;
        return this;
    }

    //Execution section
    async run(): Promise<void> {
        let chainWorkers = this.chains.map(async (network) => {
            while (true) {
                try {
                    let apiManager = await ApiManager.createApiManager(
                        network,
                        this.fetchChainRegistryRpcs
                    );
                    this.networks.set(network.name, apiManager);

                    if (network.fromBlock)
                        console.log(`Running network ${network.name} from block ${network.fromBlock}`);
                    else
                        console.log(`Running network ${network.name} from latest block`);

                    await this.runNetwork(network);
                } catch (e) {
                    //todo handle other types of errors
                    if (e instanceof CantFindChainInfoErr) {
                        return Promise.reject();
                    };

                    await new Promise(res => setTimeout(res, 30000));
                }
            }
        });

        await Promise.allSettled(chainWorkers);
    }

    async runNetwork(network: Network): Promise<void> {
        let chainData = chains.find(x => x.chain_name === network.name);
        if (!chainData) {
            throw new CantFindChainInfoErr(network.name);
        }

        let api = this.networks.get(network.name)!;
        let nextHeight = network.fromBlock ? (network.fromBlock || 1) : 0;
        let skipGetLatestHeight = false;
        let latestHeight: number = -1;
        let memoizedBlocks: Map<number, Block | IndexedBlock> =
            new Map<number, Block | IndexedBlock>();

        let getBlock = async (height: number) => {
            let memo = memoizedBlocks.get(height);
            if (memo)
                return memo;

            let composed = await composeBlock(height);
            memoizedBlocks.set(composed.header.height, composed);
            return composed;
        }

        let composeBlock = async (height: number): Promise<Block | IndexedBlock> => {
            let block = await api.fetchBlock(height);

            switch (network.dataToFetch) {
                case "RAW_TXS":
                    return block;
                case "INDEXED_TXS":
                    return {
                        ...block,
                        txs: await api.fetchIndexedTxs(height)
                    } as IndexedBlock
                default:
                    return block
            }
        }

        while (true) {
            if (!skipGetLatestHeight)
                latestHeight = await api.fetchLatestHeight(nextHeight);

            //no new block commited into network
            if (nextHeight == latestHeight) {
                await new Promise(res => setTimeout(res, 10000))
                continue;
            }

            let heightToStart = nextHeight === 0 ? nextHeight = latestHeight : nextHeight
            let targetBlocks = [...Array(this.maxBlocksInBatch).keys()]
                .map(i => i + heightToStart)
                .filter(x => x <= latestHeight);

            let blockResults = await Promise.allSettled(
                targetBlocks.map(async (num) => await getBlock(num))
            );

            let blocks = blockResults
                .map(b => (b as PromiseFulfilledResult<Block>)?.value)
                .sort((a, b) => a.header.height > b.header.height ? 1 : -1);

            for (const block of blocks) {
                if (block.header.height !== nextHeight)
                    break;

                try {
                    await this.onBlockRecievedCallback({ chain: chainData }, block);
                    nextHeight++;
                } catch (e: any) {
                    throw new Error("Error executing callback " + e?.message + "\n" + e?.stack)
                }
            }

            skipGetLatestHeight = nextHeight < latestHeight;
            if (memoizedBlocks.size > this.maxBlocksInBatch * 2)
                memoizedBlocks.clear();

            if (!skipGetLatestHeight)
                await new Promise(res => setTimeout(res, 5000));
        }
    }
}

export interface Network {
    name: string,
    fromBlock?: number,
    dataToFetch?: DataToFetch
    rpcUrls?: string[]
}

export interface WatcherContext {
    chain: Chain
}

export type DataToFetch = "RAW_TXS" | "INDEXED_TXS";

export interface IndexedBlock extends Omit<Block, "txs"> {
    txs: IndexedTx[]
}