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

export function serializeObject(obj: any) {
    function replacer(_key: any, value: any) {
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
    function reviver(_key: any, value: any) {
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

const second = 1000;
const minute = second * 60;
const hour = minute * 60;
const day = hour * 24;
export const INTERVALS = { second, minute, hour, day }