import { Block, IndexedTx, SearchTxQuery, StargateClient } from "@cosmjs/stargate";
import { logger } from "./helpers";
import { BlockResultsResponse, CometClient, connectComet } from "@cosmjs/tendermint-rpc";

export class IndexerClient extends StargateClient {
    ok: number = 0;
    fail: number = 0;
    rpcUrl: string;
    priority: boolean = false;

    private constructor(client: CometClient, opts: ClientOptions) {
        super(client, {});
        this.rpcUrl = opts.rpcUrl;
        this.priority = opts.priority;
    }

    static async createClient(opts: ClientOptions): Promise<IndexerClient> {
        let client = await connectComet(opts.rpcUrl);
        return new IndexerClient(client, opts);
    }

    async getBlock(height?: number | undefined): Promise<Block> {
        logger.silly(`Trying to fetch block ${height} from ${this.rpcUrl}`)
        return await this.useResultReporting(() => super.getBlock(height));
    }

    async getBlockResults(height?: number | undefined): Promise<BlockResultsResponse> {
        logger.silly(`Trying to fetch block ${height} from ${this.rpcUrl}`)
        return await this.useResultReporting(() => super.forceGetCometClient().blockResults(height));
    }

    async searchTx(query: SearchTxQuery): Promise<IndexedTx[]> {
        logger.silly(`Trying to search txs ${JSON.stringify(query)} from ${this.rpcUrl}`);
        return await this.useResultReporting(() => super.searchTx(query));
    }

    async getHeight(): Promise<number> {
        logger.silly(`Trying to get height from ${this.rpcUrl}`);
        return await this.useResultReporting(() => super.getHeight());
    }

    private async useResultReporting(func: any) {
        try {
            let result = await func();
            this.ok++;

            return Promise.resolve(result);
        } catch (err: any) {
            this.fail++;
            logger.warn("RPC response err", err)
            return Promise.reject();
        }
    }
}

interface ClientOptions {
    rpcUrl: string,
    priority: boolean
}