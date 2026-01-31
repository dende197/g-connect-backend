require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const { wrapper } = require('axios-cookiejar-support');
const { CookieJar } = require('tough-cookie');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const cheerio = require('cheerio');

// ============= SETUP APP =============
const app = express();
app.use(express.json({ limit: '50mb' }));

// ============= CORS (CORRETTO) =============
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

// ============= DEBUG MODE (CORRETTO - Era un bug!) =============
// ❌ PYTHON: DEBUG_MODE = ... or True  (SEMPRE TRUE!)
// ✅ NODE.JS:
const DEBUG_MODE = (process.env.DEBUG_MODE || "false").toLowerCase() === "true";

// ============= SUPABASE CLIENT =============
let supabase = null;
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

console.log("\n" + "=".repeat(70));
console.log("🔍 DEBUG: Verifica Supabase Configuration");

if (supabaseUrl) {
    console.log(`✅ SUPABASE_URL: ${supabaseUrl}`);
} else {
    console.log("❌ SUPABASE_URL: NOT SET");
}

if (supabaseKey) {
    console.log(`✅ SUPABASE_SERVICE_ROLE_KEY presente (${supabaseKey.length} caratteri)`);
    try {
        const parts = supabaseKey.split('.');
        if (parts.length >= 2) {
            let payloadB64 = parts[1];
            while (payloadB64.length % 4 !== 0) payloadB64 += '=';
            const payload = JSON.parse(Buffer.from(payloadB64, 'base64').toString());
            const role = payload.role;
            console.log(`   Ruolo decodificato dal JWT: ${role}`);
            if (role === 'service_role') {
                console.log("   ✅✅✅ PERFETTO! Stai usando la chiave SERVICE_ROLE");
            } else {
                console.log(`   ❌❌❌ ERRORE! Ruolo: ${role} (non service_role)`);
            }
        }
    } catch (e) {
        console.log(`   ⚠️ Impossibile decodificare JWT: ${e.message}`);
    }

    try {
        supabase = createClient(supabaseUrl, supabaseKey);
        console.log("✅ Supabase client inizializzato");
    } catch (e) {
        console.log(`❌ Errore inizializzazione Supabase: ${e.message}`);
    }
} else {
    console.log("❌ SUPABASE_SERVICE_ROLE_KEY: NOT SET");
}
console.log("=".repeat(70) + "\n");

// ============= CONSTANTS =============
const CHALLENGE_URL = "https://auth.portaleargo.it/oauth2/auth";
const LOGIN_URL = "https://www.portaleargo.it/auth/sso/login";
const TOKEN_URL = "https://auth.portaleargo.it/oauth2/token";
const REDIRECT_URI = "it.argosoft.didup.famiglia.new://login-callback";
const CLIENT_ID = "72fd6dea-d0ab-4bb9-8eaa-3ac24c84886c";
const ENDPOINT = "https://www.portaleargo.it/appfamiglia/api/rest/";
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36";

const SENSITIVE_KEYS = new Set(["x-auth-token", "Authorization", "authToken", "access_token", "token", "password"]);
const CLASS_REGEX = /^[1-5][A-Z]{1,2}$/;
const SUBJECT_TOKENS = new Set([
    "ITALIANO", "INGLESE", "STORIA", "GEOGRAFIA", "FILOSOFIA", "MATEMATICA", "SCIENZE", "BIOLOGIA",
    "FISICA", "ARTE", "DISEGNO", "RELIGIONE", "RELIGIOSA", "EDUCAZIONE", "MUSICA", "TECNOLOGIE",
    "TECNOLOGIA", "INFORMATICA", "CHIMICA", "LATINO", "GRECO", "FRANCESE", "SPAGNOLO", "TEDESCO",
    "TRIENNIO", "BIENNIO", "PRIMO", "SECONDO", "TERZO", "QUARTO", "QUINTO",
    "QUADRIMESTRE", "TRIMESTRE", "PENTAMESTRE", "SCRUTINIO", "SCRUTINI", "PERIODO",
    "SCIENZE NATURALI", "SCIENZE UMANE", "STORIA E GEOGRAFIA",
    "DISEGNO E STORIA DELL'ARTE", "EDUCAZIONE FISICA", "EDUCAZIONE CIVICA",
    "VALUTAZIONE", "VALUTAZIONI", "ASSENZE", "ASSENZA", "VOTI", "VOTO"
]);

// ============= HELPERS =============

function redact(obj) {
    if (!obj) return obj;
    try {
        if (Array.isArray(obj)) return obj.map(v => redact(v));
        if (typeof obj === 'object') {
            const newObj = {};
            for (const [k, v] of Object.entries(obj)) {
                newObj[k] = SENSITIVE_KEYS.has(k) ? "<redacted>" : redact(v);
            }
            return newObj;
        }
    } catch (e) { }
    return obj;
}

function debugLog(message, data = null) {
    if (DEBUG_MODE) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`🔍 ${message}`);
        if (data !== null) {
            const safe = redact(data);
            try {
                const str = JSON.stringify(safe, null, 2);
                console.log(str.substring(0, 2000));
            } catch (e) {
                console.log(String(safe).substring(0, 2000));
            }
        }
        console.log(`${'='.repeat(60)}\n`);
    }
}

// ============= PKCE HELPERS =============

function generateCodeVerifier() {
    return crypto.randomBytes(32).toString('hex');
}

function generateCodeChallenge(verifier) {
    const hash = crypto.createHash('sha256').update(verifier).digest();
    return hash
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=/g, '');
}

function generateState() {
    return crypto.randomBytes(16).toString('hex');
}

// ============= ARGO ADVANCED CLASS (TRADOTTO) =============

