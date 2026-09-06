// ============================================================================
// G-CONNECT DEMO / MOCK DATA ENGINE
// ============================================================================
// Per disattivare o togliere istantaneamente TUTTI i dati finti e tornare
// ai soli dati reali di Argo, imposta la variabile sottostante su: false
// ============================================================================
(function (root) {
    'use strict';

    var ENABLE_DEMO_DATA = true; // <-- MASTER SWITCH: true per attivare, false per disattivare

    function getIsoDate(daysOffset) {
        var d = new Date();
        if (daysOffset) d.setDate(d.getDate() + daysOffset);
        var y = d.getFullYear();
        var m = String(d.getMonth() + 1).padStart(2, '0');
        var day = String(d.getDate()).padStart(2, '0');
        return y + '-' + m + '-' + day;
    }

    var todayIso = getIsoDate(0);
    var tomorrowIso = getIsoDate(1);
    var dayAfterIso = getIsoDate(2);
    var dayPlus3Iso = getIsoDate(3);

    var DEMO_DATA = {
        // --------------------------------------------------------------------
        // 1. VOTI (A.S. 2026/2027 in corso)
        // --------------------------------------------------------------------
        voti: [
            // === ANNO SCOLASTICO CORRENTE 2026/2027 (Settembre 2026) ===
            // Italiano
            { id: 'v26-ita-1', materia: 'Italiano', valore: 8, voto: 8, data: '2026-09-04', tipo: 'Orale', docente: 'Prof.ssa Bianchi', commento: 'Interrogazione su Dante e le origini della lingua volgare' },
            { id: 'v26-ita-2', materia: 'Italiano', valore: 7.5, voto: 7.5, data: '2026-09-02', tipo: 'Scritto', docente: 'Prof.ssa Bianchi', commento: 'Analisi del testo poetico e comprensione critica' },
            // Matematica (Include insufficienza per mostrare calcolo recupero e goal simulator)
            { id: 'v26-mat-1', materia: 'Matematica', valore: 7, voto: 7, data: '2026-09-02', tipo: 'Scritto', docente: 'Prof. Ferrari', commento: 'Verifica su domini di funzione e grafici deducibili' },
            { id: 'v26-mat-2', materia: 'Matematica', valore: 4.5, voto: 4.5, data: '2026-09-04', tipo: 'Scritto', docente: 'Prof. Ferrari', commento: 'Difficoltà nel calcolo dei limiti notevoli e asintoti' },
            { id: 'v26-mat-3', materia: 'Matematica', valore: 8, voto: 8, data: '2026-09-05', tipo: 'Orale', docente: 'Prof. Ferrari', commento: 'Ottimo recupero: dimostrazione del teorema di Weierstrass' },
            // Fisica (Altro voto basso per testare l'indicatore di attenzione)
            { id: 'v26-fis-1', materia: 'Fisica', valore: 5, voto: 5, data: '2026-09-03', tipo: 'Scritto', docente: 'Prof. Costa', commento: 'Esercizi su cinematica rotazionale ed energia' },
            { id: 'v26-fis-2', materia: 'Fisica', valore: 7, voto: 7, data: '2026-09-05', tipo: 'Orale', docente: 'Prof. Costa', commento: 'Buona esposizione delle leggi della termodinamica' },
            // Informatica
            { id: 'v26-inf-1', materia: 'Informatica', valore: 9, voto: 9, data: '2026-09-04', tipo: 'Pratico', docente: 'Prof. De Luca', commento: 'Sviluppo algoritmo di ordinamento e ricerca in laboratorio' },
            { id: 'v26-inf-2', materia: 'Informatica', valore: 8.5, voto: 8.5, data: '2026-09-02', tipo: 'Scritto', docente: 'Prof. De Luca', commento: 'Modello relazionale e query SQL complesse' },
            // Scienze Naturali
            { id: 'v26-sci-1', materia: 'Scienze Naturali', valore: 7, voto: 7, data: '2026-09-05', tipo: 'Orale', docente: 'Prof.ssa Romano', commento: 'Struttura della cellula e respirazione cellulare' },
            { id: 'v26-sci-2', materia: 'Scienze Naturali', valore: 6.5, voto: 6.5, data: '2026-09-03', tipo: 'Scritto', docente: 'Prof.ssa Romano', commento: 'Verifica su genetica mendeliana' },
            // Inglese
            { id: 'v26-ing-1', materia: 'Inglese', valore: 8.5, voto: 8.5, data: '2026-09-04', tipo: 'Orale', docente: 'Prof. Miller', commento: 'Fluency and accurate vocabulary discussing modern society' },
            { id: 'v26-ing-2', materia: 'Inglese', valore: 8, voto: 8, data: '2026-09-02', tipo: 'Scritto', docente: 'Prof. Miller', commento: 'Essay writing: argumentative structure on climate issues' },
            // Storia Triennio
            { id: 'v26-sto-1', materia: 'Storia Triennio', valore: 7.5, voto: 7.5, data: '2026-09-03', tipo: 'Orale', docente: 'Prof. Moretti', commento: 'Quadro socio-politico dell\'Europa moderna' },
            // Filosofia
            { id: 'v26-fil-1', materia: 'Filosofia', valore: 8, voto: 8, data: '2026-09-04', tipo: 'Orale', docente: 'Prof. Moretti', commento: 'Origine del pensiero occidentale: i presocratici e Socrate' },
            // Disegno e Storia Dell'Arte Triennio
            { id: 'v26-art-1', materia: 'Disegno e Storia Dell\'Arte Triennio', valore: 7.5, voto: 7.5, data: '2026-09-05', tipo: 'Pratico', docente: 'Prof.ssa Ricci', commento: 'Tavola n.1: assonometria isometrica di solidi composti' },
            { id: 'v26-art-2', materia: 'Disegno e Storia Dell\'Arte Triennio', valore: 7, voto: 7, data: '2026-09-02', tipo: 'Orale', docente: 'Prof.ssa Ricci', commento: 'Analisi architettonica e prospettica del Rinascimento' },
            // Scienze Motorie e Sportive
            { id: 'v26-scm-1', materia: 'Scienze Motorie e Sportive', valore: 9, voto: 9, data: '2026-09-03', tipo: 'Pratico', docente: 'Prof. Galli', commento: 'Test di resistenza aerobica (Cooper test) e coordinazione' },
            // Educazione Civica
            { id: 'v26-civ-1', materia: 'Educazione Civica', valore: 8, voto: 8, data: '2026-09-04', tipo: 'Orale', docente: 'Prof.ssa Bianchi', commento: 'Principi fondamentali della Costituzione Italiana (art. 1-12)' }
        ],

        // --------------------------------------------------------------------
        // 2. COMPITI (AGENDA / HOME / CALENDARIO)
        // --------------------------------------------------------------------
        tasks: [
            // ── COMPITI PER OGGI (DOMENICA) ──
            {
                id: 'task-demo-today-1',
                subject: 'Matematica',
                due_date: todayIso,
                text: 'Ripasso formule goniometriche ed esercizi sui limiti notevoli pag. 134 n. 45, 48.',
                done: false,
                source: 'argo'
            },
            {
                id: 'task-demo-today-2',
                subject: 'Italiano',
                due_date: todayIso,
                text: 'Lettura e parafrasi Purgatorio Canto I (versi 1-45). Analisi figura di Catone.',
                done: false,
                source: 'argo'
            },
            {
                id: 'task-demo-today-3',
                subject: 'Filosofia',
                due_date: todayIso,
                text: 'Studio approfondito del mito della caverna di Platone e significato gnoseologico.',
                done: true,
                source: 'argo'
            },

            // ── COMPITI PER DOMANI (LUNEDÌ) ──
            {
                id: 'task-demo-tomorrow-1',
                subject: 'Fisica',
                due_date: tomorrowIso,
                text: 'Problemi sulla conservazione dell\'energia meccanica e attrito n. 12, 14 pag. 210.',
                done: false,
                source: 'argo'
            },
            {
                id: 'task-demo-tomorrow-2',
                subject: 'Inglese',
                due_date: tomorrowIso,
                text: 'Writing task: "Technology and human connection in modern society" (250 parole).',
                done: false,
                source: 'argo'
            },
            {
                id: 'task-demo-tomorrow-3',
                subject: 'Informatica',
                due_date: tomorrowIso,
                text: 'Verifica pratica di laboratorio: programmazione orientata agli oggetti e algoritmi.',
                done: false,
                isExam: true,
                type: 'verifica',
                source: 'argo'
            },
            {
                id: 'task-demo-tomorrow-4',
                subject: 'Scienze Naturali',
                due_date: tomorrowIso,
                text: 'Scheda di sintesi sulla duplicazione del DNA e meccanismi di proofreading cellulare.',
                done: false,
                source: 'argo'
            },

            // ── COMPITI PER I GIORNI SUCCESSIVI ──
            {
                id: 'task-demo-later-1',
                subject: 'Storia Triennio',
                due_date: dayAfterIso,
                text: 'Quadro riassuntivo sulle monarchie nazionali e trasformazioni economiche moderne.',
                done: false,
                source: 'argo'
            },
            {
                id: 'task-demo-later-2',
                subject: 'Disegno e Storia Dell\'Arte Triennio',
                due_date: dayPlus3Iso,
                text: 'Completamento tavola assonometrica n. 2 a china e chiaroscuro.',
                done: false,
                source: 'argo'
            }
        ],

        // --------------------------------------------------------------------
        // 3. VERIFICHE PROGRAMMATE (CALENDARIO & PROMEMORIA)
        // --------------------------------------------------------------------
        verifiche: [
            {
                id: 'verif-demo-tomorrow',
                materia: 'Informatica',
                data: tomorrowIso,
                text: 'Verifica pratica di laboratorio: programmazione orientata agli oggetti e algoritmi',
                tipo: 'Prova Pratica'
            },
            {
                id: 'verif-demo-1',
                materia: 'Matematica',
                data: '2026-09-15',
                text: 'Verifica scritta su limiti di funzioni reali, continuità e asintoti',
                tipo: 'Verifica Scritta'
            },
            {
                id: 'verif-demo-2',
                materia: 'Filosofia',
                data: '2026-09-18',
                text: 'Interrogazione orale su presocratici, sofisti e Socrate',
                tipo: 'Interrogazione Orale'
            },
            {
                id: 'verif-demo-3',
                materia: 'Informatica',
                data: '2026-09-22',
                text: 'Prova pratica di laboratorio: programmazione orientata agli oggetti e algoritmi',
                tipo: 'Prova Pratica'
            },
            {
                id: 'verif-demo-4',
                materia: 'Fisica',
                data: '2026-09-24',
                text: 'Test su dinamica rotazionale e primo principio della termodinamica',
                tipo: 'Verifica Scritta'
            },
            {
                id: 'verif-demo-5',
                materia: 'Italiano',
                data: '2026-09-28',
                text: 'Tema in classe: testo argomentativo di ambito storico-letterario',
                tipo: 'Verifica Scritta'
            }
        ],

        // --------------------------------------------------------------------
        // 4. ATTIVITÀ DI CLASSE (LEZIONI & REGISTRO)
        // --------------------------------------------------------------------
        classActivities: [
            {
                id: 'act-demo-1',
                materia: 'Matematica',
                data: '2026-09-04',
                docente: 'Prof. Ferrari',
                argomento: 'Ripasso proprietà delle funzioni esponenziali e logaritmiche. Esempi pratici.'
            },
            {
                id: 'act-demo-2',
                materia: 'Italiano',
                data: '2026-09-04',
                docente: 'Prof.ssa Bianchi',
                argomento: 'Introduzione alla struttura della cantica del Purgatorio dantesco.'
            },
            {
                id: 'act-demo-3',
                materia: 'Informatica',
                data: '2026-09-05',
                docente: 'Prof. De Luca',
                argomento: 'Algoritmi ricorsivi vs iterativi. Calcolo della complessità temporale Big-O.'
            },
            {
                id: 'act-demo-4',
                materia: 'Fisica',
                data: '2026-09-05',
                docente: 'Prof. Costa',
                argomento: 'Lavoro compiuto da forze variabili e teorema dell\'energia cinetica.'
            },
            {
                id: 'act-demo-5',
                materia: 'Inglese',
                data: '2026-09-06',
                docente: 'Prof. Miller',
                argomento: 'Unit 1: Globalization and modern economy. Debate in gruppi di conversazione.'
            }
        ],

        // --------------------------------------------------------------------
        // 5. ASSENZE, RITARDI, USCITE E NOTE
        // --------------------------------------------------------------------
        assenzeData: {
            assenze: [
                {
                    id: 'ass-demo-1',
                    data: '2026-09-14',
                    numOre: 5,
                    giustificata: true,
                    motivazione: 'Motivi di salute'
                }
            ],
            ritardi: [
                {
                    id: 'rit-demo-1',
                    data: '2026-09-18',
                    oraInizio: '08:15',
                    giustificato: true,
                    motivazione: 'Disagio trasporti pubblici'
                }
            ],
            uscite: [
                {
                    id: 'usc-demo-1',
                    data: '2026-09-22',
                    oraFine: '12:10',
                    giustificata: true,
                    motivazione: 'Visita specialistica programmata'
                }
            ],
            note: [
                {
                    id: 'nota-demo-1',
                    data: '2026-09-21',
                    autore: 'Prof.ssa Bianchi',
                    testo: 'L\'alunno dimostra vivo interesse e partecipazione costruttiva durante le lezioni.',
                    tipo: 'Nota di merito'
                }
            ],
            totaleAssenze: 1,
            totaleRitardi: 1,
            totaleUscite: 1,
            oreAssenzaTotali: 5,
            daGiustificare: 0
        }
    };

    /**
     * Applica i dati finti se ENABLE_DEMO_DATA è true.
     * Salva anche i dati in localStorage per persistenza durante refresh/offline.
     * PRESERVA TOTALMENTE LE CIRCOLARI REALI.
     */
    function applyDemoDataIfEnabled(targetState) {
        if (!ENABLE_DEMO_DATA) return false;
        if (!targetState || typeof targetState !== 'object') return false;

        targetState.voti = Array.isArray(DEMO_DATA.voti) ? DEMO_DATA.voti.slice() : [];
        targetState.tasks = Array.isArray(DEMO_DATA.tasks) ? DEMO_DATA.tasks.slice() : [];
        targetState.verifiche = Array.isArray(DEMO_DATA.verifiche) ? DEMO_DATA.verifiche.slice() : [];
        targetState.classActivities = Array.isArray(DEMO_DATA.classActivities) ? DEMO_DATA.classActivities.slice() : [];
        targetState.assenzeData = JSON.parse(JSON.stringify(DEMO_DATA.assenzeData));

        // IMPORTANTE: targetState.circolari rimane INVARIATO (vengono utilizzate le circolari reali)!

        try {
            var getPrefix = (typeof root.lsKey === 'function') ? root.lsKey : function(k) { return k; };
            root.localStorage.setItem(getPrefix('voti'), JSON.stringify(targetState.voti));
            root.localStorage.setItem(getPrefix('tasks'), JSON.stringify(targetState.tasks));
            root.localStorage.setItem(getPrefix('verifiche'), JSON.stringify(targetState.verifiche));
            root.localStorage.setItem(getPrefix('class_activities'), JSON.stringify(targetState.classActivities));
            root.localStorage.setItem(getPrefix('assenzeData'), JSON.stringify(targetState.assenzeData));
            root.localStorage.setItem('gc_demo_data_active', '1');
        } catch (_) {}

        return true;
    }

    /**
     * Rimuove i dati finti e ripristina la sessione normale.
     */
    function clearDemoData(targetState) {
        try {
            var getPrefix = (typeof root.lsKey === 'function') ? root.lsKey : function(k) { return k; };
            root.localStorage.removeItem(getPrefix('voti'));
            root.localStorage.removeItem(getPrefix('tasks'));
            root.localStorage.removeItem(getPrefix('verifiche'));
            root.localStorage.removeItem(getPrefix('class_activities'));
            root.localStorage.removeItem(getPrefix('assenzeData'));
            root.localStorage.removeItem('gc_demo_data_active');
        } catch (_) {}

        if (targetState && typeof targetState === 'object') {
            targetState.voti = [];
            targetState.tasks = [];
            targetState.verifiche = [];
            targetState.classActivities = [];
            targetState.assenzeData = null;
        }
    }

    // Esportazione per browser e test Node.js
    root.ENABLE_DEMO_DATA = ENABLE_DEMO_DATA;
    root.DEMO_DATA = DEMO_DATA;
    root.applyDemoDataIfEnabled = applyDemoDataIfEnabled;
    root.clearDemoData = clearDemoData;

    if (typeof module !== 'undefined' && module.exports) {
        module.exports = {
            ENABLE_DEMO_DATA: ENABLE_DEMO_DATA,
            DEMO_DATA: DEMO_DATA,
            applyDemoDataIfEnabled: applyDemoDataIfEnabled,
            clearDemoData: clearDemoData
        };
    }
})(typeof window !== 'undefined' ? window : globalThis);
