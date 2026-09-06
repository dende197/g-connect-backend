const crypto = require('crypto');
const {
    SESSION_TOKEN_HEX_LENGTH,
    SESSION_TOKEN_REGEX,
    SESSION_TTL_MS,
    isSessionSecurityConfigured,
    encryptArgoPassword,
    decryptArgoPassword,
    generateSessionToken,
    verifySessionToken,
    normalizeUserId
} = require('./auth');

const DEBUG_MODE = (process.env.DEBUG_MODE || 'false').toLowerCase() === 'true';

const SENSITIVE_KEYS = new Set([
    'x-auth-token', 'Authorization', 'authToken',
    'access_token', 'token', 'password'
]);

const CLASS_REGEX = /^[1-5][A-Z]{1,3}(?:\s*\([A-Z]{2,3}\))?$/;

// ============= CORS HEADERS =============

const DEFAULT_ALLOWED_ORIGINS = new Set([
    'https://dende197.github.io',
    'http://localhost:3000',
    'http://localhost:5173',
    'http://localhost:8080',
    'http://127.0.0.1:5500'
]);

const ENV_ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || '')
    .split(',')
    .map(o => o.trim())
    .filter(Boolean);

function isOriginAllowed(origin) {
    if (!origin) return false;
    if (DEFAULT_ALLOWED_ORIGINS.has(origin)) return true;
    if (ENV_ALLOWED_ORIGINS.includes(origin)) return true;
    try {
        const parsed = new URL(origin);
        // Allow GitHub Pages of this app / user
        if (parsed.hostname === 'dende197.github.io' || parsed.hostname.endsWith('.github.io')) {
            return true;
        }
        // Allow local development
        if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') {
            return true;
        }
        // Allow Vercel preview/production deployments
        if (parsed.hostname.endsWith('.vercel.app')) {
            return true;
        }
    } catch (_) {}
    return false;
}

function setCorsHeaders(req, res) {
    const origin = (req && req.headers && req.headers.origin) || '';

    if (origin && isOriginAllowed(origin)) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
        // SECURITY: Reject untrusted origins
        res.setHeader('Access-Control-Allow-Credentials', 'false');
    }
    res.setHeader('Vary', 'Origin');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Authorization, X-Requested-With, X-Client-Info, apikey, x-id-soggetto, x-prg-soggetto, x-auth-token, x-session-token, x-user-id'
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
}

function handleCors(req, res) {
    setCorsHeaders(req, res);
    if (req.method === 'OPTIONS') {
        res.status(204).end();
        return true; // Indicates that handler should return
    }
    return false;
}

// ============= LOGGING =============

