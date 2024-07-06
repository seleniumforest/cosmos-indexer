import { IndexedTx } from "@cosmjs/stargate";
import { ApiManager } from "./apiManager";
import { BlockWithIndexedTxs, IndexerBlock, Network } from "./blocksWatcher";
import { isRejected, logger } from "./helpers";
import { IndexerStorage } from "./storage";
import { decodeTxRaw } from "@cosmjs/proto-signing";

export class BatchComposer {
    private network: Network;
    private api: ApiManager;
    private memoizedBatchBlocks = new Map<number, IndexerBlock>();
    private storage?: IndexerStorage;

    public constructor(network: Network, api: ApiManager, storage?: IndexerStorage) {
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


    /*
        2-layered cache. Ensures that block won't be fetched twice even cache storage is not enabled.
    */
    private async getComposedBlock(height: number) {
        let temp = this.memoizedBatchBlocks.get(height);
        if (temp)
            return temp;

        let pers = this.storage && await this.storage.getBlockByHeight(height, this.network.dataToFetch!);
        if (pers)
            return pers;

        let composed = await this.composeBlock(height);

        this.storage && await this.storage.saveBlock(composed);
        this.memoizedBatchBlocks.set(composed.header.height, composed);

        return composed;
    }

    private matchTxType(tx: IndexedTx, match: string) {
        let updateClientEvent = tx.events
            .find(x => x.type === "message")?.attributes
            .find(x => x.key === "action")?.value;

        if (!updateClientEvent)
            return false;

        return updateClientEvent.toLowerCase().includes(match.toLowerCase());
    }

    private async composeBlock(height: number): Promise<IndexerBlock> {
        let block = await this.api.fetchBlock(height);

        if (this.network.dataToFetch === "RAW_TXS")
            return {
                ...block,
                type: "RAW_TXS"
            };

        if (this.network.dataToFetch === "INDEXED_TXS") {
            //do not search txs if there's 0 txs shown in block header
            let txs = block.txs.length === 0 ? [] :
                (await this.api.fetchIndexedTxs(height, block.header.chainId))
                    //decode txraw
                    .map(tx => ({
                        tx: tx,
                        decoded: decodeTxRaw(tx.tx)
                    }))
                    //remove IBC signatures, they're too fat and have no useful info
                    .map(({ tx, decoded: d }) => ({
                        tx: {
                            ...tx,
                            events: tx.events.map(ev => ({
                                ...ev,
                                attributes: ev.attributes.map(a => ({
                                    key: a.key,
                                    value: a.key === "header" && ev.type === "update_client" && d.body.messages.some(x => x.typeUrl.includes("MsgUpdateClient")) ?
                                        "" :
                                        a.value
                                }))
                            })),
                            rawLog: Array.isArray(tx.events) && tx.events.length > 0 ? "" : tx.rawLog
                        },
                        decoded: d
                    }))
                    //remove ICQ relay tx bodys, they're too fat
                    .map(({ tx, decoded: d }) => {
                        let isIcqTx =
                            d.body.messages.some(x => x.typeUrl.includes("MsgUpdateClient")) &&
                            d.body.messages.some(x => x.typeUrl.includes("MsgSubmitQueryResponse")) &&
                            d.body.messages.length === 2;

                        return {
                            ...tx,
                            tx: isIcqTx ? [] : tx.tx
                        }
                    })


            return {
                ...block,
                txs,
                type: "INDEXED_TXS"
            } as IndexerBlock;
        }

        let msg = `composeBlock: Unknown dataToFetch for network ${JSON.stringify(this.network)}`;
        logger.error(msg);
        throw new Error(msg);
    }
}