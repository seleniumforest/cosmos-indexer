import { Block, IndexedTx, SearchTxFilter, SearchTxQuery, StargateClient } from "@cosmjs/stargate";
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

    static async create(opts: ClientOptions): Promise<IndexerClient> {
        let client = await Tendermint34Client.connect(opts.rpcUrl);
        return new IndexerClient(client, opts);
    }

    override async getBlock(height?: number | undefined): Promise<Block> {
        try {
            let block = await super.getBlock(height);
            this.reportResult(true);

            return block;
        } catch (err: any) {
            this.reportResult(false);
            return Promise.reject(err?.message)
        }
    }

    override async searchTx(query: SearchTxQuery, filter?: SearchTxFilter | undefined): Promise<readonly IndexedTx[]> {
        try {
            let txs = await super.searchTx(query, filter);
            this.reportResult(true);

            return txs;
        } catch (err: any) {
            this.reportResult(false)
            return Promise.reject(err?.message);
        }
    }

    override async getHeight(): Promise<number> {
        try {
            let lastestHeight = await super.getHeight();
            this.reportResult(true);
            
            return lastestHeight;
        } catch (err: any) {
            this.reportResult(false);
            return Promise.reject(err?.message);
        }
    }

    private reportResult(result: boolean): void {
        if (result)
            this.ok++;
        else
            this.fail++;
    }
}

interface ClientOptions {
    rpcUrl: string,
    priority: boolean
}