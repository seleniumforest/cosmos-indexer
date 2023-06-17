import { BlocksWatcher } from "./blocksWatcher";

(async () => {
    await BlocksWatcher
        .create()
        .addNetwork({ 
            name: "stargaze", 
            dataToFetch: "RAW_TXS"
        })
        .useChainRegistryRpcs()
        .useBatchFetching(5)
        .onBlockRecieved(async (ctx, block) => {
            console.log(ctx.networkName, block.header.height)
        })
        .run()
})();