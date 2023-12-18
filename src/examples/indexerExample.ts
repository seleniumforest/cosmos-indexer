import { IndexedTx } from "@cosmjs/stargate";
import { BlocksWatcher } from "../blocksWatcher";

(async () => {
    await BlocksWatcher
        .create()
        .useNetwork({
            //network name, as mentioned here https://github.com/cosmos/chain-registry/
            name: "stargaze",
            //RAW_TXS - txs without execution result, INDEXED_TXS - txs with eventlogs
            dataToFetch: "INDEXED_TXS",
            //you can pass custom RPC, it will prioritize it over registry's rpcs
            //rpcUrls: [ "your-rpc.com:26657" ],
            //you can start from specific block, but be sure that there's at least one node stores data from this block
            fromBlock: 11177007
        })
        //there could be multiple networks
        .useNetwork({
            name: "persistence",
            dataToFetch: "RAW_TXS"
        })
        //typeorm datasourceoptions object https://orkhan.gitbook.io/typeorm/docs/data-source-options 
        .useBlockCache({
            type: "postgres",
            host: "localhost",
            port: 5432,
            username: "postgres",
            password: "1",
            database: "index",
            schema: "public",
            synchronize: true
        })
        //it will fetch from chain-registry 
        .useChainRegistryRpcs()
        //if fromBlock specified, it will fetch 5 block in parallel, please don't use large batches, rpc could throw 429's 
        .useBatchFetching(5)
        //now you can handle block with txs, how you want
        //cast block to "as IndexedBlock" if dataToFetch set to "INDEXED_TXS", otherwise "as Block"
        .onBlockRecieved(async (ctx, block) => {
            console.log(ctx.chain.chain_name, block.header.height, block.txs.map((x: any) => x.hash))
        })
        .run()
})();