import { BlocksWatcher, DataToFetch } from "./blocksWatcher";

(async () => {
    await BlocksWatcher
        .create()
        .addNetwork({ 
            name: "stride", 
            fromBlock: 3947143, 
            dataToFetch: DataToFetch.HEADER_AND_INDEXED_TRANSACTIONS 
        })
        .useChainRegistryRpcs()
        .useBatchFetching(5)
        .onBlockRecieved(async (ctx, block) => {
            console.log(ctx.networkName, block.header.height)
        })
        .run()
})();