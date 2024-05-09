import { IndexedTx } from "@cosmjs/stargate"
import { BlockResponse } from "@cosmjs/tendermint-rpc"
import { TxSearchResponse } from "@cosmjs/tendermint-rpc/build/comet38"
import { Entity, Column, PrimaryGeneratedColumn, Index, DataSource } from "typeorm"

@Entity()
export class CachedBlock {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    @Index({ unique: true })
    height: number

    @Column()
    time: Date

    @Column()
    chainId: string

    @Column()
    data: string
}

@Entity()
export class CachedTxs {
    @PrimaryGeneratedColumn()
    id: number

    @Column()
    @Index({ unique: true })
    height: number

    @Column()
    data: string
}

export interface IIndexerStorage<
    Block extends Indexer.Block.BlockBase,
    Tx extends Indexer.Txs.TxBase
> {
    getBlockByHeight(height: number): Promise<Block>;
    saveBlock(block: BlockResponse): Promise<void>;
    getTxsByHeight(height: number): Promise<Tx[]>;
    saveTxs(txs: TxSearchResponse, height: number): Promise<void>;
}

export class CosmosIndexerStorage implements IIndexerStorage<Indexer.Block.CosmosBlock, Indexer.Txs.CosmosTx> {
    dataSource: DataSource;

    public constructor(dataSource: DataSource) {
        this.dataSource = dataSource;
    }

    getBlockByHeight(height: number): Promise<Indexer.Block.CosmosBlock> {
        throw new Error("Method not implemented.");
    }
    saveBlock(block: BlockResponse): Promise<void> {
        throw new Error("Method not implemented.");
    }
    getTxsByHeight(height: number): Promise<Indexer.Txs.CosmosTx[]> {
        throw new Error("Method not implemented.");
    }
    saveTxs(txs: TxSearchResponse, height: number): Promise<void> {
        throw new Error("Method not implemented.");
    }

    // async getBlockByHeight(height: number) {
    //     if (!this.dataSource) return;

    //     let repo = this.dataSource.getRepository(CachedBlock);
    //     let cached = await repo.findOne({ where: { height } });
    //     if (cached) {
    //         let obj = JSON.parse(cached.data) as Block & { txs: string[] };
    //         return {
    //             ...obj,
    //             txs: obj.txs.map((x: any) => new Uint8Array(x.split(",").map((ch: any) => +ch)))
    //         }
    //     }
    // }

    // async saveBlock(block: BlockResponse) {
    //     if (!this.dataSource) return;

    //     let repo = this.dataSource.getRepository(CachedBlock);
    //     let header = block.block.header;

    //     await repo.save({
    //         chainId: header.chainId,
    //         height: header.height,
    //         time: new Date(header.time.getMilliseconds()),
    //         data: JSON.stringify({
    //             ...block,
    //             txs: block.block.txs.map(x => x.toString())
    //         })
    //     });
    // }

    // async getTxsByHeight(height: number) {
    //     if (!this.dataSource) return;

    //     let repo = this.dataSource.getRepository(CachedTxs);
    //     let cached = await repo.findOne({ where: { height } });

    //     if (cached) {
    //         let obj = JSON.parse(cached.data) as (IndexedTx & { tx: string })[];

    //         return obj.map((x) => ({
    //             ...x,
    //             gasUsed: BigInt(x.gasUsed),
    //             gasWanted: BigInt(x.gasWanted),
    //             tx: new Uint8Array(x.tx.split(",").map((ch) => +ch))
    //         } as IndexedTx))
    //     }
    // }

    // async saveTxs(txs: TxSearchResponse, height: number) {
    //     if (!this.dataSource) return;

    //     let repo = this.dataSource.getRepository(CachedTxs);
    //     await repo.save({
    //         height,
    //         data: JSON.stringify(txs.txs.map(x => ({
    //             ...x,
    //             gasUsed: x.result.gasUsed.toString(),
    //             gasWanted: x.result.gasWanted.toString(),
    //             tx: x.tx.toString()
    //         })))
    //     });
    // }
}

export class EthereumIndexerStorage implements IIndexerStorage<Indexer.Block.EthereumBlock, Indexer.Txs.EthereumTx> {
    getBlockByHeight(height: number): Promise<Indexer.Block.EthereumBlock> {
        throw new Error("Method not implemented.");
    }
    saveBlock(block: BlockResponse): Promise<void> {
        throw new Error("Method not implemented.");
    }
    getTxsByHeight(height: number): Promise<Indexer.Txs.EthereumTx[]> {
        throw new Error("Method not implemented.");
    }
    saveTxs(txs: TxSearchResponse, height: number): Promise<void> {
        throw new Error("Method not implemented.");
    }
}