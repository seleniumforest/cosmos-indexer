import { Block, IndexedTx, SearchTxQuery, StargateClient } from "@cosmjs/stargate";

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

    static async createIndexer(opts: ClientOptions): Promise<IndexerClient> {
        let client = await StargateClient.connect(opts.rpcUrl);
        return new IndexerClient(client, opts);
    }

    async getBlock(height?: number | undefined): Promise<Block> {
        try {
            let block = await this.client.getBlock(height);
            this.ok++;

            return block;
        } catch (err: any) {
            this.fail++;
            return Promise.reject(err?.message)
        }
    }

    async searchTx(query: SearchTxQuery): Promise<IndexedTx[]> {
        try {
            let txs = await this.client.searchTx(query);
            this.ok++;

            return txs;
        } catch (err: any) {
            this.fail++;
            return Promise.reject(err?.message);
        }
    }

    async getHeight(): Promise<number> {
        try {
            let lastestHeight = await this.client.getHeight();
            this.ok++;

            return lastestHeight;
        } catch (err: any) {
            this.fail++;
            return Promise.reject(err?.message);
        }
    }
}

interface ClientOptions {
    rpcUrl: string,
    priority: boolean
}