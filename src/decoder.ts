import { Block, IndexedTx } from "@cosmjs/stargate";
import { BlockWithDecodedTxs, DecodedTxRawFull } from "./blocksWatcher";
import { decodeTxRaw } from "@cosmjs/proto-signing";
import { Any } from "cosmjs-types/google/protobuf/any";
import { BlockResultsResponse, Event } from "@cosmjs/tendermint-rpc";
import { fromUtf8 } from "@cosmjs/encoding";
import * as crypto from 'crypto';

const BlacklistedMsgs = [
    //this produces update_client event with fatty "header" value
    "MsgUpdateClient",
    //this sends ics23:iavl data inside msg
    "MsgSubmitQueryResponse"
]

function isBlacklisted(typeUrl: string) {
    return BlacklistedMsgs.some(msg => typeUrl.toLowerCase().includes(msg.toLowerCase()))
}

function cleanMessages(msgs: Any[]) {
    return msgs.map(msg => {
        return {
            typeUrl: msg.typeUrl,
            value: isBlacklisted(msg.typeUrl) ? Uint8Array.from([]) : msg.value
        }
    })
}

function cleanEvents(events: readonly Event[]): Event[] {
    return events.map(({ attributes, type }) => {
        return {
            type,
            attributes: attributes.map(({ key, value }) => {
                let keyString = key instanceof Uint8Array ? fromUtf8(key) : key;

                return {
                    key,
                    value: keyString === "header" && type === "update_client" ? Uint8Array.from([]) : value
                }
            })
        }
    })
}

function sha256FromUint8Array(uint8Array: Uint8Array): string {
    const hash = crypto.createHash('sha256');
    hash.update(Buffer.from(uint8Array));
    return hash.digest('hex').toUpperCase();
}

export function decodeAndTrimBlock(block: Block, trim: boolean): BlockWithDecodedTxs {
    return {
        type: "RAW_TXS",
        ...block,
        txs: block.txs.map(tx => {
            let decoded = decodeTxRaw(tx);
            if (trim)
                decoded.body.messages = cleanMessages(decoded.body.messages);
            return {
                ...decoded,
                txhash: sha256FromUint8Array(tx)
            };
        })
    };
}

export function trimBlockResults(blockResults: BlockResultsResponse): BlockResultsResponse {
    let result = {
        ...blockResults,
        results: blockResults.results.map(tx => {
            return {
                ...tx,
                log: "",
                events: cleanEvents(tx.events)
            }
        })
    }

    return result;
}