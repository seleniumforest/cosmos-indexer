import { ApiManager } from "./apiManager";
import { BlockWithDecodedTxs, BlockWithIndexedTxs, IndexerBlock, Network } from "./blocksWatcher";
import { isRejected, logger } from "./helpers";
import { IndexerStorage } from "./storage";

export class BatchComposer {
    private network: Network;
    private api: ApiManager;
    private memoizedBatchBlocks = new Map<number, IndexerBlock>();
    private storage: IndexerStorage;

    public constructor(network: Network, api: ApiManager, storage: IndexerStorage) {
        this.network = network;
        this.api = api;
        this.storage = storage;
    }

    async compose(from: number, batchSize: number, latestHeight: number) {
        let targetBlocks = [...Array(batchSize).keys()]
            .map(i => i + from)
            .filter(x => x <= latestHeight);

        let blockResults = await Promise.allSettled(
            targetBlocks.map(async (num) => await this.getComposedBlock(num))
        );

        blockResults
            .filter(isRejected)
            .forEach(x => logger.warn(`targetBlocks ${targetBlocks.at(0)}-${targetBlocks.at(-1)} rejection reason: ${x.reason}`))

        let blocks = blockResults
            .map(b => (b as PromiseFulfilledResult<IndexerBlock>)?.value)
            .sort((a, b) => a.header.height > b.header.height ? 1 : -1);

        this.memoizedBatchBlocks.clear();
        return blocks;
    }

    private async getComposedBlock(height: number) {
        let temp = this.memoizedBatchBlocks.get(height);
        if (temp)
            return temp;

        let block = await this.storage.getBlockByHeight(height) ||
            await this.api.fetchBlock(height);
        let composed = await this.composeIndexerBlock(block);
        this.memoizedBatchBlocks.set(composed.header.height, composed);

        return composed;
    }

    private async composeIndexerBlock(block: BlockWithDecodedTxs): Promise<IndexerBlock> {
        if (this.network.dataToFetch === "RAW_TXS")
            return block;

        if (this.network.dataToFetch === "INDEXED_TXS") {
            //do not search txs if there's 0 txs shown in block header
            let resultTxs = block.txs.length === 0 ?
                [] :
                await this.api.fetchBlockResults(block.header.height, block.header.chainId);

            return {
                ...block,
                txs: resultTxs,
                type: "INDEXED_TXS"
            } as BlockWithIndexedTxs;
        }

        let msg = `composeBlock: Unknown dataToFetch for network ${JSON.stringify(this.network)}`;
        logger.error(msg);
        throw new Error(msg);
    }
}