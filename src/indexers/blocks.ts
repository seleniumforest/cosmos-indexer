import { DataSource, DataSourceOptions } from "typeorm";
import { CachedBlock, CachedTxs, CosmosIndexerStorage, EthereumIndexerStorage } from "../modules/storage";

export class BlocksIndexerBase<T extends Indexer.SUPPORTED_CHAIN> {
    protected storage: DependencyMap["STORAGE"][T];
    //protected apiManager: DependencyMap["API"][T]
    protected cache?: DataSource;

    useBlockCache(opts: DataSourceOptions) {
        this.cache = new DataSource({
            ...opts,
            entities: [CachedBlock, CachedTxs]
        })

        return this;
    }
}

export class CosmosBlocksIndexer extends BlocksIndexerBase<"COSMOS"> {
    constructor() {
        super();
    }

    static create() {
        return new CosmosBlocksIndexer();
    }

    compose() {
        if (this.cache) {
            this.storage = new CosmosIndexerStorage(this.cache);
        }
    }

    run() {

    }
}

(async () =>
    await CosmosBlocksIndexer
        .create()
        .run()
)();

export type DependencyMap = {
    STORAGE: {
        ETH: EthereumIndexerStorage;
        COSMOS: CosmosIndexerStorage;
    }
};