import { Logger } from "tslog";
import { BlockType, BlockWithIndexedTxs, IndexerBlock } from "./blocksWatcher";

/**
 * 
 * @param lvl 0: silly, 1: trace, 2: debug, 3: info, 4: warn, 5: error, 6: fatal
 */
export const logger = new Logger({ name: "logger", minLevel: 1 });

export const isFulfilled = <T,>(p: PromiseSettledResult<T>): p is PromiseFulfilledResult<T> => p.status === 'fulfilled';
export const isRejected = <T,>(p: PromiseSettledResult<T>): p is PromiseRejectedResult => p.status === 'rejected';

export async function awaitWithTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg?: string): Promise<T> {
    const timeoutPromise = new Promise<T>((_, reject) => {
        setTimeout(() => {
            reject(new Error(errorMsg || `Timeout ${timeoutMs} exceeded`));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
}

// export function serializeBlock(block: IndexerBlock): string {
//     if (block.type === "RAW_TXS") {
//         return JSON.stringify({
//             ...block,
//             txs: block.txs.map(x => x.toString())
//         })
//     }

//     if (block.type === "INDEXED_TXS") {
//         let b = block as (BlockWithIndexedTxs);
//         return JSON.stringify({
//             ...b,
//             txs: b.txs.map(tx => ({
//                 ...tx,
//                 gasUsed: tx.gasUsed.toString(),
//                 gasWanted: tx.gasWanted.toString(),
//                 tx: uint8ArrayToBase64(tx.tx),
//                 //we dont serialize rawlog if events are filled. Otherwise, keep it as is for older versions of cosmos sdk
//                 rawLog: Array.isArray(tx.events) && tx.events.length > 0 ? "" : tx.rawLog
//             }))
//         })
//     }

//     return JSON.stringify(block);
// }

// export function deserializeBlock(block: string) {
//     let obj = JSON.parse(block) as IndexerBlock;

//     if (obj.type === "RAW_TXS") {
//         return {
//             ...obj,
//             txs: obj.txs.map((x: any) => base64ToUint8Array(x))
//         } as IndexerBlock
//     }

//     if (obj.type === "INDEXED_TXS") {
//         return {
//             ...obj,
//             txs: obj.txs.map((x: any) => {
//                 debugger;
//                 return {

//                 }
//             })
//         }
//     }
// }

export function serializeObject(obj: any) {
    function replacer(key: any, value: any) {
        if (value instanceof Uint8Array) {
            return { type: 'Uint8Array', data: Buffer.from(value).toString('base64') };
        }
        if (typeof value === 'bigint') {
            return { type: 'BigInt', data: value.toString() };
        }
        return value;
    }

    return JSON.stringify(obj, replacer);
}

export function deserializeObject<T>(jsonString: string) {
    function reviver(key: any, value: any) {
        if (value && typeof value === 'object' && value.type === 'Uint8Array') {
            return new Uint8Array(Buffer.from(value.data, 'base64'));
        }
        if (value && typeof value === 'object' && value.type === 'BigInt') {
            return BigInt(value.data);
        }
        return value;
    }

    return JSON.parse(jsonString, reviver) as T;
}

function uint8ArrayToBase64(uint8Array: Uint8Array) {
    let binary = '';
    const len = uint8Array.byteLength;
    for (let i = 0; i < len; i++) {
        binary += String.fromCharCode(uint8Array[i]);
    }
    return btoa(binary);
}
function base64ToUint8Array(base64String: string) {
    const binary = atob(base64String);
    const len = binary.length;
    const uint8Array = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        uint8Array[i] = binary.charCodeAt(i);
    }
    return uint8Array;
}

const second = 1000;
const minute = second * 60;
const hour = minute * 60;
const day = hour * 24;
export const INTERVALS = { second, minute, hour, day }