class AdvancedArgo {
    static async rawLogin(school, username, password) {
        try {
            const jar = new CookieJar();
            const client = wrapper(axios.create({
                jar: jar,
                withCredentials: true,
                timeout: 30000  // ← AGGIUNTO: timeout (Python non ha limite!)
            }));

            const CODE_VERIFIER = generateCodeVerifier();
            const CODE_CHALLENGE = generateCodeChallenge(CODE_VERIFIER);
            const STATE = generateState();

            // 1. GET Challenge
            const challengeParams = new URLSearchParams({
                redirect_uri: REDIRECT_URI,
                client_id: CLIENT_ID,
                response_type: "code",
                prompt: "login",
                state: STATE,
                scope: "openid offline profile user.roles argo",
                code_challenge: CODE_CHALLENGE,
                code_challenge_method: "S256"
            });

            debugLog("PKCE: Richiesta Challenge...");
            const reqChallenge = await client.get(`${CHALLENGE_URL}?${challengeParams.toString()}`);

            // Estrai login_challenge dall'URL
            // Estrai login_challenge dall'URL o dall'HTML
            const finalUrl = reqChallenge.request?.res?.responseUrl || reqChallenge.config.url || '';
            let loginChallenge = null;
            const matchChallenge = finalUrl.match(/login_challenge=([0-9a-f]+)/);

            if (matchChallenge) {
                loginChallenge = matchChallenge[1];
            } else if (reqChallenge.data) {
                try {
                    const $ = cheerio.load(reqChallenge.data);
                    const hidden = $('input[name="challenge"]').val();
                    if (hidden) loginChallenge = hidden;
                } catch (_) { }
            }

            if (!loginChallenge) {
                throw new Error("Login challenge non trovata (URL/HTML)");
            }

            // 2. POST Login
            const loginBody = new URLSearchParams();
            loginBody.append("challenge", loginChallenge);
            loginBody.append("client_id", CLIENT_ID);
            loginBody.append("prefill", "true");
            loginBody.append("famiglia_customer_code", school);
            loginBody.append("username", username);
            loginBody.append("password", password);
            loginBody.append("login", "true");

            debugLog("PKCE: Login POST...");
            const reqLogin = await client.post(LOGIN_URL, loginBody, {
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                maxRedirects: 0,
                validateStatus: () => true  // Accetta tutte le status
            });

            let location = reqLogin.headers['location'];
            if (!location && reqLogin.data) {
                try {
                    const $ = cheerio.load(reqLogin.data);
                    // Prova link diretto con code=
                    location = $('a[href*="code="]').attr('href') || null;
                    // Prova meta refresh: content="0;url=..."
                    if (!location) {
                        const meta = $('meta[http-equiv="refresh"]').attr('content') || '';
                        const m = meta.match(/url=(.+)$/i);
                        if (m) location = m[1];
                    }
                } catch (_) { }
            }
            if (!location) {
                throw new Error("Credenziali errate o scuola non valida (No Location header)");
            }

            // 3. Follow redirects until code
            let code = null;
            let loopCount = 0;

            while (loopCount < 10) {
                if (location.includes("code=")) {
                    const codeMatch = location.match(/code=([0-9a-zA-Z-_.]+)/);
                    if (codeMatch) {
                        code = codeMatch[1];
                        break;
                    }
                }

                const reqRedirect = await client.get(location, {
                    maxRedirects: 0,
                    validateStatus: () => true
                });

                location = reqRedirect.headers['location'];
                if (!location) break;
                loopCount++;
            }

            if (!code) throw new Error("Auth code non trovato dopo i redirect");

            // 4. Exchange code for token
            const tokenBody = new URLSearchParams();
            tokenBody.append("code", code);
            tokenBody.append("grant_type", "authorization_code");
            tokenBody.append("redirect_uri", REDIRECT_URI);
            tokenBody.append("code_verifier", CODE_VERIFIER);
            tokenBody.append("client_id", CLIENT_ID);

            debugLog("PKCE: Token exchange...");
            const tokenRes = await client.post(TOKEN_URL, tokenBody);
            const accessToken = tokenRes.data.access_token;

            if (!accessToken) throw new Error("No access_token in response");

            // 5. Login to Argo API to get profiles
            const argoLoginHeaders = {
                "User-Agent": USER_AGENT,
                "Content-Type": "application/json",
                "Authorization": "Bearer " + accessToken,
                "Accept": "application/json"
            };

            const payload = {
                clientID: crypto.randomBytes(32).toString('hex'),
                "lista-x-auth-token": [],
                "x-auth-token-corrente": null,
                "lista-opzioni-notifiche": {}
            };

            debugLog("PKCE: Argo API /login call...");
            const argoResp = await axios.post(ENDPOINT + "login", payload, {
                headers: argoLoginHeaders,
                timeout: 30000
            });

            const soggetti = argoResp.data.data || [];

            debugLog("🔍 SOGGETTI RICEVUTI", {
                count: soggetti.length,
                first: soggetti[0] ? Object.keys(soggetti[0]) : []
            });

            const profiles = soggetti.map((sog, idx) => ({
                index: idx,
                name: (sog.desNominativo || '').trim().toUpperCase(),
                class: (sog.classe || '').trim().toUpperCase(),
                school: (sog.codMin || sog.codiceScuola || school || '').trim().toUpperCase(),
                token: sog.token || '',
                idSoggetto: sog.idSoggetto,
                raw: sog
            }));

            return { access_token: accessToken, profiles, jar };

        } catch (e) {
            debugLog("❌ Errore Raw Login", e.message);
            throw e;
        }
    }
}

// ============= IDENTITY HELPERS =============

function buildName(obj = {}) {
    const full = obj.desNominativo || obj.nominativo;
    if (full) return String(full).trim().toUpperCase();
    const n = obj.desNome || obj.nome || '';
    const c = obj.desCognome || obj.cognome || '';
    const combo = `${String(c).trim()} ${String(n).trim()}`.trim();
    return combo ? combo.toUpperCase() : null;
}

function normalizeClass(raw) {
    if (!raw) return null;
    const txt = String(raw).toUpperCase().replace(/\s+/g, ' ').trim();
    // Primo tentativo: "3A", "3AB", "3 A", "3  AB"
    let m = txt.match(/\b([1-5])\s*([A-Z]{1,2})\b/);
    if (m) {
        // Per coerenza UI, di default teniamo solo la prima lettera (es. "3AB" -> "3A")
        return m[1] + m[2][0];
    }
    // Secondo tentativo: cerca numero + lettera ovunque
    m = txt.match(/([1-5])\s*([A-Z])/);
    if (m) return m[1] + m[2];
    // Terzo tentativo: ricava primo numero e prima lettera
    const digit = (txt.match(/[1-5]/) || [])[0];
    const letter = (txt.match(/[A-Z]/) || [])[0];
    if (digit && letter) return digit + letter;
    return null;
}

function safeData(obj) {
    if (!obj) return {};
    if (obj.data) return obj.data;
    if (obj.scheda) return obj.scheda;
    return obj;
}

// ============= PROFILE ENRICHMENT (ULTRA-ROBUST DEEP SCAN) =============

