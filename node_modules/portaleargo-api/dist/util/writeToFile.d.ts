/**
 * Salva dei dati in un file JSON.
 * @param name - Il nome del file, escludendo l'estensione
 * @param value - I dati da scrivere
 */
export declare const writeToFile: (name: string, value: unknown, path: string) => Promise<void>;
