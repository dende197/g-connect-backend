import type { Credentials } from "../types";
/**
 * Ottieni il codice per il login.
 * @param credentials - Le credenziali per l'accesso
 * @returns I dati del codice da usare
 */
export declare const getCode: (credentials: Credentials) => Promise<{
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
