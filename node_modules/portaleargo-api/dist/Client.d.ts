import { Pool, type Dispatcher, type RetryHandler } from "undici";
import type CacheHandler from "undici/types/cache-interceptor";
import { BaseClient } from "./BaseClient";
import type { ClientOptions } from "./types";
/**
 * Un client per interagire con l'API
 */
export declare class Client extends BaseClient {
    /**
     * Custom dispatcher.
     */
    dispatcher: Dispatcher;
    fetch: ((input: globalThis.RequestInfo | URL, init?: globalThis.RequestInit) => Promise<Response>) & typeof globalThis.fetch;
    /**
     * @param options - Le opzioni per il client
     */
    constructor(options?: ClientOptions & {
        /**
         * Il percorso della cartella dove salvare i dati.
         * * Ignorato se `dataProvider` viene fornito
         */
        dataPath?: string | null;
        /**
         * Additional options for the pool
         */
        poolOptions?: Pool.Options;
        /**
         * Retry options
         */
        retryOptions?: RetryHandler.RetryOptions;
        /**
         * Cache options
         */
        cacheOptions?: CacheHandler.CacheOptions;
    });
    static createDataProvider(dataPath?: string): NonNullable<ClientOptions["dataProvider"]>;
    createFetch(): typeof window.fetch;
    getCode(): Promise<{
        code: string;
        url: string;
        redirectUri: string;
        scopes: string[];
        codeVerifier: string;
        challenge: string;
        clientId: string;
        state: string;
        nonce: string;
    }>;
}
