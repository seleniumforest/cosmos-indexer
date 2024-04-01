import { Logger } from "tslog";

export const logger = new Logger({ name: "logger", minLevel: 1 });

export const isFulfilled = <T,>(p: PromiseSettledResult<T>): p is PromiseFulfilledResult<T> => p.status === 'fulfilled';
export const isRejected = <T,>(p: PromiseSettledResult<T>): p is PromiseRejectedResult => p.status === 'rejected';

export async function awaitWithTimeout<T>(promise: Promise<T>, timeoutMs: number, errorMsg?: string): Promise<T> {
    const timeoutPromise = new Promise<T>((_, reject) => {
        setTimeout(() => {
            reject(new Error(errorMsg || "Timeout exceeded"));
        }, timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
}