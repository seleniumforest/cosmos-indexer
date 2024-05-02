import { LogsWatcher } from "../logsWatcher";

/**
 Watches for transactions from specified address. 
 Some events couldn't be fetched because of RPC fails by timeout, use BlocksWatcher instead.
*/

(async () => {
    const keys = [{ key: "message.sender", value: "stars1j5g3rnkap08twuskcawysd8vdma2jvdwtperhe" }];

    await LogsWatcher
        .create()
        .useNetwork({
            name: "stargaze",
            fromBlock: 13051429,
            onDataRecievedCallback: async (ctx, txs) => {
                console.log(`found ${txs.length} txs on block range [${ctx.range[0]}, ${ctx.range[1]}], ${ctx.range[1] - ctx.range[0]} blocks`);
            }
        }, keys)
        .useChainRegistryRpcs()
        .useLogLevel(5)
        .run()
})();