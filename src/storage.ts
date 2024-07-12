import { Entity, Column, ObjectId, Index, DataSource, ObjectIdColumn } from "typeorm"
import { BlockWithDecodedTxs, CachingOptions, DecodedTxRawFull } from "./blocksWatcher"
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

    @Column()
    data: string
}

@Entity()
export class CachedTxs {
    @ObjectIdColumn()
    id: ObjectId

    @Column()
    @Index({ unique: true })
    height: number

    @Column()
    chainId: string

    @Column()
    data: string
}

const defaultOpts: CachingOptions = {
    type: "mongodb",
    trimIbcProofs: false,
    enabled: false
}

export class IndexerStorage {
    public options: CachingOptions;
    private dataSource: DataSource;

    private constructor(ds?: DataSource, opts?: CachingOptions) {
        if (ds) {
            this.dataSource = ds;
        }
        this.options = opts || { ...defaultOpts };
    }

    public static async create(opts?: CachingOptions) {
        if (opts && opts?.enabled) {
            let dataSource = new DataSource({
                ...opts,
                synchronize: true,
                entities: [CachedBlock, CachedTxs]
            });

            await dataSource.initialize();
            return new IndexerStorage(dataSource, opts);
        };

        return new IndexerStorage(undefined, opts);
    }

    async getBlockByHeight(height: number) {
        if (!this.options.enabled) return;

        let repo = this.dataSource.getRepository(CachedBlock);
        let cached = await repo.findOne({ where: { height } });
        if (cached) {
            let result = deserializeObject<BlockWithDecodedTxs>(cached.data);
            return result;
        }
    }

    async saveBlock(block: BlockWithDecodedTxs) {
        if (!this.options.enabled) return;

        let repo = this.dataSource.getRepository(CachedBlock);
        await repo.save({
            chainId: block.header.chainId,
            height: block.header.height,
            time: new Date(block.header.time),
            data: serializeObject(block)
        });
    }

    async getTxsByHeight(height: number) {
        if (!this.options.enabled) return;

        let repo = this.dataSource.getRepository(CachedTxs);
        let cached = await repo.findOne({ where: { height } });

        if (cached) {
            let result = deserializeObject<DecodedTxRawFull[]>(cached.data);
            return result;
        }
    }

    async saveTxs(txs: DecodedTxRawFull[], height: number, chainId: string) {
        if (!this.options.enabled) return;

        let repo = this.dataSource.getRepository(CachedTxs);
        await repo.save({
            height,
            chainId,
            data: serializeObject(txs)
        });
    }
}