async function enrichProfiles(school, accessToken, profiles) {
    const baseApp = "https://www.portaleargo.it/appfamiglia/api/rest/";
    const baseFam = "https://www.portaleargo.it/famiglia/api/rest/";
    const results = [];

    debugLog(`🕵️ AVVIO ULTRA-ROBUST SCAN SU ${profiles.length} PROFILI (SEQUENZIALE)...`);

    for (const [index, p] of profiles.entries()) {
        const authToken = p.token;
        if (!authToken) {
            results.push({ ...p, name: `STUDENTE ${index + 1}`, class: "N/D" });
            continue;
        }

        const headers = createHeaders(school, accessToken, authToken);
        let name = null;
        let cls = null;

        // 1) connotati (GET) appfamiglia → fallback famiglia
        try {
            debugLog(`P${index}: Tentativo CONNOTATI...`);
            let r1 = await axios.get(baseApp + "connotati", { headers, timeout: 6000 });
            let d1 = safeData(r1.data);
            name = buildName(d1);
            cls = normalizeClass(d1.desClasse || d1.classe);

            if (!name) {
                r1 = await axios.get(baseFam + "connotati", { headers, timeout: 6000 });
                d1 = safeData(r1.data);
                name = buildName(d1);
                cls = normalizeClass(d1.desClasse || d1.classe);
            }
        } catch (e) { }

        // 2) curriculum (POST) appfamiglia → fallback famiglia
        if (!name || !cls) {
            try {
                debugLog(`P${index}: Tentativo CURRICULUM...`);
                let r2 = await axios.post(baseApp + "curriculum", {}, { headers, timeout: 6000 });
                let d2 = safeData(r2.data);
                let list = Array.isArray(d2) ? d2 : (d2.dati || []);
                let current = list[0] || {};
                name = buildName(current);
                cls = normalizeClass(current.desClasse || current.classe);

                if (!name) {
                    r2 = await axios.post(baseFam + "curriculum", {}, { headers, timeout: 6000 });
                    d2 = safeData(r2.data);
                    list = Array.isArray(d2) ? d2 : (d2.dati || []);
                    current = list[0] || {};
                    name = buildName(current);
                    cls = normalizeClass(current.desClasse || current.classe);
                }
            } catch (e) { }
        }

        // 3) scheda (POST) appfamiglia → fallback famiglia
        if (!name || !cls) {
            try {
                debugLog(`P${index}: Tentativo SCHEDA...`);
                let r3 = await axios.post(baseApp + "scheda", { opzioni: "{}" }, { headers, timeout: 6000 });
                let d3 = safeData(r3.data);
                let al = d3.alunno || d3;
                name = buildName(al);
                cls = normalizeClass(al.desClasse || al.classe);

                if (!name) {
                    r3 = await axios.post(baseFam + "scheda", { opzioni: "{}" }, { headers, timeout: 6000 });
                    d3 = safeData(r3.data);
                    al = d3.alunno || d3;
                    name = buildName(al);
                    cls = normalizeClass(al.desClasse || al.classe);
                }
            } catch (e) { }
        }

        // 4) dashboard intestazione (payload conforme)
        if (!name || !cls) {
            try {
                debugLog(`P${index}: Tentativo DASHBOARD...`);
                const payload = {
                    dataultimoaggiornamento: "2024-09-01 00:00:00",
                    opzioni: JSON.stringify({ intestazione: true })
                };
                const r4 = await axios.post(baseApp + "dashboard/dashboard", payload, { headers, timeout: 6000 });
                const d4 = safeData(r4.data);
                const intest = d4.intestazione || d4;
                name = buildName(intest);
                cls = normalizeClass(intest.desClasse || intest.classe);
            } catch (e) { }
        }

        // Normlizzazione finale
        name = (name || p.name || `STUDENTE ${index + 1}`).trim().toUpperCase();
        cls = (normalizeClass(cls || p.class) || "N/D").trim().toUpperCase();

        if (name) debugLog(`✅ Profilo ${index} risolto: ${name} (${cls})`);
        results.push({ ...p, name, class: cls });
    }

    return results;
}

// ============= DATA EXTRACTION (MULTI-STRATEGY) =============

function extractStudentFromScheda(schedaResp) {
    const roots = [
        schedaResp.data || {},
        (schedaResp.data || {}).scheda || {},
        schedaResp
    ];

    let name = null, cls = null;

    for (const root of roots) {
        if (!root) continue;

        const al = root.alunno || root;
        const full = al.desNominativo || al.nominativo || '';
        const n = al.desNome || al.nome || '';
        const c = al.desCognome || al.cognome || '';

        if (!name) {
            if (full) name = String(full).trim().toUpperCase();
            else if (n || c) name = `${String(c).trim()} ${String(n).trim()}`.trim().toUpperCase();
        }

        if (!cls) {
            const tempCls = al.desClasse || al.classe || root.desDenominazione || '';
            const norm = normalizeClass(tempCls);
            if (norm) cls = norm;
        }

        if (name && cls) break;
    }

    return { name, cls };
}

function extractStudentFromDashboard(dashboardData) {
    let name = null, cls = null;

    try {
        const dataObj = dashboardData.data || dashboardData;
        const dati = dataObj.dati || [];

        if (dataObj.intestazione) {
            if (dataObj.intestazione.alunno) name = dataObj.intestazione.alunno.trim().toUpperCase();
            if (dataObj.intestazione.classe) cls = dataObj.intestazione.classe.trim().toUpperCase();
        }

        if ((!name || !cls) && dati.length > 0) {
            const primoBlocco = dati[0];
            if (primoBlocco.desAlunno) name = primoBlocco.desAlunno;
            if (primoBlocco.desClasse) cls = primoBlocco.desClasse;
        }

    } catch (e) {
        debugLog("⚠️ Errore estrazione identity da Dashboard", e.message);
    }

    return { name, cls };
}

async function getScheda(headers) {
    try {
        const res = await axios.post(ENDPOINT + "scheda", { opzioni: "{}" }, {
            headers,
            timeout: 20000
        });
        return res.data;
    } catch (e) {
        debugLog("⚠️ Errore get_scheda", e.message);
        return {};
    }
}

async function getDashboard(headers) {
    try {
        const startDate = "2024-09-01 00:00:00";
        const DASHBOARD_OPTIONS = {
            votiGiornalieri: true,
            votiScrutinio: true,
            compiti: true,
            argomenti: true,
            promemoria: true,
            bacheca: true,
            noteDisciplinari: true,
            assenze: true,
            votiPeriodici: true
        };

        const payload = {
            dataultimoaggiornamento: startDate,
            opzioni: JSON.stringify(DASHBOARD_OPTIONS)
        };

        const res = await axios.post(ENDPOINT + "dashboard/dashboard", payload, {
            headers,
            timeout: 25000
        });

        return res.data;
    } catch (e) {
        debugLog("⚠️ Errore Dashboard", e.message);
        return {};
    }
}

async function getAnagrafe(headers) {
    try {
        const baseUrl = ENDPOINT.replace('/appfamiglia', '/famiglia');
        const res = await axios.get(baseUrl + "anagrafe", { headers, timeout: 15000 });
        return res.data;
    } catch (e) {
        debugLog("⚠️ Errore Anagrafe", e.message);
        return null;
    }
}

// Nuovi endpoint per identità (Strategia D)
async function getAlunno(headers) {
    try {
        const res = await axios.get(ENDPOINT + "alunno", { headers, timeout: 12000 });
        return res.data;
    } catch (e) {
        debugLog("⚠️ Errore Alunno", e.message);
        return null;
    }
}

