import type { APICorsiRecupero, APIDettagliProfilo, APILogin, APIProfilo, APIRicevimenti, ClientOptions, Credentials, Dashboard, HttpMethod, Json, LoginLink, ReadyClient, Token } from "./types";
/**
 * Un client per interagire con l'API
 */
export declare abstract class BaseClient {
    #private;
    static readonly BASE_URL = "https://www.portaleargo.it";
    /**
     * A custom fetch implementation
     */
    fetch: typeof fetch;
    /**
     * I dati del token
     */
    token?: Token;
    /**
     * I dati del login
     */
    loginData?: APILogin["data"][number];
    /**
     * I dati del profilo
     */
    profile?: APIProfilo["data"];
    /**
     * I dati della dashboard
     */
    dashboard?: Dashboard;
    /**
     * Se scrivere nella console alcuni dati utili per il debug
     */
    debug: boolean;
    /**
     * Headers aggiuntivi per ogni richiesta API
     */
    headers?: Record<string, string>;
    /**
     * Le funzioni per leggere e scrivere i dati.
     * Impostare questo valore forzerà `dataPath` a `null`
     */
    dataProvider?: NonNullable<ClientOptions["dataProvider"]>;
    /**
     * La versione di didUp da specificare nell'header.
     * * Modificare questa opzione potrebbe creare problemi nell'utilizzo della libreria
     */
    version: string;
    /**
     * Le credenziali usate per l'accesso
     */
    credentials?: Partial<Credentials>;
    /**
     * @param options - Le opzioni per il client
     */
    constructor(options?: ClientOptions);
    /**
     * Controlla se il client è pronto
     */
    isReady(): this is ReadyClient;
    /**
     * Effettua una richiesta API.
     * @param path - Il percorso della richiesta
     * @param options - Altre opzioni
     * @returns La risposta
     */
    apiRequest<T extends Json>(path: string, options?: Partial<{
        body: Json;
        method: HttpMethod;
        noWait: false;
    }>): Promise<T>;
    apiRequest<T extends Json>(path: string, options: {
        body?: Json;
        method?: HttpMethod;
        noWait: true;
    }): Promise<Omit<Response, "json"> & {
        json: () => Promise<T>;
    }>;
    /**
     * Effettua il login.
     * @returns Il client aggiornato
     */
    login(): Promise<ReadyClient & this & {
        dashboard: Dashboard;
    }>;
    /**
     * Carica i dati salvati localmente.
     */
    loadData(): Promise<void>;
    /**
     * Aggiorna il client, se necessario.
     * @returns Il nuovo token
     */
    refreshToken(): Promise<Token>;
    /**
     * Ottieni il token tramite l'API.
     * @param code - The code for the access
     * @returns I dati del token
     */
    getToken(code?: LoginLink & {
        code: string;
    }): Promise<Token>;
    /**
     * Rimuovi il profilo.
     */
    logOut(): Promise<void>;
    /**
     * Ottieni i dettagli del profilo dello studente.
     * @returns I dati
     */
    getDettagliProfilo<T extends APIDettagliProfilo["data"]>(old?: T): Promise<{
        utente: {
            flgUtente: string;
        };
        genitore: {
            flgSesso: string;
            desCognome: string;
            desEMail: string;
            desCellulare: string | null;
            desTelefono: string;
            desNome: string;
            datNascita: string;
        };
        alunno: {
            cognome: string;
            desCellulare: string | null;
            desCf: string;
            datNascita: string;
            desCap: string;
            desComuneResidenza: string;
            nome: string;
            desComuneNascita: string;
            desCapResidenza: string;
            cittadinanza: string;
            desIndirizzoRecapito: string;
            desEMail: string | null;
            nominativo: string;
            desVia: string;
            desTelefono: string;
            sesso: string;
            desComuneRecapito: string;
        };
    }>;
    /**
     * Ottieni l'orario giornaliero.
     * @param date - Il giorno dell'orario
     * @returns I dati
     */
    getOrarioGiornaliero(date?: {
        year?: number;
        month?: number;
        day?: number;
    }): Promise<{
        numOra: number;
        mostra: boolean;
        desCognome: string;
        desNome: string;
        docente: string;
        materia: string;
        pk?: string;
        scuAnagrafePK?: string;
        desDenominazione: string;
        desEmail: string;
        desSezione: string;
        ora: string | null;
    }[]>;
    /**
     * Ottieni il link per scaricare un allegato della bacheca.
     * @param uid - L'uid dell'allegato
     * @returns L'url
     */
    getLinkAllegato(uid: string): Promise<string>;
    /**
     * Ottieni il link per scaricare un allegato della bacheca alunno.
     * @param uid - l'uid dell'allegato
     * @param pkScheda - L'id del profilo
     * @returns L'url
     */
    getLinkAllegatoStudente(uid: string, pkScheda?: string | undefined): Promise<string>;
    /**
     * Ottieni i dati di una ricevuta telematica.
     * @param iuv - L'iuv del pagamento
     * @returns La ricevuta
     */
    getRicevuta(iuv: string): Promise<{
        fileName: string;
        url: string;
    }>;
    /**
     * Ottieni i voti dello scrutinio dello studente.
     * @returns I dati
     */
    getVotiScrutinio(): Promise<{
        desDescrizione: string;
        materie: string[];
        suddivisione: string;
        votiGiudizi: boolean;
        scrutinioFinale: boolean;
    }[] | undefined>;
    /**
     * Ottieni i dati riguardo i ricevimenti dello studente.
     * @returns I dati
     */
    getRicevimenti<T extends APIRicevimenti["data"]>(old?: T): Promise<{
        disponibilita: Record<string, {
            desNota: string;
            numMax: number;
            docente: {
                desCognome: string;
                desNome: string;
                pk: string;
                desEmail: string | null;
            };
            numPrenotazioniAnnullate: number | null;
            flgAttivo: string;
            oraFine: string;
            indisponibilita: string | null;
            datInizioPrenotazione: string;
            desUrl: string;
            unaTantum: string;
            oraInizioPrenotazione: string;
            datScadenza: string;
            desLuogoRicevimento: string;
            oraInizio: string;
            pk: string;
            flgMostraEmail: string;
            desEMailDocente: string;
            numPrenotazioni: number;
        }[]>;
        genitoreOAlunno: {
            desEMail: string;
            nominativo: string;
            pk: string;
            telefono: string;
        }[];
        tipoAccesso: string;
        prenotazioni: {
            operazione: string;
            datEvento: string;
            prenotazione: {
                prgScuola: number;
                datPrenotazione: string;
                numPrenotazione: number | null;
                prgAlunno: number;
                genitore: string;
                numMax: number;
                orarioPrenotazione: string;
                prgGenitore: number;
                flgAnnullato: string | null;
                flgAnnullatoDa: string | null;
                desTelefonoGenitore: string;
                flgTipo: string | null;
                datAnnullamento: string | null;
                desUrl: string | null;
                pk: string;
                genitorePK: string;
                desEMailGenitore: string;
                numPrenotazioni: number | null;
            };
            disponibilita: {
                ora_Fine: string;
                desNota: string;
                datDisponibilita: string;
                desUrl: string;
                numMax: number;
                ora_Inizio: string;
                flgAttivo: string;
                desLuogoRicevimento: string;
                pk: string;
            };
            docente: {
                desCognome: string;
                desNome: string;
                pk: string;
                desEmail: string | null;
            };
        }[];
    }>;
    /**
     * Ottieni le tasse dello studente.
     * @param pkScheda - L'id del profilo
     * @returns I dati
     */
    getTasse(pkScheda?: string | undefined): Promise<{
        tasse: {
            importoPrevisto: string;
            dataPagamento: string | null;
            listaSingoliPagamenti: {
                importoTassa: string;
                descrizione: string;
                importoPrevisto: string;
            }[] | null;
            dataCreazione: string | null;
            scadenza: string;
            rptPresent: boolean;
            rata: string;
            iuv: string | null;
            importoTassa: string;
            stato: string;
            descrizione: string;
            debitore: string;
            importoPagato: string | null;
            pagabileOltreScadenza: boolean;
            rtPresent: boolean;
            isPagoOnLine: boolean;
            status: string;
        }[];
        isPagOnlineAttivo: boolean;
    }>;
    /**
     * Ottieni i dati del PCTO dello studente.
     * @param pkScheda - L'id del profilo
     * @returns I dati
     */
    getPCTOData(pkScheda?: string | undefined): Promise<{
        percorsi: any[];
        pk: string;
    }[]>;
    /**
     * Ottieni i dati dei corsi di recupero dello studente.
     * @param pkScheda - L'id del profilo
     * @returns I dati
     */
    getCorsiRecupero<T extends APICorsiRecupero["data"]>(pkScheda?: string | undefined, old?: T): Promise<{
        corsiRecupero: any[];
        periodi: any[];
    }>;
    /**
     * Ottieni il curriculum dello studente.
     * @param pkScheda - L'id del profilo
     * @returns I dati
     */
    getCurriculum(pkScheda?: string | undefined): Promise<{
        pkScheda: string;
        classe: string;
        anno: number;
        esito: "" | {
            esitoPK: {
                codMin: string;
                codEsito: string;
            };
            desDescrizione: string;
            numColore: number;
            flgPositivo: string;
            flgTipoParticolare: string | null;
            tipoEsito: string;
            descrizione: string;
            icona: string;
            codEsito: string;
            particolarita: string;
            positivo: string;
            tipoEsitoParticolare: string;
        };
        credito: number;
        mostraInfo: boolean;
        mostraCredito: boolean;
        isSuperiore: boolean;
        isInterruzioneFR: boolean;
        media: number | null;
        CVAbilitato: boolean;
        ordineScuola: string;
    }[]>;
    /**
     * Ottieni lo storico della bacheca.
     * @param pkScheda - L'id del profilo
     * @returns I dati
     */
    getStoricoBacheca(pkScheda: string): Promise<Omit<{
        pk: string;
    } & {
        datEvento: string;
        messaggio: string;
        data: string;
        pvRichiesta: boolean;
        categoria: string;
        dataConfermaPresaVisione: string;
        url: string | null;
        autore: string;
        dataScadenza: string | null;
        adRichiesta: boolean;
        isPresaVisione: boolean;
        dataConfermaAdesione: string;
        listaAllegati: {
            nomeFile: string;
            path: string;
            descrizioneFile: string | null;
            pk: string;
            url: string;
        }[];
        dataScadAdesione: string | null;
        isPresaAdesioneConfermata: boolean;
    } & {
        operazione?: "I";
    }, "operazione">[]>;
    /**
     * Ottieni lo storico della bacheca alunno.
     * @param pkScheda - L'id del profilo
     * @returns I dati
     */
    getStoricoBachecaAlunno(pkScheda: string): Promise<Omit<{
        pk: string;
    } & {
        nomeFile: string;
        datEvento: string;
        messaggio: string;
        data: string;
        flgDownloadGenitore: string;
        isPresaVisione: boolean;
    } & {
        operazione?: "I";
    }, "operazione">[]>;
    /**
     * Ottieni i dati della dashboard.
     * @returns La dashboard
     */
    private getDashboard;
    private getProfilo;
    private getLoginData;
    private logToken;
    private rimuoviProfilo;
    private what;
    private aggiornaData;
    private checkReady;
    protected abstract getCode(): Promise<LoginLink & {
        code: string;
    }>;
}
