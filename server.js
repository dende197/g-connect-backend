import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

// ============= NUOVA LIBRERIA =============
import { Client } from 'portaleargo-api';

// ESM path helpers
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ============= SETUP APP =============
const app = express();
app.use(express.json({ limit: '50mb' }));

// ============= CORS =============
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || "";
const _allowed = ALLOWED_ORIGINS
    .split(",")
    .map(o => o.trim())
    .filter(o => o.length > 0);

app.use(cors({
    origin: function (origin, callback) {
        const allowed = _allowed.length > 0 ? _allowed : ["https://dende197.github.io"];
        if (!origin || allowed.includes(origin) || allowed.includes("*")) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"]
}));

// ============= DEBUG MODE =============
const DEBUG_MODE = (process.env.DEBUG_MODE || "false").toLowerCase() === "true";

function debugLog(message, data = null) {
    if (DEBUG_MODE) {
        console.log(`\n🔍 ${message}`);
        if (data) console.log(JSON.stringify(data, null, 2).substring(0, 500));
    }
}

// ============= SUPABASE CLIENT =============
let supabase = null;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (supabaseUrl && supabaseKey) {
    try {
        supabase = createClient(supabaseUrl, supabaseKey);
        console.log("✅ Supabase client inizializzato");
    } catch (e) {
        console.log(`❌ Errore inizializzazione Supabase: ${e.message}`);
    }
} else {
    console.log("❌ SUPABASE NON CONFIGURATO (Modalità Offline/Locale per i social)");
}

// ============= HELPER: MAPPING DATI ARGO -> APP FRONTEND =============
// Versione robusta che cerca in più posizioni
function mapLibraryDataToAppFormat(dashboard) {
    const grades = [];
    const tasks = [];
    const promemoria = [];

    if (!dashboard || typeof dashboard !== 'object') {
        return { grades, tasks, promemoria };
    }

    // 1) VOTI: unisci tutte le possibili fonti
    const rawVoti = [
        ...(Array.isArray(dashboard.voti) ? dashboard.voti : []),
        ...(Array.isArray(dashboard.votiGiornalieri) ? dashboard.votiGiornalieri : []),
        ...(Array.isArray(dashboard.votiScrutinio) ? dashboard.votiScrutinio : []), // Inclusi per completezza
        ...(Array.isArray(dashboard.votiPeriodici) ? dashboard.votiPeriodici : []),
        ...(Array.isArray(dashboard.valutazioni) ? dashboard.valutazioni : []),
        ...(Array.isArray(dashboard?.dati?.[0]?.votiGiornalieri) ? dashboard.dati[0].votiGiornalieri : []),
        ...(Array.isArray(dashboard?.dati?.[0]?.voti) ? dashboard.dati[0].voti : []),
    ];

    for (const v of rawVoti) {
        grades.push({
            id: uuidv4().substring(0, 12),
            materia: v.desMateria || v.materia || 'N/D',
            valore: v.codVoto || v.voto || v.valore || '',
            data: v.datGiorno || v.data || v.dataVoto || '',
            tipo: v.desVoto || v.tipo || 'N/D',
            subject: v.desMateria || v.materia || 'N/D',
            value: v.codVoto || v.voto || v.valore || '',
            date: v.datGiorno || v.data || v.dataVoto || ''
        });
    }

    // 2) COMPITI: cerca sia in dashboard.compiti sia nel registro
    const rawCompiti = [
        ...(Array.isArray(dashboard.compiti) ? dashboard.compiti : []),
        ...(Array.isArray(dashboard?.dati?.[0]?.compiti) ? dashboard.dati[0].compiti : []),
        ...(Array.isArray(dashboard?.dati?.[0]?.registro) ? dashboard.dati[0].registro.flatMap(r => r.compiti || []) : []),
        ...(Array.isArray(dashboard.registro) ? dashboard.registro.flatMap(r => r.compiti || []) : []),
    ];

    // Per collegare una materia ai compiti nel registro, servono gli elementi del registro
    const registroItems = Array.isArray(dashboard.registro) ? dashboard.registro
        : Array.isArray(dashboard?.dati?.[0]?.registro) ? dashboard.dati[0].registro
            : [];

    for (const c of rawCompiti) {
        // prova ad associare la materia prendendo dall'item registro che contiene questo compito
        let materia = 'Generico';
        try {
            const owner = registroItems.find(item => Array.isArray(item.compiti) && item.compiti.includes(c));
            materia = (owner && (owner.materia || owner.desMateria)) || materia;
        } catch { }

        tasks.push({
            id: uuidv4().substring(0, 12),
            text: c.desCompito || c.compito || c.descrizione || '',
            subject: materia || 'Generico',
            due_date: c.dataConsegna || c.datCompito || c.data || '', // gestisci entrambe le varianti
            datCompito: c.dataConsegna || c.datCompito || c.data || '',
            materia: materia || 'Generico',
            done: false
        });
    }

    // 3) PROMEMORIA/BACHECA: unisci tutte le fonti
    const rawPromemoria = [
        ...(Array.isArray(dashboard.promemoria) ? dashboard.promemoria : []),
        ...(Array.isArray(dashboard.bachecaAlunno) ? dashboard.bachecaAlunno : []),
        ...(Array.isArray(dashboard?.dati?.[0]?.promemoria) ? dashboard.dati[0].promemoria : []),
        ...(Array.isArray(dashboard?.dati?.[0]?.bachecaAlunno) ? dashboard.dati[0].bachecaAlunno : []),
    ];

    for (const b of rawPromemoria) {
        promemoria.push({
            id: uuidv4().substring(0, 12),
            titolo: b.desOggetto || b.titolo || 'Avviso',
            testo: b.desMessaggio || b.testo || b.desAnnotazioni || '',
            autore: b.desMittente || 'Scuola',
            data: b.datGiorno || b.data || '',
            url: b.urlAllegato || '',
            oggetto: b.desOggetto || b.titolo || 'Avviso'
        });
    }

    return { grades, tasks, promemoria };
}

// ============= FILE PERSISTENCE (FALLBACK) =============
const POSTS_FILE = path.join(__dirname, 'posts.json');
const MARKET_FILE = path.join(__dirname, 'market.json');
const POLLS_FILE = path.join(__dirname, 'polls.json');

function loadJsonFile(filepath, defaultVal = []) {
    try {
        if (fs.existsSync(filepath)) return JSON.parse(fs.readFileSync(filepath, 'utf8'));
    } catch (e) { }
    return defaultVal;
}
function saveJsonFile(filepath, data) {
    try { fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8'); } catch (e) { }
}

// ============= ARGO AUTH ROUTES (RISCRITTE) =============

// 1. LOGIN
app.post('/login', async (req, res) => {
    const { schoolCode, username, password } = req.body;
    // Supporto per il vecchio parametro 'school'
    const school = (schoolCode || req.body.school || '').trim().toUpperCase();
    const user = (username || '').trim();
    const profileIndex = Number.isInteger(req.body?.profileIndex) ? Number(req.body.profileIndex) : 0;

    if (!school || !user || !password) {
        return res.status(400).json({ success: false, error: "Dati mancanti" });
    }

    try {
        debugLog(`🔐 Login attempt for ${user} @ ${school} (Idx: ${profileIndex})`);

        // ISTANZA LIBRERIA
        // Nota: dataProvider: null previene la cache su file system che potrebbe causare problemi di permessi o stato sporco
        const argo = new Client({
            schoolCode: school,
            username: user,
            password: password,
            dataProvider: null
        });

        // EFFETTUA LOGIN
        await argo.login();
        debugLog("✅ Login libreria successo");

        // ENUMERAZIONE PROFILI (Multi-figlio)
        let profiles = [];
        try {
            // Se la libreria espone un array di profili/soggetti, usalo
            const candidatesArr = argo.profiles || argo.soggetti || [];
            // Se non lo espone, proviamo ad assumere che ci sia almeno 1, 
            // ma se la libreria non espone la lista, potremmo non sapere quanti sono.
            // fallback a 1 se length non disponibile
            const count = Array.isArray(candidatesArr) ? candidatesArr.length : (argo.profilesCount || 1);

            if (count > 0) {
                // Cicliamo per provare a leggere i dati di ogni profilo
                // N.B. Se sono tanti rallenta un po' il login, ma è necessario per la PWA
                for (let i = 0; i < count; i++) {
                    const selMethods = ['selectProfile', 'selectSoggetto', 'setSoggetto', 'useProfile', 'useSoggetto'];
                    let selected = false;
                    for (const m of selMethods) {
                        if (typeof argo[m] === 'function') {
                            await argo[m](i);
                            selected = true;
                            break;
                        }
                    }

                    if (!selected && i > 0) break; // Se non riusciamo a selezionare, fermiamoci

                    // Legge info identità
                    let pName = "STUDENTE " + (i + 1);
                    let pClass = "N/D";

                    try {
                        const dett = (typeof argo.getDettagliProfilo === 'function') ? await argo.getDettagliProfilo() : null;
                        const al = dett?.alunno || dett;
                        if (al) {
                            pName = (al.desNominativo || al.nominativo || pName).toUpperCase();
                            pClass = (al.desClasse || al.classe || pClass).toUpperCase();
                        }
                    } catch { }

                    if (argo.dashboard?.intestazione) {
                        if (pName.startsWith("STUDENTE")) pName = (argo.dashboard.intestazione.alunno || pName).toUpperCase();
                        if (pClass === "N/D") pClass = (argo.dashboard.intestazione.classe || pClass).toUpperCase();
                    }

                    // pulizia classe
                    const m = pClass.match(/\b([1-5][A-Z])\b/);
                    if (m) pClass = m[1];

                    profiles.push({ index: i, name: pName, class: pClass, school: school });
                }

                // RI-SELEZIONA il profilo richiesto dall'utente prima di ritornare i dati dashboard
                const selMethods = ['selectProfile', 'selectSoggetto', 'setSoggetto', 'useProfile', 'useSoggetto'];
                for (const m of selMethods) {
                    if (typeof argo[m] === 'function') {
                        await argo[m](profileIndex);
                        break;
                    }
                }
            }
        } catch (e) {
            debugLog("Enumerazione profili non supportata o fallita", e.message);
        }

        // Se l'enumerazione fallisce, aggiungiamo almeno il corrente placeholder
        if (profiles.length === 0) {
            profiles.push({ index: 0, name: "STUDENTE", class: "N/D", school: school });
        }

        // RECUPERA DATI (del profilo ri-selezionato)
        const dashboard = argo.dashboard;

        // Identità corrente (dovrebbe combaciare con l'index selezionato)
        let studentName = profiles[profileIndex]?.name || "STUDENTE";
        let studentClass = profiles[profileIndex]?.class || "N/D";

        // Fallback ulteriore se profiles[profileIndex] fosse vuoto
        if (studentName === "STUDENTE" && argo.dashboard?.intestazione?.alunno) {
            studentName = argo.dashboard.intestazione.alunno.toUpperCase();
        }
        if (studentClass === "N/D" && argo.dashboard?.intestazione?.classe) {
            studentClass = argo.dashboard.intestazione.classe.toUpperCase();
            // Clean class
            const m = studentClass.match(/\b([1-5][A-Z])\b/);
            if (m) studentClass = m[1];
        }

        // FORMATTA I DATI PER IL FRONTEND
        const { grades, tasks, promemoria } = mapLibraryDataToAppFormat(dashboard);

        // SALVA PROFILO SU SUPABASE (OPZIONALE)
        if (supabase) {
            // Usa ID univoco per figlio: school:user:index
            const pid = `${school}:${user.toLowerCase()}:${profileIndex}`;
            try {
                await supabase.from("profiles").upsert({
                    id: pid,
                    name: studentName,
                    class: studentClass,
                    last_active: new Date().toISOString()
                }, { onConflict: "id" });
            } catch (e) { debugLog("Supabase Upsert Ignored"); }
        }

        // RISPOSTA COMPLETA
        const resp = {
            success: true,
            session: {
                schoolCode: school,
                authToken: "LIB_SESSION",
                accessToken: "LIB_SESSION",
                userName: user,
                profileIndex: profileIndex
            },
            student: {
                name: studentName,
                class: studentClass,
                school: school
            },
            tasks: tasks,
            voti: grades,
            promemoria: promemoria,
            selectedProfile: {
                index: profileIndex,
                name: studentName,
                class: studentClass,
                school: school
            }
        };

        // Se abbiamo rilevato più profili (o anche solo 1 ma vogliamo essere espliciti), li mandiamo
        if (profiles.length > 0) {
            resp.status = "MULTIPLE_PROFILES"; // Segnale per il frontend di mostrare modale se necessario (o se >1)
            resp.profiles = profiles;
        }

        res.status(200).json(resp);

    } catch (e) {
        console.error("❌ LOGIN ERROR:", e.message);
        const errorMsg = e.message || "Errore sconosciuto";
        res.status(401).json({
            success: false,
            error: errorMsg.includes("401") ? "Credenziali non valide" : errorMsg
        });
    }
});

// 2. SYNC (Aggiornamento dati)
app.post('/sync', async (req, res) => {
    const { schoolCode, storedUser, storedPass } = req.body;
    const school = (schoolCode || '').trim().toUpperCase();
    const syncIdx = Number.isInteger(req.body?.profileIndex) ? Number(req.body.profileIndex) : 0;

    if (!school || !storedUser || !storedPass) {
        return res.status(401).json({ success: false, error: "Credenziali sync mancanti" });
    }

    try {
        // Decodifica Base64 (il frontend invia user/pass salvati in base64)
        const user = decodeURIComponent(Buffer.from(storedUser, 'base64').toString('utf-8')).trim();
        const pwd = decodeURIComponent(Buffer.from(storedPass, 'base64').toString('utf-8'));

        debugLog(`🔄 Sync attempt for ${user} (Idx: ${syncIdx})`);

        const argo = new Client({
            schoolCode: school,
            username: user,
            password: pwd,
            dataProvider: null
        });

        await argo.login();

        // Seleziona profilo
        try {
            const selMethods = ['selectProfile', 'selectSoggetto', 'setSoggetto', 'useProfile', 'useSoggetto'];
            for (const m of selMethods) {
                if (typeof argo[m] === 'function') {
                    await argo[m](syncIdx);
                    break;
                }
            }
        } catch { }

        // Estrai dati freschi
        const dashboard = argo.dashboard;
        const { grades, tasks, promemoria } = mapLibraryDataToAppFormat(dashboard);

        res.json({
            success: true,
            tasks,
            voti: grades,
            promemoria,
            new_tokens: { authToken: "LIB", accessToken: "LIB" }
        });

    } catch (e) {
        debugLog("❌ SYNC FAILED", e.message);
        res.status(401).json({ success: false, error: e.message });
    }
});

// 3. RESOLVE PROFILE (Legacy compatibility)
app.post('/api/resolve-profile', async (req, res) => {
    const { schoolCode, username, password } = req.body;
    const profileIndex = Number.isInteger(req.body?.profileIndex) ? Number(req.body.profileIndex) : 0;

    try {
        const argo = new Client({
            schoolCode: schoolCode,
            username: username,
            password: password,
            dataProvider: null
        });
        await argo.login();

        // SELEZIONE PROFILO
        try {
            const selMethods = ['selectProfile', 'selectSoggetto', 'setSoggetto', 'useProfile', 'useSoggetto'];
            for (const m of selMethods) {
                if (typeof argo[m] === 'function') {
                    await argo[m](profileIndex);
                    break;
                }
            }
        } catch (e) { }

        let name = "STUDENTE";
        let cls = "N/D";

        try {
            // 1) Dettagli profilo
            const dettagli = (typeof argo.getDettagliProfilo === 'function') ? await argo.getDettagliProfilo() : null;
            const al = dettagli?.alunno || dettagli;
            if (al) {
                name = (al.desNominativo || al.nominativo || name).toUpperCase();
                cls = (al.desClasse || al.classe || cls).toUpperCase();
            }
        } catch (e) { }

        if (argo.dashboard?.intestazione) {
            if (name === "STUDENTE") name = (argo.dashboard.intestazione.alunno || name).toUpperCase();
            if (cls === "N/D") cls = (argo.dashboard.intestazione.classe || cls).toUpperCase();
        }

        if (cls) {
            cls = cls.trim();
            const m = cls.match(/\b([1-5][A-Z])\b/);
            if (m) cls = m[1];
        }
        if (name) name = name.trim();

        res.json({ success: true, name, class: cls });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============= SOCIAL ROUTES (POSTS, MARKET, ETC.) =============

// Health Check
app.get('/health', (req, res) => res.status(200).json({ status: "ok", mode: "library_integrated_esm_robust" }));

// Avatar Upload
app.post('/api/upload', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase mancante" });
    try {
        const { image: base64Image, userId = uuidv4() } = req.body;
        if (!base64Image || !base64Image.startsWith('data:image/')) return res.status(400).json({ error: "Invalid image" });
        const ext = base64Image.split(';')[0].split('/')[1];
        const buffer = Buffer.from(base64Image.split(',')[1], 'base64');
        const filename = `${userId.replace(/:/g, '_')}_${Date.now()}.${ext}`;
        const { error } = await supabase.storage.from('avatars').upload(filename, buffer, { upsert: true, contentType: `image/${ext}` });
        if (error) throw error;
        const { data } = supabase.storage.from('avatars').getPublicUrl(filename);
        res.status(200).json({ success: true, url: data.publicUrl });
    } catch (e) { res.status(500).json({ success: false, error: e.message }); }
});

// Profile Ops
app.get('/api/profile/:user_id', async (req, res) => {
    if (!supabase) return res.status(404).json({ success: false });
    const { data } = await supabase.from("profiles").select("*").eq("id", req.params.user_id);
    res.status(200).json({ success: true, data: data?.[0] });
});

app.put('/api/profile', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false });
    const { userId, name, class: className, avatar } = req.body;
    const update = { id: userId, last_active: new Date().toISOString() };
    if (name) update.name = name;
    if (className) update.class = className;
    if (avatar) update.avatar = avatar;
    await supabase.from("profiles").upsert(update, { onConflict: "id" });
    res.status(200).json({ success: true });
});

// Posts
app.get('/api/posts', async (req, res) => {
    if (supabase) {
        const { data } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(100);
        return res.json({ success: true, data: data || [] });
    }
    res.json({ success: true, data: loadJsonFile(POSTS_FILE) });
});

app.post('/api/posts', async (req, res) => {
    const body = req.body;
    if (supabase) {
        await supabase.from("posts").insert({
            author_id: body.authorId, author_name: body.author, class: body.class,
            text: body.text, image: body.image, anon: !!body.anon
        });
        const { data } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(100);
        return res.json({ success: true, data: data || [] });
    }
    const posts = loadJsonFile(POSTS_FILE);
    posts.unshift({ ...body, id: Date.now() });
    saveJsonFile(POSTS_FILE, posts);
    res.json({ success: true, data: posts });
});

// Market (Nota: PWA cache issues citati sono client-side, qui serviamo solo i dati)
app.get('/api/market', async (req, res) => {
    if (supabase) {
        const { data } = await supabase.from("market_items").select("*").order("created_at", { ascending: false }).limit(200);
        return res.json({ success: true, data: data || [] });
    }
    res.json({ success: true, data: loadJsonFile(MARKET_FILE) });
});

app.post('/api/market', async (req, res) => {
    const body = req.body;
    if (supabase) {
        await supabase.from("market_items").insert({
            seller_id: body.sellerId, seller_name: body.seller,
            title: body.title, price: body.price, image: body.image
        });
        return res.json({ success: true, data: [] });
    }
    const items = loadJsonFile(MARKET_FILE);
    items.unshift({ ...body, id: Date.now() });
    saveJsonFile(MARKET_FILE, items);
    res.json({ success: true, data: items });
});

// Polls
app.get('/api/polls', async (req, res) => {
    if (supabase) {
        const { data } = await supabase.from("polls").select("*").order("created_at", { ascending: false });
        return res.json({ success: true, data: data || [] });
    }
    res.json({ success: true, data: loadJsonFile(POLLS_FILE) });
});

app.post('/api/polls', async (req, res) => {
    const { question, choices, authorId, expiresAt } = req.body;
    const newPoll = {
        id: uuidv4(), question, choices: choices.map(c => ({ id: uuidv4(), text: c.text, votes: 0 })),
        voters: {}, author: authorId, created_at: new Date().toISOString(), expires_at: expiresAt
    };
    if (supabase) {
        await supabase.from("polls").insert(newPoll);
        return res.json({ success: true, data: [] });
    }
    const polls = loadJsonFile(POLLS_FILE);
    polls.unshift(newPoll);
    saveJsonFile(POLLS_FILE, polls);
    res.json({ success: true, data: polls });
});

app.post('/api/polls/:poll_id/vote', async (req, res) => {
    const { poll_id } = req.params;
    const { voterId, choiceId } = req.body;

    if (supabase) {
        const { data } = await supabase.from("polls").select("*").eq("id", poll_id).single();
        if (data) {
            const voters = data.voters || {};
            const prev = voters[voterId];
            if (prev === choiceId) return res.json({ success: true, data });

            const choices = data.choices;
            choices.forEach(c => {
                if (c.id === choiceId) c.votes = (c.votes || 0) + 1;
                if (prev && c.id === prev) c.votes = Math.max(0, (c.votes || 0) - 1);
            });
            voters[voterId] = choiceId;
            await supabase.from("polls").update({ choices, voters }).eq("id", poll_id);
            return res.json({ success: true, data: { ...data, choices, voters } });
        }
    }
    res.json({ success: true });
});

// Chat & Planner
app.get('/api/messages/thread/:thread_id', async (req, res) => {
    if (!supabase) return res.json({ success: false });
    const { data } = await supabase.from("chat_messages").select("*").eq("thread_id", req.params.thread_id).order("created_at").limit(500);
    res.json({ success: true, data: data || [] });
});

app.post('/api/messages', async (req, res) => {
    if (!supabase) return res.json({ success: false });
    await supabase.from("chat_messages").insert({
        thread_id: req.body.threadId, sender_id: req.body.senderId,
        sender_name: req.body.senderName, receiver_id: req.body.receiverId, text: req.body.text
    });
    res.json({ success: true, data: [] });
});

// REST Fallback for Planner
function sbHeaders() {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
        throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY env vars");
    }
    return {
        apikey: process.env.SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json"
    };
}
function sbTableUrl(table) {
    return `${process.env.SUPABASE_URL}/rest/v1/${table}`;
}

