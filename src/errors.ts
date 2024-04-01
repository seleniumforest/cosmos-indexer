import { logger } from "./helpers";

export class CantGetTxsInBlockErr extends Error {
    constructor(networkName: string, height: string | number, endpointSet: any) {
        let message = `Couldn't get txs at ${height} for network ${networkName} with endpoints set ${JSON.stringify(endpointSet)}`;
        logger.error(message);
        super(message);
    }
}

export class CantGetLatestHeightErr extends Error {
    constructor(networkName: string, endpointSet: string[]) {
        let message = `Couldn't get latest height for network ${networkName} with endpoints set ${JSON.stringify(endpointSet)}`;
        logger.error(message);
        super(message);
    }
}

export class CantGetBlockHeaderErr extends Error {
    constructor(networkName: string, height: number, endpointSet: string[]) {
        let message = `Couldn't get latest block header ${height} for network ${networkName} with endpoints set ${JSON.stringify(endpointSet)}`;
        logger.error(message);
        super(message);
    }
}

export class UnknownChainErr extends Error {
    constructor(chainName: string) {
        let message = `Unknown chain ${chainName}`;
        logger.error(message);
        super(message);
    }
}