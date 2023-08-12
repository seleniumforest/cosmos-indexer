# Indexer for Cosmos SDK based blockchains
Iterates blocks from given height. Takes every block and transaction, and passes it to your handler. Works with multiple RPCs from chain-registry, balancing between them.


```npm install https://github.com/seleniumforest/cosmos-indexer```

## Usecases

1. Alerts - to catch some event in blockchain faster as possible. 
2. To collect data needed for on-chain analysis, dashboards. 
3. Minters/Scripts
4. Alternative to websocket connection

## Usage

See  ```src/example.ts```