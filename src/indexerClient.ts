import { Block, IndexedTx, SearchTxQuery, StargateClient } from "@cosmjs/stargate";
import { logger } from "./helpers";

export class IndexerClient {
    client: StargateClient;
    ok: number = 0;
    fail: number = 0;
    rpcUrl: string = "";
    priority: boolean = false;

    private constructor(client: StargateClient, opts: ClientOptions) {
        this.rpcUrl = opts.rpcUrl;
        this.priority = opts.priority;
        this.client = client;
    }

    static async createClient(opts: ClientOptions): Promise<IndexerClient> {
        let client = await StargateClient.connect(opts.rpcUrl);
        return new IndexerClient(client, opts);
    }

    async getBlock(height?: number | undefined): Promise<Block> {
        logger.silly(`Trying to fetch block ${height} from ${this.rpcUrl}`)
        return await this.useResultReporting(() => this.client.getBlock(height));
    }

    async searchTx(query: SearchTxQuery): Promise<IndexedTx[]> {
        logger.silly(`Trying to search txs ${JSON.stringify(query)} from ${this.rpcUrl}`)
        return await this.useResultReporting(() => this.client.searchTx(query));
    }

    async getHeight(): Promise<number> {
        logger.silly(`Trying to get height from ${this.rpcUrl}`);
        return await this.useResultReporting(() => this.client.getHeight());
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