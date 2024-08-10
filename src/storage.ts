import { Entity, Column, ObjectId, Index, DataSource, ObjectIdColumn, createQueryBuilder, getMongoRepository } from "typeorm"
import { BlockWithDecodedTxs, CachingOptions, DecodedTxRawFull } from "./blocksWatcher"
import { deserializeObject, serializeObject } from "./helpers"
import { BlockResultsResponse } from "@cosmjs/tendermint-rpc"

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

    @Column({ type: "jsonb" })
    data: string
}

@Entity()
export class CachedBlockResult {
    @ObjectIdColumn()
    id: ObjectId

    @Column()
    @Index({ unique: true })
    height: number

    @Column()
    chainId: string

    @Column({ type: "jsonb" })
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
                entities: [CachedBlock, CachedBlockResult]
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

    async getBlockResultByHeight(height: number) {
        if (!this.options.enabled) return;

        let repo = this.dataSource.getRepository(CachedBlockResult);
        let cached = await repo.findOne({ where: { height } });

        if (cached) {
            let result = deserializeObject<BlockResultsResponse>(cached.data);
            return result;
        }
    }

    async saveBlockResults(results: BlockResultsResponse, height: number, chainId: string) {
        if (!this.options.enabled) return;

        let repo = this.dataSource.getRepository(CachedBlockResult);
        await repo.save({
            height,
            chainId,
            data: serializeObject(results)
        });
    }

    async latestSavedHeight() {
        if (!this.options.enabled) return;

        let repo = this.dataSource.getMongoRepository(CachedBlock);
        let max = await repo.aggregate([
            {
                $group: {
                    _id: null,
                    maxHeight: { $max: "$height" }
                }
            }
        ]).toArray()

        return (max[0] as any).maxHeight;
    }
}