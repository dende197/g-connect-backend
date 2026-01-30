import { BaseClient } from "./BaseClient";
import type { ClientOptions } from "./types";
/**
 * Un client per interagire con l'API
 */
export declare class WebClient extends BaseClient {
    /**
     * @param options - Le opzioni per il client
     */
    constructor(options?: ClientOptions);
    static createDataProvider(): NonNullable<ClientOptions["dataProvider"]>;
    getCode(): Promise<never>;
}
