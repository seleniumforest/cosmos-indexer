export class CantGetTxsInBlockErr extends Error {
    constructor(networkName: string, height: string | number, endpointSet: any) {
        let message = `Couldn't get txs at ${height} for network ${networkName} with endpoints set ${JSON.stringify(endpointSet)}`;
        console.error(message);
        super(message);
    }
}

export class CantGetLatestHeightErr extends Error {
    constructor(networkName: string, endpointSet: string[]) {
        let message = `Couldn't get latest height for network ${networkName} with endpoints set ${JSON.stringify(endpointSet)}`;
        console.error(message);
        super(message);
    }
}

export class CantGetBlockHeaderErr extends Error {
    constructor(networkName: string, height: number, endpointSet: string[]) {
        let message = `Couldn't get latest block header ${height} for network ${networkName} with endpoints set ${JSON.stringify(endpointSet)}`;
        console.error(message);
        super(message);
    }
}