app.put('/api/planner/:user_id', async (req, res) => {
    const userId = decodeURIComponent(req.params.user_id);
    const body = req.body || {};

    // NOTA: Con il nuovo multi-profilo, userId potrebbe contenere ":", 
    // assicurati che il DB accetti stringhe lunghe o che il client codifichi correttamente.
    // Qui si salva tutto come stringa opaca.

    const payload = {
        user_id: userId,
        planned_tasks: body.plannedTasks || body.planned_tasks || {},
        stress_levels: body.stressLevels || body.stress_levels || {},
        planned_details: body.plannedDetails || body.planned_details || {},
        updated_at: new Date().toISOString()
    };

    // 1. Prova Supabase Client SDK
    let success = false;
    let data;
    if (supabase) {
        try {
            const res = await supabase
                .from('planner')
                .upsert(payload, { onConflict: 'user_id' })
                .select()
                .single();
            if (!res.error) {
                success = true;
                data = res.data;
            }
        } catch (e) { debugLog("Supabase JS error", e.message); }
    }

    if (success) return res.json({ success: true, data });

    // 2. Fallback REST
    try {
        const url = `${sbTableUrl('planner')}?on_conflict=user_id`;
        const headers = sbHeaders();
        headers.Prefer = "resolution=merge-duplicates,return=representation";

        const response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(payload)
        });

        if (response.ok) {
            const rows = await response.json();
            return res.json({ success: true, data: rows[0] });
        } else {
            const txt = await response.text();
            debugLog(`Planner REST failed [${response.status}]`, txt);
            return res.status(response.status).json({ success: false, error: txt });
        }
    } catch (e) {
        debugLog("Planner REST error", e.message);
        return res.status(500).json({ success: false, error: e.message });
    }
});

app.get('/api/planner/:user_id', async (req, res) => {
    const userId = decodeURIComponent(req.params.user_id);

    if (supabase) {
        try {
            const { data, error } = await supabase
                .from("planner")
                .select("user_id, planned_tasks, stress_levels, planned_details, updated_at")
                .eq("user_id", userId)
                .order("updated_at", { ascending: false })
                .limit(1);

            if (error) throw error;

            const row = data?.[0] || null;
            if (!row) {
                return res.json({
                    success: true,
                    data: {
                        userId,
                        plannedTasks: {},
                        stressLevels: {},
                        plannedDetails: {},
                        updatedAt: null
                    }
                });
            }

            return res.json({
                success: true, data: {
                    userId: row.user_id,
                    plannedTasks: row.planned_tasks || {},
                    stressLevels: row.stress_levels || {},
                    plannedDetails: row.planned_details || {},
                    updatedAt: row.updated_at
                }
            });
        } catch (e) { debugLog("planner GET supabase error", e.message); }
    }
    return res.status(404).json({ success: false });
});

// ============= START SERVER =============
const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server avviato su porta ${PORT} con 'portaleargo-api' integrata (ESM + Robust).`);
});
