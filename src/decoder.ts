import { Block, IndexedTx, Event } from "@cosmjs/stargate";
import { BlockWithDecodedTxs, DecodedTxRawFull } from "./blocksWatcher";
import { decodeTxRaw } from "@cosmjs/proto-signing";
import { Any } from "cosmjs-types/google/protobuf/any";

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

export function decodeAndTrimBlock(block: Block, trim: boolean): BlockWithDecodedTxs {
    return {
        type: "RAW_TXS",
        ...block,
        txs: block.txs.map(tx => {
            let decoded = decodeTxRaw(tx);
            if (trim)
                decoded.body.messages = cleanMessages(decoded.body.messages);
            return decoded;
        })
    };
}

export function decodeAndTrimIndexedTxs(txs: IndexedTx[], trim: boolean): DecodedTxRawFull[] {
    let result = txs
        .map(tx => ({
            tx: tx,
            decoded: decodeTxRaw(tx.tx)
        }))
        //remove IBC signatures from events
        .map(({ tx, decoded: d }) => {
            if (!trim)
                return { tx, decoded: d }

            return {
                tx: {
                    ...tx,
                    events: tx.events.map(ev => ({
                        ...ev,
                        attributes: ev.attributes.map(a => ({
                            key: a.key,
                            value: a.key === "header" && ev.type === "update_client" && d.body.messages.some(x => x.typeUrl.includes("MsgUpdateClient")) ?
                                "" :
                                a.value
                        }))
                    })),
                    rawLog: Array.isArray(tx.events) && tx.events.length > 0 ? "" : tx.rawLog
                },
                decoded: d
            }
        })
        //remove ICQ relay tx bodys
        .map(({ tx, decoded: d }) => {
            let decoded = { ...d };

            if (trim)
                decoded.body.messages = cleanMessages(decoded.body.messages);

            return {
                code: tx.code,
                tx: decoded,
                events: tx.events as Event[],
                gasWanted: tx.gasWanted,
                gasUsed: tx.gasUsed,
                txIndex: tx.txIndex,
                hash: tx.hash
            }
        });

    return result;
}