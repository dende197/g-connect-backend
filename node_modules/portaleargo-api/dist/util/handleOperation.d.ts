import type { APIOperation } from "../types";
/**
 * Gestisci dei dati dell'API contenenti un'operazione.
 * @param array - L'array ricevuto
 * @param old - L'eventuale array da modificare
 * @param pk - Una funzione per estrarre il pk
 * @returns Il nuovo array
 */
export declare const handleOperation: <T, P extends boolean>(array: APIOperation<T, P>[], old?: Omit<Extract<APIOperation<T, P>, {
    operazione?: "I";
}>, "operazione">[], ...[pk]: P extends true ? [pk: (a: Omit<Extract<APIOperation<T, P>, {
    operazione?: "I";
}>, "operazione">) => string] : []) => Omit<Extract<(P extends true ? {
    pk?: undefined;
} : {
    pk: string;
}) & {
    operazione: "D";
    pk: string;
}, {
    operazione?: "I";
}> | Extract<(P extends true ? {
    pk?: undefined;
} : {
    pk: string;
}) & T & (P extends true ? {
    operazione: "I";
} : {
    operazione?: "I";
}), {
    operazione?: "I";
}>, "operazione">[];
