# Indexer for Cosmos SDK based blockchains
Iterates blocks from given height. Takes every block and transaction, and passes it to your handler. Works with multiple RPCs from chain-registry, balancing between them.

## Usecases

1. Alerts - to catch some event in blockchain faster as possible. 
2. To collect data needed for on-chain analysis, dashboards. 
3. Minters/Scripts
4. Alternative to websocket connection

## Usage

NPM package soon, now use 
```npm install https://github.com/seleniumforest/cosmos-indexer#0.2.0``` 
to install

See  ```src/example.ts```

## TODO

### Code

1. Handle Errors
2. Divide code to low coupled modules
3. Make advanced balancer or integrate 3rd party
4. Work with typings for Indexed/Raw blocks

### Features

1. Module to integrate new blockchains
2. Use dependabot to update chain-registry package more frequently
3. Add chain-registry data hot refresh every day
4. Feature to expose rest urls for calling other API methods (or we can pass them throgh ctx???)

