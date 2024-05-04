# Self-hosted indexer for Cosmos SDK based blockchains

Iterates blocks from given height and catches up latest blocks. Takes every block header and/or transactions, and passes it to your handler. Works with multiple RPCs from chain-registry, balancing between them, or with your own prioritized RPC. Optionally, caches blocks into your db to reindex data faster.

## Project status

Core features are stable (iterating over blocks, working with chain-registry) in production. Secondary features need some testing. Also, needs refactoring (make low-coupled modules, use depinjection and make better types) before i make docker/k8s configs to run this as persistent app.

## Usecases

1. Alerts - to catch some event in blockchain faster as possible.
2. To collect data needed for on-chain analysis, dashboards.
3. Minters/Scripts
4. Alternative to websocket connection

## Usage

Install with  

```bash
npm install cosmos-indexer
```
or

```bash
yarn add cosmos-indexer
```

See usage examples go to src/examples



```js
import { BlocksWatcher, IndexedBlock } from "cosmos-indexer";

(async () => {
    await BlocksWatcher
        .create()
        .useNetwork({
            //network name, as mentioned here https://github.com/cosmos/chain-registry/
            name: "stargaze",

            //RAW_TXS - txs without execution result
            //INDEXED_TXS - txs with eventlogs
            //ONLY_HEIGHT - block heights with date, for minters
            //In case of ONLY_HEIGHT It will poll rpcs every second for new height (/status endpoint), so please don't run this for a long time. 
            dataToFetch: "INDEXED_TXS",

            //you can pass custom RPC, it will prioritize it over chain-registry's rpcs
            //rpcUrls: [ "your-rpc.com:26657" ],

            //you can start from specific block, but be sure that there's at least one node stores data from this block
            fromBlock: 13448926,

            //lag for 10 block if it's ok for you to have a "near-real-time" data, 
            //it will wait for all nodes to sync and you'll get less errors
            //default 0
            lag: 10,

            //now you can handle block with txs, how you want
            //if dataToFetch set to "INDEXED_TXS", cast block to "as IndexedBlock" 
            //if dataToFetch set to "RAW_TXS", cast block to "as Block"
            //if dataToFetch set to "ONLY_HEIGHT", cast block to tuple "as [number, Date]"  
            onDataRecievedCallback: async (ctx, block) => {
                let b = block as IndexedBlock;
                console.log(ctx.chain.chain_name, b.header.height, b.txs.map((x: any) => x.hash))
            }
        })
        //Block cache, in case if you need to reindex data in future
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

        //it will fetch available RPCs from chain-registry 
        .useChainRegistryRpcs()

        //if fromBlock specified, it will fetch 5 block in parallel, please don't use large batches, rpc could throw 429's 
        .useBatchFetching(5)

        //0: silly, 1: trace, 2: debug, 3: info, 4: warn, 5: error, 6: fatal
        .useLogLevel(5)

        .run()
})();

```