function debugLog(message, data = null) {
    if (!DEBUG_MODE) return;
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔍 ${message}`);
    if (data !== null) {
        const safe = redact(data);
        try {
            console.log(JSON.stringify(safe, null, 2).substring(0, 2000));
        } catch (e) {
            console.log(String(safe).substring(0, 2000));
        }
    }
    console.log(`${'='.repeat(60)}\n`);
}

// ============= SECURITY =============

function redact(obj) {
    if (!obj) return obj;
    try {
        if (Array.isArray(obj)) return obj.map(v => redact(v));
        if (typeof obj === 'object') {
            const newObj = {};
            for (const [k, v] of Object.entries(obj)) {
                newObj[k] = SENSITIVE_KEYS.has(k) ? '<redacted>' : redact(v);
            }
            return newObj;
        }
    } catch (e) { }
    return obj;
}

// ============= IDENTITY =============

function normalizeUserIdParam(userIdParam) {
    if (userIdParam === null || userIdParam === undefined) return '';
    try {
        return normalizeUserId(decodeURIComponent(String(userIdParam)));
    } catch (e) {
        return normalizeUserId(userIdParam);
    }
}

function getRequestBody(req) {
    if (!req) return {};
    if (req.body && typeof req.body === 'object' && !Array.isArray(req.body)) return req.body;
    if (typeof req.body === 'string' && req.body.trim()) {
        try { return JSON.parse(req.body); } catch (_) { return {}; }
    }
    return {};
}

function generateStableId(baseString) {
    return crypto.createHash('md5').update(baseString).digest('hex').substring(0, 12);
}

function generatePid(school, user, index) {
    const s = String(school || '').trim().toUpperCase();
    const u = String(user || '').trim().toLowerCase();
    const i = String(index ?? 0);
    return `p:${s}:${u}:${i}`.toLowerCase().replace(/\s+/g, '');
}

function buildName(obj = {}) {
    const full = obj.desNominativo || obj.nominativo;
    if (full) return String(full).trim().toUpperCase();
    const n = obj.desNome || obj.nome || '';
    const c = obj.desCognome || obj.cognome || '';
    const combo = `${String(c).trim()} ${String(n).trim()}`.trim();
    return combo ? combo.toUpperCase() : null;
}

/**
 * Detects the high school specialization / track (indirizzo) from text or abbreviations.
 * Recognized tracks:
 * - SCIENZE APPLICATE (abbreviation: SA)
 * - SCIENTIFICO (abbreviation: LS)
 * - SCIENZE UMANE (abbreviation: SU)
 * - CLASSICO (abbreviation: CL or LC)
 * - LINGUISTICO (abbreviation: LL)
 * - ARTISTICO (abbreviation: LA)
 */
function detectTrack(text) {
    if (!text) return null;
    const s = String(text).toUpperCase()
        .replace(/[\(\)\[\],.\-_/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!s) return null;

    // 1. SCIENZE APPLICATE (checked before SCIENTIFICO since it often appears as 'SCIENTIFICO OPZIONE SCIENZE APPLICATE')
    if (/\b(?:OPZIONE\s+)?SCIENZE\s+APPLICATE\b|\bSC\s*APP(?:LICATE)?\b|\bSA\b/.test(s)) {
        return { code: 'SA', name: 'Scienze Applicate' };
    }

    // 2. SCIENZE UMANE (and Economico Sociale / LES)
    if (/\bSCIENZE\s+UMANE\b|\bSC\s*UMANE\b|\bECONOMICO\s+SOCIALE\b|\bLES\b|\bSU\b/.test(s)) {
        return { code: 'SU', name: 'Scienze Umane' };
    }

    // 3. CLASSICO (abbreviation CL or LC)
    if (/\b(?:LICEO\s+)?CLASSICO\b|\bCL\b|\bLC\b/.test(s)) {
        return { code: 'CL', name: 'Classico' };
    }

    // 4. SCIENTIFICO (tradizionale / standard)
    if (/\b(?:LICEO\s+)?SCIENTIFICO\b|\bLS\b/.test(s)) {
        return { code: 'LS', name: 'Scientifico' };
    }

    // 5. LINGUISTICO
    if (/\b(?:LICEO\s+)?LINGUISTICO\b|\bLL\b/.test(s)) {
        return { code: 'LL', name: 'Linguistico' };
    }

    // 6. ARTISTICO
    if (/\b(?:LICEO\s+)?ARTISTICO\b|\bLA\b/.test(s)) {
        return { code: 'LA', name: 'Artistico' };
    }

    return null;
}

/**
 * Parses and standardizes Italian school class details (Year, Section, Track/Indirizzo).
 * 
 * @param {string|number} raw - Raw class string (e.g. '4D', '4 D SA', '4DSA', '4 D SCIENZE APPLICATE', 'QUARTA D')
 * @param {Object} [extraContext] - Extra context (e.g. { section: 'D', course: 'SCIENZE APPLICATE' })
 * @returns {Object|null} - { year: number, section: string, track: string|null, trackName: string|null, classOnly: string, formatted: string }
 */
function parseClassDetails(raw, extraContext = {}) {
    if (!raw && !extraContext.year && !extraContext.section) return null;

    let txt = String(raw || '').toUpperCase().trim();

    // Word boundary clean blacklist for non-class phrases (avoid false matches on "4 ORE", "2 ANNI", etc.)
    // Note: OPZIONE is removed because "OPZIONE SCIENZE APPLICATE" is an official track name!
    if (/^\s*[1-5]\s*(?:ORE|ANNI|ANNO|OGGETTI|OTTOBRE|ORA|ORDINE|OFFERTA|ORARIO|OVVERO|OGNI|OLTRE)\b/i.test(txt)) {
        return null;
    }

    // Contextual candidates
    const contextSection = extraContext.section || extraContext.desSezione || extraContext.sezione || '';
    const contextCourse = extraContext.course || extraContext.desCorso || extraContext.corso || extraContext.indirizzo || extraContext.desIndirizzo || '';

    // Convert written word ordinals / Roman numerals to digit if present
    txt = txt
        .replace(/\bPRIMA\b|\bI\^?\b/g, '1')
        .replace(/\bSECONDA\b|\bII\^?\b/g, '2')
        .replace(/\bTERZA\b|\bIII\^?\b/g, '3')
        .replace(/\bQUARTA\b|\bIV\^?\b/g, '4')
        .replace(/\bQUINTA\b|\bV\^?\b/g, '5');

    let year = null;
    let section = null;

    // Detect track from context course first, or within txt
    let trackObj = detectTrack(contextCourse) || detectTrack(txt);

    // 1. Try matching Year + Section + Track abbreviation in one word:
    // e.g. "4DSA", "4DLS", "3ACL", "1BSU", "4DLC", "4DLL"
    const compactTrackMatch = txt.match(/\b([1-5])[\^°]?\s*([A-Z])\s*(SA|LS|SU|CL|LC|LL|LA)\b/i);
    if (compactTrackMatch) {
        year = parseInt(compactTrackMatch[1], 10);
        section = compactTrackMatch[2].toUpperCase();
        if (!trackObj) {
            trackObj = detectTrack(compactTrackMatch[3]);
        }
    }

    // 2. Try matching canonical Year + Section:
    // e.g. "4D", "4 D", "4^ D", "4° D", "4-D", "4/D", "CLASSE 4 SEZ. D", "4D SA", "4 D (SA)"
    if (!year || !section) {
        const explicitMatch = txt.match(/(?:CLASSE\s*[:\-]?\s*)?([1-5])[\^°]?\s*(?:(?:SEZ(?:IONE)?\.?|\/|\-)\s*[:\-]?\s*)([A-Z]{1,2})\b/i);
        if (explicitMatch) {
            year = parseInt(explicitMatch[1], 10);
            section = explicitMatch[2].toUpperCase();
        }
    }

    if (!year || !section) {
        // Standard pattern: Year followed by 1-3 letters
        const stdMatch = txt.match(/\b([1-5])[\^°]?\s*([A-Z]{1,3})\b/i);
        if (stdMatch) {
            year = parseInt(stdMatch[1], 10);
            const letters = stdMatch[2].toUpperCase();
            if (letters.length === 3 && (letters.endsWith('SA') || letters.endsWith('LS') || letters.endsWith('SU') || letters.endsWith('CL') || letters.endsWith('LC') || letters.endsWith('LL'))) {
                section = letters[0];
                if (!trackObj) trackObj = detectTrack(letters.slice(1));
            } else {
                section = letters;
            }
        }
    }

    // 3. Fallback: Year from txt/extraContext, Section from contextSection
    if (!year) {
        const yMatch = txt.match(/[1-5]/) || (String(extraContext.year || '').match(/[1-5]/));
        if (yMatch) year = parseInt(yMatch[0], 10);
    }
    if (!section && contextSection) {
        const sMatch = String(contextSection).trim().toUpperCase().match(/^[A-Z]{1,3}$/);
        if (sMatch) section = sMatch[0];
    }

    // 4. Fallback: Loose single digit and single letter in txt
    if (!year || !section) {
        const d = (txt.match(/[1-5]/) || [])[0];
        const words = txt.split(/\s+/);
        let l = null;
        for (const w of words) {
            if (/^[A-Z]$/i.test(w)) { l = w.toUpperCase(); break; }
        }
        if (d && l) {
            year = parseInt(d, 10);
            section = l;
        }
    }

    if (!year || !section) return null;

    // Reject non-section false positive words
    if (/^(ORE|AN|P|DA)$/i.test(section)) return null;

    const classOnly = `${year}${section}`;
    const trackCode = trackObj ? trackObj.code : null;
    const trackName = trackObj ? trackObj.name : null;
    const formatted = trackCode ? `${classOnly} (${trackCode})` : classOnly;

    return {
        year,
        section,
        track: trackCode,
        trackName,
        classOnly,
        formatted
    };
}

function normalizeClass(raw, strictOrContext = false) {
    if (!raw) return null;

    let extraContext = {};
    let strict = false;

    if (typeof strictOrContext === 'boolean') {
        strict = strictOrContext;
    } else if (strictOrContext && typeof strictOrContext === 'object') {
        extraContext = strictOrContext;
    }

    const details = parseClassDetails(raw, extraContext);
    if (!details) return null;

    if (strict && !CLASS_REGEX.test(details.formatted)) {
        return null;
    }

    return details.formatted;
}

function isValidName(name, username = '') {
    if (!name || typeof name !== 'string') return false;
    const t = name.trim().toUpperCase();
    if (t.length < 3) return false;
    if (username && t === username.toUpperCase()) return false;
    if (/PASSWORD|RECUPERA|CAMBIA|LOGOUT|ESC|ACCEDI|REGISTRA|MENU|CERCA/i.test(t)) return false;
    if (/^NOMINATIVO$|^ALUNNO$|^STUDENTE$|^UTENTE$|^SCONOSCIUTO$/i.test(t)) return false;
    if (t.startsWith('STUDENTE ') || t.startsWith('UTENTE ')) return false;
    const parts = t.split(/\s+/).filter(p => p.length >= 2);
    if (parts.length < 2) return false;
    return true;
}

function parseJsonb(value, fallback) {
    if (value === null || value === undefined) return fallback;
    if (typeof value === 'string') {
        try { return JSON.parse(value); } catch (e) { return fallback; }
    }
    return value;
}

function safeData(obj) {
    if (!obj) return {};
    if (obj.data) return obj.data;
    if (obj.scheda) return obj.scheda;
    return obj;
}

function parseBooleanFlag(value) {
    if (value === null || value === undefined) return null;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') {
        if (value === 1) return true;
        if (value === 0) return false;
        return null;
    }
    const normalized = String(value).trim().toLowerCase();
    if (!normalized) return null;
    if (['s', 'si', 'sì', 'y', 'yes', 'true', '1'].includes(normalized)) return true;
    if (['n', 'no', 'false', '0'].includes(normalized)) return false;
    return null;
}

function resolveAttendanceJustification(item = {}) {
    // --- Collect evidence from all known Argo field name variants ---
    const giustificataFlag = parseBooleanFlag(
        item.giustificata ?? item.flgGiustificata ?? item.giustificato ?? item.flgGiustificato
    );
    const daGiustificareFlag = parseBooleanFlag(
        item.daGiustificare ?? item.flgDaGiustificare
    );

    // Helper to check if a string is a valid non-empty date (not placeholder)
    const isValidDateStr = (s) => {
        const val = String(s || '').trim().toLowerCase();
        if (!val || ['null', '0000-00-00', '00/00/0000', 'undefined', '-'].includes(val)) return false;
        if (/^\d{4}-\d{2}-\d{2}(?:[Tt ]\d{2}:\d{2}(?::\d{2})?)?$/.test(val)) return true;
        if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return true;
        return false;
    };

    // Definitive proof: a VALID justification date means the event IS justified.
    const hasValidGiustificationDate = (
        isValidDateStr(item.datGiustificazione) ||
        isValidDateStr(item.dataGiustificazione) ||
        isValidDateStr(item.datGiustifica)
    );

    // Technical proof: a transaction/UID exists
    // Note: We use this as Priority 1 proof, assuming UID implies confirmation.
    const hasTechnicalProof = !!String(item.giustificaBinUid || '').trim();

    // Secondary info: justification reason/motive
    const hasMotiveInfo = !!(
        String(item.desGiustificazione || '').trim() ||
        String(item.motivoGiustificazione || '').trim()
    );

    // --- Hardened Priority logic ---
    let giustificata = false;

    if (hasValidGiustificationDate || hasTechnicalProof) {
        // Priority 1: Valid date or UID exists → definitively justified
        giustificata = true;
    } else if (daGiustificareFlag === false) {
        // Priority 2: If the event IS NOT to be justified (e.g. pre-authorized),
        // we consider it 'justified' so it doesn't count as a pending absence.
        // This covers the case 'giustificata: N' + 'daGiustificare: false'.
        giustificata = true;
    } else if (giustificataFlag === true) {
        // Priority 3: Explicitly marked as justified
        giustificata = true;
    }
    // Priority 4: Default to false if daGiustificare is true (or missing) 
    // and no positive evidence (S flag or Date) exists.
    // This covers the case 'giustificata: N' + 'daGiustificare: true'.

    return {
        giustificata,
        daGiustificare: !giustificata
    };
}

// ============= ARGO HEADERS =============

const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/106.0.0.0 Safari/537.36';
const ENDPOINT = 'https://www.portaleargo.it/appfamiglia/api/rest/';

function createHeaders(school, accessToken, authToken, subjectId = null) {
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + accessToken,
        'Accept': 'application/json',
        'x-cod-min': school,
        'x-auth-token': authToken,
        'User-Agent': USER_AGENT,
        'Accept-Language': 'it-IT,it;q=0.9',
        'X-Requested-With': 'XMLHttpRequest'
    };
    if (subjectId) {
        headers['x-id-soggetto'] = String(subjectId);
        headers['x-prg-soggetto'] = String(subjectId);
    }
    return headers;
}

// ============= SCHOOL YEAR (ANNO SCOLASTICO) HELPERS =============

function parseDateValue(dateInput) {
    if (!dateInput) return null;
    if (dateInput instanceof Date) {
        return Number.isNaN(dateInput.getTime()) ? null : dateInput;
    }
    if (typeof dateInput === 'string') {
        const trimmed = dateInput.trim();
        const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (iso) return new Date(parseInt(iso[1], 10), parseInt(iso[2], 10) - 1, parseInt(iso[3], 10), 12, 0, 0);
        const ita = trimmed.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
        if (ita) return new Date(parseInt(ita[3], 10), parseInt(ita[2], 10) - 1, parseInt(ita[1], 10), 12, 0, 0);
        const d = new Date(trimmed);
        return Number.isNaN(d.getTime()) ? null : d;
    }
    return null;
}

function getSchoolYearFromDate(dateInput) {
    const d = parseDateValue(dateInput);
    if (!d) return null;
    const y = d.getFullYear();
    const m = d.getMonth(); // 0 = Jan ... 8 = Sep
    const startYear = m >= 8 ? y : y - 1;
    const endYear = startYear + 1;
    const shortEnd = String(endYear).slice(-2);
    return {
        startYear,
        endYear,
        key: `${startYear}/${shortEnd}`,
        label: `A.S. ${startYear}/${shortEnd}`,
        startDate: new Date(startYear, 8, 1, 0, 0, 0, 0),
        endDate: new Date(endYear, 7, 31, 23, 59, 59, 999)
    };
}

function getCurrentSchoolYearKey(refDate = new Date()) {
    const sy = getSchoolYearFromDate(refDate);
    return sy ? sy.key : '2026/27';
}

function getAvailableSchoolYears(allVotes = [], refDate = new Date()) {
    const currentKey = getCurrentSchoolYearKey(refDate);
    const set = new Set();
    set.add(currentKey);
    (allVotes || []).forEach(v => {
        const rawDate = v?.data || v?.date || (v instanceof Date ? v : null);
        const sy = getSchoolYearFromDate(rawDate);
        if (sy) set.add(sy.key);
    });
    return Array.from(set).sort((a, b) => b.localeCompare(a));
}

function getVotesForSchoolYear(yearKey, allVotes = []) {
    if (!yearKey) return allVotes || [];
    return (allVotes || []).filter(v => {
        const rawDate = v?.data || v?.date || (v instanceof Date ? v : null);
        const sy = getSchoolYearFromDate(rawDate);
        return sy && sy.key === yearKey;
    });
}

function getPreviousYearTermComparison({
    subject = null,
    refDate = new Date(),
    allVotes = [],
    prevYearKey = null
} = {}) {
    const d = parseDateValue(refDate) || new Date();
    const currentSy = getSchoolYearFromDate(d) || { startYear: 2026, endYear: 2027, key: '2026/27' };
    const prevStartYear = currentSy.startYear - 1;
    const prevEndYear = currentSy.endYear - 1;
    const targetPrevKey = prevYearKey || `${prevStartYear}/${String(prevEndYear).slice(-2)}`;

    // Term determination:
    // 1° Quadrimestre: September (8) .. January (0)
    // 2° Quadrimestre: February (1) .. August (7)
    const m = d.getMonth();
    const isFirstTerm = (m >= 8 || m === 0);
    const term = isFirstTerm ? 'first' : 'second';
    const termLabel = isFirstTerm ? '1° Quadrimestre' : '2° Quadrimestre';
    const termShort = isFirstTerm ? '1°Q' : '2°Q';

    // The target term date boundaries in the target previous school year:
    const prevTermStart = isFirstTerm
        ? new Date(prevStartYear, 8, 1, 0, 0, 0, 0)
        : new Date(prevEndYear, 1, 1, 0, 0, 0, 0);
    const prevTermEnd = isFirstTerm
        ? new Date(prevEndYear, 0, 31, 23, 59, 59, 999)
        : new Date(prevEndYear, 7, 31, 23, 59, 59, 999);

    const prevYearVotes = getVotesForSchoolYear(targetPrevKey, allVotes);
    let targetVotes = prevYearVotes;
    if (subject) {
        const normSubj = String(subject).trim().toLowerCase();
        targetVotes = prevYearVotes.filter(v => {
            const s = String(v?.materia || v?.subject || '').trim().toLowerCase();
            return s === normSubj || s.includes(normSubj) || normSubj.includes(s);
        });
    }

    const prevTermVotes = targetVotes.filter(v => {
        const rawDate = v?.data || v?.date || (v instanceof Date ? v : null);
        const vd = parseDateValue(rawDate);
        return vd && vd >= prevTermStart && vd <= prevTermEnd;
    });

    function getNumVal(v) {
        if (typeof v === 'number') return Number.isFinite(v) ? v : null;
        const raw = (v?.valore !== undefined) ? v.valore : v?.value;
        if (typeof raw === 'number') return Number.isFinite(raw) ? raw : null;
        const s = String(raw || '').replace(',', '.').replace('+', '.25').replace('-', '.75').replace('½', '.5').trim();
        const n = parseFloat(s);
        return Number.isFinite(n) ? n : null;
    }

    const termNums = prevTermVotes.map(getNumVal).filter(n => Number.isFinite(n));
    const yearNums = targetVotes.map(getNumVal).filter(n => Number.isFinite(n));

    const prevTermMedia = termNums.length ? (termNums.reduce((a, b) => a + b, 0) / termNums.length) : null;
    const prevYearFullMedia = yearNums.length ? (yearNums.reduce((a, b) => a + b, 0) / yearNums.length) : null;

    return {
        prevYearKey: targetPrevKey,
        currentYearKey: currentSy.key,
        term,
        termLabel,
        termShort,
        prevTermMedia,
        prevYearFullMedia,
        prevTermVotesCount: prevTermVotes.length,
        prevYearVotesCount: targetVotes.length
    };
}

module.exports = {
    SESSION_TOKEN_HEX_LENGTH,
    DEBUG_MODE,
    CLASS_REGEX,
    isSessionSecurityConfigured,
    USER_AGENT,
    ENDPOINT,
    handleCors,
    setCorsHeaders,
    debugLog,
    redact,
    generateStableId,
    normalizeUserId,
    normalizeUserIdParam,
    getRequestBody,
    generatePid,
    generateSessionToken,
    verifySessionToken,
    buildName,
    normalizeClass,
    detectTrack,
    parseClassDetails,
    isValidName,
    safeData,
    parseBooleanFlag,
    resolveAttendanceJustification,
    parseJsonb,
    createHeaders,
    encryptArgoPassword,
    decryptArgoPassword,
    parseDateValue,
    getSchoolYearFromDate,
    getCurrentSchoolYearKey,
    getAvailableSchoolYears,
    getVotesForSchoolYear,
    getPreviousYearTermComparison
};

