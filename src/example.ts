import { BlocksWatcher } from "./blocksWatcher";

(async () => {
    await BlocksWatcher
        .create()
        .addNetwork({ 
            //network name, as mentioned here https://github.com/cosmos/chain-registry/
            name: "stargaze", 
            //RAW_TXS - txs without execution result, INDEXED_TXS - txs with eventlogs
            dataToFetch: "INDEXED_TXS",
            //you can pass custom RPC (which is on 26657 port), it will prioritize it over registry's rpcs
            //rpcUrls: [ "your-rpc.com" ],
            //you can start from specific block, but be sure that there's at least one node stores data from this block
            //fromBlock: undefined
        })
        //it will fetch from chain-registry 
        .useChainRegistryRpcs()
        //it will fetch 5 block in parallel, please don't use large batches, rpc could throw 429's 
        .useBatchFetching(5)
        //now you can handle block with txs, how you want
        .onBlockRecieved(async (ctx, block) => {
            console.log(ctx.networkName, block.header.height, block.txs)
        })
        .run()
})();