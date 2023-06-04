export const isFulfilled = <T,>(p:PromiseSettledResult<T>): p is PromiseFulfilledResult<T> => p.status === 'fulfilled';
export const isRejected = <T,>(p:PromiseSettledResult<T>): p is PromiseRejectedResult => p.status === 'rejected';

export const defaultRegistryUrls = [
    "https://proxy.atomscan.com/directory/",
    "https://registry.ping.pub/"
]