async function getAlunnoAnagrafe(headers) {
    try {
        const res = await axios.get(ENDPOINT + "alunno/anagrafe", { headers, timeout: 12000 });
        return res.data;
    } catch (e) {
        debugLog("⚠️ Errore Alunno/Anagrafe", e.message);
        return null;
    }
}

function createHeaders(school, accessToken, authToken) {
    return {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + accessToken,
        "Accept": "application/json",
        "x-cod-min": school,
        "x-auth-token": authToken,
        "User-Agent": USER_AGENT
    };
}

// ============= IDENTITY RESOLUTION (MULTI-STRATEGY) =============

async function resolveIdentityForProfile(school, username, password, accessToken, authToken, currentName, currentClass) {
    let name = (currentName || '').trim().toUpperCase();
    let cls = normalizeClass(currentClass) || '';

    // FAST EXIT
    if (name && cls && CLASS_REGEX.test(cls) && name !== username.toUpperCase()) {
        return { name, cls };
    }

    const headers = createHeaders(school, accessToken, authToken);

    // STRATEGIA A: /scheda
    if (!name || !cls || !CLASS_REGEX.test(cls)) {
        try {
            debugLog("🕵️ Identity: Tentativo 1 (Scheda)...");
            const scheda = await getScheda(headers);
            const extracted = extractStudentFromScheda(scheda);

            if (extracted.name) name = extracted.name;
            if (extracted.cls) cls = extracted.cls;

            cls = normalizeClass(cls) || cls;
            if (name && cls && CLASS_REGEX.test(cls)) {
                debugLog("✅ Identity risolta con SCHEDA");
                return { name, cls };
            }
        } catch (e) {
            debugLog("⚠️ Fail Scheda", e.message);
        }
    }

    // STRATEGIA B: /dashboard
    if (!name || !cls || !CLASS_REGEX.test(cls)) {
        try {
            debugLog("🕵️ Identity: Tentativo 2 (Dashboard)...");
            const dashboard = await getDashboard(headers);
            const extracted = extractStudentFromDashboard(dashboard);

            if (!name && extracted.name) name = extracted.name;
            if ((!cls || !CLASS_REGEX.test(cls)) && extracted.cls) cls = extracted.cls;

            cls = normalizeClass(cls) || cls;
            if (name && cls && CLASS_REGEX.test(cls)) {
                debugLog("✅ Identity risolta con DASHBOARD");
                return { name, cls };
            }
        } catch (e) {
            debugLog("⚠️ Fail Dashboard", e.message);
        }
    }

    // STRATEGIA C: /anagrafe (Legacy)
    if (!name || !cls) {
        try {
            debugLog("🕵️ Identity: Tentativo 3 (Anagrafe Legacy)...");
            const anagrafe = await getAnagrafe(headers);

            if (anagrafe) {
                if (Array.isArray(anagrafe) && anagrafe.length > 0) {
                    const a = anagrafe[0];
                    if (a.nominativo) name = a.nominativo;
                    if (a.desClasse) cls = a.desClasse;
                } else if (anagrafe.nominativo) {
                    name = anagrafe.nominativo;
                    if (anagrafe.desClasse) cls = anagrafe.desClasse;
                }
            }
        } catch (e) {
            debugLog("⚠️ Fail Anagrafe", e.message);
        }
    }

    // STRATEGIA D: /alunno e /alunno/anagrafe
    if (!name || !cls || !CLASS_REGEX.test(cls)) {
        try {
            debugLog("🕵️ Identity: Tentativo 4 (Alunno)...");
            const alunno = await getAlunno(headers) || await getAlunnoAnagrafe(headers);
            const obj = Array.isArray(alunno) ? (alunno[0] || {}) : (alunno || {});
            const an = obj.alunno || obj;

            if (!name && (an.desNominativo || an.nominativo)) {
                name = (an.desNominativo || an.nominativo).trim().toUpperCase();
            }
            if ((!cls || !CLASS_REGEX.test(cls)) && (an.desClasse || an.classe)) {
                cls = (an.desClasse || an.classe).trim().toUpperCase();
            }

            cls = normalizeClass(cls) || cls;
            if (name && cls && CLASS_REGEX.test(cls)) {
                debugLog("✅ Identity risolta con ALUNNO");
                return { name, cls };
            }
        } catch (e) {
            debugLog("⚠️ Fail Alunno", e.message);
        }
    }

    // Pulizia finale
    if (name) name = name.trim().toUpperCase();
    if (cls) cls = normalizeClass(cls) || null;

    debugLog("🏁 Identity finale", { name, cls });
    return { name: name || null, cls: cls || null };
}

async function resolveIdentityFromWebUI(jar) {
    try {
        if (!jar) return { name: null, cls: null };

        const client = wrapper(axios.create({ jar, withCredentials: true, timeout: 15000 }));
        const url = 'https://www.portaleargo.it/argoweb/famiglia/index.jsf';

        debugLog("🌐 Identity: Fallback ULTIMA SPIAGGIA (HTML Scraping)...");
        const res = await client.get(url, {
            headers: { 'User-Agent': USER_AGENT, 'Accept': 'text/html' }
        });

        const $ = cheerio.load(res.data);

        // Nome principale (toolbar "Alunno:")
        let name = $('#_idJsp44').text().trim();

        // Fallback su "Nominativo: ..." in statusbar
        if (!name) {
            const t = $('span:contains("Nominativo")').text();
            const m = t && t.match(/Nominativo\s*:\s*(.+)/i);
            if (m) name = m[1].trim();
        }

        // Classe (riga "Classe:")
        let cls = $('#_idJsp56').text().trim();

        // Pulizia/normalizzazione
        name = name ? name.toUpperCase() : null;
        cls = cls ? normalizeClass(cls) : null;

        if (name) debugLog(`✅ Identity risolta da WEB UI: ${name} (${cls})`);
        return { name, cls: cls || "N/D" };
    } catch (e) {
        debugLog("⚠️ resolveIdentityFromWebUI error", e.message);
        return { name: null, cls: null };
    }
}

// ============= GRADE EXTRACTION (3 STRATEGIE) =============

