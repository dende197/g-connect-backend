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
// Questa funzione trasforma i dati della libreria nel formato che la tua App si aspetta
function mapLibraryDataToAppFormat(dashboard) {
    const grades = [];
    const tasks = [];
    const promemoria = [];

    if (!dashboard) return { grades, tasks, promemoria };

    // 1. MAPPING VOTI
    // La libreria unifica i voti in dashboard.voti (o votiGiornalieri)
    const rawVoti = [
        ...(dashboard.votiGiornalieri || []),
        ...(dashboard.votiScrutinio || []),
        ...(dashboard.voti || [])
    ];

    rawVoti.forEach(v => {
        grades.push({
            id: uuidv4().substring(0, 12),
            materia: v.desMateria || v.materia || 'N/D',
            valore: v.codVoto || v.voto || '',
            data: v.datGiorno || v.data || '',
            tipo: v.desVoto || v.tipo || 'N/D',
            // Campi duplicati per compatibilità con vecchie versioni del frontend
            subject: v.desMateria || v.materia || 'N/D',
            value: v.codVoto || v.voto || '',
            date: v.datGiorno || v.data || ''
        });
    });

    // 2. MAPPING COMPITI
    // Cerchiamo i compiti nel registro o nella proprietà compiti
    if (dashboard.registro && Array.isArray(dashboard.registro)) {
        dashboard.registro.forEach(item => {
            if (item.compiti && Array.isArray(item.compiti)) {
                item.compiti.forEach(c => {
                    tasks.push({
                        id: uuidv4().substring(0, 12),
                        text: c.desCompito || c.compito || '',
                        subject: item.materia || 'Generico',
                        due_date: c.datCompito || item.data || '', // Data consegna
                        datCompito: c.datCompito || item.data || '',
                        materia: item.materia || 'Generico',
                        done: false
                    });
                });
            }
        });
    }

    // 3. MAPPING PROMEMORIA / BACHECA
    const rawBacheca = [
        ...(dashboard.bachecaAlunno || []),
        ...(dashboard.promemoria || [])
    ];

    rawBacheca.forEach(b => {
        promemoria.push({
            id: uuidv4().substring(0, 12),
            titolo: b.desOggetto || b.titolo || 'Avviso',
            testo: b.desMessaggio || b.testo || '',
            autore: b.desMittente || 'Scuola',
            data: b.datGiorno || b.data || '',
            url: b.urlAllegato || '',
            oggetto: b.desOggetto || b.titolo || 'Avviso'
        });
    });

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

    if (!school || !user || !password) {
        return res.status(400).json({ success: false, error: "Dati mancanti" });
    }

    try {
        debugLog(`🔐 Login attempt for ${user} @ ${school}`);

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

        // RECUPERA DATI
        // La libreria popola automaticamente argo.dashboard
        const dashboard = argo.dashboard;

        // TENTA RECUPERO IDENTITÀ
        let studentName = "STUDENTE";
        let studentClass = "N/D";

        try {
            // Proviamo a prendere i dettagli completi se disponibili
            const dettagli = await argo.getDettagliProfilo();
            if (dettagli && dettagli.alunno) {
                studentName = (dettagli.alunno.desNominativo || dettagli.alunno.nominativo || studentName).toUpperCase();
                studentClass = (dettagli.alunno.desClasse || dettagli.alunno.classe || studentClass).toUpperCase();
            } else if (dashboard.intestazione) {
                // Fallback sull'intestazione dashboard
                studentName = (dashboard.intestazione.alunno || studentName).toUpperCase();
                studentClass = (dashboard.intestazione.classe || studentClass).toUpperCase();
            }
        } catch (err) {
            debugLog("⚠️ Warning identità:", err.message);
        }

        // FORMATTA I DATI PER IL FRONTEND
        const { grades, tasks, promemoria } = mapLibraryDataToAppFormat(dashboard);

        // SALVA PROFILO SU SUPABASE (OPZIONALE)
        if (supabase) {
            const pid = `${school}:${user.toLowerCase()}:0`;
            try {
                await supabase.from("profiles").upsert({
                    id: pid,
                    name: studentName,
                    class: studentClass,
                    last_active: new Date().toISOString()
                }, { onConflict: "id" });
            } catch (e) { debugLog("Supabase Upsert Ignored"); }
        }

        // RISPOSTA
        res.status(200).json({
            success: true,
            session: {
                schoolCode: school,
                // Nota: Non esponiamo il token reale per sicurezza/semplicità,
                // il frontend userà username/password per il sync
                authToken: "LIB_SESSION",
                accessToken: "LIB_SESSION",
                userName: user,
                profileIndex: 0
            },
            student: {
                name: studentName,
                class: studentClass,
                school: school
            },
            tasks: tasks,
            voti: grades,
            promemoria: promemoria,
            // Per compatibilità se il frontend controlla selectedProfile
            selectedProfile: {
                index: 0,
                name: studentName,
                class: studentClass,
                school: school
            }
        });

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

    if (!school || !storedUser || !storedPass) {
        return res.status(401).json({ success: false, error: "Credenziali sync mancanti" });
    }

    try {
        // Decodifica Base64 (il frontend invia user/pass salvati in base64)
        const user = decodeURIComponent(Buffer.from(storedUser, 'base64').toString('utf-8')).trim();
        const pwd = decodeURIComponent(Buffer.from(storedPass, 'base64').toString('utf-8'));

        debugLog(`🔄 Sync attempt for ${user}`);

        const argo = new Client({
            schoolCode: school,
            username: user,
            password: pwd,
            dataProvider: null
        });

        await argo.login();

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
// Utile se il frontend chiama questo endpoint prima del login
app.post('/api/resolve-profile', async (req, res) => {
    const { schoolCode, username, password } = req.body;
    try {
        const argo = new Client({
            schoolCode: schoolCode,
            username: username,
            password: password,
            dataProvider: null
        });
        await argo.login();

        let name = "STUDENTE";
        let cls = "N/D";

        // Tentativo rapido di prendere il nome
        if (argo.dashboard?.intestazione?.alunno) {
            name = argo.dashboard.intestazione.alunno;
            cls = argo.dashboard.intestazione.classe || "N/D";
        }

        res.json({ success: true, name, class: cls });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============= SOCIAL ROUTES (POSTS, MARKET, ETC.) =============
// Queste rotte rimangono invariate per non rompere le funzionalità social

// Health Check
app.get('/health', (req, res) => res.status(200).json({ status: "ok", mode: "library_integrated_esm" }));

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

// Market
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

    // 2. Fallback REST (import per fetch se necessario, o usa global fetch di node 18+)
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
            debugLog("Planner REST failed", txt);
        }
    } catch (e) {
        debugLog("Planner REST error", e.message);
    }

    res.status(500).json({ success: false, error: "Save failed" });
});

app.get('/api/planner/:user_id', async (req, res) => {
    if (supabase) {
        const { data } = await supabase.from("planner").select("*").eq("user_id", req.params.user_id).single();
        if (data) return res.json({ success: true, data });
    }
    res.status(404).json({ success: false });
});

// ============= START SERVER =============
const PORT = process.env.PORT || 5001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`\n🚀 Server avviato su porta ${PORT} con 'portaleargo-api' integrata (ESM).`);
});
