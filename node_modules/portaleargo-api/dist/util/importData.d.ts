import type { ReadData } from "../types";
/**
 * Importa dei dati salvati in un file.
 * @param name - Il nome del file, escludendo l'estensione
 * @returns I dati importati
 */
export declare const importData: <T extends keyof ReadData>(name: T, path: string) => Promise<ReadData[T] | undefined>;
