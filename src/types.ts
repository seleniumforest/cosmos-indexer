namespace Indexer {
    export type SUPPORTED_CHAIN = "ETH" | "COSMOS";
}

namespace Indexer.Block {
    export type BlockBase = {
        height: number;
    }

    export type CosmosBlock = BlockBase & {
        cosmos: number;
    }

    export type EthereumBlock = BlockBase & {
        eth: number;
    }
}

namespace Indexer.Txs {
    export type TxBase = {
        hash: number;
    }

    export type CosmosTx = TxBase & {
        cosmos: number;
    }

    export type EthereumTx = TxBase & {
        eth: number;
    }
}