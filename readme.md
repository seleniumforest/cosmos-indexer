# Indexer for Cosmos SDK based blockchains

Iterates blocks from given height and catches up latest blocks. Takes every block header and/or transactions, and passes it to your handler. Works with multiple RPCs from chain-registry, balancing between them, or with your own prioritized RPC. Optionally, caches blocks into your db to reindex data faster.

## Usecases

1. Alerts - to catch some event in blockchain faster as possible.
2. To collect data needed for on-chain analysis, dashboards.
3. Minters/Scripts
4. Alternative to websocket connection

## Usage

NPM package soon, now use
`npm install https://github.com/seleniumforest/cosmos-indexer`
to install

For api usage, see `src/examples/indexerExample.ts`

## TODO

### Code

1. Better error handling
2. Divide code to low coupled modules
3. Make advanced balancer or integrate 3rd party
4. Work with typings for Indexed/Raw blocks

### Features

1. Use dependabot to update chain-registry package more frequently
2. Feature to expose rest urls for calling other API methods (or we can pass them throgh ctx???)
3. Make configs for production build/pm2
4. Default handlers for basic events (msgsend, msgdelegate, msgvote etc.), should be extendable for any chain.
