import { IndexedTx } from "@cosmjs/stargate"
import { Block } from "@cosmjs/stargate"
import { Entity, Column, PrimaryGeneratedColumn, Index, DataSource, DataSourceOptions } from "typeorm"

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

    @Column({ type: "jsonb" })
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
    chainId: string

    @Column({ type: "jsonb" })
    data: string
}

export class IndexerStorage {
    //null means caching is not enabled
    dataSource?: DataSource;

    public constructor(opts?: DataSourceOptions) {
        if (opts) {
            this.dataSource = new DataSource({
                ...opts,
                synchronize: true,
                entities: [CachedBlock, CachedTxs]
            });
            this.dataSource.initialize();
        }
    }

    async getBlockByHeight(height: number) {
        if (!this.dataSource) return;

        let repo = this.dataSource.getRepository(CachedBlock);
        let cached = await repo.findOne({ where: { height } });
        if (cached) {
            let obj = JSON.parse(cached.data) as Block & { txs: string[] };
            return {
                ...obj,
                txs: obj.txs.map((x: any) => new Uint8Array(x.split(",").map((ch: any) => +ch)))
            }
        }
    }

    async saveBlock(block: Block) {
        if (!this.dataSource) return;

        let repo = this.dataSource.getRepository(CachedBlock);
        await repo.save({
            chainId: block.header.chainId,
            height: block.header.height,
            time: new Date(block.header.time),
            data: JSON.stringify({
                ...block,
                txs: block.txs.map(x => x.toString())
            })
        });
    }

    async getTxsByHeight(height: number) {
        if (!this.dataSource) return;

        let repo = this.dataSource.getRepository(CachedTxs);
        let cached = await repo.findOne({ where: { height } });

        if (cached) {
            let obj = JSON.parse(cached.data) as (IndexedTx & { tx: string })[];

            return obj.map((x) => ({
                ...x,
                gasUsed: BigInt(x.gasUsed),
                gasWanted: BigInt(x.gasWanted),
                tx: new Uint8Array(x.tx.split(",").map((ch) => +ch))
            } as IndexedTx))
        }
    }

    async saveTxs(txs: IndexedTx[], height: number, chainId: string) {
        if (!this.dataSource) return;

        let repo = this.dataSource.getRepository(CachedTxs);
        await repo.save({
            height,
            chainId,
            data: JSON.stringify(txs.map(x => ({
                ...x,
                gasUsed: x.gasUsed.toString(),
                gasWanted: x.gasWanted.toString(),
                tx: x.tx.toString()
            })))
        });
    }
}