async function extractGradesMultiStrategy(headers) {
    let grades = [];

    // Strategia 1: Dashboard
    try {
        const dashboardData = await getDashboard(headers);
        let datiList = [];

        if (dashboardData.data && dashboardData.data.dati) datiList = dashboardData.data.dati;
        else if (dashboardData.dati) datiList = dashboardData.dati;

        if (datiList.length > 0) {
            const mainData = datiList[0];
            const votiKeys = ['votiGiornalieri', 'votiPeriodici', 'votiScrutinio', 'voti', 'valutazioni'];

            for (const key of votiKeys) {
                const votiRaw = mainData[key];
                if (Array.isArray(votiRaw) && votiRaw.length > 0) {
                    for (const v of votiRaw) {
                        const valore = v.codVoto || v.voto || v.valore;
                        const materia = v.desMateria || v.materia || 'N/D';

                        grades.push({
                            materia: materia,
                            valore: valore,
                            data: v.datGiorno || v.data,
                            tipo: v.desVoto || v.tipo || 'N/D',
                            subject: materia,
                            value: valore,
                            date: v.datGiorno || '',
                            id: uuidv4().substring(0, 12)
                        });
                    }
                    return grades;
                }
            }
        }
    } catch (e) {
        debugLog("⚠️ Grade Strategia 1 fallita", e.message);
    }

    // Strategia 2: API Diretta
    try {
        const endpoints = ["votiGiornalieri", "voti"];
        const baseUrl = ENDPOINT.replace('/appfamiglia', '/famiglia');

        for (const ep of endpoints) {
            try {
                const res = await axios.get(baseUrl + ep, { headers, timeout: 10000 });

                if (res.status === 200 && Array.isArray(res.data)) {
                    for (const v of res.data) {
                        grades.push({
                            materia: v.desMateria || 'N/D',
                            valore: v.codVoto || '',
                            data: v.datGiorno || '',
                            subject: v.desMateria || 'N/D',
                            value: v.codVoto || '',
                            date: v.datGiorno || '',
                            id: uuidv4().substring(0, 12)
                        });
                    }
                    if (grades.length > 0) {
                        debugLog("✅ Grade Strategia 2 succeeded");
                        return grades;
                    }
                }
            } catch (err) {
                continue;
            }
        }
    } catch (e) {
        debugLog("⚠️ Grade Strategia 2 fallita", e.message);
    }

    debugLog("⚠️ Nessun voto trovato");
    return grades;
}

// ============= HOMEWORK EXTRACTION =============

async function extractHomeworkSafe(headers) {
    const tasksData = [];

    try {
        const dashboardData = await getDashboard(headers);
        const rawHomework = {};

        const dati = dashboardData?.data?.dati || [];

        if (dati.length > 0) {
            const registro = dati[0].registro || [];

            for (const element of registro) {
                const compiti = element.compiti || [];

                for (const compito of compiti) {
                    const dataConsegna = compito.dataConsegna;
                    if (!dataConsegna) continue;

                    if (!rawHomework[dataConsegna]) {
                        rawHomework[dataConsegna] = { compiti: [], materie: [] };
                    }

                    rawHomework[dataConsegna].compiti.push(compito.compito || '');
                    rawHomework[dataConsegna].materie.push(element.materia || 'Generico');
                }
            }
        }

        for (const [dateStr, details] of Object.entries(rawHomework)) {
            const compitiList = details.compiti;
            const materieList = details.materie;

            compitiList.forEach((desc, i) => {
                const mat = materieList[i] || "Generico";

                tasksData.push({
                    id: uuidv4().substring(0, 12),
                    text: desc,
                    subject: mat,
                    due_date: dateStr,
                    datCompito: dateStr,
                    materia: mat,
                    done: false
                });
            });
        }

    } catch (e) {
        debugLog("⚠️ Errore compiti", e.message);
    }

    return tasksData;
}

// ============= PROMEMORIA EXTRACTION =============

async function extractPromemoria(headers) {
    const promemoria = [];

    try {
        const dashboardData = await getDashboard(headers);
        let datiList = dashboardData?.data?.dati || dashboardData?.dati || [];

        for (const blocco of datiList) {
            const items = [...(blocco.bachecaAlunno || []), ...(blocco.promemoria || [])];

            for (const i of items) {
                promemoria.push({
                    titolo: i.desOggetto || i.titolo || 'Avviso',
                    testo: i.desMessaggio || i.testo || i.desAnnotazioni || '',
                    autore: i.desMittente || 'Scuola',
                    data: i.datGiorno || i.data || '',
                    url: i.urlAllegato || '',
                    oggetto: i.desOggetto || i.titolo || 'Avviso',
                    date: i.datGiorno || ''
                });
            }
        }

    } catch (e) {
        debugLog("⚠️ Errore promemoria", e.message);
    }

    return promemoria;
}

// ============= FILE PERSISTENCE =============

const POSTS_FILE = path.join(__dirname, 'posts.json');
const MARKET_FILE = path.join(__dirname, 'market.json');
const POLLS_FILE = path.join(__dirname, 'polls.json');

function loadJsonFile(filepath, defaultVal = []) {
    try {
        if (fs.existsSync(filepath)) {
            return JSON.parse(fs.readFileSync(filepath, 'utf8'));
        }
    } catch (e) {
        console.error(`Error loading ${filepath}:`, e);
    }
    return defaultVal;
}

