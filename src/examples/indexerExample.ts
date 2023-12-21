import { BlocksWatcher, IndexedBlock } from "../blocksWatcher";

(async () => {
    await BlocksWatcher
        .create()
        .useNetwork({
            //network name, as mentioned here https://github.com/cosmos/chain-registry/
            name: "stargaze",
            //RAW_TXS - txs without execution result
            //INDEXED_TXS - txs with eventlogs
            //ONLY_HEIGHT - block heights with date, for minters
            //In case of ONLY_HEIGHT It will poll rpcs every second for new height (/status endpoint), 
            //so please don't run this for a long time. 
            dataToFetch: "INDEXED_TXS",
            //you can pass custom RPC, it will prioritize it over registry's rpcs
            //rpcUrls: [ "your-rpc.com:26657" ],
            //you can start from specific block, but be sure that there's at least one node stores data from this block
            fromBlock: 11177007,
            //lag for 10 block if it's ok for you to have a "near-real-time" data, 
            //it will wait for all nodes to sync and you'll get less errors
            //default 0
            lag: 10,
            //now you can handle block with txs, how you want
            //if dataToFetch set to "INDEXED_TXS", cast block to "as IndexedBlock" 
            //if dataToFetch set to "RAW_TXS", cast block to "as Block"
            //if dataToFetch set to "ONLY_HEIGHT", cast block to tuple "as [number, Date]"  
            onBlockRecievedCallback: async (ctx, block) => {
                let b = block as IndexedBlock;
                console.log(ctx.chain.chain_name, b.header.height, b.txs.map((x: any) => x.hash))
            }
        })
        //there could be multiple networks
        .useNetwork({
            name: "persistence",
            dataToFetch: "RAW_TXS"
        })
        //block cache, in case if you need to reindex data in future
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
        .run()
})();