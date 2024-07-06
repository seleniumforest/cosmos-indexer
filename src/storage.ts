import { IndexedTx } from "@cosmjs/stargate"
import { Block } from "@cosmjs/stargate"
import { Entity, Column, ObjectId, Index, DataSource, DataSourceOptions, ObjectIdColumn } from "typeorm"
import { DataToFetch, IndexerBlock } from "./blocksWatcher"
import { deserializeObject, serializeObject } from "./helpers"

@Entity()
export class CachedBlock {
    @ObjectIdColumn()
    id: ObjectId

    @Column()
    @Index({ unique: true })
    height: number

    @Column()
    time: Date

    @Column()
    chainId: string

    //"Indexed" | "Raw"
    @Column()
    type: string

    @Column()
    data: string
}

// @Entity()
// export class CachedTxs {
//     @ObjectIdColumn()
//     id: ObjectId

//     @Column()
//     @Index({ unique: true })
//     height: number

//     @Column()
//     chainId: string

//     @Column()
//     data: string
// }

export class IndexerStorage {
    //null means caching is not enabled
    dataSource?: DataSource;

    public constructor(opts?: DataSourceOptions) {
        if (opts) {
            this.dataSource = new DataSource({
                ...opts,
                synchronize: true,
                entities: [CachedBlock]
                // entities: [CachedBlock, CachedTxs]
            });
            this.dataSource.initialize();
        }
    }

    async getBlockByHeight(height: number, type: DataToFetch) {
        if (!this.dataSource) return;

        let repo = this.dataSource.getRepository(CachedBlock);
        let cached = await repo.findOne({ where: { height, type } });
        if (cached) {
            return deserializeObject<IndexerBlock>(cached.data);
        }
    }

    async saveBlock(block: IndexerBlock) {
        if (!this.dataSource) return;

        let repo = this.dataSource.getRepository(CachedBlock);
        await repo.save({
            chainId: block.header.chainId,
            height: block.header.height,
            time: new Date(block.header.time),
            type: block.type || "",
            data: serializeObject(block)
        });
    }

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

    // async saveTxs(txs: IndexedTx[], height: number, chainId: string) {
    //     if (!this.dataSource) return;

    //     let repo = this.dataSource.getRepository(CachedTxs);
    //     await repo.save({
    //         height,
    //         chainId,
    //         data: JSON.stringify(txs.map(x => ({
    //             ...x,
    //             gasUsed: x.gasUsed.toString(),
    //             gasWanted: x.gasWanted.toString(),
    //             tx: x.tx.toString()
    //         })))
    //     });
    // }
}