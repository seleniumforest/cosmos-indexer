import { Block, IndexedTx, SearchTxQuery, StargateClient } from "@cosmjs/stargate";
import { Tendermint34Client } from "@cosmjs/tendermint-rpc";

export class IndexerClient extends StargateClient {
    ok: number = 0;
    fail: number = 0;
    rpcUrl: string = "";
    priority: boolean = false;

    private constructor(client: Tendermint34Client, opts: ClientOptions) {
        super(client, {});
        this.rpcUrl = opts.rpcUrl;
        this.priority = opts.priority;
    }

    static async createIndexer(opts: ClientOptions): Promise<IndexerClient> {
        let client = await Tendermint34Client.connect(opts.rpcUrl);
        return new IndexerClient(client, opts);
    }

    override async getBlock(height?: number | undefined): Promise<Block> {
        try {
            let block = await super.getBlock(height);
            this.ok++;

            return block;
        } catch (err: any) {
            this.fail++;
            return Promise.reject(err?.message)
        }
    }

    override async searchTx(query: SearchTxQuery): Promise<IndexedTx[]> {
        try {
            let txs = await super.searchTx(query);
            this.ok++;

            return txs;
        } catch (err: any) {
            this.fail++;
            return Promise.reject(err?.message);
        }
    }

    override async getHeight(): Promise<number> {
        try {
            let lastestHeight = await super.getHeight();
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