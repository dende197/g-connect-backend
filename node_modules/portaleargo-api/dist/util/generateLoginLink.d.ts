import type { LoginLink } from "../types";
/**
 * Genera un link per il login tramite browser.
 * @param param0 - Le opzioni per generare il link
 * @returns L'url generato con gli altri dati utilizzati
 */
export declare const generateLoginLink: ({ redirectUri, scopes, codeVerifier, challenge, id, state, nonce, }?: {
    redirectUri?: string;
    scopes?: string[];
    codeVerifier?: string;
    challenge?: string;
    id?: string;
    state?: string;
    nonce?: string;
}) => Promise<LoginLink>;