function saveJsonFile(filepath, data) {
    try {
        fs.writeFileSync(filepath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error(`Error saving ${filepath}:`, e);
    }
}

// ============= ROUTES =============

// Health Check
app.get('/health', (req, res) => {
    res.status(200).json({ status: "ok", debug: DEBUG_MODE });
});

// Avatar Upload (Supabase)
app.post('/api/upload', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase non configurato" });

    try {
        const { image: base64Image, userId = uuidv4() } = req.body;

        if (!base64Image || !base64Image.startsWith('data:image/')) {
            return res.status(400).json({ success: false, error: "Formato immagine non valido" });
        }

        const matches = base64Image.match(/^data:image\/([a-zA-Z0-9]+);base64,(.+)$/);
        if (!matches) throw new Error("Invalid base64");

        const ext = matches[1];
        const buffer = Buffer.from(matches[2], 'base64');
        const filename = `${userId.replace(/:/g, '_')}_${Date.now()}.${ext}`;

        const { data, error } = await supabase.storage.from('avatars').upload(filename, buffer, {
            contentType: `image/${ext}`,
            upsert: true
        });

        if (error) throw error;

        const { data: publicData } = supabase.storage.from('avatars').getPublicUrl(filename);

        debugLog(`✅ Avatar uploaded: ${filename}`, { url: publicData.publicUrl });
        res.status(200).json({ success: true, url: publicData.publicUrl });

    } catch (e) {
        debugLog("❌ Avatar upload failed", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Update Profile
app.put('/api/profile', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase non configurato" });

    try {
        const { userId, name, class: className, avatar } = req.body;
        if (!userId) return res.status(400).json({ success: false, error: "userId mancante" });

        const profileData = {
            id: userId,
            last_active: new Date().toISOString()
        };

        if (name) profileData.name = name;
        if (className) profileData.class = className;
        if (avatar) {
            if (!avatar.startsWith('http')) {
                return res.status(400).json({ success: false, error: "Avatar deve essere URL" });
            }
            profileData.avatar = avatar;
        }

        const { error } = await supabase.from("profiles").upsert(profileData, { onConflict: "id" });
        if (error) throw error;

        debugLog(`✅ Profile updated: ${userId}`);
        res.status(200).json({ success: true });

    } catch (e) {
        debugLog("❌ Profile update failed", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Get Profile
app.get('/api/profile/:user_id', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase non configurato" });

    try {
        const { data, error } = await supabase.from("profiles").select("*").eq("id", req.params.user_id);

        if (error) throw error;
        if (!data || data.length === 0) {
            return res.status(404).json({ success: false, error: "Profilo non trovato" });
        }

        debugLog(`✅ Profile retrieved: ${req.params.user_id}`);
        res.status(200).json({ success: true, data: data[0] });

    } catch (e) {
        debugLog("❌ Profile retrieval failed", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Posts CRUD
app.get('/api/posts', async (req, res) => {
    if (supabase) {
        try {
            const { data } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(100);
            return res.json({ success: true, data: data || [] });
        } catch (e) {
            debugLog("⚠️ Posts GET error", e.message);
        }
    }
    res.json({ success: true, data: loadJsonFile(POSTS_FILE) });
});

app.post('/api/posts', async (req, res) => {
    const body = req.body || {};
    if (!body.text) return res.status(400).json({ success: false, error: "Missing text" });

    if (supabase) {
        try {
            const payload = {
                author_id: body.authorId || body.author_id,
                author_name: body.author || body.author_name,
                class: body.class,
                text: body.text,
                image: body.image,
                anon: !!body.anon
            };
            await supabase.from("posts").insert(payload);
            const { data } = await supabase.from("posts").select("*").order("created_at", { ascending: false }).limit(100);
            return res.json({ success: true, data: data || [] });
        } catch (e) {
            debugLog("⚠️ Posts POST error", e.message);
        }
    }

    const newPost = { ...body, id: Date.now() };
    const posts = loadJsonFile(POSTS_FILE);
    posts.unshift(newPost);
    saveJsonFile(POSTS_FILE, posts.slice(0, 100));
    res.json({ success: true, data: posts });
});

// Market CRUD
app.get('/api/market', async (req, res) => {
    if (supabase) {
        try {
            const { data } = await supabase.from("market_items").select("*").order("created_at", { ascending: false }).limit(200);
            return res.json({ success: true, data: data || [] });
        } catch (e) {
            debugLog("⚠️ Market GET error", e.message);
        }
    }
    res.json({ success: true, data: loadJsonFile(MARKET_FILE) });
});

app.post('/api/market', async (req, res) => {
    const body = req.body || {};
    if (!body.title || !body.price) return res.status(400).json({ success: false, error: "Missing title/price" });

    if (supabase) {
        try {
            const payload = {
                seller_id: body.sellerId || body.seller_id,
                seller_name: body.seller || body.seller_name,
                title: body.title,
                price: body.price,
                image: body.image
            };
            await supabase.from("market_items").insert(payload);
            const { data } = await supabase.from("market_items").select("*").order("created_at", { ascending: false }).limit(200);
            return res.json({ success: true, data: data || [] });
        } catch (e) {
            debugLog("⚠️ Market POST error", e.message);
        }
    }

    const newItem = { ...body, id: Date.now() };
    const items = loadJsonFile(MARKET_FILE);
    items.unshift(newItem);
    saveJsonFile(MARKET_FILE, items);
    res.json({ success: true, data: items });
});

// Polls CRUD
app.get('/api/polls', async (req, res) => {
    if (supabase) {
        try {
            const { data } = await supabase.from("polls").select("*").order("created_at", { ascending: false });
            return res.json({ success: true, data: data || [] });
        } catch (e) {
            debugLog("⚠️ Polls GET error", e.message);
        }
    }
    res.json({ success: true, data: loadJsonFile(POLLS_FILE) });
});

app.post('/api/polls', async (req, res) => {
    const body = req.body || {};
    const { question, choices, authorId, author, expiresAt } = body;

    if (!question || !choices) {
        return res.status(400).json({ success: false, error: "Missing question or choices" });
    }

    const newPoll = {
        id: uuidv4(),
        question,
        choices: choices.map(c => ({ id: c.id || uuidv4(), text: c.text, votes: 0 })),
        voters: {},
        author: authorId || author,
        created_at: new Date().toISOString(),
        expires_at: expiresAt
    };

    if (supabase) {
        try {
            await supabase.from("polls").insert(newPoll);
            const { data } = await supabase.from("polls").select("*").order("created_at", { ascending: false }).limit(10);
            return res.json({ success: true, data: data || [] });
        } catch (e) {
            debugLog("⚠️ Polls POST error", e.message);
        }
    }

    const polls = loadJsonFile(POLLS_FILE);
    polls.unshift(newPoll);
    saveJsonFile(POLLS_FILE, polls);
    res.json({ success: true, data: polls });
});

app.post('/api/polls/:poll_id/vote', async (req, res) => {
    const pollId = req.params.poll_id;
    const body = req.body || {};
    const voter = body.voterId || body.authorId || body.userId || body.voter;
    const choiceId = body.choiceId;

    if (!voter || !choiceId) {
        return res.status(400).json({ success: false, error: "Missing voterId or choiceId" });
    }

    if (supabase) {
        try {
            const { data } = await supabase.from("polls").select("*").eq("id", pollId).limit(1);

            if (!data || data.length === 0) {
                return res.status(404).json({ success: false, error: "Poll not found" });
            }

            const poll = data[0];
            const voters = poll.voters || {};
            const prevChoice = voters[voter];

            if (prevChoice === choiceId) {
                return res.json({ success: true, data: poll });
            }

            const choices = poll.choices || [];

            choices.forEach(ch => {
                if (ch.id === choiceId) ch.votes = (ch.votes || 0) + 1;
                if (prevChoice && ch.id === prevChoice) ch.votes = Math.max(0, (ch.votes || 0) - 1);
            });

            voters[voter] = choiceId;

            await supabase.from("polls").update({ choices, voters }).eq("id", pollId);

            const updated = await supabase.from("polls").select("*").eq("id", pollId).limit(1);
            return res.json({ success: true, data: updated.data[0] });

        } catch (e) {
            debugLog("⚠️ Poll vote error", e.message);
        }
    }

    const polls = loadJsonFile(POLLS_FILE);
    const poll = polls.find(p => p.id === pollId);

    if (!poll) {
        return res.status(404).json({ success: false, error: "Poll not found" });
    }

    const voters = poll.voters || {};
    const prevChoice = voters[voter];

    if (prevChoice === choiceId) {
        return res.json({ success: true, data: poll });
    }

    poll.choices.forEach(ch => {
        if (ch.id === choiceId) ch.votes = (ch.votes || 0) + 1;
        if (prevChoice && ch.id === prevChoice) ch.votes = Math.max(0, (ch.votes || 0) - 1);
    });

    voters[voter] = choiceId;
    poll.voters = voters;

    saveJsonFile(POLLS_FILE, polls);
    res.json({ success: true, data: poll });
});

// Chat Messages
app.get('/api/messages/thread/:thread_id', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase not configured" });

    try {
        const { data } = await supabase.from("chat_messages")
            .select("*")
            .eq("thread_id", req.params.thread_id)
            .order("created_at", { ascending: true })
            .limit(500);

        res.json({ success: true, data: data || [] });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

app.post('/api/messages', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase not configured" });

    try {
        const msg = req.body;

        if (!msg.threadId || !msg.senderId || !msg.receiverId || !msg.text) {
            return res.status(400).json({ success: false, error: "Missing fields" });
        }

        const payload = {
            thread_id: msg.threadId,
            sender_id: msg.senderId,
            sender_name: msg.senderName,
            receiver_id: msg.receiverId,
            text: msg.text
        };

        await supabase.from("chat_messages").insert(payload);

        const { data } = await supabase.from("chat_messages")
            .select("*")
            .eq("thread_id", msg.threadId)
            .order("created_at", { ascending: true })
            .limit(500);

        res.json({ success: true, data: data || [] });

    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// ============= PLANNER ROUTES =============

app.get('/api/planner/:user_id', async (req, res) => {
    if (!supabase) return res.status(500).json({ success: false, error: "Supabase not configured" });

    try {
        const userId = decodeURIComponent(req.params.user_id);
        const { data, error } = await supabase.from("planners")
            .select("*")
            .eq("user_id", userId)
            .limit(1);

        if (error) throw error;

        if (!data || data.length === 0) {
            return res.status(404).json({ success: false, error: "Planner not found" });
        }

        res.json({ success: true, data: data[0] });
    } catch (e) {
        res.status(500).json({ success: false, error: e.message });
    }
});

// Supabase REST helpers for fallback
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

    // Prima prova supabase-js
    if (supabase) {
        try {
            const { data, error } = await supabase
                .from('planners')
                .upsert(payload, { onConflict: 'user_id' })
                .select()
                .single();

            if (!error && data) {
                return res.json({
                    success: true,
                    data: {
                        userId: data.user_id,
                        plannedTasks: data.planned_tasks,
                        stressLevels: data.stress_levels,
                        plannedDetails: data.planned_details,
                        updatedAt: data.updated_at
                    }
                });
            }
            debugLog("planner upsert supabase-js error", error?.message);
        } catch (e) {
            debugLog("planner upsert supabase-js exception", e.message);
        }
    }

    // Fallback REST (come Python)
    try {
        const url = `${sbTableUrl('planners')}?on_conflict=user_id`;
        const headers = sbHeaders();
        headers.Prefer = "resolution=merge-duplicates,return=representation";

        const r = await axios.post(url, payload, { headers, timeout: 15000 });
        const rows = Array.isArray(r.data) ? r.data : [r.data];
        const row = rows[0] || payload;

        return res.json({
            success: true,
            data: {
                userId: row.user_id,
                plannedTasks: row.planned_tasks,
                stressLevels: row.stress_levels,
                plannedDetails: row.planned_details,
                updatedAt: row.updated_at
            }
        });
    } catch (e) {
        debugLog("planner upsert REST error", e.response?.data || e.message);
        return res.status(e.response?.status || 500).json({ success: false, error: e.response?.data || e.message });
    }
});

// ============= AUTH ENDPOINTS =============

app.post('/api/resolve-profile', async (req, res) => {
    const { schoolCode, username, password, profileIndex } = req.body;
    const school = (schoolCode || '').trim().toUpperCase();
    const user = (username || '').trim().toLowerCase();
    const idx = parseInt(profileIndex) || 0;

    if (!school || !user || !password) {
        return res.status(400).json({ success: false, error: "Parametri mancanti" });
    }

    try {
        const loginRes = await AdvancedArgo.rawLogin(school, user, password);
        const profiles = loginRes.profiles || [];

        if (profiles.length === 0) {
            return res.status(404).json({ success: false, error: "Nessun profilo" });
        }

        const targetIdx = (idx < 0 || idx >= profiles.length) ? 0 : idx;
        const target = profiles[targetIdx];

        const { name, cls } = await resolveIdentityForProfile(
            school, user, password,
            loginRes.access_token, target.token,
            target.name, target.class
        );

        const finalClass = normalizeClass(cls);
        res.json({
            success: true,
            name: name || `STUDENTE ${targetIdx + 1}`,
            class: finalClass || "N/D"
        });

    } catch (e) {
        debugLog("⚠️ resolve_profile error", e.message);
        res.status(500).json({ success: false, error: e.message });
    }
});

// Login Endpoint
app.post('/login', async (req, res) => {
    const body = req.body;
    const school = (body.schoolCode || body.school || '').trim().toUpperCase();
    const username = (body.username || '').trim().toLowerCase();
    const password = body.password;
    const selectedProfileIndex = body.profileIndex !== undefined ? body.profileIndex : null;

    if (!school || !username || !password) {
        return res.status(400).json({ success: false, error: "Dati mancanti" });
    }

    try {
        debugLog("LOGIN REQUEST", { school, username, idx: selectedProfileIndex });

        // 1. Raw Login (Ottiene i token)
        const loginRes = await AdvancedArgo.rawLogin(school, username, password);
        const accessToken = loginRes.access_token;
        let profiles = loginRes.profiles || [];

        // 2. Arricchimento Profili (Recupero nomi reali se mancanti)
        profiles = await enrichProfiles(school, accessToken, profiles);

        // 3. Verifica Multi-Profilo
        // Se ci sono più profili e l'utente non ne ha scelto uno, restituiamo la lista
        if (profiles.length > 1 && selectedProfileIndex === null) {
            debugLog("⚠️ Rilevati profili multipli, richiesta selezione al frontend.");
            return res.status(200).json({
                success: true,
                status: "MULTIPLE_PROFILES",
                profiles: profiles.map(p => ({
                    index: p.index,
                    name: p.name,
                    class: p.class,
                    school: school
                }))
            });
        }

        // 4. Selezione Profilo Target
        let targetIndex = 0;
        if (selectedProfileIndex !== null) {
            targetIndex = parseInt(selectedProfileIndex);
        }
        if (targetIndex < 0 || targetIndex >= profiles.length) targetIndex = 0;

        const targetProfile = profiles[targetIndex];
        const authToken = targetProfile.token;

        if (!accessToken || !authToken) {
            throw new Error("Impossibile recuperare i token di sessione");
        }

        // 5. Identità autoritativa
        let studentName = targetProfile.name;
        let studentClass = normalizeClass(targetProfile.class) || targetProfile.class;
        const jar = loginRes.jar;

        // Fallback HTML se i metodi JSON non hanno risolto il nome reale
        if ((!studentName || studentName.startsWith('STUDENTE')) || studentClass === "N/D") {
            const webId = await resolveIdentityFromWebUI(jar);
            if (webId.name) studentName = webId.name;
            if (webId.cls && webId.cls !== "N/D") studentClass = normalizeClass(webId.cls) || studentClass;
        }

        // 4. Dati Scolastici (Parallelo)
        const headers = createHeaders(school, accessToken, authToken);
        const [gradesData, tasksData, announcementsData] = await Promise.all([
            extractGradesMultiStrategy(headers),
            extractHomeworkSafe(headers),
            extractPromemoria(headers)
        ]);

        // 5. Upsert Supabase
        if (supabase) {
            try {
                const pid = `${school}:${username}:${targetIndex}`;
                const normalizedClass = normalizeClass(studentClass);
                await supabase.from("profiles").upsert({
                    id: pid,
                    name: studentName,
                    class: normalizedClass || studentClass || "N/D",
                    last_active: new Date().toISOString()
                }, { onConflict: "id" });
                debugLog("👤 Profile upsert", { id: pid, name: studentName, class: studentClass });
            } catch (e) {
                debugLog("⚠️ Supabase upsert error", e.message);
            }
        }

        // 6. Response
        const resp = {
            success: true,
            session: {
                schoolCode: school,
                authToken: authToken,
                accessToken: accessToken,
                userName: username,
                profileIndex: targetIndex
            },
            student: { name: studentName, class: normalizeClass(studentClass) || studentClass || "N/D", school: school },
            tasks: tasksData,
            voti: gradesData,
            promemoria: announcementsData
        };

        if (targetProfile) {
            resp.selectedProfile = {
                index: targetIndex,
                name: studentName,
                class: studentClass,
                school: targetProfile.school || school,
                idSoggetto: targetProfile.idSoggetto
            };
        }

        if (profiles.length > 1) {
            resp.profiles = profiles.map(p => ({
                index: p.index,
                name: p.name,
                class: p.class,
                school: p.school || school
            }));
        }

        debugLog("📊 LOGIN SUCCESS", {
            student: studentName,
            class: studentClass,
            profiles: profiles.length
        });

        res.status(200).json(resp);

    } catch (e) {
        console.error("LOGIN FAILURE", e);
        res.status(401).json({
            success: false,
            error: e.message,
            traceback: DEBUG_MODE ? e.stack : null
        });
    }
});

// Test Profile Structure
app.post('/test/profile-structure', async (req, res) => {
    const { schoolCode, username, password } = req.body;

    if (!schoolCode || !username || !password) {
        return res.status(400).json({ error: "Missing credentials" });
    }

    const result = { profiles: [], errors: [], success: false };

    try {
        const loginRes = await AdvancedArgo.rawLogin(schoolCode, username, password);
        let profiles = loginRes.profiles || [];

        // Arricchimento test
        profiles = await enrichProfiles(schoolCode, loginRes.access_token, profiles);

        result.profiles = profiles.map(p => ({
            index: p.index,
            token_start: p.token ? p.token.substring(0, 8) + "..." : "NONE",
            name: p.name,
            class: p.class,
            raw_data_keys: Object.keys(p.raw || {})
        }));

        result.success = true;
        res.json(result);

    } catch (e) {
        result.errors.push({ error: e.message, traceback: e.stack });
        res.status(500).json(result);
    }
});

// Sync Endpoint
app.options('/sync', cors());  // ← PREFLIGHT per CORS

app.post('/sync', async (req, res) => {
    const body = req.body;
    const school = (body.schoolCode || '').trim().toUpperCase();
    const storedUser = body.storedUser;
    const storedPass = body.storedPass;
    let profileIndex = parseInt(body.profileIndex) || 0;

    try {
        debugLog("SYNC REQUEST", { school, profileIndex });

        if (!school || !storedUser || !storedPass) {
            return res.status(401).json({ success: false, error: "Credenziali mancanti" });
        }

        // Decode Base64
        const user = decodeURIComponent(Buffer.from(storedUser, 'base64').toString('utf-8')).trim().toLowerCase();
        const pwd = decodeURIComponent(Buffer.from(storedPass, 'base64').toString('utf-8'));

        let accessToken = null;
        let authToken = null;
        let profiles = [];

        try {
            const loginRes = await AdvancedArgo.rawLogin(school, user, pwd);
            accessToken = loginRes.access_token;
            profiles = loginRes.profiles || [];

            if (profiles.length > 0) {
                if (profileIndex < 0 || profileIndex >= profiles.length) profileIndex = 0;
                authToken = profiles[profileIndex].token;
            }
        } catch (e) {
            debugLog("⚠️ Sync Login Fail", e.message);
            throw e;
        }

        const headers = createHeaders(school, accessToken, authToken);

        // Fetch in parallelo
        const [grades, tasks, promemoria] = await Promise.all([
            extractGradesMultiStrategy(headers),
            extractHomeworkSafe(headers),
            extractPromemoria(headers)
        ]);

        if (supabase) {
            try {
                let sName = null, sClass = null;

                if (profiles.length > 0) {
                    const t = profiles[profileIndex];
                    const resIdent = await resolveIdentityForProfile(
                        school, user, pwd, accessToken, authToken, t.name, t.class
                    );
                    sName = resIdent.name;
                    sClass = normalizeClass(resIdent.cls) || resIdent.cls;
                }

                const pid = `${school}:${user}:${profileIndex}`;
                const payload = { id: pid, last_active: new Date().toISOString() };

                if (sName) payload.name = sName;
                const sClassNorm = normalizeClass(sClass);
                if (sClassNorm) payload.class = sClassNorm;

                await supabase.from("profiles").upsert(payload, { onConflict: "id" });
                debugLog("👤 Sync profile upsert", payload);

            } catch (e) {
                debugLog("⚠️ Sync Supabase error", e.message);
            }
        }

        res.json({
            success: true,
            tasks,
            voti: grades,
            promemoria,
            new_tokens: { authToken, accessToken }
        });

    } catch (e) {
        debugLog("❌ SYNC FAILED", e.message);
        res.status(401).json({ success: false, error: e.message });
    }
});

// ============= START SERVER =============
const PORT = process.env.PORT || 5001; // ← Cambiata da 5000 a 5001 per macOS AirPlay conflict

app.listen(PORT, () => {
    console.log(`\n${'='.repeat(70)}`);
    console.log(`🚀 Server Node.js avviato su porta ${PORT}`);
    console.log(`Debug Mode: ${DEBUG_MODE}`);
    console.log(`Supabase: ${supabase ? '✅ Configurato' : '❌ Non configurato'}`);
    console.log(`${'='.repeat(70)}\n`);
});
