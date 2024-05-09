import { Block, IndexedTx, SearchTxQuery, StargateClient } from "@cosmjs/stargate";
import { logger } from "./helpers";
import { BlockResultsResponse, CometClient, connectComet } from "@cosmjs/tendermint-rpc";

export class IndexerClient {
    client: CometClient;
    ok: number = 0;
    fail: number = 0;
    rpcUrl: string = "";
    priority: boolean = false;

    private constructor(client: CometClient, opts: ClientOptions) {
        this.rpcUrl = opts.rpcUrl;
        this.priority = opts.priority;
        this.client = client;
    }

    static async createClient(opts: ClientOptions): Promise<IndexerClient> {
        let client = await connectComet(opts.rpcUrl);
        return new IndexerClient(client, opts);
    }

    async getBlock(height?: number | undefined) {
        let result = await this.useResultReporting(() => this.client.block(height));
        return result;
    }

    async getBlocks(from: number, to: number) {
        let result = await this.useResultReporting(() => this.client.blockchain(from, to));
        return result;
    }

    async searchTx(query: string) {
        let result = await this.useResultReporting(() => this.client.txSearch({ query }));
        return result;
    }

    async getHeight(): Promise<number> {
        let result = await this.useResultReporting(() => this.client.blockResults());
        return result.height;
    }

    private async useResultReporting<T>(func: () => T) {
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