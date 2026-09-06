try {
    const _curSchool = localStorage.getItem('argo_school');
    if (!_curSchool || _curSchool === 'SG28499' || _curSchool === 'SS19014') {
        localStorage.setItem('argo_school', 'SG20925');
    }
} catch (_) {}

// --- XSS PROTECTION ---
function escapeHtml(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escapeJsSingleQuote(str) {
    if (str === null || str === undefined) return '';
    return String(str)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

// --- THEME ---
// G-Connect ora ha un unico stile visivo (Liquid Glass / navy) — non esiste
// più la possibilità di passare a light mode o dark mode. La costante sotto
// resta solo per compatibilità con eventuale codice legacy che la referenzia.
const savedTheme = 'liquid-glass';

// --- AGENDA SEARCH & FILTER HELPERS ---
setInterval(() => {
    const clock = document.getElementById('topbar-clock');
    if (clock) {
        clock.innerText = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    }
}, 500);

window.scrollToSearch = function () {
    // If we're not in the agenda view, go there first
    if (state.view !== 'planner' && state.view !== 'home_diary') {
        navigate('planner');
    }

    // Switch to list mode if we are in calendar mode
    if (state.uiMode !== 'list') {
        switchPlannerView('list');
    }

    setTimeout(() => {
        const searchInput = document.querySelector('.agenda-search-input');
        if (searchInput) {
            searchInput.scrollIntoView({ behavior: 'smooth', block: 'center' });
            searchInput.focus();
        }
    }, 300);
};

let _agendaSearchDebounceTimer = null;
window.handleAgendaSearch = function (event) {
    state.agendaSearchQuery = event.target.value;
    clearTimeout(_agendaSearchDebounceTimer);
    _agendaSearchDebounceTimer = setTimeout(() => {
        state._filterJustTriggered = true; // Use light animation
        refreshAgenda();
    }, 120);
};

window.setAgendaFilter = function (subject) {
    state.agendaSearchSubject = subject;
    refreshAgenda();
};
const PASSING_GRADE_THRESHOLD = 6;
const CHART_INTERMEDIATE_TICK_RATIO = 0.8;
const CHART_MIN_RANGE_EPSILON = 0.0001;
const CHART_LINE_COLOR = '#2563EB';
const CHART_LABEL_COLOR = 'rgba(20,20,20,0.45)';
const CHART_LABEL_FONT = '800 10px Inter';
const GOAL_GRADE_SCALE_DESC = [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6];
const MAX_GRADE_VALUE = 10;
const MAX_GOAL_SCENARIOS = 6;
const BRAND_GRADIENT = 'linear-gradient(135deg, #0D1F2D 0%, #1A6B8A 45%, #C6F2DF 100%)';
const GOAL_GRADE_OPTIONS_DESC = GOAL_GRADE_SCALE_DESC.includes(PASSING_GRADE_THRESHOLD)
    ? GOAL_GRADE_SCALE_DESC
    : [...GOAL_GRADE_SCALE_DESC, PASSING_GRADE_THRESHOLD].sort((a, b) => b - a);
const PRINT_DIALOG_DELAY_MS = 220;
const SUBJECT_TREND_GRADIENT_TOP_ALPHA = 0.95;
const SUBJECT_TREND_GRADIENT_MID_ALPHA = 0.4;
const SUBJECT_TREND_GRADIENT_BOTTOM_ALPHA = 0.08;
const CLASS_ACTIVITIES_WEEK_LOOKBACK = 16;
const CLASS_ACTIVITIES_WEEK_LOOKAHEAD = 8;
const CLASS_ACTIVITIES_MAX_WEEK_OPTIONS = 80;
const MOBILE_WEEK_LABEL_BREAKPOINT = 700;
const PLANNER_MOBILE_DROPDOWN_DEFAULT_WIDTH = 214;
const PLANNER_MOBILE_DROPDOWN_DEFAULT_HEIGHT = 220;
const PLANNER_MOBILE_DROPDOWN_MARGIN = 10;
const PLANNER_MOBILE_DROPDOWN_FLIP_CLEARANCE = 12;
const PLANNER_MOBILE_DROPDOWN_OFFSET = -2;
const PLANNER_MOBILE_DROPDOWN_SCROLL_LISTENER_OPTIONS = { capture: true };
let plannerMobileDropdownRepositionListener = null;
let subjectTrendAnimationFrame = null;
const SUBJECT_TREND_ANIMATION_STEP = 0.06;
// Start slightly above 0 to avoid an all-zero first frame and reduce perceived flicker.
const SUBJECT_TREND_ANIMATION_INITIAL_PROGRESS = 0.04;

function normalizeSubjectName(name) {
    // Unify subject labels coming from different DidUP payloads/UI variants
    // (e.g. trailing asterisks, extra spaces, accents and apostrophe variants) before grouping/filtering.
    return (name || '')
        .toString()
        // NFD separates accented letters into base char + combining mark (e.g. é -> e + ́).
        .normalize('NFD')
        // Remove combining marks to compare subjects regardless of accents.
        .replace(/[\u0300-\u036f]/g, '')
        // Normalize typographic apostrophes/backticks/acute accents to a single apostrophe.
        .replace(/[’`´]/g, "'")
        .replace(/['"]/g, '')
        .replace(/[./]/g, ' ')
        .replace(/&/g, ' e ')
        .replace(/\*/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function isArtDrawingSubjectNormalized(normalized) {
    const s = (normalized || '').toString();
    if (!s) return false;
    return s.includes('disegno')
        || s.includes('storia dellarte')
        || s.includes('storia arte')
        || s.includes('storiaarte')
        || s.includes('dellarte')
        || s.includes('arte triennio');
}

const CANONICAL_GRADES_SUBJECTS = [
    // Pagina 1 del carosello
    'Italiano',
    'Matematica',
    'Fisica',
    'Inglese',
    'Scienze Naturali',
    // Pagina 2 del carosello
    'Informatica',
    'Filosofia',
    'Storia Triennio',
    "Disegno e Storia Dell'arte Triennio",
    'Educazione Civica',
    // Pagina 3 del carosello
    'Scienze Motorie e Sportive'
];

function getSubjectCanonicalName(subject) {
    if (!subject) return '';
    const norm = (typeof normalizeSubjectName === 'function')
        ? normalizeSubjectName(subject)
        : String(subject || '').toLowerCase().trim();
    if (!norm) return '';

    // 1. Disegno e Storia Dell'arte Triennio (before Storia)
    if (typeof isArtDrawingSubjectNormalized === 'function' && isArtDrawingSubjectNormalized(norm)) {
        return "Disegno e Storia Dell'arte Triennio";
    }
    if (norm.includes('disegn') || norm.includes('dellarte') || norm.includes('storia dell') || (norm.includes('arte') && !norm.includes('letterat'))) {
        return "Disegno e Storia Dell'arte Triennio";
    }

    // 2. Educazione Civica (before Storia)
    if (norm.includes('civic') || norm.includes('cittadin')) {
        return 'Educazione Civica';
    }

    // 3. Storia Triennio
    if (norm.includes('stori')) {
        return 'Storia Triennio';
    }

    // 4. Italiano
    if (norm.includes('ital') || norm.includes('letter') || norm.includes('narrat') || norm.includes('antol') || norm.includes('gramm')) {
        return 'Italiano';
    }

    // 5. Filosofia
    if (norm.includes('filos')) {
        return 'Filosofia';
    }

    // 6. Inglese
    if (norm.includes('ingl') || norm.includes('stranier')) {
        return 'Inglese';
    }

    // 7. Informatica
    if (norm.includes('inform')) {
        return 'Informatica';
    }

    // 8. Scienze Motorie e Sportive (before Scienze and before Fisica)
    if (norm.includes('motor') || norm.includes('sport') || norm.includes('ginnas') || (norm.includes('educazione') && norm.includes('fisic'))) {
        return 'Scienze Motorie e Sportive';
    }

    // 9. Scienze Naturali
    if (norm.includes('scienz') || norm.includes('chimic') || norm.includes('biol') || norm.includes('geol') || norm.includes('natura')) {
        return 'Scienze Naturali';
    }

    // 10. Fisica
    if (norm.includes('fisic')) {
        return 'Fisica';
    }

    // 11. Matematica
    if (norm.includes('matem') || norm.includes('algeb') || norm.includes('geom') || norm.includes('trigon')) {
        return 'Matematica';
    }

    return '';
}

function getSubjectGroupKey(subject) {
    if (typeof getSubjectCanonicalName === 'function') {
        const canonical = getSubjectCanonicalName(subject);
        if (canonical) return 'canonical_' + normalizeSubjectName(canonical);
    }
    const normalized = normalizeSubjectName(subject);
    if (!normalized) return 'altro';
    if (typeof isArtDrawingSubjectNormalized === 'function' && isArtDrawingSubjectNormalized(normalized)) {
        return 'canonical_disegno e storia dellarte triennio';
    }
    return normalized;
}

function areSubjectsEquivalent(subjectA, subjectB) {
    const a = normalizeSubjectName(subjectA);
    const b = normalizeSubjectName(subjectB);
    if (!a || !b) return false;
    if (a === b) return true;
    if (typeof isArtDrawingSubjectNormalized === 'function' && isArtDrawingSubjectNormalized(a) && isArtDrawingSubjectNormalized(b)) return true;
    if (typeof getSubjectGroupKey === 'function') {
        const keyA = getSubjectGroupKey(subjectA);
        const keyB = getSubjectGroupKey(subjectB);
        if (keyA && keyB && keyA !== 'altro' && keyA === keyB) return true;
    }
    return false;
}

function isUserGeneratedTaskId(id) {
    if (typeof id !== 'string') return false;
    return id.startsWith('manual_') || id.startsWith('quest-');
}

function hasPlannedTasks(plannedTasks) {
    if (!plannedTasks || typeof plannedTasks !== 'object') return false;
    return Object.values(plannedTasks).some(ids => Array.isArray(ids) && ids.length > 0);
}

window._truncateWithEllipsis = function truncateWithEllipsis(value, max = 180) {
    const txt = String(value ?? '').replace(/\s+/g, ' ').trim();
    if (!txt) return '';
    return txt.length > max ? `${txt.slice(0, max)}…` : txt;
};
const truncateWithEllipsis = window._truncateWithEllipsis;

function getAgendaCacheKey() {
    try {
        return `${lsKey('weekly_agenda_cache')}:${state.plannerMode || 'registro'}:${state.agendaSortOrder || 'due_desc'}:${state.agendaSearchSubject || 'all'}:${state.agendaSearchQuery || ''}`;
    } catch (e) {
        console.warn('Agenda cache key fallback:', e?.message || e);
        return `weekly_agenda_cache:${state.plannerMode || 'registro'}:${state.agendaSortOrder || 'due_desc'}:${state.agendaSearchSubject || 'all'}:${state.agendaSearchQuery || ''}`;
    }
}

function getCachedWeeklyAgendaHtml() {
    if (state._weeklyAgendaCacheHtml) return state._weeklyAgendaCacheHtml;
    try {
        const cached = localStorage.getItem(getAgendaCacheKey());
        if (!cached) return '';
        state._weeklyAgendaCacheHtml = cached;
        return cached;
    } catch (_) {
        return '';
    }
}

function saveWeeklyAgendaCache(html) {
    state._weeklyAgendaCacheHtml = html || '';
    try {
        localStorage.setItem(getAgendaCacheKey(), state._weeklyAgendaCacheHtml);
    } catch (_) { }
}

/**
 * Pre-computa e salva la lista agenda in cache.
 * @param {boolean} force - Se true, esegue il warmup anche fuori dalla vista calendar (es. login/sync).
 */
window.warmWeeklyAgendaCache = function (force = false) {
    if (!force && state.uiMode !== 'calendar') return;
    const snapshot = {
        agendaSortOrder: state.agendaSortOrder,
        agendaSearchSubject: state.agendaSearchSubject,
        agendaSearchQuery: state.agendaSearchQuery
    };
    try {
        state.agendaSearchQuery = '';
        state.agendaSearchSubject = 'all';
        state.agendaSortOrder = 'due_desc';
        const baseHtml = renderWeeklyAgenda();
        if (baseHtml) saveWeeklyAgendaCache(baseHtml);
    } finally {
        state.agendaSortOrder = snapshot.agendaSortOrder;
        state.agendaSearchSubject = snapshot.agendaSearchSubject;
        state.agendaSearchQuery = snapshot.agendaSearchQuery;
    }
};

window.refreshAgenda = function () {
    const list = document.getElementById('weekly-agenda-list');
    if (list) {
        const temp = document.createElement('div');
        const html = renderWeeklyAgenda();
        saveWeeklyAgendaCache(html);
        temp.innerHTML = html;
        const newList = temp.firstElementChild;
        if (newList) {
            newList.id = 'weekly-agenda-list'; // Ensure ID consistency
            list.parentNode.replaceChild(newList, list);
            // Avoid lag by using light animation for filters
            if (!state._filterJustTriggered && typeof animatePlannerSurface === 'function') {
                animatePlannerSurface('list');
            } else if (state._filterJustTriggered) {
                // Subtle fade for filter results instead of heavy stagger
                gsap.fromTo(newList.querySelectorAll('.agenda-task-card'), { opacity: 0.5 }, { opacity: 1, duration: 0.2 });
                state._filterJustTriggered = false;
            }
        } else {
            list.innerHTML = '';
        }
        // Focus back on search input if it existed to maintain typing flow
        const searchInput = document.getElementById('weekly-agenda-list')?.querySelector('.agenda-search-input');
        if (searchInput) {
            searchInput.focus();
            const val = searchInput.value;
            searchInput.value = '';
            searchInput.value = val; // Move cursor to end
        }
    } else {
        scheduleRender(0);
    }
};

function refreshPlannerSwitchButtons() {
    const buttons = Array.from(document.querySelectorAll('.view-switch .switch-btn'));
    buttons.forEach((btn) => {
        const targetView = btn.dataset.plannerView;
        const isActive = targetView === state.uiMode;
        btn.classList.toggle('active', isActive);
        btn.style.background = isActive ? 'var(--on-surface)' : 'transparent';
        btn.style.color = isActive ? 'white' : 'var(--text-secondary)';
    });
}

function animatePlannerSurface(view) {
    if (typeof gsap === 'undefined') return;
    if (view === 'calendar') {
        const days = document.querySelectorAll('.calendar-day');
        const badges = document.querySelectorAll('.event-badge');
        gsap.fromTo(days, { y: 12, scale: 0.985 }, {
            y: 0,
            scale: 1,
            duration: 0.28,
            ease: 'power2.out',
            stagger: { each: 0.015, from: 'start' },
            clearProps: 'transform'
        });
        gsap.fromTo(badges, { x: -4 }, {
            x: 0,
            duration: 0.22,
            ease: 'power1.out',
            stagger: 0.01,
            clearProps: 'transform'
        });
        return;
    }
    const listCards = document.querySelectorAll('#weekly-agenda-list .card, #weekly-agenda-list .asw-task-card, #weekly-agenda-list .agenda-day-section');
    const listBadges = document.querySelectorAll('#weekly-agenda-list .agenda-subject-badge, #weekly-agenda-list .agenda-time-badge, #weekly-agenda-list .agenda-day-month, #weekly-agenda-list .agenda-day-label, #weekly-agenda-list .asw-subject-badge, #weekly-agenda-list .asw-label-tag');
    const listUi = document.querySelectorAll('#weekly-agenda-list .agenda-search-container, #weekly-agenda-list .agenda-filters-scroll, #weekly-agenda-list .filter-chip, #weekly-agenda-list .agenda-task-main, #weekly-agenda-list .agenda-task-actions, #weekly-agenda-list .agenda-task-action-btn, #weekly-agenda-list [data-task-text]');
    gsap.fromTo(listCards, { opacity: 0, y: 10 }, {
        opacity: 1,
        y: 0,
        duration: 0.26,
        ease: 'power2.out',
        stagger: 0.02,
        clearProps: 'transform,opacity'
    });
    gsap.fromTo(listBadges, { opacity: 0, scale: 0.96, y: 4 }, {
        opacity: 1,
        scale: 1,
        y: 0,
        duration: 0.24,
        ease: 'power2.out',
        stagger: 0.01,
        clearProps: 'transform,opacity'
    });
    gsap.fromTo(listUi, { opacity: 0, y: 6 }, {
        opacity: 1,
        y: 0,
        duration: 0.24,
        ease: 'power2.out',
        stagger: 0.008,
        clearProps: 'transform,opacity'
    });
}

// --- UI TRANSITION HELPERS (Added by Phase 25 Mega Patch) ---
window.switchPlannerMode = function (mode) {
    state.plannerMode = mode;
    document.querySelectorAll('[data-planner-mode]').forEach(btn => {
        const isActive = btn.dataset.plannerMode === mode;
        btn.style.background = isActive ? 'rgba(139,92,246,0.25)' : 'transparent';
        btn.style.color = isActive ? 'white' : 'rgba(var(--glass-rgb),0.6)';
        btn.style.border = isActive ? '1px solid rgba(139,92,246,0.4)' : '1px solid transparent';
    });
    const list = document.getElementById('weekly-agenda-list');
    if (list && typeof gsap !== 'undefined') {
        gsap.to(list, {
            opacity: 0, y: 4, duration: 0.12, ease: 'power2.in',
            onComplete: () => {
                const temp = document.createElement('div');
                temp.innerHTML = renderWeeklyAgenda();
                const newList = temp.firstElementChild;
                if (newList) {
                    list.parentNode.replaceChild(newList, list);
                    gsap.fromTo(newList, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out', clearProps: 'transform,opacity' });
                } else {
                    gsap.fromTo(list, { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.28, ease: 'power2.out', clearProps: 'transform,opacity' });
                }
            }
        });
    } else {
        scheduleRender(0);
    }
};

window.switchPlannerView = function (view) {
    if (view !== 'calendar' && view !== 'list') return;
    if (state.uiMode === view) return;
    state.uiMode = view;
    localStorage.setItem('g_diary_planner_view', view);
    const content = document.getElementById('planner-main-content');
    const canPatchInPlace = state.view === 'planner' && content;
    const runSwap = () => {
        if (!canPatchInPlace) {
            scheduleRender(0);
            return;
        }
        if (view === 'calendar') {
            if (typeof window.warmWeeklyAgendaCache === 'function') window.warmWeeklyAgendaCache(true);
            content.innerHTML = '<div id="calendar"></div>';
            renderCustomCalendar();
            animatePlannerSurface('calendar');
        } else {
            const cachedAgenda = getCachedWeeklyAgendaHtml();
            const listHtml = cachedAgenda || renderWeeklyAgenda();
            if (!cachedAgenda && listHtml) saveWeeklyAgendaCache(listHtml);
            content.innerHTML = listHtml;
            animatePlannerSurface('list');
        }
        refreshPlannerSwitchButtons();
    };

    if (content && typeof gsap !== 'undefined') {
        gsap.to(content, {
            opacity: 0,
            y: 4,
            scale: 0.995,
            duration: 0.1,
            ease: 'power2.in',
            onComplete: () => {
                runSwap();
                const newContent = document.getElementById('planner-main-content');
                if (newContent) {
                    gsap.fromTo(newContent, { opacity: 0, y: 6, scale: 0.995 }, {
                        opacity: 1,
                        y: 0,
                        scale: 1,
                        duration: 0.16,
                        ease: 'power2.out',
                        clearProps: 'transform,opacity'
                    });
                }
            }
        });
        return;
    }
    runSwap();
};

window.navigateSubject = function (subjName) {
    if (!subjName) return;
    state._gradeSubjectsScrollY = window.pageYOffset || document.documentElement.scrollTop || 0;
    state.activeSubject = subjName;
    scheduleRender(0);
};

window.handleGradeSubjectClick = function (subjectName) {
    state.view = 'voti';
    window.navigateSubject(subjectName);
    if (typeof closeModal === 'function') closeModal();
};

window.handleGradeSubjectClickFromEncoded = function (encodedSubjectName) {
    const rawSubject = (encodedSubjectName || '').toString();
    let subjectName = rawSubject;
    try {
        subjectName = decodeURIComponent(rawSubject);
        // Some inline handlers can pass an already-encoded payload again after intermediate transformations.
        // Attempt one extra decode only when the original payload still contains encoded percent markers (%25...).
        if (/%25/.test(rawSubject)) {
            try {
                const maybeDoubleDecoded = decodeURIComponent(subjectName);
                if (maybeDoubleDecoded !== subjectName) subjectName = maybeDoubleDecoded;
            } catch (_) { }
        }
    } catch (_) {
        subjectName = rawSubject;
    }
    window.handleGradeSubjectClick(subjectName);
};

window.closeSubject = function () {
    const restoreY = Number.isFinite(state._gradeSubjectsScrollY) ? state._gradeSubjectsScrollY : null;
    state.activeSubject = null;
    scheduleRender(0);
    if (restoreY !== null) {
        requestAnimationFrame(() => {
            window.scrollTo({ top: restoreY, behavior: 'auto' });
            state._gradeSubjectsScrollY = null;
        });
    }
};
// --- Google Calendar OAuth2 (Universal) ---
window.refreshSessionToken = async function () {
    const s = JSON.parse(localStorage.getItem('argo_session') || '{}');
    if (!s || !s.schoolCode || !(s.userName || s.username)) return false;

    // SECURITY: Passwords are never retrieved from sessionStorage.

    // Helper: apply refreshed session data from server response
    const _applyRefreshedSession = (data) => {
        const sessionData = {
            ...data.session,
            studentId: data.student?.id || s.studentId,
            sessionToken: data.sessionToken
        };
        if (typeof sessionManager !== 'undefined' && sessionManager.save) {
            sessionManager.save(sessionData);
        } else {
            localStorage.setItem('argo_session', JSON.stringify({ ...s, ...sessionData }));
        }
    };

    // Strategy 1: use in-memory password (app still in RAM from recent login)
    if (window._argoPasswordRuntime) {
        try {
            const res = await fetch(`${window.API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    schoolCode: s.schoolCode,
                    username: s.userName || s.username,
                    password: window._argoPasswordRuntime,
                    profileIndex: s.profileIndex
                })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success && data?.sessionToken) {
                _applyRefreshedSession(data);
                console.log('[refreshSessionToken] ✅ Refreshed via in-memory password');
                return true;
            }
        } catch (e) {
            console.warn('[refreshSessionToken] Strategy 1 (RAM) failed:', e.message);
        }
    }

    // Strategy 2: server-side refresh using Supabase-stored encrypted credentials
    const userId = (typeof window.getUserId === 'function' ? window.getUserId() : null) || s.studentId;
    if (userId && userId !== 'guest') {
        // Attempt up to 2 times with a short delay (Argo sometimes returns transient 401s)
        for (let attempt = 1; attempt <= 2; attempt++) {
            try {
                if (attempt > 1) {
                    console.log(`[refreshSessionToken] Strategy 2 retry #${attempt} after 2s delay...`);
                    await new Promise(r => setTimeout(r, 2000));
                }
                const res = await fetch(`${window.API_BASE_URL}/api/auth?action=refresh-session`, {
                    method: 'POST',
                    headers: getSessionHeaders(),
                    body: JSON.stringify({ userId })
                });
                const data = await res.json().catch(() => ({}));
                if (res.ok && data?.success && data?.sessionToken) {
                    _applyRefreshedSession(data);
                    console.log(`[refreshSessionToken] ✅ Refreshed via server-side credentials (attempt ${attempt})`);
                    return true;
                }
                // If server returned 403 (session token invalid), no point retrying
                if (res.status === 403) {
                    console.warn('[refreshSessionToken] Strategy 2: 403 Non autorizzato — sessionToken invalid, stopping retry');
                    break;
                }
            } catch (e) {
                console.warn(`[refreshSessionToken] Strategy 2 attempt ${attempt} failed:`, e.message);
            }
        }
    }

    console.warn('[refreshSessionToken] ❌ All strategies failed');
    return false;
};

window.googleFetchWithAuthRetry = async function (url, options = {}) {
    let res = await fetch(url, options);
    if (res.status !== 401 && res.status !== 403) return res;

    const refreshed = await window.refreshSessionToken().catch(() => false);
    if (!refreshed) return res;

    const retryOpts = { ...options, headers: getSessionHeaders(options.headers || {}) };
    return fetch(url, retryOpts);
};

window.connectGoogle = async function () {
    const userId = window.getUserId();
    if (!userId || userId === 'guest') { showToast('Devi essere loggato per collegare Google.', 'error', 'var(--red)'); return; }

    try {
        const response = await window.googleFetchWithAuthRetry(`${window.API_BASE_URL}/api/google?action=auth-url`, {
            method: 'POST',
            headers: getSessionHeaders(),
            body: JSON.stringify({ userId })
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data?.success || !data?.url) throw new Error(data?.error || 'Autorizzazione Google fallita');
        window.location.href = data.url;
    } catch (err) {
        console.error('Google auth-url error:', err);
        showToast(err.message || 'Errore collegamento Google', 'error', 'var(--red)');
    }
};

window.syncGoogleCalendar = async function () {
    const btn = event?.currentTarget;
    const originalHtml = btn?.innerHTML || '';
    try {
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="ph-bold ph-circle-notch ph-spin"></i> Aggiornamento...'; }
        const userId = window.getUserId();
        const session = JSON.parse(localStorage.getItem('argo_session') || '{}');
        const fullSession = {
            ...session,
            profileIndex: session.profileIndex ?? 0
        };
        // NON inviamo state.tasks: forziamo il server a scaricare i compiti aggiornati da Argo
        const res = await window.googleFetchWithAuthRetry(`${window.API_BASE_URL}/api/google?action=sync`, {
            method: 'POST',
            headers: getSessionHeaders(),
            body: JSON.stringify({ userId, session: fullSession })
        });
        const data = await res.json();
        if (data.success) {
            state.googleConnected = true;
            localStorage.setItem('gc_google_connected_cache', '1');
            showToast(`✅ Sincronizzati ${data.added || 0} nuovi compiti su Google Calendar!`, 'success', 'var(--green)');
        } else {
            if (data?.error === 'GOOGLE_AUTH_EXPIRED') {
                state.googleConnected = false;
                localStorage.setItem('gc_google_connected_cache', '0');
                // Force a full render because render dedup may otherwise skip profile card refresh.
                state._forceRender = true;
                window.scheduleRender(0);
                throw new Error('Sessione Google scaduta. Ricollega Google dal profilo.');
            }
            throw new Error(data.error || 'Sync fallito');
        }
    } catch (err) {
        console.error('Google Sync Error:', err);
        showToast(err.message || 'Errore durante il sync', 'error', 'var(--red)');
    } finally {
        if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
    }
};

window.disconnectGoogle = async function () {
    try {
        const userId = window.getUserId();
        const res = await window.googleFetchWithAuthRetry(`${window.API_BASE_URL}/api/google?action=disconnect&userId=${encodeURIComponent(userId)}`, {
            method: 'GET',
            headers: getSessionHeaders()
        });
        const data = await res.json();
        if (data.success) {
            state.googleConnected = false;
            localStorage.setItem('gc_google_connected_cache', '0');
            state._forceRender = true;
            showToast('Google Calendar disconnesso.', 'warning', 'var(--orange)');
            window.scheduleRender(0);
        }
    } catch (e) { showToast('Errore disconnessione Google', 'error', 'var(--red)'); }
};

window.checkGoogleStatus = async function () {
    try {
        const userId = window.getUserId();
        if (!userId || userId === 'guest') return;
        const prevConnected = !!state.googleConnected;
        const res = await window.googleFetchWithAuthRetry(`${window.API_BASE_URL}/api/google?action=status&userId=${encodeURIComponent(userId)}`, {
            method: 'GET',
            headers: getSessionHeaders()
        });
        const data = await res.json();
        const nextConnected = !!data.connected;
        state.googleConnected = nextConnected;
        localStorage.setItem('gc_google_connected_cache', nextConnected ? '1' : '0');
        // State updated silently — profile view reads state.googleConnected on navigation
        // No full re-render needed (eliminates double render on boot)
        if (prevConnected !== nextConnected && state.view === 'profile') {
            state._forceRender = true;
            window.scheduleRender(0);
        }
    } catch (e) {
        const wasConnected = !!state.googleConnected;
        state.googleConnected = false;
        localStorage.setItem('gc_google_connected_cache', '0');
        if (wasConnected && state.view === 'profile') {
            state._forceRender = true;
            window.scheduleRender(0);
        }
    }
};

window.saveArgoToSupabase = async function () {
    try {
        const session = JSON.parse(localStorage.getItem('argo_session') || '{}');
        const userId = window.getUserId();
        if (!userId || userId === 'guest' || !session.userName) return;
        // Include runtime password so server can persist encrypted credentials in Supabase
        const pwd = window._argoPasswordRuntime || '';

        await window.googleFetchWithAuthRetry(`${window.API_BASE_URL}/api/google?action=save-argo`, {
            method: 'POST',
            headers: getSessionHeaders(),
            body: JSON.stringify({
                userId,
                schoolCode: session.schoolCode,
                username: session.userName || session.username,
                password: pwd,
                profileIndex: session.profileIndex ?? 0
            })
        });
        console.log('✅ Credenziali Argo salvate correttamente nel cloud');
    } catch (e) {
        console.error('❌ Errore salvataggio cloud', e);
    }
};
// ------------------------------------------------------------

function calcolaMedia(voti) {
    if (!voti || voti.length === 0) return null;
    const validi = voti.map(v => {
        let s = (v.valore || v.value || "").toString().replace(',', '.');
        return parseFloat(s);
    }).filter(n => !isNaN(n));

    if (validi.length === 0) return null;
    const somma = validi.reduce((a, b) => a + b, 0);
    return (somma / validi.length).toFixed(2);
}
function isGiustifica(val) {
    if (!val && val !== 0) return true;
    const s = val.toString().replace(',', '.').trim();
    return s === '' || s === '-' || s === '—' || isNaN(parseFloat(s));
}

function getNumericGradeValue(vote) {
    if (!vote) return null;
    const raw = (vote.valore || vote.value || '').toString().replace(',', '.').trim();
    if (isGiustifica(raw)) return null;
    const num = parseFloat(raw);
    return Number.isFinite(num) ? num : null;
}

function getVoteDate(vote) {
    const raw = vote?.data || vote?.date;
    if (!raw) return null;
    if (raw instanceof Date) return Number.isNaN(raw.getTime()) ? null : raw;
    const d = (typeof parseArgoDate === 'function') ? parseArgoDate(raw) : (typeof window !== 'undefined' && typeof window.parseArgoDate === 'function' ? window.parseArgoDate(raw) : new Date(raw));
    if (!(d instanceof Date) || Number.isNaN(d.getTime())) return null;
    return d;
}
/**
 * Restituisce l'etichetta UI per uno scenario di proiezione obiettivo.
 * @param {{combo?: boolean, exact?: boolean, n?: number}} scenario Scenario calcolato (combo, exact, numero voti).
 * @param {boolean} lowercase Se true, restituisce testo in minuscolo per card scure.
 * @returns {string} Etichetta human-readable da mostrare nella proiezione.
 */
function getProjectionScenarioLabel(scenario, lowercase = false) {
    if (scenario?.combo) return lowercase ? 'combinazione utile' : 'Combinazione utile';
    if (scenario?.exact) return lowercase ? 'prossimo voto esatto' : 'Prossimo voto esatto';
    if ((scenario?.n || 0) === 1) return lowercase ? 'prossimo voto' : 'Prossimo voto';
    return lowercase ? `prossimi ${scenario?.n || 0} voti` : `Prossimi ${scenario?.n || 0} voti`;
}
function getProjectionComboDetailLabel(grade, extraTopGrades, maxGradeValue) {
    return `1 voto ${grade.toFixed(2)} + ${extraTopGrades} vot${extraTopGrades === 1 ? 'o' : 'i'} da ${maxGradeValue.toFixed(2)}`;
}

// ============= SCHOOL YEAR (ANNO SCOLASTICO) HELPERS =============

function getSchoolYearFromDate(dateInput) {
    if (!dateInput) return null;
    const d = (dateInput instanceof Date) ? dateInput : ((typeof parseArgoDate === 'function') ? parseArgoDate(dateInput) : new Date(dateInput));
    if (!(d instanceof Date) || Number.isNaN(d.getTime()) || d.getTime() <= 86400000) return null;
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

function getAvailableSchoolYears(allVotes = null, refDate = new Date()) {
    const currentKey = getCurrentSchoolYearKey(refDate);
    const votes = Array.isArray(allVotes) ? allVotes : (typeof getVotiData === 'function' ? getVotiData() : (state.voti || []));
    const yearSet = new Set();
    yearSet.add(currentKey);
    (votes || []).forEach(v => {
        const raw = v.data || v.date || '';
        const sy = getSchoolYearFromDate(raw);
        if (sy) yearSet.add(sy.key);
    });
    return Array.from(yearSet).sort((a, b) => b.localeCompare(a));
}

function getVotesForSchoolYear(yearKey, allVotes = null) {
    const votes = Array.isArray(allVotes) ? allVotes : (typeof getVotiData === 'function' ? getVotiData() : (state.voti || []));
    if (!yearKey) return votes;
    return (votes || []).filter(v => {
        const raw = v.data || v.date || '';
        const sy = getSchoolYearFromDate(raw);
        return sy && sy.key === yearKey;
    });
}

function getActiveSchoolYear() {
    if (state.selectedSchoolYear) return state.selectedSchoolYear;
    try {
        const key = (typeof lsKey === 'function') ? lsKey('selected_school_year') : 'selected_school_year';
        const stored = localStorage.getItem(key);
        if (stored) {
            state.selectedSchoolYear = stored;
            return stored;
        }
    } catch (_) { }
    return getCurrentSchoolYearKey();
}

window.selectSchoolYear = function(yearKey) {
    state.selectedSchoolYear = yearKey;
    try {
        const key = (typeof lsKey === 'function') ? lsKey('selected_school_year') : 'selected_school_year';
        localStorage.setItem(key, yearKey);
    } catch (_) { }
    if (typeof window.scheduleRender === 'function') {
        window.scheduleRender(0);
    }
};

function getSchoolYearRanges(refDate = new Date()) {
    const year = refDate.getFullYear();
    const month = refDate.getMonth();
    const startYear = month >= 8 ? year : year - 1; // school year starts in September
    const endYear = startYear + 1;
    return {
        startYear,
        endYear,
        firstTermStart: new Date(startYear, 8, 1, 0, 0, 0, 0),      // 1 Sep 00:00:00
        firstTermEnd: new Date(endYear, 0, 31, 23, 59, 59, 999),    // 31 Jan 23:59:59
        secondTermStart: new Date(endYear, 1, 1, 0, 0, 0, 0),       // 1 Feb 00:00:00
        secondTermEnd: new Date(endYear, 7, 31, 23, 59, 59, 999)     // 31 Aug 23:59:59
    };
}

function getCurrentSchoolTerm(refDate = new Date()) {
    const ranges = getSchoolYearRanges(refDate);
    if (refDate >= ranges.firstTermStart && refDate <= ranges.firstTermEnd) return 'first';
    if (refDate >= ranges.secondTermStart && refDate <= ranges.secondTermEnd) return 'second';
    return (refDate.getMonth() >= 8 || refDate.getMonth() === 0) ? 'first' : 'second';
}

function getVotesBySchoolTerm(votes, term, refDate = new Date()) {
    const ranges = getSchoolYearRanges(refDate);
    const list = Array.isArray(votes) ? votes : [];
    return list.filter(v => {
        const d = getVoteDate(v);
        if (!d) return false;
        if (term === 'first') return d >= ranges.firstTermStart && d <= ranges.firstTermEnd;
        if (term === 'second') return d >= ranges.secondTermStart && d <= ranges.secondTermEnd;
        return false;
    });
}

function getPreviousYearTermComparison({
    subject = null,
    refDate = new Date(),
    allVotes = null,
    prevYearKey = null
} = {}) {
    const d = (refDate instanceof Date) ? refDate : ((typeof parseArgoDate === 'function') ? parseArgoDate(refDate) : new Date(refDate));
    const validDate = (d instanceof Date && !Number.isNaN(d.getTime()) && d.getTime() > 86400000) ? d : new Date();
    const currentSy = getSchoolYearFromDate(validDate) || { startYear: 2026, endYear: 2027, key: '2026/27' };
    const prevStartYear = currentSy.startYear - 1;
    const prevEndYear = currentSy.endYear - 1;
    const targetPrevKey = prevYearKey || `${prevStartYear}/${String(prevEndYear).slice(-2)}`;

    const m = validDate.getMonth();
    const isFirstTerm = (m >= 8 || m === 0);
    const term = isFirstTerm ? 'first' : 'second';
    const termLabel = isFirstTerm ? '1° Quadrimestre' : '2° Quadrimestre';
    const termShort = isFirstTerm ? '1°Q' : '2°Q';

    const prevTermStart = isFirstTerm
        ? new Date(prevStartYear, 8, 1, 0, 0, 0, 0)
        : new Date(prevEndYear, 1, 1, 0, 0, 0, 0);
    const prevTermEnd = isFirstTerm
        ? new Date(prevEndYear, 0, 31, 23, 59, 59, 999)
        : new Date(prevEndYear, 7, 31, 23, 59, 59, 999);

    const votes = Array.isArray(allVotes) ? allVotes : (typeof getVotiData === 'function' ? getVotiData() : (state.voti || []));
    const prevYearVotes = getVotesForSchoolYear(targetPrevKey, votes);

    let targetVotes = prevYearVotes;
    if (subject) {
        targetVotes = prevYearVotes.filter(v => areSubjectsEquivalent(v.materia || v.subject, subject));
    }

    const prevTermVotes = targetVotes.filter(v => {
        const vd = getVoteDate(v);
        return vd && vd >= prevTermStart && vd <= prevTermEnd;
    });

    const termNums = prevTermVotes.map(getNumericGradeValue).filter(n => Number.isFinite(n));
    const yearNums = targetVotes.map(getNumericGradeValue).filter(n => Number.isFinite(n));

    const prevTermMedia = termNums.length ? averageFromNumeric(termNums) : null;
    const prevYearFullMedia = yearNums.length ? averageFromNumeric(yearNums) : null;

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

function averageFromNumeric(values) {
    if (!Array.isArray(values) || values.length === 0) return null;
    const valid = values.filter(v => Number.isFinite(v));
    if (!valid.length) return null;
    return valid.reduce((a, b) => a + b, 0) / valid.length;
}

function getGradeMonthlyTrendSummary(votiData = null) {
    const data = votiData !== null ? votiData : (typeof getVotiData === 'function' ? getVotiData() : (state.voti || []));
    const numericVotes = (data || []).map(getNumericGradeValue).filter(v => Number.isFinite(v));
    const media = numericVotes.length > 0 ? averageFromNumeric(numericVotes) : null;

    const MONTHS_IT = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    function voteYearMonth(v) {
        const raw = v.data || v.date || '';
        const d = (typeof parseArgoDate === 'function') ? parseArgoDate(raw) : new Date(raw);
        return (d && !isNaN(d)) ? { y: d.getFullYear(), m: d.getMonth(), key: d.getFullYear() * 100 + d.getMonth() } : null;
    }

    const monthMap = {};
    (data || []).forEach(v => {
        const ym = voteYearMonth(v);
        const val = getNumericGradeValue(v);
        if (!ym || !Number.isFinite(val)) return;
        if (!monthMap[ym.key]) monthMap[ym.key] = { key: ym.key, label: MONTHS_IT[ym.m], nums: [] };
        monthMap[ym.key].nums.push(val);
    });

    const monthList = Object.values(monthMap)
        .sort((a, b) => a.key - b.key)
        .map(m => ({ ...m, avg: averageFromNumeric(m.nums) }));

    const mediaCurMese = monthList.length >= 1 ? monthList[monthList.length - 1].avg : null;
    const mediaPrevMese = monthList.length >= 2 ? monthList[monthList.length - 2].avg : null;
    let diffStr = '';
    let diffVal = 0;
    let isPositive = true;
    let hasComparison = false;

    if (mediaCurMese !== null && mediaPrevMese !== null) {
        diffVal = mediaCurMese - mediaPrevMese;
        isPositive = diffVal >= 0;
        diffStr = (isPositive ? '+' : '') + diffVal.toFixed(2);
        hasComparison = true;
    } else if (numericVotes.length >= 2) {
        diffStr = `${numericVotes.length} voti`;
        isPositive = true;
    }

    return {
        media,
        monthList,
        mediaCurMese,
        mediaPrevMese,
        diffVal,
        diffStr,
        isPositive,
        hasComparison,
        numericVotes
    };
}


function getNextGradeSimulatorValue() {
    const inState = Number(state.nextGradeSimulator);
    if (Number.isFinite(inState)) return Math.max(1, Math.min(10, Math.round(inState)));
    try {
        const stored = Number(localStorage.getItem(lsKey('next_grade_sim')));
        if (Number.isFinite(stored)) return Math.max(1, Math.min(10, Math.round(stored)));
    } catch (_) { }
    return 7;
}

function setNextGradeSimulatorValue(value) {
    const next = Math.max(1, Math.min(10, Math.round(Number(value) || 7)));
    state.nextGradeSimulator = next;
    try {
        localStorage.setItem(lsKey('next_grade_sim'), String(next));
    } catch (_) { }
    return next;
}
function getMotivationalFallback() {
    const quotes = [
        "Un piccolo passo oggi vale più di dieci domani.",
        "La costanza batte il talento quando il talento non è costante.",
        "Fatto è meglio di perfetto.",
        "Studia con calma, migliora ogni giorno.",
        "La conoscenza è potere.",
        "La curiosità è il motore dell'apprendimento.",
        "Ogni errore è un passo verso la comprensione.",
        "La disciplina è il ponte tra gli obiettivi e i risultati.",
        "Un libro è un giardino tascabile.",
        "Imparare senza riflettere è tempo perso."
    ];
    const day = new Date().getDate();
    return quotes[day % quotes.length];
}
function getSafeUserName() {
    const full = state?.user?.name?.trim();
    if (!full) return "Studente";
    const parts = full.split(/\s+/);
    // Return only the last part (usually surname) or the first if it's single
    return parts.length > 1 ? parts.slice(1).join(" ") : parts[0];
}
// Argo/DIDUP restituisce i nomi in TUTTO MAIUSCOLO (dato di registro).
// Questo helper è puramente cosmetico per la UI — non tocca mai lo state
// né quello che viene inviato al backend, serve solo per mostrare
// "Andrea" invece di "ANDREA" nel saluto della dashboard.
function toDisplayName(name) {
    if (!name) return name;
    return String(name)
        .toLowerCase()
        .replace(/(^|\s|['-])([a-zà-ÿ])/g, (m, sep, ch) => sep + ch.toUpperCase());
}
function gaugeClassForMedia(m) {
    if (m >= 6.5) return 'gauge-good';
    if (m >= 6.0) return 'gauge-warn';
    return 'gauge-bad';
}
function getSpecializationFullName(spec, rawClass = '') {
    // 🔥 HEURISTIC & PRIORITY: Estrai codici dalla classe
    const classMatch = String(rawClass).toUpperCase().match(/\b(SA|SU|LS|LC|LL|EC|CAT|AFM|ITI)\b/);
    const classCode = classMatch ? classMatch[1] : null;

    // Se abbiamo un codice nella classe, ha la precedenza su quello del DB
    // (perché spesso il DB è rimasto a un vecchio fallback 'SA')
    const code = classCode || spec;

    const maps = {
        'SA': 'Scienze Applicate',
        'LC': 'Liceo Classico',
        'SU': 'Scienze Umane',
        'LL': 'Liceo Linguistico',
        'LS': 'Liceo Scientifico',
        'EC': 'Economico Sociale',
        'CAT': 'Costruzioni Ambiente Territorio',
        'AFM': 'Amministrazione Finanza Marketing',
        'ITI': 'Istituto Tecnico Industriale'
    };
    return maps[code] || code || 'Indirizzo N/D';
}
function getLocalDateString(date = new Date()) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}
function parseLocalDate(dateStr) {
    const parts = (dateStr || '').split('-');
    if (parts.length !== 3) return new Date(NaN);
    return new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
}
function getSchoolDate() {
    // Return a Date object normalized to Italy (UTC+1 or UTC+2)
    const now = new Date();
    const italyStr = now.toLocaleString("en-US", { timeZone: "Europe/Rome" });
    return new Date(italyStr);
}
function updateOfflineBadge() {
    if (!offlineBadge) return;
    if (state.isOffline) {
        console.log("⚠️ Mostro offline badge");
        offlineBadge.classList.add('show');
    } else {
        offlineBadge.classList.remove('show');
    }
}
function getModalContainer() {
    let el = document.getElementById('modal-container');
    if (!el) {
        el = document.createElement('div');
        el.id = 'modal-container';
        document.body.appendChild(el);
    }
    return el;
}

// ── closeModal fallback (nel caso app-bootstrap.js non l'abbia ancora definita) ──
if (typeof window.closeModal !== 'function') {
    window.closeModal = function(e) {
        if (e && e.target !== e.currentTarget) return; // stopPropagation behaviour
        var mc = document.getElementById('modal-container');
        if (mc) mc.innerHTML = '';
    };
}

const modalRuntime = { pendingCloseTimeout: null };
function showModal(html, className = '') {
    const container = getModalContainer();
    if (!container) return;
    if (modalRuntime.pendingCloseTimeout) {
        clearTimeout(modalRuntime.pendingCloseTimeout);
        modalRuntime.pendingCloseTimeout = null;
    }
    container.innerHTML = `
            <div class="modal-overlay active" onclick="closeModal(event)" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:99990;background:rgba(var(--glass-rgb),0.2);display:flex;align-items:center;justify-content:center;padding:16px;backdrop-filter:blur(20px);box-sizing:border-box;transition: opacity 0.3s ease;">
                <div class="modal-content liquid-glass rounded-[40px] deep-shadow ${className}" onclick="event.stopPropagation()" style="position:relative;z-index:99991;max-height:calc(100dvh - 32px);overflow-y:auto;overflow-x:hidden;display:flex;flex-direction:column;width:100%;max-width:640px;padding:0;animation: modalAppear 0.4s cubic-bezier(0.2, 0.8, 0.2, 1);">
                    ${html}
                </div>
            </div>
        `;
}

// ══════════════════════════════════════════════════════════════════════════════
// iOS HIG STACKED GLASS TOASTS SYSTEM
// ══════════════════════════════════════════════════════════════════════════════
window._activeToasts = [];

function showToast(message, type = 'success', customBackground = '') {
    if (typeof message === 'object' && message !== null) {
        type = message.type || type;
        customBackground = message.customBackground || customBackground;
        message = message.message || message.text || JSON.stringify(message);
    }

    if (typeof window.triggerHaptic === 'function') {
        window.triggerHaptic(type === 'error' ? 'error' : 'light');
    }

    let stack = document.getElementById('toast-stack-container');
    if (!stack) {
        stack = document.createElement('div');
        stack.id = 'toast-stack-container';
        document.body.appendChild(stack);
    }

    const typeValue = typeof type === 'string' ? type.toLowerCase() : 'success';
    const id = 'toast_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);

    let iconName = 'ph-check-circle';
    let iconClass = 'text-[#30d158]';
    let toastTypeClass = 'toast-success';
    if (typeValue === 'error') {
        iconName = 'ph-x-circle';
        iconClass = 'text-[#ff453a]';
        toastTypeClass = 'toast-error';
    } else if (typeValue === 'warning') {
        iconName = 'ph-warning-circle';
        iconClass = 'text-[#ff9f0a]';
        toastTypeClass = 'toast-warning';
    } else if (typeValue === 'info') {
        iconName = 'ph-info';
        iconClass = 'text-[#2997ff]';
        toastTypeClass = 'toast-info';
    }

    const toastObj = {
        id,
        message,
        typeValue,
        iconName,
        iconClass,
        toastTypeClass,
        created: Date.now()
    };

    window._activeToasts.unshift(toastObj);
    if (window._activeToasts.length > 3) {
        window._activeToasts.pop();
    }

    _renderToastStack();

    setTimeout(() => {
        _dismissToast(id);
    }, 3200);
}

window._dismissToast = function(id) {
    const el = document.getElementById(id);
    if (el) {
        el.style.opacity = '0';
        el.style.transform = 'translateY(16px) scale(0.9)';
        el.style.transition = 'all 0.25s cubic-bezier(0.16,1,0.3,1)';
    }
    setTimeout(() => {
        window._activeToasts = window._activeToasts.filter(t => t.id !== id);
        _renderToastStack();
    }, 250);
};

function _renderToastStack() {
    const stack = document.getElementById('toast-stack-container');
    if (!stack) return;

    if (window._activeToasts.length === 0) {
        stack.innerHTML = '';
        return;
    }

    stack.innerHTML = window._activeToasts.map((t, idx) => {
        const tierClass = `toast-tier-${idx}`;
        return `
        <div id="${t.id}" class="ios-glass-toast ${t.toastTypeClass} ${tierClass}" data-id="${t.id}">
            <i class="ph-fill ${t.iconName} ${t.iconClass} text-[22px] flex-shrink-0"></i>
            <span class="text-[14px] font-semibold text-[#f1f5f9] tracking-tight leading-snug flex-1">${escapeHtml(t.message)}</span>
            <button onclick="_dismissToast('${t.id}')" style="background:none;border:none;color:rgba(255,255,255,0.4);cursor:pointer;padding:4px;display:flex;align-items:center;justify-content:center;">
                <i class="ph ph-x text-[14px]"></i>
            </button>
        </div>
        `;
    }).join('');

    const topToastEl = stack.querySelector('.toast-tier-0');
    if (topToastEl) {
        let startX = 0;
        let currentX = 0;
        let isDragging = false;

        topToastEl.addEventListener('touchstart', (e) => {
            if (e.touches && e.touches.length === 1) {
                startX = e.touches[0].clientX;
                isDragging = true;
            }
        }, { passive: true });

        topToastEl.addEventListener('touchmove', (e) => {
            if (!isDragging || !e.touches) return;
            currentX = e.touches[0].clientX - startX;
            topToastEl.style.transform = `translateX(${currentX}px) scale(1)`;
            topToastEl.style.opacity = `${Math.max(0.2, 1 - Math.abs(currentX) / 180)}`;
        }, { passive: true });

        topToastEl.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            if (Math.abs(currentX) > 75) {
                if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');
                const id = topToastEl.getAttribute('data-id');
                window._dismissToast(id);
            } else {
                topToastEl.style.transform = 'translateY(0) scale(1)';
                topToastEl.style.opacity = '1';
                topToastEl.style.transition = 'transform 0.25s cubic-bezier(0.16,1,0.3,1), opacity 0.25s ease';
            }
        }, { passive: true });
    }
}

// ══════════════════════════════════════════════════════════════════════════════
// iOS HIG BOTTOM SHEET ENGINE (SNAP POINTS & DRAG GESTURE)
// ══════════════════════════════════════════════════════════════════════════════
window.openBottomSheet = function(opts = {}) {
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('medium');
    const { title = '', html = '', onClose = null } = opts;
    let root = document.getElementById('ios-bottom-sheet-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'ios-bottom-sheet-root';
        document.body.appendChild(root);
    }

    root.innerHTML = `
        <div id="ios-sheet-backdrop" class="ios-sheet-backdrop" onclick="window.closeBottomSheet()"></div>
        <div id="ios-bottom-sheet" class="ios-bottom-sheet">
            <div class="ios-sheet-handle-bar" id="ios-sheet-drag-handle"></div>
            ${title ? `
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;padding-bottom:12px;border-bottom:0.5px solid rgba(255,255,255,0.08);">
                <h3 style="font-size:18px;font-weight:700;color:var(--text-primary);margin:0;">${escapeHtml(title)}</h3>
                <button onclick="window.closeBottomSheet()" style="width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:var(--text-secondary);cursor:pointer;display:flex;align-items:center;justify-content:center;">
                    <i class="ph ph-x text-[16px]"></i>
                </button>
            </div>` : ''}
            <div id="ios-sheet-content" style="overflow-y:auto;max-height:75vh;-webkit-overflow-scrolling:touch;">
                ${html}
            </div>
        </div>
    `;

    window._bottomSheetOnClose = onClose;

    requestAnimationFrame(() => {
        const backdrop = document.getElementById('ios-sheet-backdrop');
        const sheet = document.getElementById('ios-bottom-sheet');
        if (backdrop) backdrop.classList.add('active');
        if (sheet) sheet.classList.add('open');

        // Attach drag-down gesture
        const handle = document.getElementById('ios-sheet-drag-handle');
        if (handle && sheet) {
            let startY = 0;
            let currentY = 0;
            let isDragging = false;

            handle.addEventListener('touchstart', (e) => {
                if (e.touches && e.touches.length === 1) {
                    startY = e.touches[0].clientY;
                    isDragging = true;
                }
            }, { passive: true });

            handle.addEventListener('touchmove', (e) => {
                if (!isDragging || !e.touches) return;
                currentY = Math.max(0, e.touches[0].clientY - startY);
                sheet.style.transform = `translateY(${currentY}px)`;
            }, { passive: true });

            handle.addEventListener('touchend', () => {
                if (!isDragging) return;
                isDragging = false;
                if (currentY > 110) {
                    window.closeBottomSheet();
                } else {
                    sheet.style.transform = 'translateY(0)';
                    sheet.style.transition = 'transform 0.3s cubic-bezier(0.16,1,0.3,1)';
                }
            }, { passive: true });
        }
    });
};

window.closeBottomSheet = function() {
    const backdrop = document.getElementById('ios-sheet-backdrop');
    const sheet = document.getElementById('ios-bottom-sheet');
    if (sheet) sheet.classList.remove('open');
    if (backdrop) backdrop.classList.remove('active');
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');

    setTimeout(() => {
        const root = document.getElementById('ios-bottom-sheet-root');
        if (root) root.innerHTML = '';
        if (typeof window._bottomSheetOnClose === 'function') {
            window._bottomSheetOnClose();
            window._bottomSheetOnClose = null;
        }
    }, 350);
};

// ══════════════════════════════════════════════════════════════════════════════
// iOS HIG CONTEXT MENU (LONG PRESS ACTION SHEET)
// ══════════════════════════════════════════════════════════════════════════════
window.openContextMenu = function(e, items = []) {
    if (e && e.preventDefault) e.preventDefault();
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('medium');

    let root = document.getElementById('ios-context-root');
    if (!root) {
        root = document.createElement('div');
        root.id = 'ios-context-root';
        document.body.appendChild(root);
    }

    const x = Math.min(window.innerWidth - 220, Math.max(16, (e.clientX || (e.touches && e.touches[0] ? e.touches[0].clientX : 40))));
    const y = Math.min(window.innerHeight - 200, Math.max(70, (e.clientY || (e.touches && e.touches[0] ? e.touches[0].clientY : 100))));

    const itemsHtml = items.map((item, i) => {
        if (item.separator) return `<div class="ios-context-separator"></div>`;
        return `
        <button class="ios-context-item ${item.danger ? 'danger' : ''}" onclick="window.closeContextMenu();${item.action || ''}">
            <span>${escapeHtml(item.label)}</span>
            <i class="ph ${item.icon || 'ph-dots-three'} text-[18px]"></i>
        </button>
        `;
    }).join('');

    root.innerHTML = `
        <div class="ios-context-overlay active" onclick="window.closeContextMenu()"></div>
        <div id="ios-context-menu-box" class="ios-context-menu open" style="top:${y}px;left:${x}px;">
            ${itemsHtml}
        </div>
    `;
};

window.closeContextMenu = function() {
    const root = document.getElementById('ios-context-root');
    if (root) root.innerHTML = '';
};

// ══════════════════════════════════════════════════════════════════════════════
// iOS LARGE TITLE SCROLL CONTROLLER
// ══════════════════════════════════════════════════════════════════════════════
window.setupLargeHeaderScroll = function(container) {
    if (!container) return;
    const largeTitle = container.querySelector('.ios-large-title');
    const compactNav = container.querySelector('.ios-compact-nav');
    if (!largeTitle && !compactNav) return;

    container.addEventListener('scroll', () => {
        const scrollY = container.scrollTop || window.scrollY || 0;
        if (scrollY > 35) {
            if (compactNav) compactNav.classList.add('visible');
            if (largeTitle) {
                largeTitle.style.opacity = '0';
                largeTitle.style.transform = 'scale(0.96)';
            }
        } else {
            if (compactNav) compactNav.classList.remove('visible');
            if (largeTitle) {
                largeTitle.style.opacity = '1';
                largeTitle.style.transform = 'scale(1)';
            }
        }
    }, { passive: true });
};

function showBoot(text) {
window.showBoot = showBoot; // expose globally for app-bootstrap.js
    const el = document.getElementById('boot-overlay');
    if (!el) return;
    if (text) {
        const t = el.querySelector('.boot-title');
        if (t) t.textContent = text;
    }
    el.style.display = 'flex';
    el.classList.remove('hidden');
}
function hideBoot() {
    const el = document.getElementById('boot-overlay');
    if (el) {
        el.classList.add('hidden');
        setTimeout(() => { el.style.display = 'none'; }, 300);
    }
    // Also dismiss app-loader if still visible
    const loader = document.getElementById('app-loader');
    if (loader) {
        loader.style.opacity = '0';
        setTimeout(() => loader.remove(), 500);
    }
}
function detectTrackUi(text) {
    if (!text) return null;
    const s = String(text).toUpperCase()
        .replace(/[\(\)\[\],.\-_/]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!s) return null;

    if (/\b(?:OPZIONE\s+)?SCIENZE\s+APPLICATE\b|\bSC\s*APP(?:LICATE)?\b|\bSA\b/.test(s)) return 'SA';
    if (/\bSCIENZE\s+UMANE\b|\bSC\s*UMANE\b|\bECONOMICO\s+SOCIALE\b|\bLES\b|\bSU\b/.test(s)) return 'SU';
    if (/\b(?:LICEO\s+)?CLASSICO\b|\bCL\b|\bLC\b/.test(s)) return 'CL';
    if (/\b(?:LICEO\s+)?SCIENTIFICO\b|\bLS\b/.test(s)) return 'LS';
    if (/\b(?:LICEO\s+)?LINGUISTICO\b|\bLL\b/.test(s)) return 'LL';
    if (/\b(?:LICEO\s+)?ARTISTICO\b|\bLA\b/.test(s)) return 'LA';
    return null;
}

function normalizeClassUi(cls, track) {
    if (!cls) return null;
    let txt = String(cls).toUpperCase().trim();

    // Reject placeholders, uninitialized tokens, and non-classes
    if (!txt || txt === '...' || txt === '..' || txt === 'N/D' || txt === 'STUDENTE' || txt === 'UNDEFINED' || txt === 'NULL' || txt === '---') {
        return null;
    }

    // Word boundary blacklist for non-class phrases (e.g. "4 ORE", "2 ANNI")
    if (/^\s*[1-5]\s*(?:ORE|ANNI|ANNO|OGGETTI|OTTOBRE|ORA|ORDINE|OFFERTA|ORARIO|OVVERO|OGNI|OLTRE)\b/i.test(txt)) {
        return null;
    }

    // Convert written word ordinals
    txt = txt
        .replace(/\bPRIMA\b|\bI\^?\b/g, '1')
        .replace(/\bSECONDA\b|\bII\^?\b/g, '2')
        .replace(/\bTERZA\b|\bIII\^?\b/g, '3')
        .replace(/\bQUARTA\b|\bIV\^?\b/g, '4')
        .replace(/\bQUINTA\b|\bV\^?\b/g, '5');

    // 1. If already in canonical formatted shape: e.g. "4D (SA)", "5A (LS)", "3B (SU)"
    const alreadyFormatted = txt.match(/^([1-5])\s*([A-Z]{1,2})\s*\(([A-Z]{2,4})\)$/);
    if (alreadyFormatted) {
        return `${alreadyFormatted[1]}${alreadyFormatted[2]} (${alreadyFormatted[3]})`;
    }

    // Detect track from track param first, then from text
    let detectedTrack = detectTrackUi(track) || detectTrackUi(txt);

    // 2. Compact compound formats: 4DSA, 4DLS, 3ACL, 1BSU, 4DLC, 4DLL, 4DLA
    const compactMatch = txt.match(/\b([1-5])[\^°]?\s*([A-Z])\s*(SA|LS|SU|CL|LC|LL|LA)\b/i);
    if (compactMatch) {
        const year = compactMatch[1];
        const section = compactMatch[2].toUpperCase();
        const t = detectTrackUi(compactMatch[3]) || compactMatch[3].toUpperCase();
        return `${year}${section} (${t})`;
    }

    // 3. Match Year + Section with possible track in string:
    // e.g. "4D (SA)", "4 D SA", "4 D (SA)", "4D SCIENZE APPLICATE", "CLASSE 4 SEZ. D"
    const explicitMatch = txt.match(/(?:CLASSE\s*[:\-]?\s*)?([1-5])[\^°]?\s*(?:(?:SEZ(?:IONE)?\.?|\/|\-)\s*[:\-]?\s*)?([A-Z]{1,2})\b/i);
    if (explicitMatch) {
        const year = explicitMatch[1];
        const section = explicitMatch[2].toUpperCase();
        if (!/^(ORE|AN|P|DA)$/i.test(section)) {
            return detectedTrack ? `${year}${section} (${detectedTrack})` : `${year}${section}`;
        }
    }

    // 4. Fallback matching
    const fallbackMatch = txt.match(/([1-5])\s*([A-Z]{1,2})/);
    if (fallbackMatch) {
        const year = fallbackMatch[1];
        const section = fallbackMatch[2].toUpperCase();
        if (!/^(ORE|AN|P|DA)$/i.test(section)) {
            return detectedTrack ? `${year}${section} (${detectedTrack})` : `${year}${section}`;
        }
    }

    return (txt.length <= 15 && txt !== '...' && txt !== 'N/D' && txt !== 'STUDENTE') ? txt : null;
}
function isValidClass(cls) {
    if (!cls) return false;
    const s = String(cls).trim().toUpperCase();
    return s.length >= 1 && s.length <= 20;
}
function isValidName(name) {
    if (!name || typeof name !== 'string') return false;
    const trimmed = name.trim();
    if (trimmed.length < 2) return false;
    return /^[a-zA-ZÀ-ÿ0-9\s'.\-]+$/.test(trimmed);
}
function renderNav() {
    if (!state.isLoggedIn || state.view === 'login' || state._loggedOut) {
        const nc = document.getElementById('nav-container');
        if (nc) nc.innerHTML = '';
        return '';
    }
    const currentView = state.view;

    // Helper to generate an iOS HIG nav item link with filled/outline icon states
    const renderNavItem = (view, iconBase, label) => {
        const isActive = currentView === view;
        const color    = isActive ? '#2997ff' : 'rgba(255, 255, 255, 0.45)';
        const fontStyle = isActive ? 'font-bold' : 'font-medium';
        const iconClass = isActive ? `ph-fill ${iconBase}` : `ph ${iconBase}`;

        return `
        <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('selection');navigate('${view}')" 
           class="nav-item relative flex flex-col items-center justify-center gap-1 min-w-[56px] min-h-[48px] px-2 py-1 transition-transform active:scale-95 bg-transparent border-none outline-none cursor-pointer"
           style="color:${color};-webkit-tap-highlight-color:transparent;">
            <i class="${iconClass} text-[22px] relative z-10 transition-transform ${isActive ? 'scale-110' : ''}"></i>
            <span class="text-[10px] ${fontStyle} tracking-tight relative z-10">${label}</span>
            ${isActive ? `<div style="position:absolute;bottom:2px;width:4px;height:4px;border-radius:50%;background:#2997ff;box-shadow:0 0 8px #2997ff;"></div>` : ''}
        </button>
        `;
    };

    return `
        <!-- ══ BOTTOM NAV — 4K Ultra HD Liquid Glass Floating Pill (iOS HIG) ══ -->
        <nav class="liquid-navbar fixed bottom-5 left-1/2 -translate-x-1/2 flex items-center justify-around px-3 rounded-[36px] z-[1000] w-[90%] max-w-[360px] h-[64px] md:hidden" style="background:rgba(12,19,34,0.86)!important;backdrop-filter:blur(32px) saturate(190%)!important;-webkit-backdrop-filter:blur(32px) saturate(190%)!important;border:0.5px solid rgba(255,255,255,0.14)!important;box-shadow:0 20px 48px -10px rgba(0,0,0,0.7),inset 0 1px 1px rgba(255,255,255,0.12)!important;">
            ${renderNavItem('home', 'ph-squares-four', 'Overview')}
            ${renderNavItem('planner', 'ph-calendar-blank', 'Planner')}
            ${renderNavItem('voti', 'ph-star', 'Grades')}
            ${renderNavItem('circolari', 'ph-file-text', 'Circulars')}
        </nav>

        <!-- ══ TOP NAV — Tablet & Desktop only (≥ 768px) ══ -->
        <nav class="top-bar-nav fixed top-0 left-1/2 -translate-x-1/2 hidden md:flex items-center justify-center gap-4 z-[1000]" style="background:rgba(12,19,34,0.9);backdrop-filter:blur(24px);border:0.5px solid rgba(255,255,255,0.1);">
            ${renderNavItem('home', 'ph-squares-four', 'Overview')}
            ${renderNavItem('planner', 'ph-calendar-blank', 'Planner')}
            ${renderNavItem('voti', 'ph-star', 'Grades')}
            ${renderNavItem('circolari', 'ph-file-text', 'Circulars')}
        </nav>

        <!-- Drawer overlay -->
        <div id="drawerOverlay" onclick="closeDrawer()" style="
            position:fixed; inset:0; background:rgba(15,23,42,0.45);
            backdrop-filter:blur(4px); opacity:0; pointer-events:none;
            z-index:9999; display:flex; align-items:flex-end;
            transition:opacity 0.3s ease;">
            <div id="drawerContent" onclick="event.stopPropagation()" style="
                width:100%; background:var(--surface-container-lowest); border-radius:36px 36px 0 0;
                padding:32px 32px 40px; box-shadow:0 -10px 40px rgba(0,0,0,0.12);
                transform:translateY(100%); display:flex; flex-direction:column;
                max-height:80%; overflow-y:auto;
                transition:transform 0.3s cubic-bezier(0.16,1,0.3,1);">
                <div style="width:44px;height:5px;background:var(--surface-container-low);border-radius:999px;margin:0 auto 24px;flex-shrink:0;"></div>
                <div id="drawerDynamicBody"></div>
            </div>
        </div>

        <!-- Dialog overlay -->
        <div id="dialogOverlay" style="
            position:fixed; inset:0; background:rgba(15,23,42,0.45);
            backdrop-filter:blur(4px); opacity:0; pointer-events:none;
            z-index:9999; display:flex; align-items:center; justify-content:center;
            padding:0 24px; transition:opacity 0.2s ease;">
            <div style="background:var(--surface-container-lowest); border-radius:24px; padding:24px;
                        width:100%; max-height:80%; overflow-y:auto;
                        box-shadow:0 25px 50px rgba(0,0,0,0.15);">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <h4 id="dialogTitle" style="font-size:1.1rem;font-weight:700;color:var(--on-surface);">Dettagli</h4>
                    <button onclick="closeDialog()" style="width:32px;height:32px;border-radius:50%;
                        background:var(--surface-container-low);border:none;display:flex;align-items:center;
                        justify-content:center;color:var(--on-surface-variant);cursor:pointer;">
                        <i data-lucide="x" style="width:16px;height:16px;"></i>
                    </button>
                </div>
                <div id="dialogBody" style="font-size:0.875rem;color:var(--on-surface-variant);"></div>
            </div>
        </div>

        <script>
            if (typeof lucide !== 'undefined') lucide.createIcons();
        </script>
    `;
}
function updatePlanTaskUI(taskId, isPlanned) {
    const taskElement = document.querySelector(`[data-task-id="${taskId}"]`);
    if (!taskElement) return;

    const checkbox = taskElement.querySelector('.plan-checkbox, [data-plan-checkbox]');
    const container = taskElement;

    if (checkbox) {
        if (isPlanned) {
            checkbox.style.background = 'var(--green, #30D158)';
            checkbox.style.borderColor = 'var(--green, #30D158)';
            checkbox.innerHTML = '<i class="ph-bold ph-check" style="font-size: 16px; color: black;"></i>';
        } else {
            checkbox.style.background = 'transparent';
            checkbox.style.borderColor = 'rgba(var(--glass-rgb),0.2)';
            checkbox.innerHTML = '';
        }

        checkbox.style.transform = 'scale(0.85) translateZ(0)';
        requestAnimationFrame(() => {
            setTimeout(() => {
                checkbox.style.transform = 'scale(1) translateZ(0)';
            }, 50);
        });
    }

    if (container) {
        container.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        container.style.borderLeftColor = isPlanned ? 'var(--green, #30D158)' : 'rgba(var(--glass-rgb),0.05)';
        container.style.background = isPlanned ? 'rgba(48, 209, 88, 0.08)' : 'rgba(var(--glass-rgb),0.03)';
    }
}
function updatePlannerCounter() {
    // Function retired: replaced numeric badge with static green '+'
}
function normalizeTipoVerifica(tipo, upperCase = true) {
    const t = (tipo || '').toString().toLowerCase().trim();
    if (t === 'scritta') return upperCase ? 'SCRITTA' : 'Scritta';
    if (t === 'orale') return upperCase ? 'ORALE' : 'Orale';
    return upperCase ? 'VERIFICA' : 'Valutazione';
}
function getHomeTaskWidgetData() {
    const mode = state.homeTaskFocus === 'today' ? 'today' : 'tomorrow';
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = getLocalDateString(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = getLocalDateString(tomorrow);

    if (mode === 'today') {
        const plannedTodayIds = (state.plannedTasks && state.plannedTasks[todayStr]) || [];
        const tasks = (state.tasks || []).filter(t => {
            if (t.subject === 'QUEST') return false;
            if (t.isExam) return false;
            return plannedTodayIds.includes(t.id);
        });
        return {
            mode,
            title: 'Oggi',
            dateStr: todayStr,
            emptyMessage: 'Nessun compito pianificato per oggi.',
            tasks
        };
    }

    const tasks = (state.tasks || []).filter(t => {
        if (t.subject === 'QUEST') return false;
        if (t.isExam) return false;
        return t.due_date === tomorrowStr;
    });
    return {
        mode,
        title: 'Domani',
        dateStr: tomorrowStr,
        emptyMessage: 'Nessun compito assegnato per domani.',
        tasks
    };
}
function renderHomeTaskListHtml(homeTaskData) {
    if (!homeTaskData.tasks.length) {
        return `<div style="font-size:11px; color:var(--outline-variant); padding:10px 0; text-align:center;">${homeTaskData.emptyMessage}</div>`;
    }
    return homeTaskData.tasks.map(t => {
        const abbr = getSubjectAbbrev(t.subject);
        const key = abbr.toLowerCase();
        return `
              <div style="display:flex; align-items:center; gap:9px; padding:6px 0; border-bottom:1px solid var(--outline-variant); cursor:pointer;" onclick="toggleTask('${escapeJsSingleQuote(t.id)}')">
                <div data-task-toggle="${escapeHtml(t.id)}" style="width:17px; height:17px; border:1.5px solid ${t.done ? 'var(--on-surface)' : 'var(--outline-variant)'}; border-radius:5px; flex-shrink:0; display:flex; align-items:center; justify-content:center; background:${t.done ? 'var(--on-surface)' : 'var(--surface-container-lowest)'}; transition: background 0.15s ease, border-color 0.15s ease;">
                  ${t.done ? '<svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 2.5L3 4.5L7 1" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>' : ''}
                </div>
                <span style="font-family:\'JetBrains Mono\',monospace; font-size:9px; font-weight:500; border-radius:5px; padding:2px 6px; flex-shrink:0; background:var(--${key},#EEE); color:var(--${key}-t,#444);">${abbr}</span>
                <span data-task-text="${escapeHtml(t.id)}" style="font-size:12.5px; font-weight:500; color:${t.done ? 'var(--on-surface-variant)' : 'var(--on-surface)'}; flex:1; line-height:1.3; ${t.done ? 'text-decoration:line-through;' : ''} white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(t.text)}</span>
                ${isUserGeneratedTaskId(t.id) ? `
                <button onclick="event.stopPropagation(); deleteCalendarTask('${escapeJsSingleQuote(t.id)}');" style="width:20px; height:20px; border-radius:6px; background:var(--error-container); border:1px solid rgba(255,59,48,0.18); display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;" aria-label="Elimina attività" title="Elimina attività">
                    <i class="ph-bold ph-trash" style="font-size:10px; color:var(--error);"></i>
                </button>` : ''}
              </div>`;
    }).join('');
}
function updateHomeTaskFocusWidget() {
    if (state.view !== 'home') return false;
    const homeTaskData = getHomeTaskWidgetData();
    const label = document.getElementById('home-focus-label');
    const list = document.getElementById('home-focus-task-list');
    const btnToday = document.getElementById('home-focus-btn-today');
    const btnTomorrow = document.getElementById('home-focus-btn-tomorrow');
    if (!label || !list || !btnToday || !btnTomorrow) return false;

    label.textContent = homeTaskData.title;
    list.innerHTML = renderHomeTaskListHtml(homeTaskData);

    const applyBtnState = (btn, active) => {
        btn.style.borderColor = active ? 'var(--on-surface)' : 'var(--outline-variant)';
        btn.style.background = active ? 'var(--on-surface)' : 'var(--surface-container-lowest)';
        btn.style.color = active ? 'var(--surface-container-lowest)' : '#4F4A43';
    };
    applyBtnState(btnToday, homeTaskData.mode === 'today');
    applyBtnState(btnTomorrow, homeTaskData.mode === 'tomorrow');
    return true;
}
function updateNextGradeSimulatorWidget() {
    if (state.view !== 'voti') return false;
    const simValueEl = document.getElementById('next-grade-sim-value');
    const currentAvgEl = document.getElementById('next-grade-current-avg');
    const simAvgEl = document.getElementById('next-grade-sim-avg');
    const impactEl = document.getElementById('next-grade-sim-impact');
    const termLabelEl = document.getElementById('next-grade-current-term-label');
    if (!simValueEl || !currentAvgEl || !simAvgEl || !impactEl) return false;
    let votiData = getVotiData();
    if (state.activeSubject) {
        votiData = votiData.filter(v => areSubjectsEquivalent(v.materia || v.subject, state.activeSubject));
    }
    const currentTerm = getCurrentSchoolTerm(new Date());
    const termVotes = currentTerm ? getVotesBySchoolTerm(votiData, currentTerm) : [];
    const numericVotes = termVotes.map(getNumericGradeValue).filter(v => Number.isFinite(v));
    const media = averageFromNumeric(numericVotes);
    const simulatorValue = getNextGradeSimulatorValue();
    const simulatedAvg = averageFromNumeric([...numericVotes, simulatorValue]);
    const simulatedDelta = Number.isFinite(media) && Number.isFinite(simulatedAvg) ? (simulatedAvg - media) : null;
    simValueEl.textContent = `voto: ${simulatorValue}`;
    currentAvgEl.textContent = Number.isFinite(media) ? media.toFixed(2) : '—';
    simAvgEl.textContent = Number.isFinite(simulatedAvg) ? simulatedAvg.toFixed(2) : '—';
    if (Number.isFinite(simulatedDelta)) {
        impactEl.textContent = `${simulatedDelta >= 0 ? '+' : ''}${simulatedDelta.toFixed(2)}`;
        impactEl.style.color = simulatedDelta >= 0 ? '#2DB86A' : '#FF3B30';
    } else {
        impactEl.textContent = '—';
        impactEl.style.color = 'var(--on-surface-variant)';
    }
    if (termLabelEl) {
        termLabelEl.textContent = currentTerm === 'first' ? 'Primo quadrimestre' : (currentTerm === 'second' ? 'Secondo quadrimestre' : 'Nessun quadrimestre attivo');
    }
    return true;
}
window.setHomeTaskFocus = function (mode) {
    state.homeTaskFocus = mode === 'today' ? 'today' : 'tomorrow';
    if (state.view === 'home') {
        if (!updateHomeTaskFocusWidget() && typeof scheduleRender === 'function') scheduleRender(0);
    }
};
function updateHomeView() {
    if (state.view !== 'home') return;

    const focusCard = document.getElementById('home-focus-task-list');
    if (focusCard) {
        const focusData = getHomeTaskWidgetData();
        const liveIds = new Set(focusData.tasks.map(t => t.id));

        // Remove DOM rows for tasks that no longer exist
        focusCard.querySelectorAll('[data-task-toggle]').forEach(cb => {
            const taskId = cb.getAttribute('data-task-toggle');
            if (!liveIds.has(taskId)) {
                const row = cb.parentElement;
                if (row && row !== focusCard) {
                    if (typeof gsap !== 'undefined') {
                        gsap.to(row, { opacity: 0, height: 0, paddingTop: 0, paddingBottom: 0, marginTop: 0, marginBottom: 0, duration: 0.2, ease: 'power2.in', onComplete: () => row.remove() });
                    } else {
                        row.remove();
                    }
                }
            }
        });

        // Show empty message if no tasks remain after removal
        setTimeout(() => {
            const remaining = focusCard.querySelectorAll('[data-task-toggle]').length;
            if (remaining === 0 && !focusCard.querySelector('[data-empty-msg]')) {
                const empty = document.createElement('div');
                empty.setAttribute('data-empty-msg', '1');
                empty.style.cssText = 'font-size:11px; color:var(--outline-variant); padding:10px 0; text-align:center;';
                empty.textContent = focusData.emptyMessage || 'Nessun compito';
                focusCard.appendChild(empty);
            }
        }, 220);

        // Update done/undone state for remaining tasks
        focusData.tasks.forEach(t => {
            const cb = focusCard.querySelector(`[data-task-toggle="${t.id}"]`);
            const txt = focusCard.querySelector(`[data-task-text="${t.id}"]`);
            if (cb) {
                cb.style.background = t.done ? 'var(--on-surface)' : 'var(--surface-container-lowest)';
                cb.style.borderColor = t.done ? 'var(--on-surface)' : 'var(--outline-variant)';
                cb.innerHTML = t.done ? '<svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 2.5L3 4.5L7 1" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>' : '';
            }
            if (txt) {
                txt.style.textDecoration = t.done ? 'line-through' : 'none';
                txt.style.color = t.done ? 'var(--on-surface-variant)' : 'var(--on-surface)';
            }
        });
    }

    updatePlannerCounter();
}
function buildCalendarEventsFromState() {
    return (state.tasks || [])
        .filter(t => t.due_date && t.hasValidDate)
        .map(t => {
            const color = getSubjectColor(t.subject || 'Generico');
            // 🚀 SENIOR FIX: Truncate subject to 4 chars for extreme legibility
            const sub = (t.subject || 'GEN').substring(0, 4).toUpperCase();
            return {
                title: `${sub}: ${t.text}`,
                start: t.due_date,
                color: t.done ? '#30D158' : color,
                textColor: 'var(--surface-container-lowest)',
                extendedProps: { fullText: t.text, subject: t.subject }
            };
        });
}
function getCalendarTasksForDate(dateStr) {
    const plannedIds = (state.plannedTasks && state.plannedTasks[dateStr]) || [];
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    const merged = new Map();
    tasks.forEach(t => {
        if (!t || t.subject === 'QUEST' || t.isExam) return;
        if (t.due_date === dateStr || plannedIds.includes(t.id)) {
            merged.set(t.id, t);
        }
    });
    return [...merged.values()];
}
function getSubjectAbbrev(subject) {
    if (!subject) return 'GEN';
    let cleanSubj = subject.replace(/[*_\[\]]/g, '').trim();
    if (!cleanSubj) return 'GEN';

    const abbrevs = {
        'ITALIANO': 'ITA', 'MATEMATICA': 'MAT', 'INGLESSE': 'ING', 'INGLESE': 'ING',
        'STORIA': 'STO', 'GEOGRAFIA': 'GEO', 'FILOSOFIA': 'FIL',
        'FISICA': 'FIS', 'SCIENZE': 'SCI', 'BIOLOGIA': 'BIO',
        'CHIMICA': 'CHI', 'ARTE': 'ART', 'DISEGNO': 'DIS',
        'RELIGIONE': 'REL', 'EDUCAZIONE FISICA': 'SCM', 'SCIENZE MOTORIE': 'SCM', 'INFORMATICA': 'INF',
        'DIRITTO': 'DIR', 'ECONOMIA': 'ECO', 'FRANCESE': 'FRA', 'TEDESCO': 'TED', 'SPAGNOLO': 'SPA',
        'FILOSOFIA E STORIA': 'STO', 'MATEMATICA E FISICA': 'MAT', 'SCIENZE NATURALI': 'SCI',
        'LINGUA E LETTERATURA ITALIANA': 'ITA', 'LINGUA E CULTURA LATINA': 'LAT',
        // DidUp long-form names
        'LINGUA E LETT. ITALIANA': 'ITA', 'LINGUA E LETTER. ITALIANA': 'ITA',
        'LINGUA E CULTURA STRANIERA': 'ING', 'LINGUA STRANIERA': 'ING',
        'MATEM. CON INFORMATICA': 'MAT', 'MATEMATICA CON INFORMATICA': 'MAT',
        'SCIENZE NAT. CHIM. BIO.': 'SCI', 'SC. NATURALI': 'SCI',
        'DISEGNO E STORIA DELL\'ARTE': 'ART', 'STORIA DELL\'ARTE': 'ART',
        'DISEGNO E STORIA DELL\'ARTE TRIENNIO': 'ART', 'STORIA TRIENNIO': 'STO',
        'SCIENZE MOTORIE E SPORTIVE': 'SCM', 'SC. MOTORIE E SPORTIVE': 'SCM',
        'GRECO': 'GRC', 'LATINO': 'LAT', 'LINGUA E CULTURA GRECA': 'GRC',
        'GEOSTORIA': 'STO', 'STORIA E GEOGRAFIA': 'STO',
        'IRC': 'REL', 'ED.CIVICA': 'CIV', 'EDUCAZIONE CIVICA': 'CIV'
    };
    const key = cleanSubj.toUpperCase().trim();
    console.log(`[Debug] Matching subject: "${key}"`);

    if (abbrevs[key]) return abbrevs[key];
    for (let [full, short] of Object.entries(abbrevs)) {
        if (key.includes(full)) {
            console.log(`[Debug] Partial match: "${full}" -> ${short}`);
            return short;
        }
    }
    // Fallback smart
    if (key.includes('MATEM')) return 'MAT';
    if (key.includes('FISIC')) return 'FIS';
    if (key.includes('ITALIA')) return 'ITA';
    if (key.includes('INGLE')) return 'ING';
    if (key.includes('LATIN')) return 'LAT';
    if (key.includes('GREC')) return 'GRC';
    if (key.includes('FILOS')) return 'FIL';
    if (key.includes('STORI')) return 'STO';
    if (key.includes('SCIEN')) return 'SCI';
    if (key.includes('DISEG')) return 'DIS';
    if (key.includes('RELIG')) return 'REL';
    if (key.includes('FRANC')) return 'FRA';
    if (key.includes('TEDES')) return 'TED';
    if (key.includes('SPAGN')) return 'SPA';
    if (key.includes('INFOR')) return 'INF';
    if (key.includes('CHIMI')) return 'CHI';

    console.warn(`[Debug] No match for: "${key}", using fallback.`);
    return key.substring(0, 3).toUpperCase();
}
function initPlannerCalendar() {
    renderCustomCalendar();
}
function syncCalendarEvents() {
    renderCustomCalendar();
}
function renderCustomCalendar() {
    const calendarEl = document.getElementById('calendar');
    if (!calendarEl) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calcola il lunedì della settimana corrente
    const d = today.getDay();
    const diffToMonday = today.getDate() - (d === 0 ? 6 : d - 1);
    const startOfCurrentWeek = new Date(new Date(today).setDate(diffToMonday));
    startOfCurrentWeek.setHours(0, 0, 0, 0);

    // Data di inizio basata sull'offset (settimane)
    const startDate = new Date(startOfCurrentWeek);
    startDate.setDate(startOfCurrentWeek.getDate() + (calendarState.weekOffset * 7));

    const endDate = new Date(startDate);
    endDate.setDate(startDate.getDate() + 13);

    const monthNames = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
    const weekLabel = `Settimana ${startDate.getDate()} ${monthNames[startDate.getMonth()]} - ${endDate.getDate()} ${monthNames[endDate.getMonth()]}`;

    // Prepare verifiche by date for quick lookup
    const todayISO = getLocalDateString(today);
    const verificheByDate = {};
    (state.verifiche || []).forEach(v => {
        const dateKey = v.data || '';
        if (!dateKey) return;
        if (!verificheByDate[dateKey]) verificheByDate[dateKey] = [];
        verificheByDate[dateKey].push({ subject: v.materia || v.subject || '', text: v.text || '', tipo: v.tipo || '' });
    });
    (state.manualVerifiche || []).forEach(v => {
        const dateKey = v.date || '';
        if (!dateKey) return;
        if (!verificheByDate[dateKey]) verificheByDate[dateKey] = [];
        verificheByDate[dateKey].push({ subject: v.subject || '', text: v.args || '', tipo: v.type || '' });
    });

    let html = `
                <div class="custom-calendar">
                    <div class="calendar-header">
                        <div class="calendar-title">${weekLabel}</div>
                        <div class="calendar-nav">
                            <button onclick="navigateCalendar(-1)" title="Settimana precedente"><i class="ph ph-caret-left"></i></button>
                            <button onclick="navigateCalendar(1)" title="Settimana successiva"><i class="ph ph-caret-right"></i></button>
                       </div>
                   </div>
                    <div class="weekday-headers">
                        <div class="weekday-header">Lun</div>
                        <div class="weekday-header">Mar</div>
                        <div class="weekday-header">Mer</div>
                        <div class="weekday-header">Gio</div>
                        <div class="weekday-header">Ven</div>
                        <div class="weekday-header">Sab</div>
                        <div class="weekday-header">Dom</div>
                   </div>
                    <div class="calendar-days">
            `;

    const tempDate = new Date(startDate);
    for (let i = 0; i < 14; i++) {
        const dateStr = getLocalDateString(tempDate);
        const isToday = dateStr === todayISO;
        const isPast = tempDate < today && !isToday;

        const dayTasks = getCalendarTasksForDate(dateStr);

        const dayVerifiche = verificheByDate[dateStr] || [];
        const dayMood = (typeof window.getDailyMoodForDate === 'function') ? window.getDailyMoodForDate(dateStr) : null;

        html += `
                    <div class="calendar-day ${isToday ? 'today' : ''} ${isPast ? 'past' : ''}" 
                         onclick="${isPast ? '' : `handleDayClick('${dateStr}')`}">
                        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:4px;">
                            <div class="day-number">${tempDate.getDate()}</div>
                            ${dayMood ? `<span style="font-size:12px;line-height:1;">${dayMood.emoji}</span>` : (isToday ? `<div style="width:5px; height:5px; border-radius:50%; background:#007AFF; margin-top:4px;"></div>` : '')}
                        </div>
                        <div class="day-events">
                            ${dayVerifiche.slice(0, 2).map(v => {
            const color = getSubjectColor(v.subject);
            const abbrev = getSubjectAbbrev(v.subject);
            return `<div class="event-badge" aria-label="Verifica ${escapeHtml(v.subject || '')}" style="background:${color}; outline:2px solid rgba(255,159,10,0.6); outline-offset:-1px;" title="${escapeHtml(v.tipo + (v.text ? ': ' + v.text : ''))}">${abbrev}✏</div>`;
        }).join('')}
                            ${dayTasks.slice(0, Math.max(0, 3 - dayVerifiche.length)).map(t => {
            const color = getSubjectColor(t.subject);
            const abbrev = getSubjectAbbrev(t.subject);
            return `<div class="event-badge ${t.done ? 'done' : ''}" style="background: ${color}">${abbrev}</div>`;
        }).join('')}
                            ${(dayVerifiche.length + dayTasks.length) > 3 ? `<div class="more-events">+${dayVerifiche.length + dayTasks.length - 3}</div>` : ''}
                       </div>
                   </div>
                `;
        tempDate.setDate(tempDate.getDate() + 1);
    }

    html += `</div></div>`;

    // Build 7-day task list below calendar (Mon-Sun of displayed first week)
    const listHtml = renderCalendarWeekList(startDate);
    calendarEl.innerHTML = html + listHtml;
    if (typeof animatePlannerSurface === 'function') animatePlannerSurface('calendar');
}

function renderCalendarWeekList(weekStart) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = getLocalDateString(today);

    const dayNames = ['LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB', 'DOM'];
    const monthNames = ["GEN", "FEB", "MAR", "APR", "MAG", "GIU", "LUG", "AGO", "SET", "OTT", "NOV", "DIC"];

    // Prepare verifiche by date
    const verificheByDate = {};
    (state.verifiche || []).forEach(v => {
        const dateKey = v.data || '';
        if (!dateKey) return;
        if (!verificheByDate[dateKey]) verificheByDate[dateKey] = [];
        verificheByDate[dateKey].push({ subject: v.materia || v.subject || '', text: v.text || v.descrizione || '', tipo: v.tipo || '', isVerifica: true });
    });
    (state.manualVerifiche || []).forEach(v => {
        const dateKey = v.date || '';
        if (!dateKey) return;
        if (!verificheByDate[dateKey]) verificheByDate[dateKey] = [];
        verificheByDate[dateKey].push({ subject: v.subject || '', text: v.args || '', tipo: v.type || '', isVerifica: true });
    });

    let hasAny = false;
    let daySections = '';
    let totalItems = 0;

    for (let i = 0; i < 7; i++) {
        const dayDate = new Date(weekStart);
        dayDate.setDate(weekStart.getDate() + i);
        const dateStr = getLocalDateString(dayDate);
        const isToday = dateStr === todayISO;
        const isTomorrow = (() => { const tm = new Date(); tm.setDate(tm.getDate() + 1); return dateStr === getLocalDateString(tm); })();
        const isPast = dayDate < today && !isToday;

        const dayTasks = getCalendarTasksForDate(dateStr);
        const dayVerifiche = verificheByDate[dateStr] || [];

        if (dayTasks.length === 0 && dayVerifiche.length === 0) continue;
        hasAny = true;
        totalItems += dayTasks.length + dayVerifiche.length;

        const labelText = isToday ? 'OGGI' : isTomorrow ? 'DOMANI' : '';
        const labelColor = isToday ? 'var(--success)' : '#FF9F0A';

        daySections += `
            <div class="asw-day-section">
                <div class="asw-day-header">
                    <div class="asw-date-block">
                        <span class="asw-day-name" style="color:${isToday ? 'var(--success)' : isPast ? 'var(--outline)' : 'var(--on-surface-variant)'};">${dayNames[i]}</span>
                        <span class="asw-day-num" style="color:${isToday ? 'var(--success)' : isPast ? 'var(--outline)' : 'var(--on-surface)'};">${dayDate.getDate()}</span>
                        <span class="asw-month" style="color:${isPast ? 'var(--outline)' : 'var(--on-surface-variant)'};">${monthNames[dayDate.getMonth()]}</span>
                    </div>
                    <div class="asw-separator"></div>
                    ${labelText ? `<span class="asw-label-tag" style="color:${labelColor}; border-color:${labelColor};">${labelText}</span>` : ''}
                </div>
                <div class="asw-tasks-list">
                    ${dayVerifiche.map(v => {
            const abbr = getSubjectAbbrev(v.subject);
            const subjColor = getSubjectColor(v.subject);
            return `
                        <div class="asw-task-card asw-verifica-card">
                            <div class="asw-task-stripe" style="background:#FF9F0A;"></div>
                            <div class="asw-task-body">
                                <div class="asw-task-meta">
                                    <span class="asw-subject-badge" style="color:var(--warning); background:rgba(255,159,10,0.1);">${escapeHtml(abbr)}</span>
                                    <span class="asw-verifica-tag"><i class="ph-bold ph-pencil-simple"></i> ${escapeHtml(normalizeTipoVerifica(v.tipo))}</span>
                                </div>
                                <div class="asw-task-text">${escapeHtml(v.text || v.subject)}</div>
                            </div>
                        </div>`;
        }).join('')}
                    ${dayTasks.map(t => {
            const subjColor = getSubjectColor(t.subject);
            const abbr = getSubjectAbbrev(t.subject);
            const displayText = (t.text || '').replace(/\*/g, '').trim();
            return `
                        <div class="asw-task-card${t.done ? ' asw-task-done' : ''}${isPast && !t.done ? ' asw-task-past' : ''}" onclick="toggleTask('${escapeJsSingleQuote(t.id)}')">
                            <div class="asw-task-stripe" style="background:${t.done ? 'var(--outline-variant)' : subjColor};"></div>
                            <div class="asw-task-body">
                                <div class="asw-task-meta">
                                    <span class="asw-subject-badge" style="color:${t.done ? 'var(--on-surface-variant)' : subjColor}; background:rgba(0,0,0,0.04);">${escapeHtml(abbr)}</span>
                                </div>
                                <div class="asw-task-text" data-task-text="${escapeHtml(t.id)}">${escapeHtml(displayText)}</div>
                            </div>
                            <div class="asw-task-actions">
                                <div class="asw-toggle-btn" data-task-toggle="${t.id}" style="border-color:${t.done ? 'var(--on-surface)' : 'var(--outline-variant)'}; background:${t.done ? 'var(--on-surface)' : 'transparent'};">
                                    ${t.done ? '<i class="ph-bold ph-check" style="font-size:11px; color:#fff;"></i>' : ''}
                                </div>
                                ${isUserGeneratedTaskId(t.id) ? `
                                <button class="asw-delete-btn" onclick="event.stopPropagation(); deleteCalendarTask('${escapeJsSingleQuote(t.id)}');" aria-label="Elimina attività">
                                    <i class="ph-bold ph-trash" style="font-size:11px;"></i>
                                </button>` : ''}
                            </div>
                        </div>`;
        }).join('')}
                </div>
            </div>`;
    }

    if (!hasAny) return '';

    return `<div class="asw-root">
        <div class="asw-header">
            <span class="asw-header-title">// AGENDA SETTIMANALE</span>
            <span class="asw-header-count">${totalItems} ITEM${totalItems !== 1 ? 'S' : ''}</span>
        </div>
        <div class="asw-body">${daySections}</div>
    </div>`;
}

function navigateCalendar(dir) {
    calendarState.weekOffset += dir;
    renderCustomCalendar();
}
function handleDayClick(dateStr) {
    if (typeof renderDayDetailModal === 'function') {
        renderDayDetailModal(dateStr);
    }
}
function renderLogin() {
    const savedSession = (typeof sessionManager !== 'undefined' && sessionManager.load) ? sessionManager.load() : null;
    const hasSession = savedSession && (typeof sessionManager !== 'undefined' && sessionManager.isLoggedIn ? sessionManager.isLoggedIn() : !!savedSession.userName);
    const rawName = (typeof getSafeUserName === 'function') ? getSafeUserName() : (state.user?.name || savedSession?.name || savedSession?.userName || 'Utente');
    const userName = escapeHtml((typeof toDisplayName === 'function') ? toDisplayName(rawName) : rawName);
    const effClass = (typeof getEffectiveUserClass === 'function') ? getEffectiveUserClass() : (state.user?.class || savedSession?.class || '');
    const userClass = escapeHtml(effClass || 'Studente');
    const initials = (rawName || 'U').trim().split(' ').map(function(w){ return w[0]; }).slice(0,2).join('').toUpperCase() || 'U';

    return `
    <div class="view login-view min-h-screen hide-scrollbar"
         style="min-height:100vh;height:100dvh;overflow-y:auto;-webkit-overflow-scrolling:touch;background:var(--background, #0b1326);font-family:'Inter',sans-serif;color:#dae2fd;display:flex;flex-direction:column;justify-content:center;align-items:center;padding:max(env(safe-area-inset-top,0px),32px) 24px max(env(safe-area-inset-bottom,0px),32px);position:relative;">

        <!-- Ambient Glow Spheres (Deep Royal Blue) -->
        <div style="position:fixed;top:0;left:50%;transform:translateX(-50%);width:360px;height:360px;background:radial-gradient(circle,rgba(37,99,235,0.22) 0%,rgba(29,78,216,0.08) 50%,transparent 70%);filter:blur(60px);pointer-events:none;z-index:0;"></div>
        <div style="position:fixed;bottom:0;right:0;width:280px;height:280px;background:radial-gradient(circle,rgba(41,151,255,0.12) 0%,transparent 70%);filter:blur(50px);pointer-events:none;z-index:0;"></div>

        <div style="position:relative;z-index:1;width:100%;max-width:400px;display:flex;flex-direction:column;align-items:center;text-align:center;">

            <!-- App Icon Tile with Specular Rim & Glowing Shadow -->
            <div style="width:84px;height:84px;border-radius:26px;
                        background:rgba(23,31,51,0.85);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);
                        border:1px solid rgba(182,196,255,0.2);border-top:1px solid rgba(255,255,255,0.4);
                        display:flex;align-items:center;justify-content:center;margin-bottom:20px;
                        box-shadow:0 16px 36px -8px rgba(6,14,32,0.8), 0 0 24px rgba(37,99,235,0.3);
                        position:relative;overflow:hidden;">
                <img src="gandhi-diary-icon-192.png" alt="Gandhi Diary"
                     onerror="this.src='gandhi-diary-icon-512.png'"
                     style="width:58px;height:58px;border-radius:18px;object-fit:cover;">
            </div>

            <!-- Header Titles -->
            <div style="display:inline-flex;align-items:center;gap:6px;background:rgba(37,99,235,0.18);border:0.5px solid rgba(182,196,255,0.25);padding:3px 10px;border-radius:999px;margin-bottom:10px;">
                <span style="width:6px;height:6px;border-radius:50%;background:#30d158;box-shadow:0 0 6px #30d158;"></span>
                <span style="font-size:11px;font-weight:800;color:#b6c4ff;letter-spacing:0.06em;text-transform:uppercase;">LICEO GANDHI · DIARIO DIGITALE</span>
            </div>

            <h1 style="font-size:32px;font-weight:900;color:#ffffff;letter-spacing:-0.03em;margin:0 0 8px;line-height:1.15;">
                Gandhi Diary
            </h1>
            <p style="font-size:14px;font-weight:500;color:#c4c5d6;line-height:1.5;margin:0 0 24px;max-width:320px;">
                Il compagno di studio moderno, veloce e intelligente per gli studenti del Liceo Gandhi.
            </p>

            <!-- Feature Glass Bento Rows -->
            <div style="width:100%;display:flex;flex-direction:column;gap:8px;margin-bottom:28px;">
                <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:16px;background:rgba(23,31,51,0.65);backdrop-filter:blur(20px);border:1px solid rgba(182,196,255,0.12);text-align:left;">
                    <div style="width:34px;height:34px;border-radius:10px;background:rgba(37,99,235,0.18);border:1px solid rgba(182,196,255,0.25);display:flex;align-items:center;justify-content:center;color:#2997ff;flex-shrink:0;">
                        <i class="ph-bold ph-lightning" style="font-size:18px;"></i>
                    </div>
                    <div style="min-width:0;">
                        <div style="font-size:13px;font-weight:700;color:#ffffff;">Sincronizzazione DidUP Istantanea</div>
                        <div style="font-size:11px;color:#8e909f;font-weight:500;">Voti, compiti, verifiche e assenze sempre aggiornati</div>
                    </div>
                </div>

                <div style="display:flex;align-items:center;gap:12px;padding:10px 14px;border-radius:16px;background:rgba(23,31,51,0.65);backdrop-filter:blur(20px);border:1px solid rgba(182,196,255,0.12);text-align:left;">
                    <div style="width:34px;height:34px;border-radius:10px;background:rgba(48,209,88,0.16);border:1px solid rgba(48,209,88,0.3);display:flex;align-items:center;justify-content:center;color:#30d158;flex-shrink:0;">
                        <i class="ph-bold ph-calendar-check" style="font-size:18px;"></i>
                    </div>
                    <div style="min-width:0;">
                        <div style="font-size:13px;font-weight:700;color:#ffffff;">Google Calendar Cloud Sync</div>
                        <div style="font-size:11px;color:#8e909f;font-weight:500;">Compiti, verifiche e assenze sincronizzati nel calendario</div>
                    </div>
                </div>
            </div>

            <!-- Action Area -->
            <div style="width:100%;display:flex;flex-direction:column;gap:12px;">
                ${hasSession ? `
                <!-- Resume Session Card -->
                <div style="background:rgba(23,31,51,0.85);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);
                            border:1px solid rgba(182,196,255,0.16);border-top:1px solid rgba(255,255,255,0.3);
                            border-radius:24px;padding:18px 18px 16px;box-shadow:0 12px 32px -8px rgba(6,14,32,0.6);margin-bottom:6px;">
                    <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;text-align:left;">
                        <div style="width:46px;height:46px;border-radius:14px;background:linear-gradient(135deg,#1d4ed8,#2563eb);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:900;color:#ffffff;flex-shrink:0;box-shadow:0 4px 14px rgba(37,99,235,0.4);">
                            ${initials}
                        </div>
                        <div style="min-width:0;flex:1;">
                            <div style="font-size:11px;font-weight:700;color:#8e909f;text-transform:uppercase;letter-spacing:0.06em;">Sessione Salvata</div>
                            <div style="font-size:16px;font-weight:800;color:#ffffff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${userName}</div>
                            <div style="font-size:11.5px;font-weight:600;color:#b6c4ff;">${userClass}</div>
                        </div>
                    </div>
                    <div style="display:flex;gap:8px;">
                        <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('medium');navigate('home')"
                            style="flex:1;height:46px;border-radius:14px;border:none;cursor:pointer;
                                   background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%);color:#ffffff;
                                   font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;
                                   box-shadow:0 4px 16px rgba(37,99,235,0.45);transition:transform 0.12s ease;"
                            ontouchstart="this.style.transform='scale(0.97)'"
                            ontouchend="this.style.transform='scale(1)'">
                            Continua <i class="ph-bold ph-arrow-right" style="font-size:16px;"></i>
                        </button>
                        <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('light');window.openArgoLogin()"
                            style="height:46px;padding:0 14px;border-radius:14px;border:1px solid rgba(255,255,255,0.14);cursor:pointer;
                                   background:rgba(255,255,255,0.06);color:#dae2fd;font-size:13px;font-weight:700;white-space:nowrap;transition:transform 0.12s ease;"
                            ontouchstart="this.style.transform='scale(0.97)'"
                            ontouchend="this.style.transform='scale(1)'">
                            Altro Account
                        </button>
                    </div>
                </div>
                ` : `
                <!-- Main Login Button -->
                <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('medium');window.openArgoLogin()"
                    style="width:100%;height:54px;border-radius:18px;border:none;cursor:pointer;
                           background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 60%,#3b82f6 100%);color:#ffffff;
                           font-size:16px;font-weight:800;font-family:'Inter',sans-serif;
                           display:flex;align-items:center;justify-content:center;gap:10px;
                           box-shadow:0 8px 28px -6px rgba(37,99,235,0.6), inset 0 1px 1px rgba(255,255,255,0.35);
                           transition:transform 0.15s ease;"
                    ontouchstart="this.style.transform='scale(0.97)'"
                    ontouchend="this.style.transform='scale(1)'">
                    <i class="ph-bold ph-sign-in" style="font-size:20px;"></i>
                    Accedi con DidUP
                </button>
                `}
            </div>

            <!-- Security Footer Note -->
            <div style="display:inline-flex;align-items:center;justify-content:center;gap:7px;margin-top:20px;color:#8e909f;font-size:11.5px;font-weight:600;line-height:1;text-align:center;">
                <i class="ph-fill ph-shield-check" style="font-size:15px;color:#30d158;display:inline-block;vertical-align:middle;flex-shrink:0;"></i>
                <span style="display:inline-block;vertical-align:middle;line-height:1.2;">Crittografia end-to-end · Credenziali protette sul dispositivo</span>
            </div>

        </div>
    </div>
    `;
}
// ================================================================
// WIDGET PRINCIPALE — carosello a 3 slide (swipe touch/mouse)
// ================================================================
function gcInitMediaWidgetSwipe() {
    const widget = document.getElementById('home-media-widget');
    const track = document.getElementById('home-media-track');
    if (!widget || !track) return;

    let currentSlide = 0;
    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;
    let isDragging = false;
    let isHorizontal = null;
    const totalSlides = track.children.length;

    function goToSlide(index) {
        currentSlide = Math.max(0, Math.min(totalSlides - 1, index));
        track.style.transform = `translateX(-${currentSlide * 100}%)`;
        for (let i = 0; i < totalSlides; i++) {
            const dot = document.getElementById(`home-media-dot${i}`);
            if (!dot) continue;
            if (i === currentSlide) {
                dot.style.width = '18px';
                dot.style.background = '#ffffff';
                dot.style.opacity = '1';
            } else {
                dot.style.width = '5px';
                dot.style.background = 'rgba(255,255,255,0.3)';
                dot.style.opacity = '0.6';
            }
        }
    }

    function handleSwipe() {
        if (currentX !== 0 && isHorizontal) {
            const diffX = startX - currentX;
            if (Math.abs(diffX) > 35) {
                if (diffX > 0 && currentSlide < totalSlides - 1) {
                    goToSlide(currentSlide + 1);
                } else if (diffX < 0 && currentSlide > 0) {
                    goToSlide(currentSlide - 1);
                }
            }
        }
        startX = 0;
        startY = 0;
        currentX = 0;
        currentY = 0;
        isHorizontal = null;
    }

    widget.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
        startY = e.touches[0].clientY;
        currentX = startX;
        currentY = startY;
        isDragging = true;
        isHorizontal = null;
    }, { passive: true });

    widget.addEventListener('touchmove', (e) => {
        if (!isDragging) return;
        currentX = e.touches[0].clientX;
        currentY = e.touches[0].clientY;
        if (isHorizontal === null) {
            const dx = Math.abs(currentX - startX);
            const dy = Math.abs(currentY - startY);
            if (dx > 8 || dy > 8) {
                isHorizontal = dx > dy;
            }
        }
    }, { passive: true });

    widget.addEventListener('touchend', () => {
        if (!isDragging) return;
        isDragging = false;
        handleSwipe();
    });

    widget.addEventListener('mousedown', (e) => {
        startX = e.clientX;
        currentX = startX;
        isDragging = true;
        isHorizontal = true;
    });

    widget.addEventListener('mousemove', (e) => {
        if (!isDragging) return;
        currentX = e.clientX;
    });

    widget.addEventListener('mouseup', () => {
        if (!isDragging) return;
        isDragging = false;
        handleSwipe();
    });

    widget.addEventListener('mouseleave', () => {
        if (isDragging) {
            isDragging = false;
            handleSwipe();
        }
    });

    // Espone l'istanza corrente ai pulsanti-dot
    window._gcMediaGoToSlideImpl = goToSlide;
}
window.gcMediaGoToSlide = function (index) {
    if (typeof window._gcMediaGoToSlideImpl === 'function') window._gcMediaGoToSlideImpl(index);
};

// ================================================================
// G-CONNECT — renderHome() PATCH v7
// ================================================================
// Multi-widget dashboard with swipeable interface

function renderHome() {
    // Register the carousel scroll handler
    window.handleCarouselScroll = function(el) {
        const scrollLeft = el.scrollLeft;
        const width = el.clientWidth;
        const index = Math.round(scrollLeft / width);
        const dots = document.querySelectorAll('.carousel-dot');
        const cs = getComputedStyle(document.documentElement);
        const activeBg = cs.getPropertyValue('--primary').trim() || '#0250C5';
        const inactiveBg = cs.getPropertyValue('--surface-container-high').trim() || '#CBD5E1';
        dots.forEach((dot, idx) => {
            if (idx === index) {
                dot.style.width = '20px';
                dot.style.height = '6px';
                dot.style.background = activeBg;
            } else {
                dot.style.width = '6px';
                dot.style.height = '6px';
                dot.style.background = inactiveBg;
            }
        });
    };

    // 1. Recupero dei dati reali dal backend/stato globale
    const isInitialLoad = !state.lastSync && (!state.tasks || state.tasks.length === 0) && (!state.voti || state.voti.length === 0);
    const currentSchoolYearKey = (typeof getCurrentSchoolYearKey === 'function') ? getCurrentSchoolYearKey() : '2026/27';
    const currentYearVotes = (typeof getVotesForSchoolYear === 'function') ? getVotesForSchoolYear(currentSchoolYearKey) : (state.voti || []);
    const trendSummary = getGradeMonthlyTrendSummary(currentYearVotes);
    const media = trendSummary.media !== null ? trendSummary.media : (parseFloat(calcolaMedia(currentYearVotes)) || 0);
    const hasHomeMedia = trendSummary.media !== null && Number.isFinite(trendSummary.media) && currentYearVotes.length > 0;
    const diffStr = trendSummary.diffStr;
    const isPositive = trendSummary.isPositive;
    const assenze = state.assenzeData || {};
    const verifiche = state.manualVerifiche || [];
    
    // 2. Dati Assenze (monte ore annuale standard ~990h)
    const oreAssenzaTotali = typeof assenze.oreAssenzaTotali === 'number' ? assenze.oreAssenzaTotali : 0;
    const ritardiTotali = typeof assenze.totaleRitardi === 'number' ? assenze.totaleRitardi : 0;
    const usciteTotali = typeof assenze.totaleUscite === 'number' ? assenze.totaleUscite : 0;
    const assenzeGiorni = typeof assenze.totaleAssenze === 'number' ? assenze.totaleAssenze : 0;

    // 3. Calcolo sicuro delle date locali
    const today = new Date();
    const todayISO = getLocalDateString(today);

    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = getLocalDateString(tomorrow);

    // Helper: rilevamento affidabile Verifiche vs Compiti (come nel Planner)
    const isVerificaItem = (item) => {
        if (!item) return false;
        if (item.isExam) return true;
        const typeStr = String(item.type || item.tipo || '').toLowerCase();
        if (typeStr.includes('verifica') || typeStr.includes('orale') || typeStr.includes('pratica') || typeStr.includes('test') || typeStr.includes('esame')) return true;
        const textStr = `${item.text || ''} ${item.desc || ''} ${item.descrizione || ''} ${item.title || ''} ${item.subject || ''} ${item.materia || ''}`.toLowerCase();
        return /verifica|interrogazione|test|esame|simulazione/i.test(textStr);
    };

    // Filtriamo i dati per Oggi (Domenica / Odierni)
    const todayVerifiche = (state.verifiche || []).filter(v => v.data === todayISO);
    const todayHomework = (state.tasks || []).filter(t => t.due_date === todayISO && t.subject !== 'QUEST');
    const seenToday = new Set();
    const allTodayItems = [];
    todayVerifiche.forEach(v => {
        const key = `${v.id || ''}||${v.materia || v.subject || ''}||${v.text || ''}`;
        if (!seenToday.has(key)) {
            seenToday.add(key);
            allTodayItems.push({
                id: v.id,
                isExam: true,
                subject: v.materia || v.subject || 'Materia',
                desc: v.text || v.descrizione || 'Verifica in programma',
                done: false
            });
        }
    });
    todayHomework.forEach(h => {
        const isExam = isVerificaItem(h);
        const key = `${h.id || ''}||${h.subject || ''}||${h.text || ''}`;
        if (!seenToday.has(key)) {
            seenToday.add(key);
            allTodayItems.push({
                id: h.id,
                isExam,
                subject: h.subject || h.materia || 'Materia',
                desc: h.text || h.title || '',
                done: !!h.done
            });
        }
    });

    // Filtriamo i dati reali per Domani
    const tomorrowVerifiche = (state.verifiche || []).filter(v => v.data === tomorrowISO);
    const tomorrowHomework = (state.tasks || []).filter(t => t.due_date === tomorrowISO && t.subject !== 'QUEST');
    const seenTomorrow = new Set();
    const allTomorrowItems = [];
    tomorrowVerifiche.forEach(v => {
        const key = `${v.id || ''}||${v.materia || v.subject || ''}||${v.text || ''}`;
        if (!seenTomorrow.has(key)) {
            seenTomorrow.add(key);
            allTomorrowItems.push({
                id: v.id,
                isExam: true,
                subject: v.materia || v.subject || 'Materia',
                desc: v.text || v.descrizione || 'Verifica in programma',
                done: false
            });
        }
    });
    tomorrowHomework.forEach(h => {
        const isExam = isVerificaItem(h);
        const key = `${h.id || ''}||${h.subject || ''}||${h.text || ''}`;
        if (!seenTomorrow.has(key)) {
            seenTomorrow.add(key);
            allTomorrowItems.push({
                id: h.id,
                isExam,
                subject: h.subject || h.materia || 'Materia',
                desc: h.text || h.title || '',
                done: !!h.done
            });
        }
    });

    // 4. Prossima Verifica Imminente (per il 3° Widget del carosello)
    const argoUpcoming = (state.verifiche || [])
        .filter(v => v.data && v.data >= todayISO)
        .map(v => ({ materia: v.materia || v.subject || '', data: v.data, text: v.text || v.descrizione || '', tipo: v.tipo || '', source: 'argo' }));
    const manualUpcoming = (state.manualVerifiche || [])
        .filter(v => !v.done && v.date && v.date >= todayISO)
        .map(v => ({ materia: v.subject || '', data: v.date, text: v.args || '', tipo: v.type || '', source: 'manual', id: v.id }));
    
    const seenVerifiche = new Set();
    const upcomingVerifiche = [...argoUpcoming, ...manualUpcoming]
        .filter(v => {
            const key = `${v.data}||${v.materia.toLowerCase()}`;
            if (seenVerifiche.has(key)) return false;
            seenVerifiche.add(key);
            return true;
        })
        .sort((a, b) => a.data.localeCompare(b.data));

    const nextVerifica = upcomingVerifiche[0];

    let daysDiff = 0;
    let countdownText = '';
    let urgencyLabel = '';
    let urgencyColor = '';
    let progressWidth = 100;

    if (nextVerifica) {
        const examDate = parseLocalDate(nextVerifica.data);
        const todayZero = new Date(today);
        todayZero.setHours(0, 0, 0, 0);
        const timeDiff = examDate.getTime() - todayZero.getTime();
        daysDiff = Math.ceil(timeDiff / (1000 * 3600 * 24));

        if (daysDiff < 0) countdownText = 'Superata';
        else if (daysDiff === 0) countdownText = 'Oggi';
        else if (daysDiff === 1) countdownText = 'Domani';
        else countdownText = `${daysDiff} gg`;

        if (daysDiff <= 2) {
            urgencyLabel = 'HARD';
            urgencyColor = 'color:var(--error); background:var(--error-container); border:1px solid var(--outline-variant);';
        } else if (daysDiff <= 5) {
            urgencyLabel = 'MEDIUM';
            urgencyColor = 'color:var(--warning); background:var(--warning-container); border:1px solid var(--outline-variant);';
        } else {
            urgencyLabel = 'EASY';
            urgencyColor = 'color:var(--success); background:var(--success-container); border:1px solid var(--outline-variant);';
        }

        progressWidth = Math.max(0, Math.min(100, ((10 - daysDiff) / 10) * 100));
    }

    // 5. Card Renderer differenziato per Compiti vs Verifiche (stile Planner)
    const renderHomeItemCard = (item, defaultTimeLabel) => {
        const isExam = item.isExam;
        const theme = (typeof getSubjectTheme === 'function') ? getSubjectTheme(item.subject) : { color: '#2997ff', icon: 'ph-book-open' };
        const cardBg = isExam
            ? 'linear-gradient(135deg, rgba(239,68,68,0.22) 0%, rgba(20,31,54,0.92) 100%)'
            : 'rgba(20,31,54,0.78)';
        const cardBorder = isExam
            ? '1px solid rgba(239,68,68,0.45)'
            : '0.5px solid rgba(255,255,255,0.12)';
        const cardShadow = isExam
            ? 'box-shadow:0 0 22px rgba(239,68,68,0.22);'
            : '';
        const accentColor = isExam ? '#ff453a' : '#2997ff';
        const iconName = isExam ? 'ph-exam' : 'ph-book-open';
        const iconBg = isExam ? 'rgba(239,68,68,0.25)' : 'rgba(41,151,255,0.16)';
        const iconColor = isExam ? '#ffb4ab' : '#2997ff';
        const iconBorder = isExam ? 'rgba(239,68,68,0.45)' : 'rgba(41,151,255,0.32)';

        const badgeHtml = isExam
            ? `<span style="background:rgba(239,68,68,0.28);color:#ffb4ab;font-size:9.5px;font-weight:800;padding:3px 9px;border-radius:999px;letter-spacing:0.05em;border:1px solid rgba(239,68,68,0.45);display:inline-flex;align-items:center;gap:4px;"><i class="ph-fill ph-warning" style="font-size:10px;"></i> VERIFICA</span>`
            : `<span style="background:rgba(41,151,255,0.16);color:#2997ff;font-size:9.5px;font-weight:800;padding:3px 9px;border-radius:999px;letter-spacing:0.05em;border:0.5px solid rgba(41,151,255,0.35);display:inline-flex;align-items:center;gap:4px;"><i class="ph-fill ph-check-square" style="font-size:10px;"></i> COMPITO</span>`;

        const timeStr = isExam ? '09:00 - 12:00' : (defaultTimeLabel || 'In programma');
        const doneStyle = item.done ? 'opacity:0.55;' : '';
        const doneText = item.done ? 'text-decoration:line-through;' : '';

        return `
        <div class="home-task-card" onclick="openTaskDetailModal('${escapeJsSingleQuote(item.id)}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'" style="
            background:${cardBg};
            backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);
            border:${cardBorder};border-top:1px solid rgba(255,255,255,0.25);
            border-radius:22px;padding:16px 18px;margin-bottom:10px;
            position:relative;overflow:hidden;cursor:pointer;
            transition:transform 0.15s ease;${cardShadow}${doneStyle}
        ">
            <!-- Accento laterale -->
            <div style="position:absolute;left:0;top:15%;height:70%;width:${isExam ? '4px' : '3.5px'};background:${accentColor};border-radius:0 4px 4px 0;"></div>

            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;padding-left:8px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:38px;height:38px;border-radius:12px;background:${iconBg};border:0.5px solid ${iconBorder};display:flex;align-items:center;justify-content:center;color:${iconColor};flex-shrink:0;">
                        <i class="ph-bold ${iconName}" style="font-size:19px;"></i>
                    </div>
                    <div>
                        <span style="font-size:10.5px;font-weight:800;letter-spacing:0.04em;text-transform:uppercase;color:${isExam ? '#ffb4ab' : theme.color};">${escapeHtml(item.subject)}</span>
                    </div>
                </div>
                <div>
                    ${badgeHtml}
                </div>
            </div>

            <h4 style="font-size:14.5px;font-weight:700;color:#ffffff;margin:0 0 4px 8px;line-height:1.3;${doneText}">${escapeHtml(item.desc || item.subject)}</h4>

            <div style="display:flex;align-items:center;justify-content:space-between;margin-top:8px;padding-left:8px;">
                <div style="display:flex;align-items:center;color:rgba(255,255,255,0.55);font-size:11.5px;">
                    <i class="ph ph-clock" style="font-size:13px;margin-right:5px;"></i>
                    <span style="font-weight:500;">${timeStr}</span>
                </div>
                <span style="font-size:11px;font-weight:600;color:rgba(182,196,255,0.7);display:flex;align-items:center;gap:2px;">
                    Dettagli <i class="ph-bold ph-caret-right" style="font-size:11px;"></i>
                </span>
            </div>
        </div>`;
    };

    const htmlOggi = allTodayItems.length > 0
        ? allTodayItems.map(item => renderHomeItemCard(item, 'Oggi')).join('')
        : `<div class="empty-state-card" style="text-align:center;padding:24px 16px;background:rgba(20,31,54,0.78);backdrop-filter:blur(25px);border:0.5px solid rgba(255,255,255,0.12);border-radius:22px;color:rgba(255,255,255,0.5);font-size:13px;font-style:italic;">Nessun compito o verifica per oggi.</div>`;

    const htmlDomani = allTomorrowItems.length > 0
        ? allTomorrowItems.map(item => renderHomeItemCard(item, 'Scadenza domani')).join('')
        : `<div class="empty-state-card" style="text-align:center;padding:24px 16px;background:rgba(20,31,54,0.78);backdrop-filter:blur(25px);border:0.5px solid rgba(255,255,255,0.12);border-radius:22px;color:rgba(255,255,255,0.5);font-size:13px;font-style:italic;">Nessun impegno programmato per domani.</div>`;

    // Inizializzazione icone Lucide subito dopo l'inserimento nel DOM
    setTimeout(() => { if (window.lucide) lucide.createIcons(); }, 80);
    setTimeout(() => { if (typeof gcInitMediaWidgetSwipe === 'function') gcInitMediaWidgetSwipe(); }, 80);

    // Avatar utente — screenshot style
    const userPhoto = state.userPhoto || '';
    const avatarHtml = userPhoto
        ? `<img src="${escapeHtml(userPhoto)}" style="width:44px;height:44px;border-radius:50%;object-fit:cover;cursor:pointer;border:1px solid rgba(255,255,255,0.2);" onclick="navigate('profile')" alt="Profilo">`
        : `<div style="width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;cursor:pointer;" onclick="navigate('profile')">
            <i class="ph ph-user" style="font-size:22px;color:#ffffff;"></i>
           </div>`;

    // 6a. Conteggio novità e notifiche veritiere in data odierna
    const _notifReport = (typeof window.getComprehensiveNotificationData === 'function')
        ? window.getComprehensiveNotificationData()
        : { todayCount: 0, todayItems: [], upcomingItems: [], recentItems: [] };
    const _homeNotifCount = _notifReport.todayCount;
    const _homeNotifLabel = _homeNotifCount === 0
        ? 'Nessuna novità oggi'
        : (_homeNotifCount === 1 ? '1 novità oggi' : `${_homeNotifCount} novità oggi`);

    // 6c. Dati sintetici e precisi per il CAROSELLO STUDENT HUB (Overview a 3 slide)
    const _mediaColor = media >= 8 ? '#30d158' : media >= 7 ? '#64d2ff' : media >= 6 ? '#ff9f0a' : media > 0 ? '#ff453a' : '#8e909f';

    // Calcolo % Ore di Assenza rispetto al monte ore totale annuale (~990h, limite max 25% = 248h)
    const _monteOreTotale = 990;
    const _limiteOreMax = Math.round(_monteOreTotale * 0.25);
    const _assenzePctTotale = ((oreAssenzaTotali / _monteOreTotale) * 100).toFixed(1);
    const _assenzeStatusColor = oreAssenzaTotali > 180 ? '#ff453a' : (oreAssenzaTotali > 80 ? '#ff9f0a' : '#30d158');
    const _assenzeStatusBg = oreAssenzaTotali > 180 ? 'rgba(255,69,58,0.15)' : (oreAssenzaTotali > 80 ? 'rgba(255,159,10,0.15)' : 'rgba(48,209,88,0.15)');

    // Dati per "Quanto Manca A..." (Slide 2)
    const _countdownsData = (typeof window.getSchoolCountdowns === 'function') ? window.getSchoolCountdowns() : null;
    const _nearestMilestone = _countdownsData ? _countdownsData.nearest : {
        title: 'Vacanze di Natale',
        emoji: '🎄',
        daysLeft: 115,
        badgeText: '115 giorni',
        dateFormatted: '23 Dic'
    };

    // Dati per Mood Giornaliero (Slide 3)
    const _dailyMoodsMap = (typeof window.getDailyMoods === 'function') ? window.getDailyMoods() : {};
    const _todayMoodEntry = _dailyMoodsMap[todayISO] || null;

    // Saluto time-aware
    const _hour = today.getHours();
    const _greetWord = _hour < 6 ? 'Buonanotte' : _hour < 12 ? 'Buongiorno' : _hour < 18 ? 'Buon pomeriggio' : 'Buonasera';

    // 7. WIDGET OVERVIEW — Apple Liquid Glass Swipeable Carousel (3 Slide)
    return `
    <main class="view-fullbleed min-h-screen pb-32 pt-2 font-sans text-[#dae2fd] antialiased overflow-y-auto hide-scrollbar" style="background:var(--background, #0b1326);">

        <div style="padding:0;">

            <!-- HEADER (iOS HIG Large Title): Overview + Notifiche + Avatar -->
            <header class="ios-header-wrapper" style="display:flex;justify-content:space-between;align-items:flex-end;padding:max(env(safe-area-inset-top,0px),24px) 20px 14px 20px;">
                <div>
                    <div class="ios-sub-title" style="color:rgba(255,255,255,0.5);font-weight:700;letter-spacing:0.06em;font-size:11px;">PANORAMICA</div>
                    <h1 class="ios-large-title" style="color:#ffffff;font-weight:800;font-size:32px;letter-spacing:-0.03em;margin:2px 0 0;">Overview</h1>
                </div>
                <div style="display:flex;align-items:center;gap:10px;">
                    <button id="header-notif-btn" onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('light');openTodayNotifications();" style="position:relative;width:44px;height:44px;border-radius:50%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.14);display:flex;align-items:center;justify-content:center;color:#ffffff;cursor:pointer;transition:transform 0.15s ease, background 0.15s ease;" ontouchstart="this.style.transform='scale(0.92)'" ontouchend="this.style.transform='scale(1)'" aria-label="Notifiche">
                        <i class="ph-bold ph-bell" style="font-size:20px;color:#dae2fd;"></i>
                        ${_homeNotifCount > 0 ? `
                            <span style="position:absolute;top:5px;right:5px;min-width:16px;height:16px;border-radius:999px;background:#2997ff;border:2px solid #0b1326;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:800;color:#ffffff;padding:0 3px;box-shadow:0 0 8px rgba(41,151,255,0.8);">
                                ${_homeNotifCount > 9 ? '9+' : _homeNotifCount}
                            </span>
                        ` : ''}
                    </button>
                    ${avatarHtml}
                </div>
            </header>

            <div style="margin-bottom: 16px; padding: 0 20px;">
                <!-- WIDGET PRINCIPALE — Apple Liquid Glass Carousel a 3 Slide -->
                <div id="home-media-widget" style="
                    background: linear-gradient(150deg, rgba(22,34,58,0.92) 0%, rgba(10,16,30,0.96) 100%);
                    backdrop-filter: blur(40px) saturate(210%);-webkit-backdrop-filter: blur(40px) saturate(210%);
                    border: 0.5px solid rgba(255,255,255,0.14);
                    border-top: 1px solid rgba(255,255,255,0.30);
                    border-radius: 28px;
                    position: relative;
                    overflow: hidden;
                    box-shadow: 0 16px 40px -10px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.18);
                    user-select: none;
                ">
                    <!-- Glow Spheres Liquid Glass (Corner Anchored - Deep Indigo & Azure) -->
                    <div style="position:absolute;top:0;right:0;width:170px;height:170px;transform:translate(35%,-35%);background:radial-gradient(circle,rgba(41,151,255,0.24) 0%,rgba(56,189,248,0.10) 50%,transparent 70%);pointer-events:none;filter:blur(30px);border-radius:9999px;"></div>
                    <div style="position:absolute;bottom:0;left:0;width:170px;height:170px;transform:translate(-35%,35%);background:radial-gradient(circle,rgba(99,102,241,0.22) 0%,rgba(41,151,255,0.12) 50%,transparent 70%);pointer-events:none;filter:blur(30px);border-radius:9999px;"></div>

                    <!-- Carousel Track -->
                    <div id="home-media-track" style="display:flex;width:100%;transition:transform 0.4s cubic-bezier(0.16,1,0.3,1);will-change:transform;">

                        <!-- ════════ SLIDE 1: QUADRO GENERALE & MEDIA (Spazioso Saluto Hero) ════════ -->
                        <div style="width:100%;min-width:100%;max-width:100%;flex-shrink:0;box-sizing:border-box;padding:20px 20px 16px 20px;display:flex;flex-direction:column;justify-content:space-between;min-height:226px;">
                            <!-- Ampio Saluto Hero -->
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
                                <div>
                                    <div style="display:flex;align-items:center;gap:6px;">
                                        <span style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:6px;background:rgba(41,151,255,0.2);color:#2997ff;font-size:11px;">
                                            <i class="ph-fill ph-sparkle"></i>
                                        </span>
                                        <span style="font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#2997ff;">QUADRO GENERALE</span>
                                    </div>
                                    <h2 style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;margin:4px 0 0;line-height:1.2;font-family:'Inter',sans-serif;">
                                        ${_greetWord}, ${toDisplayName(getSafeUserName())}
                                    </h2>
                                    <p style="font-size:12px;font-weight:500;color:rgba(255,255,255,0.55);margin:2px 0 0;">
                                        ${today.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })}
                                    </p>
                                </div>
                                <span style="
                                    font-size:10.5px;font-weight:700;color:rgba(255,255,255,0.7);
                                    background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.12);
                                    padding:4px 10px;border-radius:999px;backdrop-filter:blur(10px);white-space:nowrap;
                                ">
                                    A.S. 2026/27
                                </span>
                            </div>

                            <!-- 3 Bento Badges (Media, Assenze %, Prossima Verifica) -->
                            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;">
                                <!-- 1. Media -->
                                <div onclick="navigate('voti')" style="
                                    background:rgba(255,255,255,0.04);
                                    border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);
                                    border-radius:16px;padding:10px 9px;cursor:pointer;
                                    display:flex;flex-direction:column;justify-content:space-between;min-height:86px;
                                    transition:transform 0.15s ease;
                                " ontouchstart="this.style.transform='scale(0.96)'" ontouchend="this.style.transform='scale(1)'">
                                    <div style="display:flex;align-items:center;justify-content:space-between;">
                                        <span style="font-size:8.5px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.6);">MEDIA</span>
                                        <i class="ph-bold ph-chart-line-up" style="font-size:11px;color:${_mediaColor};"></i>
                                    </div>
                                    <div style="font-size:22px;font-weight:900;color:${_mediaColor};font-variant-numeric:tabular-nums;line-height:1;letter-spacing:-0.03em;margin:3px 0 1px;">
                                        ${!hasHomeMedia ? '—' : media.toFixed(2)}
                                    </div>
                                    <span style="font-size:9px;font-weight:800;color:${hasHomeMedia ? (isPositive ? '#30d158' : '#ff453a') : '#2997ff'};background:${hasHomeMedia ? (isPositive ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)') : 'rgba(41,151,255,0.15)'};padding:1px 5px;border-radius:999px;display:inline-flex;align-items:center;gap:2px;width:fit-content;white-space:nowrap;">
                                        <i class="ph-bold ${hasHomeMedia ? (isPositive ? 'ph-trend-up' : 'ph-trend-down') : 'ph-sparkle'}" style="font-size:8px;"></i>${hasHomeMedia && diffStr ? diffStr : 'Nuovo A.S.'}
                                    </span>
                                </div>

                                <!-- 2. Assenze % -->
                                <div onclick="mostraAssenzeModal()" style="
                                    background:rgba(255,255,255,0.04);
                                    border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);
                                    border-radius:16px;padding:10px 9px;cursor:pointer;
                                    display:flex;flex-direction:column;justify-content:space-between;min-height:86px;
                                    transition:transform 0.15s ease;
                                " ontouchstart="this.style.transform='scale(0.96)'" ontouchend="this.style.transform='scale(1)'">
                                    <div style="display:flex;align-items:center;justify-content:space-between;">
                                        <span style="font-size:8.5px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.6);">ASSENZE</span>
                                        <i class="ph-bold ph-calendar-x" style="font-size:11px;color:${_assenzeStatusColor};"></i>
                                    </div>
                                    <div style="font-size:20px;font-weight:900;color:${_assenzeStatusColor};font-variant-numeric:tabular-nums;line-height:1;letter-spacing:-0.03em;margin:3px 0 1px;">
                                        ${_assenzePctTotale}%
                                    </div>
                                    <span style="font-size:8.5px;font-weight:700;color:${_assenzeStatusColor};background:${_assenzeStatusBg};padding:1px 5px;border-radius:999px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:fit-content;" title="Monte ore annuale: 990h (limite 25% = 248h)">
                                        ${oreAssenzaTotali}h / 990h
                                    </span>
                                </div>

                                <!-- 3. Prossima Verifica -->
                                <div onclick="navigate('planner')" style="
                                    background:rgba(255,255,255,0.04);
                                    border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);
                                    border-radius:16px;padding:10px 9px;cursor:pointer;
                                    display:flex;flex-direction:column;justify-content:space-between;min-height:86px;
                                    transition:transform 0.15s ease;
                                " ontouchstart="this.style.transform='scale(0.96)'" ontouchend="this.style.transform='scale(1)'">
                                    <div style="display:flex;align-items:center;justify-content:space-between;">
                                        <span style="font-size:8.5px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.6);">VERIFICA</span>
                                        <i class="ph-bold ph-exam" style="font-size:11px;color:#ff453a;"></i>
                                    </div>
                                    <div style="font-size:12px;font-weight:800;color:#ffffff;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:3px 0 1px;">
                                        ${nextVerifica ? escapeHtml(nextVerifica.materia) : 'Nessuna 🎉'}
                                    </div>
                                    <span style="font-size:8.5px;font-weight:800;color:${nextVerifica ? (daysDiff <= 2 ? '#ff453a' : '#ff9f0a') : '#30d158'};background:${nextVerifica ? (daysDiff <= 2 ? 'rgba(255,69,58,0.18)' : 'rgba(255,159,10,0.18)') : 'rgba(48,209,88,0.15)'};padding:1px 5px;border-radius:999px;white-space:nowrap;width:fit-content;">
                                        ${nextVerifica ? countdownText : 'Libero'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        <!-- ════════ SLIDE 2: QUANTO MANCA A... (Traguardi Scolastici) ════════ -->
                        <div onclick="window.openSchoolCountdownsModal()" style="width:100%;min-width:100%;max-width:100%;flex-shrink:0;box-sizing:border-box;padding:20px 20px 16px 20px;display:flex;flex-direction:column;justify-content:space-between;min-height:226px;cursor:pointer;">
                            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:0.5px solid rgba(255,255,255,0.08);padding-bottom:10px;">
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <span style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:6px;background:rgba(99,102,241,0.22);color:#818cf8;font-size:11px;">
                                        <i class="ph-fill ph-hourglass-high"></i>
                                    </span>
                                    <span style="font-size:10.5px;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:#818cf8;">QUANTO MANCA A...</span>
                                </div>
                                <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);">
                                    ✨ Prossima tappa
                                </span>
                            </div>

                            <div style="text-align:center;margin:2px 0;">
                                <h3 style="font-size:16px;font-weight:800;color:#ffffff;margin:0 0 2px;letter-spacing:-0.02em;">${_nearestMilestone.title}</h3>
                                <p style="font-size:11.5px;color:rgba(255,255,255,0.5);margin:0;">${_nearestMilestone.dateFormatted} · Tocca per vedere tutti i traguardi</p>
                            </div>

                            <!-- Central Bento Capsule -->
                            <div style="
                                background: rgba(255,255,255,0.05);
                                border: 0.5px solid rgba(255,255,255,0.12);
                                border-top: 1px solid rgba(255,255,255,0.22);
                                border-radius: 16px; padding: 10px 14px;
                                display: flex; align-items: center; justify-content: space-between; gap: 12px;
                                box-shadow: 0 4px 16px rgba(0,0,0,0.25);
                            ">
                                <div style="display:flex;align-items:center;gap:10px;min-width:0;">
                                    <div style="
                                        width:38px;height:38px;border-radius:12px;
                                        background:rgba(99,102,241,0.20);border:0.5px solid rgba(99,102,241,0.40);
                                        display:flex;align-items:center;justify-content:center;
                                        font-size:20px;flex-shrink:0;box-shadow:0 0 14px rgba(99,102,241,0.3);
                                    ">
                                        ${_nearestMilestone.emoji}
                                    </div>
                                    <div style="min-width:0;">
                                        <div style="font-size:13.5px;font-weight:700;color:#ffffff;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                                            ${_nearestMilestone.desc || 'Traguardo imminente'}
                                        </div>
                                        <div style="font-size:11px;color:rgba(255,255,255,0.5);margin-top:1px;">
                                            ${_nearestMilestone.dateFormatted}
                                        </div>
                                    </div>
                                </div>
                                <span style="
                                    font-size:13px;font-weight:900;font-variant-numeric:tabular-nums;
                                    color:#818cf8;background:rgba(99,102,241,0.18);border:0.5px solid rgba(99,102,241,0.35);
                                    padding:5px 12px;border-radius:999px;white-space:nowrap;
                                ">
                                    ${_nearestMilestone.badgeText}
                                </span>
                            </div>

                            <!-- Bottom Progress Line -->
                            <div style="display:flex;flex-direction:column;gap:4px;margin-top:2px;">
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="font-size:9.5px;font-weight:700;color:rgba(255,255,255,0.45);text-transform:uppercase;letter-spacing:0.04em;">Progresso Anno Scolastico</span>
                                    <span style="font-size:10px;font-weight:800;color:#818cf8;">${_countdownsData ? _countdownsData.schoolYearProgress : 0}%</span>
                                </div>
                                <div style="width:100%;height:4px;background:rgba(255,255,255,0.08);border-radius:999px;overflow:hidden;">
                                    <div style="width:${_countdownsData ? _countdownsData.schoolYearProgress : 0}%;height:100%;background:linear-gradient(90deg,#818cf8,#2997ff);border-radius:999px;"></div>
                                </div>
                            </div>
                        </div>

                        <!-- ════════ SLIDE 3: DIARIO & MOOD GIORNALIERO (Com'è andata oggi?) ════════ -->
                        <div style="width:100%;min-width:100%;max-width:100%;flex-shrink:0;box-sizing:border-box;padding:20px 20px 16px 20px;display:flex;flex-direction:column;justify-content:space-between;min-height:226px;">
                            <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:0.5px solid rgba(255,255,255,0.08);padding-bottom:10px;">
                                <div style="display:flex;align-items:center;gap:6px;">
                                    <span style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:6px;background:rgba(255,214,10,0.2);color:#ffd60a;font-size:11px;">
                                        <i class="ph-fill ph-smiley"></i>
                                    </span>
                                    <span style="font-size:10.5px;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:#ffd60a;">DIARIO & MOOD</span>
                                </div>
                                <span id="home-daily-mood-label" style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);">
                                    ${_todayMoodEntry ? `✨ <strong style="color:${_todayMoodEntry.color};">${_todayMoodEntry.emoji} ${_todayMoodEntry.label}</strong>` : 'Tocca una faccina'}
                                </span>
                            </div>

                            <div style="text-align:center;margin:2px 0;">
                                <h3 style="font-size:16px;font-weight:800;color:#ffffff;margin:0 0 2px;letter-spacing:-0.02em;">Com'è andata oggi?</h3>
                                <p style="font-size:11.5px;color:rgba(255,255,255,0.5);margin:0;">Scegli la tua reazione per registrarla nel diario</p>
                            </div>

                            <!-- 5 Faccine Emoji -->
                            <div id="home-daily-mood-buttons" style="display:flex;justify-content:space-between;gap:8px;">
                                ${[
                                    { idx: 0, emoji: '😫', label: 'Pessima', color: '#ff453a', bg: 'rgba(255,69,58,0.22)' },
                                    { idx: 1, emoji: '🥱', label: 'Faticosa', color: '#ff9f0a', bg: 'rgba(255,159,10,0.22)' },
                                    { idx: 2, emoji: '😐', label: 'Normale', color: '#ffd60a', bg: 'rgba(255,214,10,0.22)' },
                                    { idx: 3, emoji: '😊', label: 'Buona', color: '#64d2ff', bg: 'rgba(100,210,255,0.22)' },
                                    { idx: 4, emoji: '🤩', label: 'Top!', color: '#30d158', bg: 'rgba(48,209,88,0.22)' }
                                ].map(item => {
                                    const isSelected = _todayMoodEntry && _todayMoodEntry.index === item.idx;
                                    return `
                                    <button type="button" data-mood-idx="${item.idx}" onclick="window.setDailyMood(${item.idx})" style="
                                        flex: 1; height: 44px; border-radius: 14px;
                                        background: ${isSelected ? item.bg : 'rgba(255,255,255,0.06)'};
                                        border: ${isSelected ? `1.5px solid ${item.color}` : '0.5px solid rgba(255,255,255,0.12)'};
                                        box-shadow: ${isSelected ? `0 0 16px ${item.color}50, 0 4px 12px rgba(0,0,0,0.3)` : 'none'};
                                        transform: ${isSelected ? 'scale(1.12)' : 'scale(1)'};
                                        font-size: 20px; display: flex; align-items: center; justify-content: center;
                                        cursor: pointer; transition: all 0.2s cubic-bezier(0.16,1,0.3,1);
                                        -webkit-tap-highlight-color: transparent;
                                    " title="${item.label}" ontouchstart="this.style.transform='scale(0.9)'" ontouchend="this.style.transform='${isSelected ? 'scale(1.12)' : 'scale(1)'}'">
                                        ${item.emoji}
                                    </button>`;
                                }).join('')}
                            </div>

                            <div style="font-size:10px;color:rgba(255,255,255,0.4);text-align:center;margin-top:2px;">
                                📅 Sincronizzato con il calendario del Planner
                            </div>
                        </div>

                    </div>

                    <!-- Capsule Indicator Dots -->
                    <div style="display:flex;align-items:center;justify-content:center;gap:6px;padding:0 0 10px;">
                        <button id="home-media-dot0" onclick="gcMediaGoToSlide(0)" aria-label="Slide 1" style="height:4px;width:18px;background:#ffffff;border-radius:9999px;border:none;padding:0;cursor:pointer;transition:all 0.3s ease;"></button>
                        <button id="home-media-dot1" onclick="gcMediaGoToSlide(1)" aria-label="Slide 2" style="height:4px;width:5px;background:rgba(255,255,255,0.3);border-radius:9999px;border:none;padding:0;cursor:pointer;transition:all 0.3s ease;"></button>
                        <button id="home-media-dot2" onclick="gcMediaGoToSlide(2)" aria-label="Slide 3" style="height:4px;width:5px;background:rgba(255,255,255,0.3);border-radius:9999px;border:none;padding:0;cursor:pointer;transition:all 0.3s ease;"></button>
                    </div>
                </div>
            </div>

            <!-- SEZIONE DOMANI -->
            <div style="padding:0 20px;margin-top:20px;">
                <div style="margin-bottom:20px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;padding:0 2px;">
                        <h3 style="font-size:20px;font-weight:700;color:#dae2fd;margin:0;letter-spacing:-0.01em;">Domani</h3>
                        <a href="#" style="color:#b6c4ff;font-weight:600;font-size:13px;text-decoration:none;" onclick="navigate('planner')">Vedi tutto</a>
                    </div>
                    ${htmlDomani.includes('empty-state-card') ? `
                    <div style="background:rgba(23,31,51,0.85);backdrop-filter:blur(32px) saturate(190%);-webkit-backdrop-filter:blur(32px) saturate(190%);border:0.5px solid rgba(182,196,255,0.14);border-top:1px solid rgba(255,255,255,0.25);border-radius:24px;min-height:84px;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px 20px;">
                        <p style="font-size:13px;color:#8e909f;margin:0;font-style:italic;">Nessun impegno programmato per domani.</p>
                    </div>` : htmlDomani}
                </div>
            </div>



        </div>
    </main>
    `;
}

// ═══════════════════════════════════════════════════════════════
// NOTIFICHE & ATTIVITÀ — Helper per Calcolo Veritiero Giornaliero
// ═══════════════════════════════════════════════════════════════

window.getComprehensiveNotificationData = function() {
    const today = new Date();
    const todayISO = getLocalDateString(today);

    function parseItemDateISO(raw) {
        if (!raw) return null;
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
            const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
            if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
            const numMatch = trimmed.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
            if (numMatch) {
                return `${numMatch[3]}-${numMatch[2].padStart(2, '0')}-${numMatch[1].padStart(2, '0')}`;
            }
            const textMatch = trimmed.match(/^(\d{1,2})\s+([a-zA-Zàèéìòù]+)\s+(\d{4})/i);
            if (textMatch) {
                const mKey = textMatch[2].toLowerCase();
                const monthMap = {
                    'gen': '01', 'gennaio': '01', 'feb': '02', 'febbraio': '02', 'mar': '03', 'marzo': '03',
                    'apr': '04', 'aprile': '04', 'mag': '05', 'maggio': '05', 'giu': '06', 'giugno': '06',
                    'lug': '07', 'luglio': '07', 'ago': '08', 'agosto': '08', 'set': '09', 'sett': '09', 'settembre': '09',
                    'ott': '10', 'ottobre': '10', 'nov': '11', 'novembre': '11', 'dic': '12', 'dicembre': '12'
                };
                const m = monthMap[mKey] || monthMap[mKey.substring(0, 3)];
                if (m) {
                    return `${textMatch[3]}-${m}-${textMatch[1].padStart(2, '0')}`;
                }
            }
        }
        const d = (typeof parseArgoDate === 'function') ? parseArgoDate(raw) : new Date(raw);
        if (d && !isNaN(d.getTime()) && d.getTime() > 86400000) {
            return getLocalDateString(d);
        }
        return null;
    }

    const _getStoredArr = (k) => {
        try {
            const key = (typeof lsKey === 'function') ? lsKey(k) : k;
            return JSON.parse(localStorage.getItem(key) || localStorage.getItem(k) || '[]');
        } catch (_) { return []; }
    };

    // 1. Circolari
    const rawCircList = (Array.isArray(state.circolari) && state.circolari.length > 0) ? state.circolari : _getStoredArr('circolari');
    const circolariList = rawCircList.map(c => {
        const iso = parseItemDateISO(c.dataPubblicazione || c.date || c.data || c.pubblDate || c.data_pubblicazione);
        return {
            category: 'circolari',
            categoryLabel: 'Circolare',
            type: 'circolare',
            id: c.id,
            title: c.titolo || c.title || 'Circolare',
            desc: c.numero ? `Circolare n. ${c.numero}` : 'Comunicazione ufficiale',
            dateISO: iso,
            rawDate: c.data || c.date || '',
            icon: 'ph-file-text',
            iconColor: '#2997ff',
            iconBg: 'rgba(41,151,255,0.16)',
            action: `mostraCircolare('${escapeJsSingleQuote(c.id)}')`
        };
    });

    // 2. Voti
    const votiRaw = (typeof getVotiData === 'function') ? getVotiData() : (state.voti || []);
    const votiList = votiRaw.map(v => {
        const iso = parseItemDateISO(v.data || v.date);
        const val = v.valore || v.voto || v.value || '';
        const subj = v.materia || v.subject || 'Materia';
        const numVal = parseFloat(String(val).replace(',', '.'));
        const isGood = !isNaN(numVal) && numVal >= 6;
        const valColor = !isNaN(numVal) ? (isGood ? '#30d158' : '#ff453a') : '#2997ff';
        const valBg = !isNaN(numVal) ? (isGood ? 'rgba(48,209,88,0.16)' : 'rgba(255,69,58,0.16)') : 'rgba(41,151,255,0.16)';
        return {
            category: 'voti',
            categoryLabel: 'Voto',
            type: 'voto',
            title: `Nuovo Voto: ${subj}`,
            desc: `${v.tipo || 'Valutazione'}${v.commento ? ' — ' + v.commento : ''}`,
            val: val,
            valColor: valColor,
            valBg: valBg,
            dateISO: iso,
            rawDate: v.data || v.date,
            icon: 'ph-chart-line-up',
            iconColor: valColor,
            iconBg: valBg,
            action: "navigate('voti')"
        };
    });

    // 3. Assenze / Ritardi / Uscite / Note
    const ad = state.assenzeData || {};
    const assenzeRaw = (ad.assenze || []).map(a => ({
        category: 'assenze',
        categoryLabel: 'Assenza',
        type: 'assenza',
        title: 'Assenza Scolastica',
        desc: a.numOre ? `Assenza di ${a.numOre} ore` : (a.oraInizio ? `${a.oraInizio}ª - ${a.oraFine || 5}ª ora` : 'Giornata intera'),
        dateISO: parseItemDateISO(a.data || a.date),
        rawDate: a.data || a.date,
        icon: 'ph-calendar-x',
        iconColor: '#ff453a',
        iconBg: 'rgba(255,69,58,0.16)',
        action: "mostraAssenzeModal()"
    }));
    const ritardiRaw = (ad.ritardi || []).map(r => ({
        category: 'assenze',
        categoryLabel: 'Ritardo',
        type: 'ritardo',
        title: 'Ingresso in Ritardo',
        desc: r.oraInizio ? `Entrata ore ${r.oraInizio}` : (r.numOre ? `${r.numOre}ª ora` : 'Ingresso posticipato'),
        dateISO: parseItemDateISO(r.data || r.date),
        rawDate: r.data || r.date,
        icon: 'ph-clock-countdown',
        iconColor: '#ff9f0a',
        iconBg: 'rgba(255,159,10,0.16)',
        action: "mostraAssenzeModal()"
    }));
    const usciteRaw = (ad.uscite || []).map(u => ({
        category: 'assenze',
        categoryLabel: 'Uscita',
        type: 'uscita',
        title: 'Uscita Anticipata',
        desc: u.oraFine || u.oraInizio ? `Uscita ore ${u.oraFine || u.oraInizio}` : 'Uscita anticipata',
        dateISO: parseItemDateISO(u.data || u.date),
        rawDate: u.data || u.date,
        icon: 'ph-sign-out',
        iconColor: '#64d2ff',
        iconBg: 'rgba(100,210,255,0.16)',
        action: "mostraAssenzeModal()"
    }));
    const noteRaw = (ad.note || state.note || []).map(n => ({
        category: 'assenze',
        categoryLabel: 'Nota',
        type: 'nota',
        title: 'Nota Disciplinare',
        desc: n.autore ? `Docente: ${n.autore} — ${n.testo || n.descrizione || ''}` : (n.testo || n.descrizione || 'Annotazione docente'),
        dateISO: parseItemDateISO(n.data || n.date),
        rawDate: n.data || n.date,
        icon: 'ph-warning-octagon',
        iconColor: '#bf5af2',
        iconBg: 'rgba(191,90,242,0.16)',
        action: "mostraAssenzeModal()"
    }));

    // 4. Compiti
    const tasksRaw = (state.tasks || []).filter(t => t.subject !== 'QUEST').map(t => {
        const iso = parseItemDateISO(t.due_date || t.assigned_date || t.created_at);
        return {
            category: 'compiti',
            categoryLabel: 'Compito',
            type: 'compito',
            id: t.id,
            title: `Compito: ${t.subject || t.materia || 'Materia'}`,
            desc: t.text || t.title || 'Compito assegnato',
            done: !!t.done,
            dateISO: iso,
            rawDate: t.due_date,
            icon: 'ph-book-open',
            iconColor: '#2997ff',
            iconBg: 'rgba(41,151,255,0.16)',
            action: "navigate('planner')"
        };
    });

    // 5. Verifiche
    const verificheRaw = (state.verifiche || []).map(v => {
        const iso = parseItemDateISO(v.data || v.date);
        return {
            category: 'verifiche',
            categoryLabel: 'Verifica',
            type: 'verifica',
            id: v.id,
            title: `Verifica: ${v.materia || v.subject || 'Materia'}`,
            desc: v.text || v.descrizione || 'Verifica in programma',
            dateISO: iso,
            rawDate: v.data || v.date,
            icon: 'ph-pencil-simple',
            iconColor: '#ff9f0a',
            iconBg: 'rgba(255,159,10,0.16)',
            action: "navigate('planner')"
        };
    });

    // 6. Proposte e Assemblee di Classe
    const effClass = (typeof getEffectiveUserClass === 'function') ? getEffectiveUserClass() : '';
    const proposalsRaw = effClass && (typeof getStoredClassProposals === 'function') ? getStoredClassProposals(effClass) : [];
    const proposalsList = proposalsRaw.map(p => {
        const isAssembly = p.type === 'assembly';
        const iso = parseItemDateISO(p.created_at || p.date || p.targetDate);
        return {
            category: 'proposte',
            categoryLabel: isAssembly ? 'Assemblea' : 'Proposta',
            type: 'proposta',
            id: p.id,
            rawProp: p,
            title: isAssembly ? 'Richiesta Assemblea di Classe' : `Sposta Verifica: ${p.subject || 'Verifica'}`,
            desc: p.reason || (isAssembly ? `Proposta per ${p.targetDate}` : `Nuova data richiesta: ${p.targetDate}`),
            dateISO: iso,
            status: p.status,
            icon: isAssembly ? 'ph-users-three' : 'ph-calendar-plus',
            iconColor: isAssembly ? '#30d158' : '#ff9f0a',
            iconBg: isAssembly ? 'rgba(48,209,88,0.16)' : 'rgba(255,159,10,0.16)',
            action: null
        };
    });

    // 7. Argomenti di Lezione
    const classActRaw = (Array.isArray(state.classActivities) ? state.classActivities : []).map(a => {
        const d = (typeof getActivityDateObject === 'function') ? getActivityDateObject(a) : null;
        const iso = d ? getLocalDateString(d) : parseItemDateISO(a.data || a.date);
        return {
            category: 'lezioni',
            categoryLabel: 'Lezione',
            type: 'lezione',
            title: `Lezione: ${a.materia || a.subject || 'Materia'}`,
            desc: a.argomento || a.attivita || a.description || 'Argomento svolto in classe',
            dateISO: iso,
            icon: 'ph-chalkboard-teacher',
            iconColor: '#64d2ff',
            iconBg: 'rgba(100,210,255,0.16)',
            action: null
        };
    });

    // 8. Comunicazioni e Bacheca
    const promemoriaRaw = (state.promemoria || state.bacheca || state.announcements || []).map(p => {
        const iso = parseItemDateISO(p.data || p.date || p.datePubbl || p.dataPubblicazione);
        return {
            category: 'comunicazioni',
            categoryLabel: 'Avviso',
            type: 'comunicazione',
            title: p.titolo || p.title || p.oggetto || 'Comunicazione',
            desc: p.testo || p.text || p.descrizione || '',
            dateISO: iso,
            icon: 'ph-megaphone-simple',
            iconColor: '#ffd60a',
            iconBg: 'rgba(255,214,10,0.16)',
            action: null
        };
    });

    // Unione di tutte le novità
    const allItems = [
        ...circolariList,
        ...votiList,
        ...assenzeRaw,
        ...ritardiRaw,
        ...usciteRaw,
        ...noteRaw,
        ...tasksRaw,
        ...verificheRaw,
        ...proposalsList,
        ...classActRaw,
        ...promemoriaRaw
    ];

    // Oggi: rigorosamente se dateISO === todayISO
    const todayItems = allItems.filter(item => item.dateISO && item.dateISO === todayISO);

    // Prossimi giorni: date future
    const upcomingItems = allItems.filter(item => item.dateISO && item.dateISO > todayISO);
    upcomingItems.sort((a, b) => (a.dateISO || '').localeCompare(b.dateISO || ''));

    // Recenti: date passate fino a 90 giorni fa o elementi storici non odierni
    const recentItems = allItems.filter(item => {
        if (!item.dateISO) return true;
        if (item.dateISO >= todayISO) return false;
        const itemDate = new Date(item.dateISO);
        const diffDays = (today - itemDate) / (1000 * 60 * 60 * 24);
        return diffDays >= 0 && diffDays <= 90;
    });
    recentItems.sort((a, b) => (b.dateISO || '').localeCompare(a.dateISO || ''));

    return {
        todayISO,
        todayItems,
        upcomingItems,
        recentItems,
        todayCount: todayItems.length,
        totalCount: allItems.length
    };
};

// ═══════════════════════════════════════════════════════════════
// openTodayNotifications() — Centro Notifiche & Attività Apple Glass
// ═══════════════════════════════════════════════════════════════

function openTodayNotifications(initialTab) {
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('medium');

    const today = new Date();
    const todayISO = getLocalDateString(today);
    const MN = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const dayLabel = `${today.getDate()} ${MN[today.getMonth()]} ${today.getFullYear()}`;

    const data = window.getComprehensiveNotificationData();
    const effClass = (typeof getEffectiveUserClass === 'function') ? getEffectiveUserClass() : '';
    if (effClass) {
        if (typeof window.setupClassRealtimeSubscription === 'function') {
            window.setupClassRealtimeSubscription();
        }
        if (typeof window._fetchClassDataSilent === 'function') {
            window._fetchClassDataSilent(effClass);
        }
    }
    const isRep = (typeof isCurrentUserRepresentative === 'function') ? isCurrentUserRepresentative() : false;
    const userId = String(state.user?.id || 'utente');

    function formatItemDateBadge(iso, raw) {
        if (!iso) return raw ? `<span style="font-size:11px;color:#8e909f;font-weight:600;">${escapeHtml(raw)}</span>` : '';
        if (iso === todayISO) {
            return `<span style="font-size:10px;font-weight:800;color:#30d158;background:rgba(48,209,88,0.14);border:0.5px solid rgba(48,209,88,0.3);padding:2px 7px;border-radius:999px;display:inline-flex;align-items:center;gap:3px;"><i class="ph-fill ph-circle" style="font-size:6px;"></i> OGGI</span>`;
        }
        const d = new Date(iso);
        if (isNaN(d.getTime())) return `<span style="font-size:11px;color:#8e909f;font-weight:600;">${escapeHtml(raw || iso)}</span>`;
        
        const diffMs = d.getTime() - today.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
        if (diffDays === 1) return `<span style="font-size:10px;font-weight:800;color:#ff9f0a;background:rgba(255,159,10,0.14);border:0.5px solid rgba(255,159,10,0.3);padding:2px 7px;border-radius:999px;">DOMANI</span>`;
        if (diffDays === -1) return `<span style="font-size:10px;font-weight:700;color:#8e909f;background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.12);padding:2px 7px;border-radius:999px;">IERI</span>`;
        
        const day = d.getDate();
        const mnShort = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'][d.getMonth()];
        return `<span style="font-size:10px;font-weight:700;color:#8e909f;background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.12);padding:2px 7px;border-radius:999px;">${day} ${mnShort}</span>`;
    }

    function renderItemCard(item) {
        if (item.type === 'proposta') {
            const prop = item.rawProp;
            const isAssembly = prop.type === 'assembly';
            const title = isAssembly ? 'Richiesta Assemblea di Classe' : `Sposta Verifica: ${escapeHtml(prop.subject || 'Verifica')}`;
            const icon = isAssembly ? 'ph-users-three' : 'ph-calendar-plus';
            const iconColor = isAssembly ? '#30d158' : '#ff9f0a';
            const iconBg = isAssembly ? 'rgba(48,209,88,0.16)' : 'rgba(255,159,10,0.16)';
            const borderGlow = isAssembly ? 'rgba(48,209,88,0.3)' : 'rgba(255,159,10,0.3)';

            const acceptVotes = Array.isArray(prop.votes?.accept) ? prop.votes.accept : [];
            const declineVotes = Array.isArray(prop.votes?.decline) ? prop.votes.decline : [];
            const altVotes = Array.isArray(prop.votes?.alternatives) ? prop.votes.alternatives : [];

            const hasAccepted = acceptVotes.includes(userId);
            const hasDeclined = declineVotes.includes(userId);
            const hasAlt = altVotes.some(a => a.userId === userId);

            const statusBadge = prop.status === 'approved' 
                ? '<span style="background:rgba(48,209,88,0.2);color:#30d158;font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;border:0.5px solid rgba(48,209,88,0.4);white-space:nowrap;">APPROVATA</span>'
                : prop.status === 'rejected'
                ? '<span style="background:rgba(255,69,58,0.2);color:#ff453a;font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;border:0.5px solid rgba(255,69,58,0.4);white-space:nowrap;">RIFIUTATA</span>'
                : '<span style="background:rgba(41,151,255,0.18);color:#2997ff;font-size:10px;font-weight:800;padding:3px 8px;border-radius:999px;border:0.5px solid rgba(41,151,255,0.35);white-space:nowrap;">IN VOTAZIONE</span>';

            return `
            <div data-notif-card style="background:rgba(23,33,58,0.75);backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);border:0.5px solid rgba(182,196,255,0.16);border-top:1px solid rgba(255,255,255,0.28);border-radius:22px;padding:16px;margin-bottom:12px;box-shadow:0 8px 24px rgba(0,0,0,0.28);">
                <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;">
                    <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1;">
                        <div style="width:42px;height:42px;border-radius:14px;background:${iconBg};border:1px solid ${borderGlow};display:flex;align-items:center;justify-content:center;color:${iconColor};flex-shrink:0;box-shadow:0 0 14px ${iconColor}25;">
                            <i class="ph-bold ${icon}" style="font-size:20px;"></i>
                        </div>
                        <div style="min-width:0;flex:1;">
                            <div style="display:flex;align-items:center;gap:6px;margin-bottom:2px;">
                                <span style="font-size:9.5px;font-weight:800;letter-spacing:0.06em;text-transform:uppercase;color:${iconColor};background:${iconBg};border:0.5px solid ${borderGlow};padding:2px 7px;border-radius:999px;">
                                    ${item.categoryLabel}
                                </span>
                                ${formatItemDateBadge(item.dateISO, item.rawDate)}
                            </div>
                            <div style="font-size:14.5px;font-weight:700;color:#ffffff;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${title}</div>
                            <div style="font-size:12px;font-weight:500;color:#c4c5d6;margin-top:2px;">
                                ${isAssembly ? `Proposta per: <strong style="color:#2997ff;">${prop.targetDate}</strong> (${escapeHtml(prop.duration || '2 ore')})` : `Da: <strong>${prop.originalDate || '—'}</strong> ➔ A: <strong style="color:#ff9f0a;">${prop.targetDate}</strong>`}
                            </div>
                        </div>
                    </div>
                    <div style="flex-shrink:0;">${statusBadge}</div>
                </div>

                <div style="background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.08);border-radius:14px;padding:10px 12px;margin-top:12px;">
                    <div style="font-size:10px;font-weight:800;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.04em;">Motivazione (${escapeHtml(prop.authorName || 'Compagno')})</div>
                    <div style="font-size:12.5px;color:rgba(255,255,255,0.9);margin-top:3px;line-height:1.35;">${escapeHtml(prop.reason)}</div>
                </div>

                <div style="display:flex;align-items:center;justify-content:space-between;font-size:11.5px;color:rgba(255,255,255,0.65);margin-top:10px;padding:0 2px;">
                    <span>Voti: <strong style="color:#30d158;">${acceptVotes.length}</strong> Favorevoli · <strong style="color:#ff453a;">${declineVotes.length}</strong> Contrari</span>
                    ${altVotes.length > 0 ? `<span style="color:#ff9f0a;font-weight:700;">${altVotes.length} date alt.</span>` : ''}
                </div>

                ${prop.status === 'pending' ? `
                <div style="display:grid;grid-template-columns:1fr 1fr 1.2fr;gap:8px;margin-top:10px;">
                    <button onclick="window.voteClassProposal('${prop.id}', 'accept')" style="min-height:40px;border-radius:12px;border:none;background:${hasAccepted ? '#30d158' : 'rgba(48,209,88,0.16)'};color:${hasAccepted ? '#ffffff' : '#30d158'};font-size:11.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;border:0.5px solid rgba(48,209,88,0.35);">
                        <i class="ph-bold ph-check"></i> Accetta
                    </button>
                    <button onclick="window.voteClassProposal('${prop.id}', 'decline')" style="min-height:40px;border-radius:12px;border:none;background:${hasDeclined ? '#ff453a' : 'rgba(255,69,58,0.16)'};color:${hasDeclined ? '#ffffff' : '#ff453a'};font-size:11.5px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:4px;border:0.5px solid rgba(255,69,58,0.35);">
                        <i class="ph-bold ph-x"></i> Rifiuta
                    </button>
                    <button onclick="const altD = prompt('Inserisci una data alternativa (YYYY-MM-DD):', '${prop.targetDate}'); if (altD) window.voteClassProposal('${prop.id}', 'alternative', altD);" style="min-height:40px;border-radius:12px;border:none;background:${hasAlt ? '#ff9f0a' : 'rgba(255,159,10,0.16)'};color:${hasAlt ? '#ffffff' : '#ff9f0a'};font-size:11px;font-weight:800;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:3px;border:0.5px solid rgba(255,159,10,0.35);">
                        <i class="ph-bold ph-calendar"></i> Altra Data
                    </button>
                </div>` : ''}

                ${isRep && prop.status === 'pending' ? `
                <div style="margin-top:10px;padding-top:10px;border-top:0.5px solid rgba(255,255,255,0.1);display:flex;align-items:center;justify-content:space-between;">
                    <span style="font-size:10px;font-weight:800;color:#2997ff;text-transform:uppercase;letter-spacing:0.04em;">Rappresentante</span>
                    <div style="display:flex;gap:6px;">
                        <button onclick="window.manageClassProposal('${prop.id}', 'approved')" style="padding:6px 12px;border-radius:10px;background:#30d158;border:none;color:#ffffff;font-size:11px;font-weight:800;cursor:pointer;">Approva</button>
                        <button onclick="window.manageClassProposal('${prop.id}', 'rejected')" style="padding:6px 12px;border-radius:10px;background:rgba(255,69,58,0.2);border:0.5px solid rgba(255,69,58,0.4);color:#ff453a;font-size:11px;font-weight:800;cursor:pointer;">Archivia</button>
                    </div>
                </div>` : ''}
            </div>`;
        }

        const clickAttr = item.action ? `onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('light');closeTodayNotifications();${item.action};" style="cursor:pointer;"` : '';
        const valuePill = item.val !== undefined ? `
            <div style="background:${item.valBg || 'rgba(41,151,255,0.16)'};border:0.5px solid ${item.valColor || '#2997ff'}40;padding:6px 12px;border-radius:14px;display:flex;align-items:center;justify-content:center;box-shadow:0 0 12px ${item.valColor || '#2997ff'}20;flex-shrink:0;">
                <span style="font-size:17px;font-weight:900;color:${item.valColor || '#2997ff'};font-variant-numeric:tabular-nums;line-height:1;">
                    ${escapeHtml(String(item.val))}
                </span>
            </div>` : '';

        return `
        <div data-notif-card ${clickAttr} style="
            background:rgba(23,33,58,0.75);
            backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);
            border:0.5px solid rgba(182,196,255,0.16);border-top:1px solid rgba(255,255,255,0.28);
            border-radius:20px;padding:14px 16px;margin-bottom:10px;
            display:flex;align-items:center;justify-content:space-between;gap:14px;
            transition:transform 0.15s ease;
            box-shadow:0 4px 16px rgba(0,0,0,0.22);
        " ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
            <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1;">
                <div style="width:40px;height:40px;border-radius:14px;background:${item.iconBg};border:1px solid ${item.iconColor}40;display:flex;align-items:center;justify-content:center;color:${item.iconColor};flex-shrink:0;box-shadow:0 0 12px ${item.iconColor}20;">
                    <i class="ph-bold ${item.icon}" style="font-size:20px;"></i>
                </div>
                <div style="min-width:0;flex:1;">
                    <div style="font-size:14px;font-weight:700;color:#ffffff;line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                        ${escapeHtml(item.title)}
                    </div>
                    ${item.desc ? `
                    <div style="font-size:12px;font-weight:500;color:#8e909f;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3;">
                        ${escapeHtml(item.desc)}
                    </div>` : ''}
                </div>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                ${formatItemDateBadge(item.dateISO, item.rawDate)}
                ${valuePill}
            </div>
            ${item.action ? `<i class="ph-bold ph-caret-right" style="font-size:15px;color:rgba(255,255,255,0.4);flex-shrink:0;"></i>` : ''}
        </div>`;
    }

    // Build 3 sections HTML
    const todayHtml = data.todayItems.length > 0
        ? data.todayItems.map(renderItemCard).join('')
        : `<div style="text-align:center;padding:28px 16px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:20px;color:#8e909f;font-size:13px;font-style:italic;">
            <i class="ph ph-sparkle" style="font-size:24px;display:block;margin-bottom:6px;opacity:0.4;"></i>
            Nessuna novità registrata in data odierna.
           </div>`;

    const upcomingHtml = data.upcomingItems.length > 0
        ? data.upcomingItems.slice(0, 10).map(renderItemCard).join('')
        : `<div style="text-align:center;padding:24px 16px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:20px;color:#8e909f;font-size:12.5px;font-style:italic;">
            <i class="ph ph-calendar" style="font-size:22px;display:block;margin-bottom:6px;opacity:0.4;"></i>
            Nessun impegno nei prossimi giorni.
           </div>`;

    const recentHtml = data.recentItems.length > 0
        ? data.recentItems.slice(0, 10).map(renderItemCard).join('')
        : `<div style="text-align:center;padding:24px 16px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.08);border-radius:20px;color:#8e909f;font-size:12.5px;font-style:italic;">
            <i class="ph ph-clock" style="font-size:22px;display:block;margin-bottom:6px;opacity:0.4;"></i>
            Nessuna attività recente registrata.
           </div>`;

    const modals = document.getElementById('modals');
    if (!modals) return;

    modals.innerHTML = `
    <div id="today-notif-overlay" style="position:fixed;inset:0;z-index:10000;background:rgba(6,10,20,0.78);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);display:flex;align-items:flex-end;justify-content:center;" onclick="if(event.target===this)closeTodayNotifications()">
        <div style="
            width:100%;max-width:500px;max-height:86vh;
            background:linear-gradient(180deg, rgba(20,29,51,0.97) 0%, rgba(11,16,30,0.99) 100%);
            backdrop-filter:blur(40px) saturate(200%);-webkit-backdrop-filter:blur(40px) saturate(200%);
            border-radius:32px 32px 0 0;
            border:0.5px solid rgba(182,196,255,0.16);
            border-top:1px solid rgba(255,255,255,0.32);
            overflow-y:auto;
            animation:notifSlideUp 0.32s cubic-bezier(0.16,1,0.3,1);
            box-shadow:0 -16px 48px rgba(0,0,0,0.7);
        ">
            <!-- Drag Handle -->
            <div style="display:flex;justify-content:center;padding:12px 0 4px;touch-action:none;">
                <div style="width:38px;height:4px;background:rgba(255,255,255,0.25);border-radius:999px;"></div>
            </div>

            <!-- Header -->
            <div style="padding:14px 22px 14px;display:flex;justify-content:space-between;align-items:center;border-bottom:0.5px solid rgba(255,255,255,0.08);">
                <div>
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="display:inline-flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:6px;background:rgba(41,151,255,0.2);color:#2997ff;font-size:11px;">
                            <i class="ph-fill ph-bell"></i>
                        </span>
                        <span style="font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#2997ff;">CENTRO NOTIFICHE</span>
                    </div>
                    <h2 style="font-size:20px;font-weight:800;color:#ffffff;margin:4px 0 0;letter-spacing:-0.02em;">Novità & Attività</h2>
                    <p style="font-size:12px;color:#8e909f;margin:2px 0 0;font-weight:500;">${dayLabel}</p>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                    <span style="font-size:11.5px;font-weight:800;color:${data.todayCount > 0 ? '#2997ff' : '#8e909f'};background:${data.todayCount > 0 ? 'rgba(41,151,255,0.18)' : 'rgba(255,255,255,0.06)'};border:0.5px solid ${data.todayCount > 0 ? 'rgba(41,151,255,0.35)' : 'rgba(255,255,255,0.12)'};padding:5px 11px;border-radius:999px;">
                        ${data.todayCount > 0 ? `${data.todayCount} oggi` : '0 oggi'}
                    </span>
                    <button onclick="closeTodayNotifications()" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.16);display:flex;align-items:center;justify-content:center;cursor:pointer;color:#ffffff;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.92)'" ontouchend="this.style.transform='scale(1)'">
                        <i class="ph-bold ph-x" style="font-size:16px;"></i>
                    </button>
                </div>
            </div>

            <!-- Content Body with Grouped Sections -->
            <div data-notif-content style="padding:18px 20px 36px;">

                <!-- 1. SEZIONE: OGGI -->
                <div style="margin-bottom:22px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                        <span style="font-size:11px;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:#2997ff;display:flex;align-items:center;gap:5px;">
                            <i class="ph-fill ph-sparkle"></i> IN DATA ODIERNA (${data.todayItems.length})
                        </span>
                        <span style="font-size:11px;color:#8e909f;font-weight:600;">${today.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' })}</span>
                    </div>
                    ${todayHtml}
                </div>

                <!-- 2. SEZIONE: IN ARRIVO -->
                ${data.upcomingItems.length > 0 ? `
                <div style="margin-bottom:22px;">
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px;">
                        <span style="font-size:11px;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:#ff9f0a;display:flex;align-items:center;gap:5px;">
                            <i class="ph-fill ph-calendar-plus"></i> PROSSIMI GIORNI & IN ARRIVO (${data.upcomingItems.length})
                        </span>
                    </div>
                    ${upcomingHtml}
                </div>` : ''}

                <!-- 3. SEZIONE: RECENTI (Collapsibile con Animazione Fluida) -->
                ${data.recentItems.length > 0 ? (() => {
                    const userPrefHidden = localStorage.getItem('notif_recent_hidden') === '1';
                    // If there are no today items, always default to showing recent items so the view is never empty
                    const isHidden = (data.todayItems.length > 0) ? userPrefHidden : false;
                    return `
                    <div style="margin-bottom:10px;">
                        <div onclick="window.toggleRecentNotifications(this)" style="display:flex;align-items:center;justify-content:space-between;cursor:pointer;padding:11px 14px;background:rgba(255,255,255,0.035);border:0.5px solid rgba(255,255,255,0.09);border-radius:16px;margin-bottom:12px;transition:background 0.2s cubic-bezier(0.16,1,0.3,1),transform 0.15s ease;user-select:none;" ontouchstart="this.style.background='rgba(255,255,255,0.07)';this.style.transform='scale(0.99)'" ontouchend="this.style.background='rgba(255,255,255,0.035)';this.style.transform='scale(1)'">
                            <span style="font-size:11px;font-weight:800;letter-spacing:0.07em;text-transform:uppercase;color:#8e909f;display:flex;align-items:center;gap:6px;">
                                <i class="ph-fill ph-clock-counter-clockwise"></i> RECENTI (${data.recentItems.length})
                            </span>
                            <div style="display:flex;align-items:center;gap:5px;background:rgba(255,255,255,0.06);border:0.5px solid rgba(255,255,255,0.12);padding:3px 10px;border-radius:999px;">
                                <span id="notif-recent-btn-text" style="font-size:10.5px;font-weight:700;color:#c4c5d6;">${isHidden ? 'Mostra' : 'Nascondi'}</span>
                                <i id="notif-recent-btn-icon" class="ph-bold ph-caret-down" style="font-size:11px;color:#c4c5d6;display:inline-block;transform:rotate(${isHidden ? '0' : '180'}deg);"></i>
                            </div>
                        </div>
                        <div id="notif-recent-items-wrap" data-collapsed="${isHidden ? 'true' : 'false'}" style="display:${isHidden ? 'none' : 'block'};transform-origin:top center;">
                            ${recentHtml}
                        </div>
                    </div>`;
                })() : ''}

            </div>
        </div>
    </div>
    <style>
        @keyframes notifSlideUp {
            from { transform: translateY(100%); opacity: 0.4; }
            to   { transform: translateY(0);    opacity: 1; }
        }
    </style>`;
}
window.openTodayNotifications = openTodayNotifications;

window.toggleRecentNotifications = function(btn) {
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');
    const wrap = document.getElementById('notif-recent-items-wrap');
    const text = document.getElementById('notif-recent-btn-text');
    const icon = document.getElementById('notif-recent-btn-icon');
    if (!wrap) return;

    const isHidden = wrap.style.display === 'none' || wrap.getAttribute('data-collapsed') === 'true';

    if (typeof gsap !== 'undefined') {
        if (isHidden) {
            // EXPAND ANIMATION
            wrap.style.display = 'block';
            wrap.style.overflow = 'hidden';
            wrap.setAttribute('data-collapsed', 'false');
            if (text) text.textContent = 'Nascondi';
            if (icon) gsap.to(icon, { rotation: 180, duration: 0.32, ease: 'back.out(1.7)' });
            localStorage.setItem('notif_recent_hidden', '0');

            const fullHeight = wrap.scrollHeight;
            gsap.fromTo(wrap,
                { height: 0, opacity: 0, y: -6, scale: 0.99 },
                {
                    height: fullHeight,
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    duration: 0.36,
                    ease: 'power3.out',
                    onComplete: () => {
                        wrap.style.height = 'auto';
                        wrap.style.overflow = 'visible';
                    }
                }
            );
            const cards = wrap.querySelectorAll('[data-notif-card]');
            if (cards.length) {
                gsap.fromTo(cards,
                    { opacity: 0, y: 8, scale: 0.98 },
                    { opacity: 1, y: 0, scale: 1, duration: 0.28, stagger: 0.025, ease: 'power2.out' }
                );
            }
        } else {
            // COLLAPSE ANIMATION
            wrap.style.overflow = 'hidden';
            wrap.setAttribute('data-collapsed', 'true');
            if (text) text.textContent = 'Mostra';
            if (icon) gsap.to(icon, { rotation: 0, duration: 0.3, ease: 'power2.out' });
            localStorage.setItem('notif_recent_hidden', '1');

            const cards = wrap.querySelectorAll('[data-notif-card]');
            if (cards.length) {
                gsap.to(cards, { opacity: 0, y: -4, duration: 0.16, stagger: 0.015, ease: 'power2.in' });
            }

            gsap.to(wrap, {
                height: 0,
                opacity: 0,
                y: -6,
                scale: 0.99,
                duration: 0.28,
                ease: 'power2.inOut',
                onComplete: () => {
                    wrap.style.display = 'none';
                }
            });
        }
    } else {
        if (isHidden) {
            wrap.style.display = 'block';
            wrap.setAttribute('data-collapsed', 'false');
            if (text) text.textContent = 'Nascondi';
            if (icon) icon.style.transform = 'rotate(180deg)';
            localStorage.setItem('notif_recent_hidden', '0');
        } else {
            wrap.style.display = 'none';
            wrap.setAttribute('data-collapsed', 'true');
            if (text) text.textContent = 'Mostra';
            if (icon) icon.style.transform = 'rotate(0deg)';
            localStorage.setItem('notif_recent_hidden', '1');
        }
    }
};

function closeTodayNotifications() {
    const overlay = document.getElementById('today-notif-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        overlay.style.transition = 'opacity 0.2s ease-out';
        setTimeout(() => {
            const modals = document.getElementById('modals');
            if (modals) modals.innerHTML = '';
        }, 200);
    }
}
window.closeTodayNotifications = closeTodayNotifications;

function renderAcademicProfile() {
    const subjects = [...new Set(getVotiData().map(v => v.materia || v.subject))];

    return `
            <div class="view academic-profile-view pb-32">
                <header class="mb-8 pt-4">
                    <h1 class="headline-lg text-primary mb-1">Profilo Accademico</h1>
                    <p class="body-md text-on-surface-variant/60">Analisi e impostazioni studio</p>
               </header>

                <!-- Study Availability -->
                <section class="liquid-glass rounded-[40px] p-8 mb-6 liquid-shadow">
                    <div class="flex items-center gap-3 mb-6">
                        <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-primary">
                            <span class="material-symbols-outlined">schedule</span>
                        </div>
                        <h2 class="title-md">Disponibilità Studio</h2>
                    </div>
                    <div class="grid grid-cols-2 gap-4">
                        <div class="flex flex-col gap-2">
                            <label class="label-sm text-on-surface-variant/40">Inizio</label>
                            <input type="time" id="studyStart" value="${state.availability.start}" onchange="saveAvailability()" 
                                class="bg-surface-container-low border border-white/40 rounded-2xl h-14 px-4 font-bold text-on-surface">
                       </div>
                        <div class="flex flex-col gap-2">
                            <label class="label-sm text-on-surface-variant/40">Fine</label>
                            <input type="time" id="studyEnd" value="${state.availability.end}" onchange="saveAvailability()" 
                                class="bg-surface-container-low border border-white/40 rounded-2xl h-14 px-4 font-bold text-on-surface">
                       </div>
                   </div>
               </section>

                <!-- Difficult Subjects -->
                <section class="liquid-glass rounded-[40px] p-8 mb-6 liquid-shadow">
                    <div class="flex items-center gap-3 mb-2">
                        <div class="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center text-error">
                            <span class="material-symbols-outlined">priority_high</span>
                        </div>
                        <h2 class="title-md">Materie Critiche</h2>
                    </div>
                    <p class="body-md text-on-surface-variant/60 mb-6">Seleziona le materie in cui hai più difficoltà.</p>
                    <div class="flex flex-wrap gap-2">
                        ${subjects.length > 0 ? subjects.map(s => {
        const active = state.difficulty.includes(s);
        const safeS = s.replace(/'/g, "\\'").replace(/"/g, '&quot;');
        return `
            <button onclick="toggleDifficulty('${safeS}')" class="liquid-pill px-5 py-3 text-[13px] font-bold transition-all border ${active ? 'bg-primary text-on-primary border-primary shadow-lg' : 'bg-white/40 text-on-surface border-white/60'}">
                ${s}
            </button>`;
    }).join('') : '<div class="body-md text-on-surface-variant/40 p-4">Nessuna materia trovata.</div>'}
                   </div>
               </section>
           </div>`;
}
function renderMediaGauge(target = 0) {
    // Redundant in Liquid Glass design - replaced by bar charts in renderHome/renderGradesView
    return;
}


/* Remaining UI Functions */
function isFutureOrToday(dateStr) {
    if (!dateStr) return false;
    const todayStr = getLocalDateString(getSchoolDate());
    return dateStr >= todayStr;
}
window.isFutureOrToday = isFutureOrToday;
function updateWeeklyAgendaView() {
    if (state.view !== 'planner') return;
    const el = document.getElementById('weekly-agenda-list');
    if (!el) return;

    // Re-render using the same function for consistent HTML
    const newContent = renderWeeklyAgenda();
    const temp = document.createElement('div');
    temp.innerHTML = newContent;
    const newList = temp.querySelector('#weekly-agenda-list');

    el.style.opacity = '0';
    el.style.transition = 'opacity 0.15s ease-out';
    setTimeout(() => {
        if (newList) {
            el.innerHTML = newList.innerHTML;
        } else {
            el.innerHTML = newContent;
        }
        el.style.opacity = '1';
    }, 100);
}
function setupCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(rect.width * dpr);
    canvas.height = Math.floor(rect.height * dpr);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, rect, dpr };
}
function colorWithAlpha(color, alpha) {
    const safeAlpha = Number.isFinite(alpha) ? Math.max(0, Math.min(1, alpha)) : 1;
    const source = String(color || '').trim();
    if (!source) return `rgba(37, 99, 235, ${safeAlpha})`;

    const hexMatch = source.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
    if (hexMatch) {
        const hex = hexMatch[1];
        // Expand shorthand hex (#abc / #abcd) to full form (#aabbcc / #aabbccdd).
        const expanded = hex.length <= 4 ? hex.split('').map(ch => ch + ch).join('') : hex;
        const rgb = expanded.length === 8 ? expanded.slice(0, 6) : expanded;
        const r = parseInt(rgb.slice(0, 2), 16);
        const g = parseInt(rgb.slice(2, 4), 16);
        const b = parseInt(rgb.slice(4, 6), 16);
        if ([r, g, b].every(Number.isFinite)) return `rgba(${r}, ${g}, ${b}, ${safeAlpha})`;
    }

    const hslMatch = source.match(/^hsl\(\s*([+-]?\d*\.?\d+)\s*,\s*([+-]?\d*\.?\d+)%\s*,\s*([+-]?\d*\.?\d+)%\s*\)$/i);
    if (hslMatch) return `hsla(${hslMatch[1]}, ${hslMatch[2]}%, ${hslMatch[3]}%, ${safeAlpha})`;

    const hslaMatch = source.match(/^hsla\(\s*([^)]+)\)$/i);
    if (hslaMatch) {
        const parts = hslaMatch[1].split(',').map(p => p.trim());
        if (parts.length >= 3) return `hsla(${parts[0]}, ${parts[1]}, ${parts[2]}, ${safeAlpha})`;
    }

    const rgbMatch = source.match(/^rgb\(\s*([^)]+)\)$/i);
    if (rgbMatch) {
        const parts = rgbMatch[1].split(',').map(p => p.trim());
        if (parts.length >= 3) return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${safeAlpha})`;
    }

    const rgbaMatch = source.match(/^rgba\(\s*([^)]+)\)$/i);
    if (rgbaMatch) {
        const parts = rgbaMatch[1].split(',').map(p => p.trim());
        if (parts.length >= 3) return `rgba(${parts[0]}, ${parts[1]}, ${parts[2]}, ${safeAlpha})`;
    }

    return source;
}
function drawSubjectTrendFrame(ctx, W, H, trendItems, subjColor, progress = 1) {
    if (!Array.isArray(trendItems) || trendItems.length === 0) return;
    const p = { left: 44, right: 18, top: 16, bottom: 34 };
    const innerW = Math.max(1, W - p.left - p.right);
    const innerH = Math.max(1, H - p.top - p.bottom);
    const yMin = 0;
    const yMax = 10;
    const ySpan = yMax - yMin;
    const dateMin = trendItems[0].date.getTime();
    const dateMax = trendItems[trendItems.length - 1].date.getTime();
    const dateSpan = Math.max(1, dateMax - dateMin);
    const points = trendItems.map(item => {
        const x = p.left + ((item.date.getTime() - dateMin) / dateSpan) * innerW;
        const y = p.top + (1 - ((item.value - yMin) / ySpan)) * innerH;
        return { x, y, value: item.value };
    });

    ctx.clearRect(0, 0, W, H);

    const ticks = [0, PASSING_GRADE_THRESHOLD, 8, 10];
    ticks.forEach(t => {
        const y = p.top + (1 - ((t - yMin) / ySpan)) * innerH;
        ctx.strokeStyle = '#E8E4DE';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.left, y);
        ctx.lineTo(W - p.right, y);
        ctx.stroke();
        ctx.fillStyle = 'var(--on-surface-variant)';
        ctx.font = '700 10px JetBrains Mono';
        ctx.textAlign = 'right';
        ctx.fillText(String(t), p.left - 8, y + 3);
    });

    const visibleCount = Math.max(1, Math.ceil((points.length - 1) * progress) + 1);
    const visiblePoints = points.slice(0, visibleCount);

    if (visiblePoints.length >= 2) {
        const grad = ctx.createLinearGradient(0, p.top, 0, H - p.bottom);
        grad.addColorStop(0, colorWithAlpha(subjColor, SUBJECT_TREND_GRADIENT_TOP_ALPHA));
        grad.addColorStop(0.55, colorWithAlpha(subjColor, SUBJECT_TREND_GRADIENT_MID_ALPHA));
        grad.addColorStop(1, colorWithAlpha(subjColor, SUBJECT_TREND_GRADIENT_BOTTOM_ALPHA));
        ctx.beginPath();
        ctx.moveTo(visiblePoints[0].x, H - p.bottom);
        visiblePoints.forEach(pt => ctx.lineTo(pt.x, pt.y));
        ctx.lineTo(visiblePoints[visiblePoints.length - 1].x, H - p.bottom);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
    }

    ctx.strokeStyle = subjColor;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    visiblePoints.forEach((pt, i) => {
        if (i === 0) ctx.moveTo(pt.x, pt.y);
        else ctx.lineTo(pt.x, pt.y);
    });
    ctx.stroke();

    visiblePoints.forEach(pt => {
        ctx.fillStyle = pt.value >= PASSING_GRADE_THRESHOLD ? '#2DB86A' : '#FF3B30';
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'var(--surface-container-lowest)';
        ctx.lineWidth = 2;
        ctx.stroke();
    });

    const firstLabel = trendItems[0].date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    const lastLabel = trendItems[trendItems.length - 1].date.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    ctx.fillStyle = 'var(--on-surface-variant)';
    ctx.font = '700 10px JetBrains Mono';
    ctx.textAlign = 'left';
    ctx.fillText(firstLabel, p.left, H - 10);
    ctx.textAlign = 'right';
    ctx.fillText(lastLabel, W - p.right, H - 10);
}
function initSubjectTrendChart(canvasId, trendItems, subjColor) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || !Array.isArray(trendItems) || trendItems.length === 0) return;
    const { ctx, rect } = setupCanvas(canvas);
    const W = rect.width;
    const H = rect.height;
    if (subjectTrendAnimationFrame) cancelAnimationFrame(subjectTrendAnimationFrame);
    let animationProgress = 0;
    const animate = () => {
        const chartCanvas = document.getElementById(canvasId);
        if (!chartCanvas) {
            subjectTrendAnimationFrame = null;
            return;
        }
        animationProgress = Math.min(1, animationProgress + SUBJECT_TREND_ANIMATION_STEP);
        drawSubjectTrendFrame(ctx, W, H, trendItems, subjColor, animationProgress);
        if (animationProgress < 1) {
            subjectTrendAnimationFrame = requestAnimationFrame(animate);
        } else {
            subjectTrendAnimationFrame = null;
        }
    };
    drawSubjectTrendFrame(ctx, W, H, trendItems, subjColor, SUBJECT_TREND_ANIMATION_INITIAL_PROGRESS);
    subjectTrendAnimationFrame = requestAnimationFrame(animate);
}
function scheduleSubjectTrendChartInit(payload) {
    if (!payload || !Array.isArray(payload.points) || payload.points.length === 0) return;
    const color = payload.color || '#2563EB';
    const normalized = payload.points
        .map(p => {
            const value = Number(p?.value);
            const date = new Date(p?.date);
            if (!Number.isFinite(value) || Number.isNaN(date.getTime())) return null;
            return { value, date };
        })
        .filter(Boolean);
    if (!normalized.length) return;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        if (typeof initSubjectTrendChart === 'function') {
            initSubjectTrendChart('subjectTrendCanvas', normalized, color);
        }
    }));
}
window.scheduleSubjectTrendChartInit = scheduleSubjectTrendChartInit;
function mountSubjectTrendChartFromDom() {
    const canvas = document.getElementById('subjectTrendCanvas');
    if (!canvas) return;
    const pointsEncoded = canvas.getAttribute('data-points');
    const color = canvas.getAttribute('data-color') || '#2563EB';
    if (!pointsEncoded) return;
    try {
        const decoded = decodeURIComponent(pointsEncoded);
        const points = JSON.parse(decoded);
        if (typeof scheduleSubjectTrendChartInit === 'function') {
            scheduleSubjectTrendChartInit({ points, color });
        }
    } catch (e) {
        console.warn('Unable to mount subject trend chart:', e?.message || e);
    }
}
function initCustomScrollbar() {
    const scroller = document.getElementById('custom-scrollbar');
    const thumb = document.getElementById('scroll-thumb');
    if (!scroller || !thumb) return;

    let fadeTimeout;
    let isScrolling = false;

    function updateScroll() {
        const viewportHeight = window.innerHeight;
        const totalHeight = document.documentElement.scrollHeight;
        const scrollY = window.pageYOffset || document.documentElement.scrollTop;

        // Don't show if content fits in one screen
        if (totalHeight <= viewportHeight + 20) {
            scroller.classList.remove('show-scrollbar');
            return;
        }

        scroller.classList.add('show-scrollbar');

        // Calculate thumb height proportionally
        const thumbHeight = Math.max(60, (viewportHeight / totalHeight) * viewportHeight);
        const scrollPercent = scrollY / (totalHeight - viewportHeight);
        const thumbTop = scrollPercent * (viewportHeight - thumbHeight - 20); // 20px padding

        thumb.style.height = thumbHeight + 'px';
        thumb.style.transform = `translateY(${thumbTop + 10}px)`; // Offset for floating look

        clearTimeout(fadeTimeout);
        fadeTimeout = setTimeout(() => {
            scroller.classList.remove('show-scrollbar');
        }, 1800);
    }

    // Listen to root scroll
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('resize', updateScroll);

    // Watch for internal height changes
    const observer = new MutationObserver(updateScroll);
    observer.observe(document.body, { childList: true, subtree: true });

    updateScroll();
}


/* Chart Functions */
function initGradesCharts() {
    const canvas = document.getElementById('gradesTrendCanvas');
    if (!canvas) return;

    const { ctx, rect } = setupCanvas(canvas);
    const W = rect.width, H = rect.height;

    let votiData = [...getVotiData()];
    if (state.activeSubject) {
        votiData = votiData.filter(v => areSubjectsEquivalent(v.materia || v.subject, state.activeSubject));
    }
    // Sort by absolute time
    votiData.sort((a, b) => parseArgoDate(a.data || a.date) - parseArgoDate(b.data || b.date));

    if (votiData.length < 2) {
        ctx.fillStyle = 'rgba(var(--glass-rgb),0.3)';
        ctx.font = '700 13px Rubik';
        ctx.textAlign = 'center';
        ctx.fillText("Trend disponibile dopo 2 voti", W / 2, H / 2);
        return;
    }

    // Progressive moving average
    let sum = 0;
    const points = votiData.map((v, i) => {
        const val = parseFloat((v.valore || v.value || '0').toString().replace(',', '.'));
        sum += val;
        return {
            val: sum / (i + 1),
            raw: val,
            date: v.data || v.date
        };
    });

    const padding = 30;
    const stepX = (W - padding * 2) / (points.length - 1);
    const series = points.map(p => p.val);
    const labels = points.map(p => {
        const d = parseArgoDate(p.date);
        return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    });
    const values = points.map(p => p.raw);
    const minV = Math.max(0, Math.min(...values, ...series) - 0.5);
    const maxV = Math.min(10, Math.max(...values, ...series, 8) + 0.5);

    function getY(val) {
        const ratio = (val - minV) / Math.max(CHART_MIN_RANGE_EPSILON, (maxV - minV));
        return (H - padding * 1.5) - ratio * (H - padding * 2.5);
    }

    // Area Gradient
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, 'rgba(37, 99, 235, 1)');
    grad.addColorStop(0.55, 'rgba(37, 99, 235, 0.45)');
    grad.addColorStop(1, 'rgba(37, 99, 235, 0.08)');

    // Draw Area
    ctx.beginPath();
    ctx.moveTo(padding, getY(series[0]));
    for (let i = 1; i < series.length; i++) {
        ctx.lineTo(padding + i * stepX, getY(series[i]));
    }
    ctx.lineTo(W - padding, H - padding * 1.5);
    ctx.lineTo(padding, H - padding * 1.5);
    ctx.closePath();
    ctx.fillStyle = grad;
    ctx.fill();

    // Draw Line
    ctx.beginPath();
    ctx.moveTo(padding, getY(series[0]));
    for (let i = 1; i < series.length; i++) {
        ctx.lineTo(padding + i * stepX, getY(series[i]));
    }
    ctx.strokeStyle = CHART_LINE_COLOR;
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Dots & Labels
    series.forEach((val, i) => {
        const x = padding + i * stepX;
        const y = getY(val);

        ctx.fillStyle = 'white';
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();

        // Draw Day Label
        ctx.fillStyle = CHART_LABEL_COLOR;
        ctx.font = CHART_LABEL_FONT;
        ctx.textAlign = 'center';
        ctx.fillText(labels[i], x, H - 5);
    });
}
function renderSubjectDetailView(subjectName) {
    const activeYearKey = (typeof getActiveSchoolYear === 'function') ? getActiveSchoolYear() : ((typeof getCurrentSchoolYearKey === 'function') ? getCurrentSchoolYearKey() : '2026/27');
    const normalizedSubject = normalizeSubjectName(subjectName);
    const allYearVotes = (typeof getVotesForSchoolYear === 'function')
        ? getVotesForSchoolYear(activeYearKey)
        : getVotiData();
    const votiData = allYearVotes
        .filter(v => areSubjectsEquivalent(v.materia || v.subject, normalizedSubject))
        .sort((a, b) => parseArgoDate(b.data || b.date) - parseArgoDate(a.data || a.date));
    const media = parseFloat(calcolaMedia(votiData)) || 0;
    const hasSubjectMedia = votiData.length > 0 && media > 0;
    const goal = state.goals?.[subjectName] || 8.0;
    const n = votiData.length;
    const theme = getSubjectTheme(subjectName);
    const formattedTitle = formatSubjectTitle(subjectName);



    // ── Trend calculation: current average vs average without the latest grade ──
    const sortedByDate = [...votiData].sort((a, b) => (a.data || a.date || '').localeCompare(b.data || b.date || ''));
    const allNums = sortedByDate.map(getNumericGradeValue).filter(v => Number.isFinite(v));
    const mediaConTutti = allNums.length > 0 ? allNums.reduce((s, x) => s + x, 0) / allNums.length : null;
    const mediaSenzaUltimo = allNums.length > 1 ? allNums.slice(0, -1).reduce((s, x) => s + x, 0) / (allNums.length - 1) : null;
    let diffStr = '';
    let isPosTrend = true;
    if (mediaConTutti !== null && mediaSenzaUltimo !== null) {
        const diff = mediaConTutti - mediaSenzaUltimo;
        isPosTrend = diff >= 0;
        diffStr = (isPosTrend ? '+' : '') + diff.toFixed(2);
    }

    // ── Performance Status Badge ──
    let statusBadge = { label: 'Sufficiente', color: '#2997ff', bg: 'rgba(41,151,255,0.15)', border: 'rgba(41,151,255,0.35)', icon: 'ph-check-circle' };
    if (media >= 8.5) {
        statusBadge = { label: 'Eccellente', color: '#30d158', bg: 'rgba(48,209,88,0.18)', border: 'rgba(48,209,88,0.38)', icon: 'ph-star' };
    } else if (media >= 7.5) {
        statusBadge = { label: 'Ottimo', color: '#30d158', bg: 'rgba(48,209,88,0.15)', border: 'rgba(48,209,88,0.35)', icon: 'ph-trend-up' };
    } else if (media >= 6.5) {
        statusBadge = { label: 'Discreto', color: '#64d2ff', bg: 'rgba(100,210,255,0.15)', border: 'rgba(100,210,255,0.35)', icon: 'ph-thumbs-up' };
    } else if (media >= 6.0) {
        statusBadge = { label: 'Sufficiente', color: '#2997ff', bg: 'rgba(41,151,255,0.15)', border: 'rgba(41,151,255,0.35)', icon: 'ph-check' };
    } else if (media > 0) {
        statusBadge = { label: 'Insufficiente', color: '#ff453a', bg: 'rgba(255,69,58,0.18)', border: 'rgba(255,69,58,0.38)', icon: 'ph-warning' };
    } else {
        statusBadge = { label: 'Nessun Voto', color: 'rgba(255,255,255,0.5)', bg: 'rgba(255,255,255,0.06)', border: 'rgba(255,255,255,0.12)', icon: 'ph-info' };
    }

    // ── Semester split ──
    function semesterOf(v) {
        const raw = v.data || v.date || '';
        const d = parseArgoDate ? parseArgoDate(raw) : new Date(raw);
        if (!d || isNaN(d)) return 0;
        const m = d.getMonth();
        return (m >= 8 || m === 0) ? 1 : 2;
    }
    const s1 = votiData.filter(v => semesterOf(v) === 1);
    const s2 = votiData.filter(v => semesterOf(v) === 2);
    const media1 = parseFloat(calcolaMedia(s1)) || 0;
    const media2 = parseFloat(calcolaMedia(s2)) || 0;
    const hasSemesters = s1.length > 0 && s2.length > 0;

    // ── Predictive Hub IDs ──
    const uid = Math.random().toString(36).slice(2, 7);
    const simLblId = 'sL' + uid;
    const simResId = 'sR' + uid;
    const simDiffId = 'sD' + uid;
    const simDefault = ((media * n + 7.5) / (n + 1)).toFixed(2);
    const simDeltaInit = (parseFloat(simDefault) - media).toFixed(2);

    // ── Goal text: realistic multi-scenario breakdown ──
    let goalText;
    if (n > 0 && goal > media) {
        const gap = goal - media;
        const sumNow = media * n;
        if (gap >= 4) {
            goalText = `Obiettivo di <strong style="color:#ff9f0a;">${goal.toFixed(1)}</strong> con media attuale di ${media.toFixed(2)}: la distanza è significativa, procedi per gradi puntando a un target intermedio.`;
        } else {
            const gradeValues = [7, 8, 9, 10].filter(g => g > goal);
            const scenarios = [];
            for (const gradeVal of gradeValues) {
                const raw = (goal * n - sumNow) / (gradeVal - goal);
                const k = Math.ceil(raw);
                if (k >= 1 && k <= 30 && Number.isFinite(k)) {
                    scenarios.push({ gradeVal, k });
                }
            }
            if (scenarios.length === 0) {
                goalText = `Per raggiungere <strong style="color:#ff9f0a;">${goal.toFixed(1)}</strong> con media attuale ${media.toFixed(2)} servirebbero voti massimi costanti. Considera un obiettivo ravvicinato.`;
            } else {
                const picked = scenarios.slice(0, 3);
                const lines = picked.map(s =>
                    `<strong style="color:${theme.color};">${s.k} ${s.k === 1 ? 'voto' : 'voti'} da ${s.gradeVal}</strong>`
                ).join(' &nbsp;·&nbsp; ');
                goalText = `Per raggiungere <strong style="color:#ff9f0a;">${goal.toFixed(1)}</strong> ti occorrono: ${lines}.`;
            }
        }
    } else if (media >= goal && media > 0) {
        goalText = `🎉 Complimenti! Hai già raggiunto e superato il tuo obiettivo di <strong style="color:#30d158;">${goal.toFixed(1)}</strong>. Mantieni questa media!`;
    } else {
        goalText = `Imposta un obiettivo personalizzato per visualizzare le simulazioni e i suggerimenti accademici.`;
    }

    // ── SVG Sparkline Curve ──
    const MN = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
    const subMonthMap = {};
    votiData.forEach(v => {
        const raw = v.data || v.date || '';
        const d0 = parseArgoDate ? parseArgoDate(raw) : new Date(raw);
        if (!d0 || isNaN(d0)) return;
        const key = d0.getFullYear() * 100 + d0.getMonth();
        if (!subMonthMap[key]) subMonthMap[key] = { label: MN[d0.getMonth()], nums: [] };
        const val = getNumericGradeValue(v);
        if (Number.isFinite(val)) subMonthMap[key].nums.push(val);
    });
    const subMonthList = Object.entries(subMonthMap)
        .sort((a, b) => Number(a[0]) - Number(b[0]))
        .map(([, m]) => ({ label: m.label, avg: m.nums.reduce((s, x) => s + x, 0) / m.nums.length }))
        .slice(-6);

    let svgArea = '', svgPath = '', svgDots = '';
    let xLabels = [];
    if (subMonthList.length >= 2) {
        const W = 320, H = 80, PAD = 10;
        const pts = subMonthList.map((m, i) => {
            const x = PAD + (i / (subMonthList.length - 1)) * (W - PAD * 2);
            const y = H - PAD - ((m.avg - 1) / 9) * (H - PAD * 2);
            return [x, y];
        });
        let d = `M${pts[0][0]},${pts[0][1]}`;
        for (let i = 1; i < pts.length; i++) {
            const cx = (pts[i - 1][0] + pts[i][0]) / 2;
            d += ` C${cx},${pts[i - 1][1]} ${cx},${pts[i][1]} ${pts[i][0]},${pts[i][1]}`;
        }
        svgPath = `<path d="${d}" fill="none" stroke="${theme.color}" stroke-width="2.5" stroke-linecap="round" class="grade-chart-line"/>`;
        svgArea = `<path d="${d} L${pts[pts.length - 1][0]},${H} L${pts[0][0]},${H} Z" fill="url(#bG${uid})" class="grade-chart-area"/>`;
        const lastP = pts[pts.length - 1];
        svgDots = `<circle cx="${lastP[0]}" cy="${lastP[1]}" r="4.5" fill="${theme.color}" stroke="#ffffff" stroke-width="2" class="grade-chart-dot"/>`;
        xLabels = subMonthList.map(m => m.label);
    }

    // ── Voti List HTML ──
    const votiListHtml = votiData.map((v, i) => {
        const val = getNumericGradeValue(v);
        const isSuff = val >= 6;
        const color = isSuff ? '#30d158' : '#ff453a';
        const bgBadge = isSuff ? 'rgba(48,209,88,0.16)' : 'rgba(255,69,58,0.16)';
        const borderBadge = isSuff ? 'rgba(48,209,88,0.35)' : 'rgba(255,69,58,0.35)';
        const dateStr = (v.data || v.date || '').split('T')[0].split('-').reverse().join('/');
        const tipoStr = normalizeTipoVerifica(v.tipo, false);
        const descStr = v.descrizione || v.comment || '';

        return `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:rgba(255,255,255,0.03);border:0.5px solid rgba(255,255,255,0.06);border-radius:16px;margin-bottom:8px;transition:all 0.2s ease;">
            <div style="min-width:0;flex:1;padding-right:12px;">
                <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                    <span style="font-size:13px;font-weight:700;color:#ffffff;">${escapeHtml(tipoStr)}</span>
                    <span style="font-size:10px;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.6);font-weight:600;">${dateStr}</span>
                </div>
                ${descStr ? `<p style="font-size:11px;color:rgba(255,255,255,0.5);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(descStr)}</p>` : ''}
            </div>
            <span style="display:inline-flex;align-items:center;justify-content:center;min-width:40px;height:32px;padding:0 10px;border-radius:9999px;font-size:16px;font-weight:800;background:${bgBadge};border:1px solid ${borderBadge};color:${color};flex-shrink:0;box-shadow:0 2px 6px ${isSuff ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)'};">${v.valore || v.value}</span>
        </div>`;
    }).join('');

    const goalProgress = media > 0 ? Math.min(100, Math.round((media / goal) * 100)) : 0;

    return `
    <div class="view-fullbleed min-h-screen subject-detail-container" style="padding:0 0 calc(140px + env(safe-area-inset-bottom, 24px)) 0;background:var(--bg-base, #0c1424);font-family:'Inter',sans-serif;">

        <!-- ══ STICKY FROSTED HEADER ══ -->
        <header style="display:flex;align-items:center;justify-content:space-between;padding:max(env(safe-area-inset-top,0px),24px) 20px 14px;background:rgba(12,20,36,0.88);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);position:sticky;top:0;z-index:40;border-bottom:0.5px solid rgba(255,255,255,0.08);">
            <div style="display:flex;align-items:center;gap:12px;min-width:0;flex:1;">
                <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('light');window.closeSubject()" style="width:38px;height:38px;border-radius:50%;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.15);cursor:pointer;display:flex;align-items:center;justify-content:center;color:#ffffff;transition:transform 0.15s ease;flex-shrink:0;" ontouchstart="this.style.transform='scale(0.92)'" ontouchend="this.style.transform='scale(1)'">
                    <i class="ph ph-arrow-left text-[20px] text-[#2997ff]"></i>
                </button>
                <div style="min-width:0;flex:1;">
                    <h1 style="font-size:18px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;margin:0;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(formattedTitle)}</h1>
                    <span style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.5);">${n} valutazioni · A.S. ${escapeHtml(activeYearKey)}</span>
                </div>
            </div>
            <div style="width:38px;height:38px;border-radius:12px;background:${theme.iconBg};border:1px solid ${theme.border};display:flex;align-items:center;justify-content:center;color:${theme.color};flex-shrink:0;margin-left:12px;">
                <i class="ph-fill ${theme.icon}" style="font-size:20px;"></i>
            </div>
        </header>

        <!-- ══ CONTENT CONTAINER ══ -->
        <main style="padding:16px 20px 0;display:flex;flex-direction:column;gap:16px;">

            <!-- ── CARD 1: HERO MEDIA & ANDAMENTO ── -->
            <section style="position:relative;padding:20px;background:rgba(20,31,54,0.78);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);border-radius:26px;box-shadow:0 16px 36px -10px rgba(0,0,0,0.5);overflow:hidden;">
                <!-- Sfumatura cromatica in angolo -->
                <div style="position:absolute;top:-28px;right:-28px;width:110px;height:110px;background:${theme.color};opacity:0.24;border-radius:50%;filter:blur(28px);pointer-events:none;"></div>

                <div style="display:flex;justify-content:space-between;align-items:flex-start;position:relative;z-index:1;">
                    <div>
                        <span style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:${theme.color};display:flex;align-items:center;gap:5px;">
                            <span style="width:6px;height:6px;border-radius:50%;background:${theme.color};box-shadow:0 0 8px ${theme.color};"></span>
                            MEDIA MATERIA
                        </span>
                        <div style="display:flex;align-items:baseline;gap:10px;margin-top:4px;">
                            <span style="font-size:48px;font-weight:800;color:#ffffff;line-height:1;letter-spacing:-0.03em;font-variant-numeric:tabular-nums;">${hasSubjectMedia ? media.toFixed(2) : '—'}</span>
                            ${diffStr ? `
                            <div style="background:${isPosTrend ? 'rgba(48,209,88,0.18)' : 'rgba(255,69,58,0.18)'};padding:3px 9px;border-radius:9999px;display:inline-flex;align-items:center;gap:4px;border:1px solid ${isPosTrend ? 'rgba(48,209,88,0.4)' : 'rgba(255,69,58,0.4)'};">
                                <i class="ph-bold ${isPosTrend ? 'ph-trend-up' : 'ph-trend-down'}" style="font-size:12px;color:${isPosTrend ? '#30d158' : '#ff453a'};"></i>
                                <span style="font-size:11px;font-weight:700;color:${isPosTrend ? '#30d158' : '#ff453a'};">${diffStr}</span>
                            </div>` : ''}
                        </div>

                    </div>
                    <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:9999px;background:${statusBadge.bg};border:1px solid ${statusBadge.border};font-size:11px;font-weight:700;color:${statusBadge.color};">
                        <i class="ph-fill ${statusBadge.icon}" style="font-size:13px;"></i> ${statusBadge.label}
                    </span>
                </div>

                ${subMonthList.length >= 2 ? `
                <!-- Smooth Subject Sparkline SVG -->
                <div style="width:100%;height:78px;margin-top:14px;position:relative;z-index:1;">
                    <svg viewBox="0 0 320 80" style="width:100%;height:100%;overflow:visible;" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="bG${uid}" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stop-color="${theme.color}" stop-opacity="0.30"/>
                                <stop offset="100%" stop-color="${theme.color}" stop-opacity="0.0"/>
                            </linearGradient>
                        </defs>
                        ${svgArea}${svgPath}${svgDots}
                    </svg>
                </div>
                <div style="display:flex;justify-content:space-between;padding:0 2px;margin-top:6px;position:relative;z-index:1;">
                    ${xLabels.map((l, i) => `<span style="font-size:10px;font-weight:700;color:${i === xLabels.length - 1 ? theme.color : 'rgba(255,255,255,0.45)'};text-transform:uppercase;letter-spacing:0.06em;">${l}</span>`).join('')}
                </div>` : `
                <div style="margin-top:14px;padding:8px 12px;background:rgba(255,255,255,0.03);border-radius:12px;font-size:11px;color:rgba(255,255,255,0.5);font-style:italic;">
                    Andamento temporale disponibile a partire da 2 mesi di valutazioni.
                </div>`}
            </section>



            <!-- ── CARD 2: VOTI RICEVUTI ── -->
            <section style="position:relative;padding:20px;background:rgba(20,31,54,0.78);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);border-radius:26px;box-shadow:0 16px 36px -10px rgba(0,0,0,0.5);overflow:hidden;">
                <!-- Sfumatura cromatica in angolo -->
                <div style="position:absolute;top:-28px;right:-28px;width:90px;height:90px;background:${theme.color};opacity:0.18;border-radius:50%;filter:blur(24px);pointer-events:none;"></div>

                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;position:relative;z-index:1;">
                    <span style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:rgba(255,255,255,0.55);display:flex;align-items:center;gap:6px;">
                        <i class="ph-bold ph-list-numbers" style="font-size:13px;color:${theme.color};"></i>
                        VOTI RICEVUTI
                    </span>
                    <span style="font-size:11px;font-weight:700;color:${theme.color};background:${theme.iconBg};border:0.5px solid ${theme.border};padding:2px 8px;border-radius:999px;">
                        ${votiData.length} registrati
                    </span>
                </div>

                <div style="position:relative;z-index:1;">
                    ${votiListHtml || `
                    <div style="text-align:center;padding:24px 12px;color:rgba(255,255,255,0.45);">
                        <i class="ph ph-tray" style="font-size:28px;margin-bottom:6px;display:block;"></i>
                        <p style="font-size:12px;margin:0;font-style:italic;">Nessuna valutazione registrata per ${escapeHtml(formattedTitle)} nell'A.S. ${escapeHtml(activeYearKey)}.</p>
                    </div>`}
                </div>
            </section>

            <!-- ── CARD 3: SIMULATORE & PREDICTIVE HUB ── -->
            <section style="position:relative;padding:20px;background:rgba(20,31,54,0.78);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);border-radius:26px;box-shadow:0 16px 36px -10px rgba(0,0,0,0.5);overflow:hidden;">
                <!-- Sfumatura cromatica in angolo -->
                <div style="position:absolute;top:-28px;right:-28px;width:90px;height:90px;background:${theme.color};opacity:0.20;border-radius:50%;filter:blur(24px);pointer-events:none;"></div>

                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;position:relative;z-index:1;">
                    <div style="width:34px;height:34px;border-radius:10px;background:${theme.iconBg};border:1px solid ${theme.border};display:flex;align-items:center;justify-content:center;color:${theme.color};flex-shrink:0;">
                        <i class="ph-fill ph-lightning text-[18px]"></i>
                    </div>
                    <div>
                        <h2 style="font-size:15px;font-weight:700;color:#ffffff;margin:0;">Simulatore Prossimo Voto</h2>
                        <p style="font-size:11px;color:rgba(255,255,255,0.55);margin:0;">Calcola l'impatto istantaneo sulla media</p>
                    </div>
                </div>

                <div style="margin:14px 0 16px;position:relative;z-index:1;">
                    <div style="display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px;">
                        <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.04em;">Voto ipotetico</span>
                        <span id="${simLblId}" style="font-size:22px;font-weight:800;color:${theme.color};line-height:1;font-variant-numeric:tabular-nums;">7.5</span>
                    </div>
                    <input id="${uid}-range" type="range" min="1" max="10" step="0.5" value="7.5"
                        style="width:100%;height:6px;border-radius:9999px;outline:none;cursor:pointer;-webkit-appearance:none;background:linear-gradient(to right, ${theme.color} 72.22%, rgba(255,255,255,0.1) 72.22%);"
                        oninput="(function(el){
                            var pct = (el.value - 1) / 9 * 100;
                            el.style.background = 'linear-gradient(to right, ${theme.color} ' + pct + '%, rgba(255,255,255,0.1) ' + pct + '%)';
                            document.getElementById('${simLblId}').textContent = parseFloat(el.value).toFixed(1);
                            var nm = ((${media} * ${n}) + parseFloat(el.value)) / (${n} + 1);
                            var diff = nm - ${media};
                            document.getElementById('${simResId}').textContent = nm.toFixed(2);
                            var diffEl = document.getElementById('${simDiffId}');
                            if(diffEl){
                                diffEl.textContent = (diff >= 0 ? '+' : '') + diff.toFixed(2);
                                diffEl.style.color = diff >= 0 ? '#30d158' : '#ff453a';
                            }
                        })(this)">
                </div>

                <div style="display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.08);border-radius:18px;padding:12px 16px;position:relative;z-index:1;">
                    <div>
                        <p style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.06em;margin:0 0 2px;">Nuova Media Prevista</p>
                        <div style="display:flex;align-items:baseline;gap:8px;">
                            <span id="${simResId}" style="font-size:24px;font-weight:800;color:#ffffff;line-height:1;font-variant-numeric:tabular-nums;">${simDefault}</span>
                            <span id="${simDiffId}" style="font-size:12px;font-weight:700;color:${parseFloat(simDeltaInit) >= 0 ? '#30d158' : '#ff453a'};">
                                ${parseFloat(simDeltaInit) >= 0 ? '+' : ''}${simDeltaInit}
                            </span>
                        </div>
                    </div>
                    <div style="width:36px;height:36px;border-radius:10px;background:${theme.iconBg};border:1px solid ${theme.border};display:flex;align-items:center;justify-content:center;color:${theme.color};">
                        <i class="ph-fill ph-magic-wand text-[18px]"></i>
                    </div>
                </div>
            </section>

            <!-- ── CARD 4: CONFRONTO SEMESTRI ── -->
            ${hasSemesters ? `
            <section style="position:relative;padding:20px;background:rgba(20,31,54,0.78);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);border-radius:26px;box-shadow:0 16px 36px -10px rgba(0,0,0,0.5);overflow:hidden;">
                <!-- Sfumatura cromatica in angolo -->
                <div style="position:absolute;top:-28px;right:-28px;width:90px;height:90px;background:${theme.color};opacity:0.18;border-radius:50%;filter:blur(24px);pointer-events:none;"></div>

                <p style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.06em;margin:0 0 14px;position:relative;z-index:1;">Confronto Quadrimestri</p>
                <div style="margin-bottom:14px;position:relative;z-index:1;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <span style="font-size:13px;font-weight:700;color:#ffffff;">1° Quadrimestre</span>
                        <span style="font-size:14px;font-weight:700;color:rgba(255,255,255,0.7);">${media1.toFixed(1)}</span>
                    </div>
                    <div style="width:100%;background:rgba(255,255,255,0.06);height:6px;border-radius:9999px;overflow:hidden;">
                        <div style="width:${(media1/10*100).toFixed(0)}%;height:100%;background:rgba(255,255,255,0.4);border-radius:9999px;"></div>
                    </div>
                </div>
                <div style="margin-bottom:14px;position:relative;z-index:1;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                        <span style="font-size:13px;font-weight:700;color:#ffffff;">2° Quadrimestre</span>
                        <span style="font-size:14px;font-weight:700;color:${theme.color};">${media2.toFixed(1)}</span>
                    </div>
                    <div style="width:100%;background:rgba(255,255,255,0.06);height:6px;border-radius:9999px;overflow:hidden;">
                        <div style="width:${(media2/10*100).toFixed(0)}%;height:100%;background:${theme.color};border-radius:9999px;"></div>
                    </div>
                </div>
                ${media2 >= media1 ? `
                <div style="background:rgba(48,209,88,0.12);border:1px solid rgba(48,209,88,0.28);border-radius:14px;padding:10px 14px;display:flex;align-items:center;gap:10px;position:relative;z-index:1;">
                    <div style="width:30px;height:30px;border-radius:8px;background:rgba(48,209,88,0.2);display:flex;align-items:center;justify-content:center;color:#30d158;flex-shrink:0;">
                        <i class="ph-bold ph-caret-double-up text-[16px]"></i>
                    </div>
                    <p style="font-size:12px;color:rgba(255,255,255,0.9);line-height:1.35;margin:0;">Stai registrando un miglioramento del <strong style="color:#30d158;">+${((media2-media1)/media1*100).toFixed(0)}%</strong> rispetto al primo periodo.</p>
                </div>` : `
                <div style="background:rgba(255,159,10,0.12);border:1px solid rgba(255,159,10,0.28);border-radius:14px;padding:10px 14px;display:flex;align-items:center;gap:10px;position:relative;z-index:1;">
                    <div style="width:30px;height:30px;border-radius:8px;background:rgba(255,159,10,0.2);display:flex;align-items:center;justify-content:center;color:#ff9f0a;flex-shrink:0;">
                        <i class="ph-bold ph-caret-double-down text-[16px]"></i>
                    </div>
                    <p style="font-size:12px;color:rgba(255,255,255,0.9);line-height:1.35;margin:0;">La media del 2° periodo è inferiore al primo. Mantieni la concentrazione!</p>
                </div>`}
            </section>` : ''}

            <!-- ── CARD 5: OBIETTIVO ACCADEMICO ── -->
            <section style="position:relative;padding:20px;background:rgba(20,31,54,0.78);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);border-radius:26px;box-shadow:0 16px 36px -10px rgba(0,0,0,0.5);overflow:hidden;">
                <!-- Sfumatura cromatica in angolo -->
                <div style="position:absolute;top:-28px;right:-28px;width:90px;height:90px;background:#ff9f0a;opacity:0.20;border-radius:50%;filter:blur(24px);pointer-events:none;"></div>

                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;position:relative;z-index:1;">
                    <div style="display:flex;align-items:center;gap:10px;">
                        <div style="width:34px;height:34px;border-radius:10px;background:rgba(255,159,10,0.15);border:1px solid rgba(255,159,10,0.3);display:flex;align-items:center;justify-content:center;color:#ff9f0a;flex-shrink:0;">
                            <i class="ph-fill ph-flag-banner text-[18px]"></i>
                        </div>
                        <div>
                            <h2 style="font-size:15px;font-weight:700;color:#ffffff;margin:0;">Obiettivo Accademico</h2>
                            <p style="font-size:11px;color:rgba(255,255,255,0.55);margin:0;">${goalProgress}% completato</p>
                        </div>
                    </div>
                    <div style="text-align:right;cursor:pointer;" onclick="promptSetGoal('${escapeJsSingleQuote(subjectName)}')">
                        <span style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.55);text-transform:uppercase;letter-spacing:0.04em;">Target</span>
                        <div style="display:flex;align-items:center;gap:4px;justify-content:flex-end;">
                            <span style="font-size:22px;font-weight:800;color:#ff9f0a;line-height:1;">${goal.toFixed(1)}</span>
                            <i class="ph ph-pencil-simple text-[14px] text-[rgba(255,255,255,0.6)]"></i>
                        </div>
                    </div>
                </div>

                <!-- Dual Gradient Target Progress Bar -->
                <div style="width:100%;background:rgba(255,255,255,0.08);height:6px;border-radius:9999px;overflow:hidden;position:relative;margin-bottom:12px;z-index:1;">
                    <div style="background:linear-gradient(90deg, ${theme.color} 0%, #30d158 100%);height:100%;border-radius:9999px;width:${goalProgress}%;transition:width 0.4s ease;box-shadow:0 0 8px ${theme.color};"></div>
                </div>

                <div style="padding:10px 14px;background:rgba(255,159,10,0.08);border:0.5px solid rgba(255,159,10,0.22);border-radius:14px;margin-bottom:10px;position:relative;z-index:1;">
                    <p style="font-size:12px;line-height:1.45;color:rgba(255,255,255,0.9);margin:0;">${goalText}</p>
                </div>

                <div style="display:flex;align-items:center;gap:6px;position:relative;z-index:1;">
                    <i class="ph ph-info text-[12px] text-[rgba(255,255,255,0.45)]"></i>
                    <span style="font-size:11px;color:rgba(255,255,255,0.45);font-weight:500;">Calcolato sulla media attuale di ${media.toFixed(1)}</span>
                </div>
            </section>

            <!-- Bottom Safe Area Spacer to guarantee content is never clipped by navbar -->
            <div style="height:120px;" aria-hidden="true"></div>

        </main>
    </div>`;
}

function mostraAssenzeModal() {
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('medium');

    const ad = state.assenzeData || { assenze: [], ritardi: [], uscite: [], note: [], totaleAssenze: 0, totaleRitardi: 0, totaleUscite: 0, oreAssenzaTotali: 0, daGiustificare: 0 };
    
    // Normalizziamo tutti gli eventi
    const rawAssenze = (ad.assenze || []).map(x => ({
        ...x,
        tipo: 'assenza',
        label: 'Assenza Giornaliera',
        icon: 'ph-calendar-x',
        iconColor: '#ff453a',
        iconBg: 'rgba(255,69,58,0.15)',
        hoursStr: x.numOre ? `${x.numOre} ore` : (x.oraInizio ? `${x.oraInizio}ª - ${x.oraFine || 5}ª ora` : 'Giornata intera')
    }));

    const rawRitardi = (ad.ritardi || []).map(x => ({
        ...x,
        tipo: 'ritardo',
        label: 'Ingresso in Ritardo',
        icon: 'ph-clock-countdown',
        iconColor: '#ff9f0a',
        iconBg: 'rgba(255,159,10,0.15)',
        hoursStr: x.oraInizio ? `Entrata ore ${x.oraInizio}` : (x.numOre ? `${x.numOre}ª ora` : 'Ritardo breve')
    }));

    const rawUscite = (ad.uscite || []).map(x => ({
        ...x,
        tipo: 'uscita',
        label: 'Uscita Anticipata',
        icon: 'ph-sign-out',
        iconColor: '#2997ff',
        iconBg: 'rgba(41,151,255,0.15)',
        hoursStr: x.oraFine || x.oraInizio ? `Uscita ore ${x.oraFine || x.oraInizio}` : (x.numOre ? `${x.numOre}ª ora` : 'Uscita')
    }));

    const rawNote = (ad.note || []).map(x => ({
        ...x,
        tipo: 'nota',
        label: 'Nota Disciplinare',
        icon: 'ph-warning',
        iconColor: '#bf5af2',
        iconBg: 'rgba(191,90,242,0.15)',
        hoursStr: x.autore || 'Docente',
        giustificata: true
    }));

    const all = [...rawAssenze, ...rawRitardi, ...rawUscite, ...rawNote];
    all.sort((a, b) => {
        const da = a.data ? new Date(a.data) : new Date(0);
        const db = b.data ? new Date(b.data) : new Date(0);
        return db - da;
    });

    const daGiustificareList = all.filter(a => a.tipo !== 'nota' && (!a.giustificata || a.daGiustificare));
    const giustificateList = all.filter(a => a.giustificata && !a.daGiustificare);
    
    const countDaGiustificare = daGiustificareList.length;
    const countGiustificate = giustificateList.length;
    const oreTotali = typeof ad.oreAssenzaTotali === 'number' && ad.oreAssenzaTotali > 0
        ? ad.oreAssenzaTotali
        : (rawAssenze.length * 5 + rawRitardi.length * 1 + rawUscite.length * 2);

    window._assenzeFilter = 'tutte';

    window.filterAssenzeView = function(filterType) {
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic('selection');
        window._assenzeFilter = filterType;
        
        // Update segmented control buttons
        document.querySelectorAll('.assenze-tab-btn').forEach(btn => {
            const isSelected = btn.getAttribute('data-filter') === filterType;
            btn.style.background = isSelected ? '#2997ff' : 'transparent';
            btn.style.color = isSelected ? '#ffffff' : 'rgba(255,255,255,0.6)';
            btn.style.fontWeight = isSelected ? '700' : '600';
            btn.style.boxShadow = isSelected ? '0 2px 8px rgba(41,151,255,0.4)' : 'none';
        });

        // Filter cards in list
        document.querySelectorAll('.assenze-card-item').forEach(card => {
            const isPending = card.getAttribute('data-pending') === 'true';
            if (filterType === 'tutte') {
                card.style.display = 'flex';
            } else if (filterType === 'pending') {
                card.style.display = isPending ? 'flex' : 'none';
            } else if (filterType === 'justified') {
                card.style.display = !isPending ? 'flex' : 'none';
            }
        });

        // Show empty message if needed
        const listEl = document.getElementById('assenze-items-list');
        const emptyEl = document.getElementById('assenze-empty-msg');
        if (listEl && emptyEl) {
            const visibleCards = Array.from(listEl.querySelectorAll('.assenze-card-item')).filter(c => c.style.display !== 'none');
            emptyEl.style.display = visibleCards.length === 0 ? 'block' : 'none';
        }
    };

    const renderCardHtml = (a) => {
        const isPending = a.tipo !== 'nota' && (!a.giustificata || a.daGiustificare);
        const d = a.data ? new Date(a.data) : new Date();
        const dateFormatted = !isNaN(d.getTime()) 
            ? d.toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric', month: 'short' })
            : (a.data || 'Data N/D');
        const capitalizedDate = dateFormatted.charAt(0).toUpperCase() + dateFormatted.slice(1);

        const statusBadge = a.tipo === 'nota' 
            ? `<span style="background:rgba(191,90,242,0.15);border:0.5px solid rgba(191,90,242,0.35);color:#bf5af2;font-size:10px;font-weight:700;padding:3px 8px;border-radius:9999px;display:inline-flex;align-items:center;gap:3px;white-space:nowrap;flex-shrink:0;"><i class="ph-fill ph-chat-circle-dots"></i> NOTA</span>`
            : isPending
            ? `<span style="background:rgba(255,69,58,0.18);border:0.5px solid rgba(255,69,58,0.4);color:#ff453a;font-size:10px;font-weight:700;padding:3px 8px;border-radius:9999px;display:inline-flex;align-items:center;gap:3px;white-space:nowrap;flex-shrink:0;"><i class="ph-fill ph-warning-circle"></i> DA GIUSTIFICARE</span>`
            : `<span style="background:rgba(48,209,88,0.15);border:0.5px solid rgba(48,209,88,0.35);color:#30d158;font-size:10px;font-weight:700;padding:3px 8px;border-radius:9999px;display:inline-flex;align-items:center;gap:3px;white-space:nowrap;flex-shrink:0;"><i class="ph-fill ph-check-circle"></i> GIUSTIFICATA</span>`;

        return `
        <div class="assenze-card-item" data-pending="${isPending}" style="display:flex;flex-direction:column;gap:8px;padding:14px 16px;background:rgba(20,31,54,0.78);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:0.5px solid rgba(255,255,255,0.1);border-top:1px solid rgba(255,255,255,0.18);border-radius:20px;transition:all 0.2s ease;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
                <div style="display:flex;align-items:center;gap:10px;">
                    <div style="width:36px;height:36px;border-radius:12px;background:${a.iconBg};display:flex;align-items:center;justify-content:center;color:${a.iconColor};flex-shrink:0;">
                        <i class="ph-fill ${a.icon}" style="font-size:18px;"></i>
                    </div>
                    <div style="min-width:0;flex:1;">
                        <h4 style="font-size:14px;font-weight:700;color:#ffffff;margin:0 0 2px;">${escapeHtml(a.label)}</h4>
                        <span style="font-size:12px;color:rgba(255,255,255,0.55);font-weight:500;">${capitalizedDate} · ${escapeHtml(a.hoursStr)}</span>
                    </div>
                </div>
                <div>
                    ${statusBadge}
                </div>
            </div>
            ${(a.nota || a.testo || a.motivo) ? `
            <div style="padding:8px 12px;background:rgba(255,255,255,0.04);border-radius:10px;font-size:12px;color:rgba(255,255,255,0.75);line-height:1.4;margin-top:2px;">
                "${escapeHtml(a.nota || a.testo || a.motivo)}"
            </div>` : ''}
        </div>`;
    };

    const sheetHtml = `
        <div style="display:flex;flex-direction:column;gap:16px;padding-bottom:4px;">
            
            <!-- Summary Metrics Cards (3 Colonne) -->
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;">
                <!-- Da Giustificare -->
                <div style="padding:12px 8px;background:${countDaGiustificare > 0 ? 'rgba(255,69,58,0.15)' : 'rgba(255,255,255,0.05)'};border:0.5px solid ${countDaGiustificare > 0 ? 'rgba(255,69,58,0.35)' : 'rgba(255,255,255,0.1)'};border-radius:18px;text-align:center;">
                    <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:${countDaGiustificare > 0 ? '#ff453a' : 'rgba(255,255,255,0.5)'};display:block;margin-bottom:4px;letter-spacing:0.04em;">Da Giustif.</span>
                    <span style="font-size:22px;font-weight:800;color:${countDaGiustificare > 0 ? '#ff453a' : '#ffffff'};line-height:1;">${countDaGiustificare}</span>
                </div>
                <!-- Giustificate -->
                <div style="padding:12px 8px;background:rgba(48,209,88,0.12);border:0.5px solid rgba(48,209,88,0.28);border-radius:18px;text-align:center;">
                    <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:#30d158;display:block;margin-bottom:4px;letter-spacing:0.04em;">Giustificate</span>
                    <span style="font-size:22px;font-weight:800;color:#30d158;line-height:1;">${countGiustificate}</span>
                </div>
                <!-- Ore Assenza Totali -->
                <div style="padding:12px 8px;background:rgba(41,151,255,0.12);border:0.5px solid rgba(41,151,255,0.28);border-radius:18px;text-align:center;">
                    <span style="font-size:10px;font-weight:700;text-transform:uppercase;color:#2997ff;display:block;margin-bottom:4px;letter-spacing:0.04em;">Ore Totali</span>
                    <span style="font-size:22px;font-weight:800;color:#2997ff;line-height:1;">${typeof oreTotali === 'number' ? oreTotali.toFixed(0) + 'h' : oreTotali}</span>
                </div>
            </div>

            <!-- Apple Segmented Control Filter -->
            <div style="display:flex;background:rgba(255,255,255,0.06);padding:3px;border-radius:14px;border:0.5px solid rgba(255,255,255,0.1);">
                <button class="assenze-tab-btn" data-filter="tutte" onclick="window.filterAssenzeView('tutte')" style="flex:1;padding:8px 4px;border-radius:11px;border:none;background:#2997ff;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;transition:all 0.2s ease;box-shadow:0 2px 8px rgba(41,151,255,0.4);">
                    Tutte (${all.length})
                </button>
                <button class="assenze-tab-btn" data-filter="pending" onclick="window.filterAssenzeView('pending')" style="flex:1;padding:8px 4px;border-radius:11px;border:none;background:transparent;color:rgba(255,255,255,0.6);font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s ease;">
                    Da Giustif. (${countDaGiustificare})
                </button>
                <button class="assenze-tab-btn" data-filter="justified" onclick="window.filterAssenzeView('justified')" style="flex:1;padding:8px 4px;border-radius:11px;border:none;background:transparent;color:rgba(255,255,255,0.6);font-size:12px;font-weight:600;cursor:pointer;transition:all 0.2s ease;">
                    Giustificate (${countGiustificate})
                </button>
            </div>

            <!-- List of Items -->
            <div id="assenze-items-list" style="display:flex;flex-direction:column;gap:10px;max-height:50vh;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-right:2px;">
                ${all.length > 0 ? all.map(renderCardHtml).join('') : ''}
                <!-- Empty State -->
                <div id="assenze-empty-msg" style="display:${all.length === 0 ? 'flex' : 'none'};align-items:center;justify-content:center;flex:1;text-align:center;padding:32px 16px;color:rgba(255,255,255,0.5);font-size:14px;font-style:italic;">
                    Nessun evento o assenza da visualizzare in questa categoria.
                </div>
            </div>

        </div>
    `;

    if (typeof window.openBottomSheet === 'function') {
        window.openBottomSheet({
            title: 'Registro Assenze',
            html: sheetHtml
        });
    }
}
window.mostraAssenzeModal = mostraAssenzeModal;

function mostraVerificheModal() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = getLocalDateString(today);
    const allVerifiche = (state.verifiche || [])
        .filter(v => v.data && v.data >= todayISO)
        .sort((a, b) => a.data.localeCompare(b.data));
    const manualExams = (state.manualVerifiche || [])
        .filter(v => !v.done && v.date && v.date >= todayISO)
        .map(v => ({ materia: v.subject, data: v.date, text: v.args, tipo: v.type, source: 'manual', id: v.id }));

    const combined = [...allVerifiche, ...manualExams];
    const seen = new Set();
    const all = combined.filter(v => {
        const key = `${v.data}||${(v.materia || '').toLowerCase() || ''}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    }).sort((a, b) => (a.data || '').localeCompare(b.data || ''));

    showModal(`
        <div class="flex flex-col gap-6">
            <header>
                <h2 class="title-md text-primary mb-1">Prossime Verifiche</h2>
                <p class="body-md text-on-surface-variant/60">Calendario prove ed esami</p>
            </header>

            <div class="flex flex-col gap-4 max-h-[400px] overflow-y-auto no-scrollbar">
                ${all.length === 0 ? `
                    <div class="p-12 text-center text-on-surface-variant/40">
                        <span class="material-symbols-outlined text-4xl mb-2">event_available</span>
                        <p class="font-medium">Nessuna verifica in programma</p>
                    </div>
                ` : all.map(v => `
                    <div class="p-5 rounded-[28px] bg-surface-container-low border border-white/40 flex items-center gap-4">
                        <div class="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold">
                            ${getSubjectAbbrev(v.materia)}
                        </div>
                        <div class="flex-1 min-width-0">
                            <h3 class="font-bold text-[15px] truncate">${escapeHtml(v.text || v.materia)}</h3>
                            <p class="text-[12px] text-on-surface-variant/60 uppercase font-bold tracking-wider">${v.data}</p>
                        </div>
                        ${v.source === 'manual' ? `
                            <button onclick="deleteManualVerifica('${v.id}')" class="w-8 h-8 rounded-full bg-error/10 text-error flex items-center justify-center">
                                <span class="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                        ` : ''}
                    </div>
                `).join('')}
            </div>

            <button class="btn btn-primary w-full" onclick="closeModal()">Chiudi</button>
        </div>
    `);
}
window.mostraVerificheModal = mostraVerificheModal;

window._navVerifica = function (dir) {
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const todayISO = getLocalDateString(today);
    const argoV = (state.verifiche || []).filter(v => v.data && v.data >= todayISO).sort((a, b) => a.data.localeCompare(b.data));
    const manualV = (state.manualVerifiche || []).filter(v => !v.done && v.date && v.date >= todayISO).map(v => ({ materia: v.subject, data: v.date, text: v.args, tipo: v.type }));
    const seen = new Set();
    const all = [...argoV, ...manualV].filter(v => { const k = `${v.data}||${(v.materia || '').toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.data.localeCompare(b.data));
    if (all.length <= 1) return;
    window._verificheIdx = Math.max(0, Math.min(all.length - 1, (window._verificheIdx || 0) + dir));
    const v = all[window._verificheIdx];
    if (!v) return;

    const abbr = typeof getSubjectAbbrev === 'function' ? getSubjectAbbrev(v.materia) : (v.materia || '').substring(0, 3).toUpperCase();
    const key = abbr.toLowerCase();
    const normalizedTipo = (v.tipo || '').toString().trim().toLowerCase();
    const tipoLabel = normalizedTipo === 'scritta' ? 'SCRITTA' : normalizedTipo === 'orale' ? 'ORALE' : '';
    const examDate = parseLocalDate(v.data);
    const daysLeft = Math.ceil((examDate - today) / 86400000);
    const desc = (v.text || v.materia || '').substring(0, 45);

    const el = (id) => document.getElementById(id);
    const abbrEl = el('vw-abbr');
    if (abbrEl) { abbrEl.textContent = abbr; abbrEl.style.background = `var(--${key},var(--mat))`; abbrEl.style.color = `var(--${key}-t,var(--mat-t))`; }
    const tipoEl = el('vw-tipo'); if (tipoEl) tipoEl.textContent = tipoLabel;
    const counterEl = el('vw-counter'); if (counterEl) counterEl.textContent = `${window._verificheIdx + 1}/${all.length}`;
    const descEl = el('vw-desc'); if (descEl) descEl.textContent = desc;
    const daysEl = el('vw-days'); if (daysEl) daysEl.textContent = daysLeft;
    const barFill = el('vw-bar-fill'); if (barFill) { barFill.style.width = Math.max(5, 100 - daysLeft * 8) + '%'; barFill.style.background = `var(--${key}-dot,var(--mat-dot))`; }
};


/* Remaining UI/Modal/Logic Functions */
async function mostraCircolare(id) {
    const c = state.circolari.find(x => x.id === id);
    if (!c) return;

    if (c.sintesi && typeof marked === 'undefined' && typeof window.ensureMarked === 'function') {
        await window.ensureMarked();
    }

    // Overlay with deep atmospheric frosted blur
    const overlay = document.createElement('div');
    overlay.id = 'circ-overlay-' + id;
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(6,14,32,0.65);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);display:flex;align-items:flex-end;justify-content:center;';

    const sheet = document.createElement('div');
    sheet.style.cssText = 'width:100%;max-width:540px;background:rgba(18,29,50,0.96);backdrop-filter:blur(40px) saturate(200%);-webkit-backdrop-filter:blur(40px) saturate(200%);border:1px solid rgba(182,196,255,0.18);border-top:1px solid rgba(255,255,255,0.35);border-radius:32px 32px 0 0;display:flex;flex-direction:column;max-height:92vh;box-shadow:0 -12px 48px rgba(6,14,32,0.85);transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);font-family:\'Inter\',sans-serif;color:#dae2fd;';

    const sintesiContent = c.sintesi
        ? `<div style="font-size:14px;line-height:1.75;color:#dae2fd;">${typeof window.renderSafeMarkdown === 'function' ? window.renderSafeMarkdown(c.sintesi) : escapeHtml(c.sintesi)}</div>`
        : `<div id="sintesi-placeholder-${c.id}" style="display:flex;flex-direction:column;align-items:center;text-align:center;padding:24px 16px;gap:12px;background:rgba(23,31,51,0.8);border:1px solid rgba(182,196,255,0.14);border-radius:22px;">
               <div style="width:52px;height:52px;border-radius:18px;background:rgba(47,88,205,0.25);border:1px solid rgba(182,196,255,0.3);display:flex;align-items:center;justify-content:center;color:#b6c4ff;">
                   <i class="ph-fill ph-sparkle" style="font-size:26px;"></i>
               </div>
               <p style="font-size:16px;font-weight:800;color:#dae2fd;margin:0;">Analisi & Sintesi AI</p>
               <p style="font-size:13px;color:#c4c5d6;font-weight:500;margin:0;max-width:280px;line-height:1.5;">Ottieni una sintesi intelligente con estrazione automatica dei punti chiave e delle date importanti.</p>
               <button id="btn-sintesi-${c.id}" onclick="window._circ_startSintesi('${escapeJsSingleQuote(c.id)}','${escapeJsSingleQuote(c.link || '')}')" style="width:100%;height:48px;border-radius:14px;background:linear-gradient(135deg,#2f58cd 0%,#3b82f6 100%);color:#ffffff;border:none;font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Inter',sans-serif;margin-top:6px;box-shadow:0 4px 16px rgba(47,88,205,0.4);">
                   <i class="ph-bold ph-lightning" style="font-size:17px;"></i>
                   Elabora Sintesi con AI
               </button>
           </div>`;

    sheet.innerHTML = `
        <!-- Drag handle -->
        <div style="display:flex;justify-content:center;padding:14px 0 8px;flex-shrink:0;">
            <div style="width:44px;height:5px;border-radius:999px;background:rgba(182,196,255,0.3);"></div>
        </div>

        <!-- Header -->
        <div style="padding:6px 22px 16px;flex-shrink:0;border-bottom:1px solid rgba(182,196,255,0.12);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
                <span style="font-size:11px;font-weight:800;color:#b6c4ff;text-transform:uppercase;letter-spacing:0.08em;background:rgba(47,88,205,0.22);border:1px solid rgba(182,196,255,0.25);padding:3px 10px;border-radius:999px;">Circolare N. ${escapeHtml(String(c.numero || '—'))}</span>
                <span style="font-size:12px;font-weight:600;color:#8e909f;display:flex;align-items:center;gap:4px;"><i class="ph-bold ph-calendar" style="color:#b6c4ff;"></i> ${escapeHtml(c.data || '')}</span>
            </div>
            <h2 style="font-size:19px;font-weight:800;color:#dae2fd;line-height:1.3;margin:0;letter-spacing:-0.02em;">${escapeHtml(c.titolo)}</h2>
        </div>

        <!-- Scrollable body -->
        <div id="sintesi-box-${c.id}" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:20px 22px;">
            ${sintesiContent}
        </div>

        <!-- Actions -->
        <div style="padding:14px 22px calc(24px + env(safe-area-inset-bottom,0px));flex-shrink:0;display:flex;flex-direction:column;gap:8px;border-top:1px solid rgba(182,196,255,0.12);">
            ${c.link ? `<button onclick="window.open('${escapeJsSingleQuote(c.link)}','_blank')" style="width:100%;height:50px;border-radius:15px;background:linear-gradient(135deg,#2f58cd 0%,#3b82f6 100%);color:#ffffff;border:none;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Inter',sans-serif;box-shadow:0 6px 20px -4px rgba(47,88,205,0.5);">
                <i class="ph-bold ph-file-arrow-up" style="font-size:18px;"></i> Apri Documento PDF Ufficiale
            </button>` : ''}
            <button id="circ-close-btn-${id}" style="width:100%;height:42px;background:none;border:none;color:#b6c4ff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">Chiudi</button>
        </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { sheet.style.transform = 'translateY(0)'; });

    // Close logic — robust DOM removal
    function closeCirc() {
        sheet.style.transform = 'translateY(100%)';
        setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 320);
    }
    overlay.addEventListener('click', e => { if (e.target === overlay) closeCirc(); });
    document.getElementById('circ-close-btn-' + id).addEventListener('click', closeCirc);

    // ── Sintesi Liquid Glass progress animation ─────────────────────────────
    window._circ_startSintesi = async function(cid, link) {
        if (window.navigator?.vibrate) {
            try { window.navigator.vibrate(15); } catch (_) {}
        }
        const placeholder = document.getElementById('sintesi-placeholder-' + cid);
        if (!placeholder) return;

        // Render signature Apple Liquid Glass progress card
        placeholder.innerHTML = `
            <div id="sintesi-card-${cid}" style="width:100%;background:rgba(23,31,51,0.88);backdrop-filter:blur(24px) saturate(190%);-webkit-backdrop-filter:blur(24px) saturate(190%);border:1px solid rgba(182,196,255,0.22);border-top:1px solid rgba(255,255,255,0.28);border-radius:24px;padding:22px 20px;box-shadow:0 12px 36px rgba(6,14,32,0.65), inset 0 1px 0 rgba(255,255,255,0.15);display:flex;flex-direction:column;gap:14px;box-sizing:border-box;text-align:left;animation:fadeIn 0.35s ease-out;">
                <!-- Header row with pulsing icon, badge and percentage -->
                <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <div id="sintesi-icon-${cid}" style="width:42px;height:42px;border-radius:15px;background:rgba(47,88,205,0.25);border:1px solid rgba(182,196,255,0.35);display:flex;align-items:center;justify-content:center;color:#b6c4ff;box-shadow:0 0 18px rgba(47,88,205,0.45);flex-shrink:0;animation:liquidGlowPulse 2.4s infinite ease-in-out;">
                            <i class="ph-fill ph-sparkle" style="font-size:22px;"></i>
                        </div>
                        <div>
                            <span id="sintesi-badge-${cid}" style="font-size:10.5px;font-weight:800;color:#b6c4ff;text-transform:uppercase;letter-spacing:0.08em;background:rgba(47,88,205,0.22);border:1px solid rgba(182,196,255,0.28);padding:3px 9px;border-radius:999px;display:inline-block;">Sintesi AI</span>
                            <p id="sintesi-title-${cid}" style="font-size:14px;color:#dae2fd;font-weight:700;margin:4px 0 0;line-height:1.3;">Avvio elaborazione…</p>
                        </div>
                    </div>
                    <span id="sintesi-pct-${cid}" style="font-size:13px;font-weight:800;color:#b6c4ff;font-variant-numeric:tabular-nums;background:rgba(6,14,32,0.6);padding:4px 9px;border-radius:10px;border:1px solid rgba(182,196,255,0.18);flex-shrink:0;">0%</span>
                </div>

                <!-- Liquid Progress Bar -->
                <div style="width:100%;height:8px;background:rgba(6,14,32,0.75);border:0.5px solid rgba(182,196,255,0.18);border-radius:999px;overflow:hidden;position:relative;box-shadow:inset 0 1px 3px rgba(0,0,0,0.6);">
                    <div id="sintesi-bar-${cid}" style="height:100%;width:0%;background:linear-gradient(90deg,#2f58cd 0%,#3b82f6 50%,#b6c4ff 100%);border-radius:999px;transition:width 0.35s cubic-bezier(0.16,1,0.3,1);box-shadow:0 0 14px rgba(79,120,255,0.7);"></div>
                </div>

                <!-- Subtitle / status details -->
                <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                    <p id="sintesi-desc-${cid}" style="font-size:12px;color:#c4c5d6;font-weight:500;margin:0;line-height:1.4;">Scansione del documento in corso…</p>
                    <div style="display:flex;align-items:center;gap:4px;color:#8e909f;font-size:11px;font-weight:600;flex-shrink:0;">
                        <i class="ph-bold ph-lightning" style="color:#b6c4ff;"></i> AI Assistant
                    </div>
                </div>
            </div>`;

        const stages = [
            { pct: 22, title: 'Identificazione circolare…', desc: 'Scansione metadati e ricerca allegati' },
            { pct: 48, title: 'Recupero documento…',       desc: 'Download ed estrazione del testo' },
            { pct: 74, title: 'Analisi neurale AI…',       desc: 'Estrazione punti chiave, date e scadenze' },
            { pct: 92, title: 'Finalizzazione sintesi…',   desc: 'Formattazione del riassunto per la lettura' },
        ];

        let currentStageIdx = 0;
        let progress = 6;
        const bar = document.getElementById('sintesi-bar-' + cid);
        const titleEl = document.getElementById('sintesi-title-' + cid);
        const descEl = document.getElementById('sintesi-desc-' + cid);
        const pctEl = document.getElementById('sintesi-pct-' + cid);

        const iv = setInterval(() => {
            if (progress >= 92) return;
            progress += (92 - progress) * 0.12 + 0.6;
            if (progress > 92) progress = 92;
            const rounded = Math.round(progress);
            if (bar) bar.style.width = rounded + '%';
            if (pctEl) pctEl.textContent = rounded + '%';

            if (currentStageIdx < stages.length && progress >= stages[currentStageIdx].pct) {
                const s = stages[currentStageIdx++];
                if (titleEl) titleEl.textContent = s.title;
                if (descEl) descEl.textContent = s.desc;
            }
        }, 320);

        try {
            const result = await window.loadCircolareSintesi(cid, link);
            clearInterval(iv);

            if (result && result.success && result.sintesi) {
                if (bar) bar.style.width = '100%';
                if (pctEl) pctEl.textContent = '100%';
                const badge = document.getElementById('sintesi-badge-' + cid);
                if (badge) {
                    badge.textContent = 'Completato';
                    badge.style.background = 'rgba(74, 222, 128, 0.2)';
                    badge.style.color = '#4ade80';
                    badge.style.borderColor = 'rgba(74, 222, 128, 0.35)';
                }
                if (titleEl) titleEl.textContent = 'Sintesi completata!';
                if (descEl) descEl.textContent = 'Riassunto pronto per la consultazione.';

                if (window.navigator?.vibrate) {
                    try { window.navigator.vibrate(25); } catch (_) {}
                }

                setTimeout(async () => {
                    await window.ensureMarked();
                    const box = document.getElementById(`sintesi-box-${cid}`);
                    if (box) {
                        box.innerHTML = `
                            <div class="ai-prose" style="animation: fadeIn 0.4s ease-out; font-size:14px; line-height:1.75; color:#dae2fd;">
                                ${window.renderSafeMarkdown(result.sintesi)}
                            </div>`;
                    }
                }, 380);
            } else {
                const errMsg = (result && result.error) || 'Impossibile completare la sintesi.';
                _renderSintesiError(cid, link, errMsg);
            }
        } catch (err) {
            clearInterval(iv);
            _renderSintesiError(cid, link, err?.message || 'Errore di connessione durante la sintesi.');
        }
    };

    function _renderSintesiError(cid, link, errMsg) {
        const card = document.getElementById('sintesi-card-' + cid);
        if (!card) return;
        card.style.borderColor = 'rgba(255, 120, 120, 0.35)';
        card.style.background = 'rgba(38, 20, 30, 0.88)';
        card.innerHTML = `
            <div style="display:flex;align-items:center;gap:12px;">
                <div style="width:42px;height:42px;border-radius:15px;background:rgba(255,80,80,0.2);border:1px solid rgba(255,120,120,0.35);display:flex;align-items:center;justify-content:center;color:#ff9e9e;flex-shrink:0;">
                    <i class="ph-bold ph-warning-circle" style="font-size:22px;"></i>
                </div>
                <div>
                    <span style="font-size:10.5px;font-weight:800;color:#ff9e9e;text-transform:uppercase;letter-spacing:0.08em;background:rgba(255,80,80,0.2);border:1px solid rgba(255,120,120,0.3);padding:3px 9px;border-radius:999px;display:inline-block;">Errore Sintesi</span>
                    <p style="font-size:14px;color:#dae2fd;font-weight:700;margin:4px 0 0;line-height:1.3;">Elaborazione non riuscita</p>
                </div>
            </div>
            <p style="font-size:12.5px;color:#ffc4c4;margin:0;line-height:1.45;">${escapeHtml(errMsg)}</p>
            <button onclick="window._circ_startSintesi('${escapeJsSingleQuote(cid)}', '${escapeJsSingleQuote(link || '')}')" style="width:100%;height:44px;border-radius:14px;background:linear-gradient(135deg,#2f58cd 0%,#3b82f6 100%);color:#ffffff;border:none;font-size:13.5px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Inter',sans-serif;margin-top:4px;box-shadow:0 4px 16px rgba(47,88,205,0.4);">
                <i class="ph-bold ph-arrows-clockwise" style="font-size:16px;"></i>
                Riprova Elaborazione
            </button>
        `;
    }
}
function renderDayDetailModal(dateStr) {
    const container = getModalContainer();
    if (!container) return;

    const date = parseArgoDate(dateStr);
    const formattedDate = date.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

    const tasksForDay = getCalendarTasksForDate(dateStr);
    const verificheForDay = [];
    (state.verifiche || []).filter(v => v.data === dateStr).forEach(v => {
        verificheForDay.push({ subject: v.materia || v.subject || '', text: v.text || v.descrizione || '', tipo: v.tipo || '' });
    });
    (state.manualVerifiche || []).filter(v => v.date === dateStr).forEach(v => {
        verificheForDay.push({ subject: v.subject || '', text: v.args || '', tipo: v.type || '', id: v.id });
    });

    const hasContent = tasksForDay.length > 0 || verificheForDay.length > 0;

    showModal(`
        <div class="flex flex-col gap-6">
            <header>
                <div class="label-sm text-primary mb-1">Agenda Giornaliera</div>
                <h2 class="title-md text-on-surface capitalize">${formattedDate}</h2>
            </header>

            <div id="modal-task-list" class="flex flex-col gap-4 max-h-[400px] overflow-y-auto no-scrollbar">
                ${!hasContent ? `
                    <div class="p-12 text-center text-on-surface-variant/40">
                        <span class="material-symbols-outlined text-4xl mb-2">event_note</span>
                        <p class="font-medium">Nessun impegno pianificato</p>
                    </div>
                ` : ''}

                ${verificheForDay.map(v => `
                    <div class="p-5 rounded-[28px] bg-error/5 border border-error/20 flex items-center gap-4">
                        <div class="w-10 h-10 rounded-xl bg-error/10 flex items-center justify-center text-error">
                            <span class="material-symbols-outlined text-[20px]">warning</span>
                        </div>
                        <div class="flex-1">
                            <div class="label-sm text-error mb-1">${escapeHtml(normalizeTipoVerifica(v.tipo))}</div>
                            <h3 class="font-bold text-[15px]">${escapeHtml(v.text || v.subject)}</h3>
                        </div>
                    </div>
                `).join('')}

                ${tasksForDay.map(t => `
                    <div class="p-5 rounded-[28px] bg-surface-container-low border border-white/40 flex items-center gap-4 ${t.done ? 'opacity-50' : ''}">
                        <button onclick="toggleTask('${escapeJsSingleQuote(t.id)}'); renderDayDetailModal('${escapeJsSingleQuote(dateStr)}');" class="w-10 h-10 rounded-xl ${t.done ? 'bg-green/10 text-green' : 'bg-primary/10 text-primary'} flex items-center justify-center border border-white/60">
                            <span class="material-symbols-outlined text-[20px]">${t.done ? 'task_alt' : 'circle'}</span>
                        </button>
                        <div class="flex-1 min-width-0">
                            <div class="label-sm text-on-surface-variant/40 mb-1">${escapeHtml(t.subject)}</div>
                            <h3 class="font-bold text-[15px] truncate ${t.done ? 'line-through' : ''}">${escapeHtml(t.text)}</h3>
                        </div>
                        ${isUserGeneratedTaskId(t.id) ? `
                            <button onclick="deleteCalendarTask('${escapeJsSingleQuote(t.id)}', '${escapeJsSingleQuote(dateStr)}')" class="w-8 h-8 rounded-full bg-error/10 text-error flex items-center justify-center">
                                <span class="material-symbols-outlined text-[18px]">delete</span>
                            </button>
                        ` : ''}
                    </div>
                `).join('')}
            </div>

            <button class="btn btn-primary w-full h-14" onclick="closeModal()">Chiudi</button>
        </div>
    `);
}
function togglePlanInModal(dateStr, taskId) {
    // Utilizziamo la logica esistente ma aggiorniamo il modale
    if (!state.plannedTasks[dateStr]) state.plannedTasks[dateStr] = [];
    const index = state.plannedTasks[dateStr].indexOf(taskId);

    if (index > -1) {
        state.plannedTasks[dateStr].splice(index, 1);
    } else {
        state.plannedTasks[dateStr].push(taskId);
    }

    // Persistenza locale e remota automatica
    saveTasks();
    if (typeof debouncedSavePlannerRemote === 'function') debouncedSavePlannerRemote(500);

    // Aggiorna UI Calendario
    const calendarEl = document.getElementById('calendar');
    if (calendarEl && calendarEl._fullCalendar) {
        syncCalendarEvents(calendarEl._fullCalendar);
    }

    // Riaffresca il contenuto del modale per mostrare il check
    renderDayDetailModal(dateStr);

    // Feedback Home
    notifyPlannerChanged();
}
function deleteCalendarTask(taskId, dateStr = '') {
    if (!taskId || !isUserGeneratedTaskId(taskId)) return;
    const shouldRefreshDayModal = Boolean(dateStr && document.getElementById('modal-task-list'));
    state.tasks = state.tasks.filter(t => t.id !== taskId);
    // Remove from plannedTasks as well
    Object.keys(state.plannedTasks || {}).forEach(d => {
        if (Array.isArray(state.plannedTasks[d])) {
            state.plannedTasks[d] = state.plannedTasks[d].filter(id => id !== taskId);
        }
    });
    saveTasks();
    if (typeof debouncedSavePlannerRemote === 'function') debouncedSavePlannerRemote(500);
    if (typeof showToast === 'function') showToast('Attività eliminata');
    if (shouldRefreshDayModal) {
        renderDayDetailModal(dateStr);
    }
    notifyPlannerChanged();
    if (typeof updateHomeTaskFocusWidget === 'function') updateHomeTaskFocusWidget();
    if (typeof updateHomeView === 'function') updateHomeView();
    if (typeof renderCustomCalendar === 'function') renderCustomCalendar();
    if (typeof scheduleRender === 'function' && state.view === 'planner') scheduleRender(0);
}
function clearPlannedCalendarTasks() {
    const planned = (state.plannedTasks && typeof state.plannedTasks === 'object') ? state.plannedTasks : {};
    const hasPlanned = hasPlannedTasks(planned);
    if (!hasPlanned) {
        if (typeof showToast === 'function') showToast('Nessun compito pianificato da eliminare');
        return;
    }
    if (!confirm('Vuoi eliminare tutti i compiti pianificati nel calendario? L\'azione verrà salvata anche nel database.')) return;

    state.plannedTasks = {};
    saveTasks();
    if (typeof debouncedSavePlannerRemote === 'function') debouncedSavePlannerRemote(300);
    if (typeof showToast === 'function') showToast('Compiti pianificati eliminati');

    notifyPlannerChanged();
    if (state.view === 'planner' && state.uiMode === 'calendar' && typeof renderCustomCalendar === 'function') {
        renderCustomCalendar();
    } else if (state.view === 'planner' && typeof refreshAgenda === 'function') {
        refreshAgenda();
    } else if (typeof scheduleRender === 'function') {
        scheduleRender(0);
    }
}
function notifyPlannerChanged() {
    // ✅ FIX: invalida sempre la cache agenda prima di aggiornare
    state._weeklyAgendaCacheHtml = '';
    try { localStorage.removeItem(getAgendaCacheKey()); } catch (_) { }

    // badge sul bottone Organizza Oggi e Dashboard
    if (typeof updatePlannerCounter === 'function') updatePlannerCounter();
    // updateHomeView rimuove/aggiorna righe esistenti; updateHomeTaskFocusWidget
    // fa un re-render completo del widget (aggiunge anche i task appena pianificati)
    if (typeof updateHomeView === 'function') updateHomeView();
    if (typeof updateHomeTaskFocusWidget === 'function') updateHomeTaskFocusWidget();

    // ✅ FIX: Aggiorna la weekly agenda list in-place (nessun full re-render)
    if (state.view === 'planner') {
        const agendaEl = document.getElementById('weekly-agenda-list');
        if (agendaEl) {
            const newContent = renderWeeklyAgenda();
            const temp = document.createElement('div');
            temp.innerHTML = newContent;
            const newList = temp.querySelector('#weekly-agenda-list');
            if (newList) agendaEl.innerHTML = newList.innerHTML;
        }
    }

    // ✅ Aggiorna il calendario custom
    if (typeof renderCustomCalendar === 'function') renderCustomCalendar();

    // colori/stato eventi calendario
    const calendarEl = document.getElementById('calendar');
    if (calendarEl && calendarEl._fullCalendar) {
        syncCalendarEvents(calendarEl._fullCalendar);
        calendarEl._fullCalendar.updateSize();
    }
}
function getPlannedTasksTotalCount() {
    return Object.values(state.plannedTasks || {}).reduce((sum, list) => {
        if (!Array.isArray(list)) return sum;
        return sum + list.length;
    }, 0);
}
function getSubjectColor(subject) {
    let s = (subject || '').trim();
    s = s.replace(/[*_\[\]]/g, '').trim();
    if (!s) return '#3B9DD4';

    const normalized = normalizeSubjectName(s);
    const abbr = getSubjectAbbrev(s).toLowerCase();
    const colorByAbbrev = {
        mat: '#2563EB',
        fis: '#6366F1',
        ing: '#14B8A6',
        ita: '#EF4444',
        sto: '#EAB308',
        geo: '#D4A037',
        lat: '#D44B4B',
        sci: '#22C55E',
        bio: '#10B981',
        chi: '#9040C8',
        fil: '#A855F7',
        art: '#FF6B00',
        dis: '#FF6B00',
        scm: '#E0F2FE',
        rel: '#C82090',
        inf: '#06B6D4',
        dir: '#2A5CC8',
        eco: '#C89020',
        fra: '#3055C0',
        ted: '#C82060',
        spa: '#C83030',
        grc: '#C82090',
        civ: '#B46534'
    };
    if (colorByAbbrev[abbr]) return colorByAbbrev[abbr];

    if (normalized.includes('educazione civica') || normalized.includes('ed civica') || normalized.includes('civica')) return '#B46534';
    if (normalized.includes('scienze motorie') || normalized.includes('motorie') || normalized.includes('sportive')) return '#E0F2FE';
    if (normalized.includes('scienze naturali') || normalized.includes('naturali')) return '#22C55E';
    if (normalized.includes('informatica')) return '#06B6D4';
    if (normalized.includes('matematica')) return '#2563EB';
    if (normalized.includes('filosofia')) return '#A855F7';
    if (normalized.includes('fisica')) return '#6366F1';
    if (normalized.includes('storia')) return '#EAB308';
    if (normalized.includes('italiano')) return '#EF4444';
    if (normalized.includes('inglese')) return '#14B8A6';
    const isArtDrawingSubject = isArtDrawingSubjectNormalized(normalized);
    if (isArtDrawingSubject) return '#FF6B00';

    // Fallback: stable vibrant color
    let hash = 0;
    for (let i = 0; i < s.length; i++) {
        hash = s.charCodeAt(i) + ((hash << 5) - hash);
    }
    const h = Math.abs(hash % 360);
    return `hsl(${h}, 80%, 52%)`;
}
function renderAvatar(displayName, size = 44) {
    const initials = displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

    // Generate stable pastel color from name
    const hash = Array.from(displayName).reduce((acc, char) => char.charCodeAt(0) + ((acc << 5) - acc), 0);
    const hue = Math.abs(hash % 360);
    const bg = `hsl(${hue}, 60%, 45%)`;

    return `
            <div style="width:${size}px; height:${size}px; background:${bg}; border-radius:50%; display:flex; align-items:center; justify-content:center; color:white; font-weight:700; font-size:${size * 0.4}px; border:2px solid rgba(var(--glass-rgb),0.15); flex-shrink:0; pointer-events:none;">
                ${initials}
            </div>`;
}
function showEditProfileModal() {
    const modalContainer = getModalContainer();
    if (!modalContainer) return;
    modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()" style="width: 100%; max-width: 440px; animation: slideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h2 style="margin: 0; font-size: 22px; font-weight: 800;">Modifica Profilo</h2>
                    <button onclick="closeModal()" style="background: none; border: none; color: var(--text-dim); cursor: pointer; font-size: 20px;"><i class="ph-bold ph-x"></i></button>
                </div>
                
                <div style="display: flex; flex-direction: column; gap: 20px;">
                    <div>
                        <label style="display: block; font-size: 11px; font-weight: 800; color: var(--text-dim); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">Nome Completo</label>
                        <input type="text" id="edit-user-name" value="${escapeHtml(state.user.name || '')}" placeholder="Esempio: Andrea Rossi">
                    </div>
                    
                    <div style="padding: 16px; background: rgba(99, 102, 241, 0.03); border-radius: var(--radius-m); border: 1px solid rgba(99, 102, 241, 0.1);">
                        <p style="font-size: 12px; color: var(--text-secondary); margin: 0; line-height: 1.5;">
                            <i class="ph-fill ph-info" style="color: var(--accent); margin-right: 4px;"></i>
                            I dati scolastici come <b>classe</b> e <b>specializzazione</b> vengono aggiornati automaticamente sincronizzando DidUP.
                        </p>
                    </div>

                    <button onclick="saveProfileChanges()" class="btn-primary" style="width: 100%; margin-top: 12px;">
                        Salva Profilo
                    </button>
                </div>
            </div>
        </div>`;
}
function showProfileActions() {
    const modalContainer = getModalContainer();
    if (!modalContainer) return;
    modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()" style="width: 100%; max-width: 380px; padding: 8px; animation: slideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);">
                <!-- User Profile Summary -->
                <div style="padding: 24px; display: flex; align-items: center; gap: 16px;">
                    ${renderAvatar(state.user.name, 56)}
                    <div style="min-width: 0;">
                        <div style="font-size: 18px; font-weight: 800; color: var(--text-primary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(state.user.name)}</div>
                        <div style="font-size: 13px; color: var(--text-dim); font-weight: 600;">${escapeHtml((typeof getEffectiveUserClass === 'function' && getEffectiveUserClass()) || normalizeClassUi(state.user?.class, state.user?.specialization) || 'Studente')}</div>
                    </div>
                </div>

                <div style="padding: 0 8px 12px 8px; display: flex; flex-direction: column; gap: 4px;">
                    <button class="nav-item" onclick="closeModal(); navigate('profile');" style="width: 100%; border-radius: 12px; height: 52px; display: flex; align-items: center; gap: 12px; padding: 0 16px; background: transparent; border: none; cursor: pointer;">
                        <i class="ph-bold ph-gear" style="font-size: 20px; color: var(--text-dim);"></i>
                        <span style="font-size: 14px; font-weight: 700; color: var(--text-primary);">Configurazione</span>
                    </button>

                    <div style="height: 1px; background: rgba(var(--glass-rgb),0.05); margin: 8px 4px;"></div>

                    <button onclick="logout()" style="width: 100%; border-radius: 12px; height: 52px; display: flex; align-items: center; gap: 12px; padding: 0 16px; background: rgba(239, 68, 68, 0.05); border: none; cursor: pointer; color: var(--red);">
                        <i class="ph-bold ph-sign-out" style="font-size: 20px;"></i>
                        <span style="font-size: 14px; font-weight: 800;">Esci dall'Account</span>
                    </button>
                </div>
            </div>
        </div>`;
}
window.showProfileActions = showProfileActions;
function renderSettings() {
    return `
            <div class="view">
                <div style="margin-bottom: 24px;">
                    <h1 style="font-size: 28px; color: var(--text-primary);">Impostazioni</h1>
                    <p style="font-size: 15px; color: var(--text-secondary);">Configura la tua esperienza</p>
               </div>

                <div class="glass-panel" style="padding: 0; overflow: hidden;">
                    <!-- Profile Section -->
                    <div style="padding: 20px; display: flex; align-items: center; gap: 16px; border-bottom: 1px solid rgba(var(--glass-rgb),0.05);">
                         ${renderAvatar(state.user.name, 56)}
                        <div>
                            <div style="font-size: 17px; font-weight: 600; color: var(--text-primary);">${escapeHtml(state.user.name)}</div>
                            <div style="font-size: 14px; color: var(--text-secondary);">${escapeHtml((typeof getEffectiveUserClass === 'function' && getEffectiveUserClass()) || normalizeClassUi(state.user?.class, state.user?.specialization) || state.user?.class || 'Studente')}</div>
                       </div>
                   </div>
                    
                    <!-- Options List -->
                    <div style="display: flex; flex-direction: column;">
                        <div onclick="logout()" style="padding: 16px 20px; display: flex; align-items: center; gap: 14px; cursor: pointer; transition: background 0.2s;">
                             <div style="width: 32px; height: 32px; background: var(--red); border-radius: 8px; display: flex; align-items: center; justify-content: center; color: white;">
                                <i class="ph-bold ph-sign-out" style="font-size: 18px;"></i>
                           </div>
                            <div style="flex: 1; font-size: 16px; font-weight: 500; color: var(--red);">Esci</div>
                       </div>

                   </div>
               </div>
                
                <div style="margin-top: 30px; text-align: center;">
                    <p style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">v5.0 (Liquid Glass)</p>
                    <p style="font-size: 11px; color: var(--text-dim);">Made for Students</p>
               </div>
           </div>
            `;
}
function renderWeeklyAgenda() {
    const list = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tasks = Array.isArray(state.tasks) ? state.tasks : [];
    const plannedTasks = (state.plannedTasks && typeof state.plannedTasks === 'object') ? state.plannedTasks : {};

    if (state.plannerMode === 'registro') {
        tasks.forEach(t => {
            if (t.subject !== 'QUEST' && !t.isExam && t.due_date) {
                list.push({ ...t, displayDate: t.due_date });
            }
        });
    } else {
        Object.entries(plannedTasks).forEach(([dateStr, ids]) => {
            if (!Array.isArray(ids)) return;
            ids.forEach(id => {
                const t = tasks.find(tk => tk.id === id);
                if (t && !t.isExam) list.push({ ...t, displayDate: dateStr });
            });
        });
    }



    // --- LIVE FILTERING LOGIC ---
    const query = (state.agendaSearchQuery || "").toLowerCase().trim();
    const filterSubject = state.agendaSearchSubject || "all";
    if (state.agendaSortOrder !== "due_desc") state.agendaSortOrder = "due_desc";

    const preparedList = list.map(t => ({
        ...t,
        _dueTs: parseArgoDate(t.displayDate).getTime()
    }));

    const filteredList = preparedList.filter(t => {
        const matchesQuery = !query ||
            (t.text || "").toLowerCase().includes(query) ||
            (t.subject || "").toLowerCase().includes(query);

        const matchesSubject = filterSubject === "all" ||
            (t.subject || "").toLowerCase().trim() === filterSubject.toLowerCase().trim();

        return matchesQuery && matchesSubject;
    }).sort((a, b) => b._dueTs - a._dueTs);

    // Extract unique subjects for chips
    const allSubjects = [...new Set(list.map(t => t.subject?.trim()).filter(Boolean))].sort();

    const searchHeader = `
                <div class="agenda-search-container">
                    <div class="search-input-wrapper">
                        <i class="ph-bold ph-magnifying-glass"></i>
                        <input type="text" 
                               class="agenda-search-input" 
                               placeholder="Cerca tra i tuoi compiti..." 
                               value="${state.agendaSearchQuery || ''}"
                               oninput="handleAgendaSearch(event)">
                    </div>
                    <div class="agenda-filters-scroll">
                        <div class="filter-chip ${filterSubject === 'all' ? 'active' : ''}" onclick="state.agendaSearchSubject='all'; state._filterJustTriggered=true; refreshAgenda();">
                            <i class="ph ph-rows"></i> Tutti
                        </div>
                        ${allSubjects.map(s => {
        const escapedS = s.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
        return `
                                <div class="filter-chip ${filterSubject === s ? 'active' : ''}" onclick="state.agendaSearchSubject='${escapedS}'; state._filterJustTriggered=true; refreshAgenda();">
                                    ${s}
                                </div>
                            `;
    }).join('')}
                    </div>
                </div>
            `;

    if (!filteredList.length) {
        return `
                ${searchHeader}
                <div class="card" style="text-align: center; color: var(--text-dim); padding: 50px 20px; font-family: 'Inter', sans-serif; background: rgba(0,0,0,0.02); border: 1px dashed rgba(0,0,0,0.05);">
                    <i class="ph ph-magnifying-glass" style="font-size: 40px; opacity: 0.2; margin-bottom: 12px; display: block;"></i>
                    <div style="font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em;">// NESSUN RISULTATO</div>
                    <p style="font-size: 12px; margin-top: 4px; opacity: 0.6;">Prova a cambiare i filtri o la ricerca</p>
                </div> `;
    }

    const grouped = {};
    filteredList.forEach(t => {
        if (!grouped[t.displayDate]) grouped[t.displayDate] = [];
        grouped[t.displayDate].push(t);
    });
    const sortedDates = Object.keys(grouped).sort((a, b) => parseArgoDate(b).getTime() - parseArgoDate(a).getTime());

    return `
        <div id="weekly-agenda-list" class="weekly-agenda-root" style="display: flex; flex-direction: column; gap: 32px;">
            ${searchHeader}
            ${sortedDates.map(dateStr => {
        const d = parseArgoDate(dateStr);
        const dayNum = d.toLocaleDateString('it-IT', { day: 'numeric' });
        const dayName = d.toLocaleDateString('it-IT', { weekday: 'long' });
        const monthName = d.toLocaleDateString('it-IT', { month: 'short' });
        const isToday = dateStr === getLocalDateString();
        const isTomorrow = (() => { const tm = new Date(); tm.setDate(tm.getDate() + 1); return dateStr === getLocalDateString(tm); })();

        const labelColor = isToday ? 'var(--success)' : isTomorrow ? '#FF9F0A' : 'transparent';
        const labelText = isToday ? 'TODAY' : isTomorrow ? 'BEYOND' : '';
        const labelTag = isToday || isTomorrow
            ? `<span class="agenda-day-label" style="font-family: var(--font-main); font-size:10px; font-weight:800; color:${labelColor}; border: 1px solid ${labelColor}; padding:2px 8px; border-radius:4px; text-transform:uppercase; letter-spacing:0.05em;">${labelText}</span>`
            : '';

        return `
            <div class="agenda-day-section">
                <!-- TE Date Header -->
                <div style="display:flex; align-items:center; gap:12px; margin-bottom:12px;">
                    <div style="display:flex; flex-direction:column; align-items:center; min-width:44px;">
                        <span style="font-family: var(--font-main); font-size:24px; font-weight:800; color:${isToday ? 'var(--accent)' : 'var(--text-primary)'}; line-height:1; letter-spacing:-0.04em;">${dayNum}</span>
                        <span class="agenda-day-month" style="font-family: var(--font-main); font-size:10px; font-weight:700; color:var(--text-dim); text-transform:uppercase; letter-spacing:0.1em; margin-top:2px;">${monthName}</span>
                    </div>
                    <div style="flex:1; height:1px; background:rgba(0,0,0,0.05);"></div>
                    <div style="font-family: var(--font-main); font-size:12px; font-weight:700; color:var(--text-dim); text-transform:capitalize; letter-spacing:-0.01em;">${dayName}</div>
                    ${labelTag}
                </div>
                
                <!-- Tasks List -->
                <div style="display:flex; flex-direction:column; gap:12px;">
                    ${grouped[dateStr].filter(t => !/check-?list|check\s*liste|checklist\s*&\s*review/i.test(t.text || t.description || '')).map(t => {
            const subjColor = getSubjectColor(t.subject);
            const cleanSubject = (t.subject || '').replace(/\*/g, '').trim();
            const timeMatch = (t.text || '').match(/(\d{1,2}:\d{2})/);
            const timeStr = timeMatch ? timeMatch[1] : '';

            const displayText = (t.text || t.description || 'Task')
                .replace(/^\[AI\]\s*/i, '')
                .replace(/^\d{2}:\d{2}\s*[—\-]\s*/, '')
                .replace(/\*/g, '')
                .replace(/[\s|]+$/, '')
                .trim();

            return `
                        <div class="card agenda-task-card" style="display:flex; align-items:stretch; background:${t.done ? '#FAFAF9' : 'var(--surface-container-lowest)'}; border: 1px solid ${t.done ? '#EDEBE7' : 'rgba(0,0,0,0.06)'}; border-radius:14px; min-height:80px; box-shadow: 0 1px 3px rgba(0,0,0,0.02); transition: background 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), border-color 0.2s cubic-bezier(0.2, 0.8, 0.2, 1), box-shadow 0.2s cubic-bezier(0.2, 0.8, 0.2, 1);">
                        <div style="width:4px; background:${t.done ? 'var(--outline-variant)' : subjColor}; flex-shrink:0;"></div>
                        
                        <div class="agenda-task-main" style="flex:1; padding:16px 20px; min-width:0; display:flex; flex-direction:column; justify-content:center;">
                            <div style="display:flex; align-items:center; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
                                <span class="agenda-subject-badge" style="font-family: var(--font-main); font-size:9px; font-weight:700; color:${t.done ? 'var(--on-surface-variant)' : subjColor}; text-transform:uppercase; letter-spacing:0.08em; background:rgba(0,0,0,0.04); padding:2px 6px; border-radius:4px;">${escapeHtml(cleanSubject)}</span>
                                ${timeStr ? `<span class="agenda-time-badge" style="font-family: var(--font-main); font-size:9px; font-weight:600; color:var(--on-surface-variant); background:var(--surface-container-low); padding:2px 6px; border-radius:4px;">${escapeHtml(timeStr)}</span>` : ''}
                            </div>
                            <div data-task-text="${escapeHtml(t.id)}" style="font-family: var(--font-main); font-size:14px; font-weight:600; color:${t.done ? 'var(--on-surface-variant)' : 'var(--on-surface)'}; line-height:1.5; word-break:break-word; ${t.done ? 'text-decoration:line-through; opacity: 0.5;' : ''}">${escapeHtml(displayText)}</div>
                        </div>
                        
                        <div class="agenda-task-actions" style="padding:0 16px; display:flex; align-items:center; justify-content:center; gap:8px; flex-shrink:0; border-left: 1px dashed rgba(0,0,0,0.04);">
                            <div class="agenda-task-action-btn" data-task-toggle="${escapeHtml(t.id)}" onclick="toggleTask('${escapeJsSingleQuote(t.id)}')" style="width:30px; height:30px; border-radius:8px; border:1.5px solid ${t.done ? 'var(--on-surface)' : 'var(--outline-variant)'}; background:${t.done ? 'var(--on-surface)' : 'transparent'}; display:flex; align-items:center; justify-content:center; cursor:pointer; transition: background 0.18s ease, border-color 0.18s ease; flex-shrink:0;">
                                ${t.done ? '<i class="ph-bold ph-check" style="font-size:14px; color:#fff;"></i>' : ''}
                            </div>
                            ${isUserGeneratedTaskId(t.id) ? `
                            <button class="agenda-task-action-btn" onclick="event.stopPropagation(); deleteCalendarTask('${escapeJsSingleQuote(t.id)}');" style="width:30px; height:30px; border-radius:8px; border:1px solid rgba(255,59,48,0.18); background:var(--error-container); color:var(--error); display:flex; align-items:center; justify-content:center; cursor:pointer; transition: background 0.18s ease; flex-shrink:0;" aria-label="Elimina attività">
                                <i class="ph-bold ph-trash" style="font-size:13px;"></i>
                            </button>` : ''}
                        </div>
                    </div>`;
        }).join('')}
                </div>
            </div>`;
    }).join('')}
        </div>`;
}

function getActivityDateObject(activity) {
    const rawDate = activity?.date || activity?.datGiorno || '';
    const parsed = parseArgoDate(rawDate);
    if (!(parsed instanceof Date) || Number.isNaN(parsed.getTime())) return null;
    return parsed;
}

function getCurrentSchoolYearLabel() {
    const now = new Date();
    // Convenzione scolastica italiana: anno scolastico da settembre ad agosto.
    const startYear = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
    return `${startYear}-${startYear + 1}`;
}

function getSchoolYearLabelForDate(date) {
    // Convenzione scolastica italiana: anno scolastico da settembre ad agosto.
    const startYear = date.getMonth() >= 8 ? date.getFullYear() : date.getFullYear() - 1;
    return `${startYear}-${startYear + 1}`;
}

function getIsoWeekInputValue(date) {
    const target = new Date(date.getTime());
    target.setHours(0, 0, 0, 0);
    const day = (target.getDay() + 6) % 7;
    target.setDate(target.getDate() - day + 3);
    const firstThursday = new Date(target.getFullYear(), 0, 4);
    const firstThursdayDay = (firstThursday.getDay() + 6) % 7;
    firstThursday.setDate(firstThursday.getDate() - firstThursdayDay + 3);
    const week = 1 + Math.round((target - firstThursday) / (7 * 24 * 60 * 60 * 1000));
    return `${target.getFullYear()}-W${String(week).padStart(2, '0')}`;
}

function parseIsoWeekRange(weekValue) {
    const match = String(weekValue || '').match(/^(\d{4})-W(\d{2})$/);
    if (!match) return null;
    const year = Number(match[1]);
    const week = Number(match[2]);
    if (!Number.isFinite(year) || !Number.isFinite(week)) return null;
    const jan4 = new Date(year, 0, 4, 12, 0, 0);
    const jan4Day = (jan4.getDay() + 6) % 7;
    const week1Monday = new Date(jan4);
    week1Monday.setDate(jan4.getDate() - jan4Day);
    const start = new Date(week1Monday);
    start.setDate(week1Monday.getDate() + (week - 1) * 7);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
}

function getViewportWidth() {
    return window.innerWidth || document.documentElement.clientWidth || 0;
}

function getWeekSelectionDetailLabel(weekValue, options = {}) {
    const match = String(weekValue || '').match(/^(\d{4})-W(\d{2})$/);
    const range = parseIsoWeekRange(weekValue);
    if (!match || !range) return '';
    const weekNumber = Number(match[2]);
    const weekYear = Number(match[1]);
    const startLabel = range.start.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' });
    const endLabel = range.end.toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: '2-digit' });
    if (options.compact) return `${startLabel} → ${endLabel}`;
    return `Settimana ${weekNumber} del ${weekYear} · da ${startLabel} a ${endLabel}`;
}

function getWeekSelectionOptionLabel(weekValue, options = {}) {
    const normalizedWeek = String(weekValue || '');
    if (!/^\d{4}-W\d{2}$/.test(normalizedWeek)) return normalizedWeek;
    const range = parseIsoWeekRange(normalizedWeek);
    if (!range) return normalizedWeek;
    const startLabel = range.start.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    const endLabel = range.end.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
    if (options.compact) return `${startLabel} → ${endLabel}`;
    const weekNumber = Number(normalizedWeek.slice(6));
    return `Settimana ${weekNumber} · ${startLabel} → ${endLabel}`;
}

function shiftIsoWeekValue(weekValue, deltaWeeks) {
    const range = parseIsoWeekRange(weekValue);
    if (!range || !Number.isFinite(deltaWeeks)) return weekValue;
    const target = new Date(range.start);
    target.setDate(target.getDate() + (deltaWeeks * 7));
    return getIsoWeekInputValue(target);
}

function getClassActivitiesWeekOptions(selectedWeekValue) {
    const weeks = new Set();
    const today = new Date();
    // Keep a wide recent/upcoming window so users can switch weeks quickly without raw ISO inputs.
    for (let offset = -CLASS_ACTIVITIES_WEEK_LOOKBACK; offset <= CLASS_ACTIVITIES_WEEK_LOOKAHEAD; offset += 1) {
        const d = new Date(today);
        d.setDate(today.getDate() + (offset * 7));
        weeks.add(getIsoWeekInputValue(d));
    }
    getSortedCompletedClassActivities().forEach((activity) => {
        if (activity?._parsedDate instanceof Date) {
            weeks.add(getIsoWeekInputValue(activity._parsedDate));
        }
    });
    const selected = selectedWeekValue || getIsoWeekInputValue(today);
    weeks.add(selected);
    const sorted = [...weeks].sort((a, b) => {
        const aStart = parseIsoWeekRange(a)?.start?.getTime?.() ?? 0;
        const bStart = parseIsoWeekRange(b)?.start?.getTime?.() ?? 0;
        return bStart - aStart;
    });
    // Safety cap to keep the dropdown compact even when there are many historical school years.
    return sorted.slice(0, CLASS_ACTIVITIES_MAX_WEEK_OPTIONS);
}

function getSortedCompletedClassActivities() {
    return (Array.isArray(state.classActivities) ? state.classActivities : [])
        .map((a) => ({ ...a, _parsedDate: getActivityDateObject(a) }))
        .filter((a) => a._parsedDate)
        .sort((a, b) => {
            const delta = b._parsedDate.getTime() - a._parsedDate.getTime();
            if (delta !== 0) return delta;
            return String(b?.id || '').localeCompare(String(a?.id || ''));
        });
}

function getClassActivitiesExportSelection() {
    const saved = state.classActivitiesExport || {};
    const period = saved.period || 'month';
    const monthValue = saved.month || getLocalDateString().slice(0, 7);
    const weekValue = saved.week || getIsoWeekInputValue(new Date());
    const schoolYearValue = saved.schoolYear || getCurrentSchoolYearLabel();
    const all = getSortedCompletedClassActivities();
    let items = all;
    let periodLabel = 'Intero anno scolastico';

    if (period === 'month') {
        items = all.filter((a) => getLocalDateString(a._parsedDate).slice(0, 7) === monthValue);
        const [y, m] = monthValue.split('-');
        const monthName = new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
        periodLabel = `Mese: ${monthName}`;
    } else if (period === 'week') {
        const range = parseIsoWeekRange(weekValue);
        if (range) {
            const startKey = getLocalDateString(range.start);
            const endKey = getLocalDateString(range.end);
            items = all.filter((a) => {
                const key = getLocalDateString(a._parsedDate);
                return key >= startKey && key <= endKey;
            });
            periodLabel = getWeekSelectionDetailLabel(weekValue) || `Settimana: ${range.start.toLocaleDateString('it-IT')} - ${range.end.toLocaleDateString('it-IT')}`;
        } else {
            items = [];
            periodLabel = 'Settimana non valida';
        }
    } else if (period === 'school_year') {
        const m = schoolYearValue.match(/^(\d{4})-(\d{4})$/);
        if (m) {
            const start = new Date(Number(m[1]), 8, 1, 0, 0, 0);
            const end = new Date(Number(m[2]), 7, 31, 23, 59, 59);
            items = all.filter((a) => a._parsedDate >= start && a._parsedDate <= end);
            periodLabel = `Anno scolastico: ${m[1]}/${m[2]}`;
        } else {
            items = [];
            periodLabel = 'Anno scolastico non valido';
        }
    }

    return { period, monthValue, weekValue, schoolYearValue, items, periodLabel, totalItems: all.length };
}

function renderClassActivitiesExportModalContent() {
    const modalContent = document.getElementById('class-activities-export-modal-content');
    if (!modalContent) return;
    const selection = getClassActivitiesExportSelection();
    const weekOptions = getClassActivitiesWeekOptions(selection.weekValue);
    if (!weekOptions.includes(selection.weekValue) && weekOptions.length > 0) {
        selection.weekValue = weekOptions[0];
        state.classActivitiesExport = state.classActivitiesExport || {};
        state.classActivitiesExport.week = selection.weekValue;
    }
    const viewportWidth = getViewportWidth();
    const compactWeekLabels = viewportWidth <= MOBILE_WEEK_LABEL_BREAKPOINT;
    const weekDetailLabel = getWeekSelectionDetailLabel(selection.weekValue, compactWeekLabels ? { compact: true } : {});
    const years = [...new Set(getSortedCompletedClassActivities().map(a => getSchoolYearLabelForDate(a._parsedDate)))].sort((a, b) => b.localeCompare(a));
    if (!years.length) years.push(getCurrentSchoolYearLabel());

    // ── Period controls — Apple Liquid Glass Style ─────────
    const S = 'width:100%;padding:14px 16px;border-radius:16px;border:0.5px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#ffffff;font-size:14px;font-weight:600;font-family:\'Inter\',sans-serif;outline:none;box-sizing:border-box;-webkit-appearance:none;';

    const periodControls = selection.period === 'month'
        ? `<input type="month" value="${escapeHtml(selection.monthValue)}" onchange="updateClassActivitiesExportPeriodValue('month', this.value)" style="${S}">`
        : selection.period === 'week'
            ? `<div style="display:flex;flex-direction:column;gap:8px;">
                <div style="display:flex;align-items:center;gap:8px;">
                    <button type="button" onclick="shiftClassActivitiesExportWeek(-1)" style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.15);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#ffffff;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.92)'" ontouchend="this.style.transform='scale(1)'">
                        <i class="ph-bold ph-caret-left" style="font-size:18px;"></i>
                    </button>
                    <select onchange="updateClassActivitiesExportPeriodValue('week', this.value)" style="${S}flex:1;">
                        ${weekOptions.map((weekValue) => `<option value="${escapeHtml(weekValue)}" ${selection.weekValue === weekValue ? 'selected' : ''}>${escapeHtml(getWeekSelectionOptionLabel(weekValue, compactWeekLabels ? { compact: true } : {}))}</option>`).join('')}
                    </select>
                    <button type="button" onclick="shiftClassActivitiesExportWeek(1)" style="width:42px;height:42px;border-radius:50%;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.15);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#ffffff;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.92)'" ontouchend="this.style.transform='scale(1)'">
                        <i class="ph-bold ph-caret-right" style="font-size:18px;"></i>
                    </button>
                </div>
                ${weekDetailLabel ? `<p style="font-size:11px;color:rgba(255,255,255,0.5);font-weight:600;text-align:center;margin:0;">${escapeHtml(weekDetailLabel)}</p>` : ''}
              </div>`
            : `<select onchange="updateClassActivitiesExportPeriodValue('school_year', this.value)" style="${S}">
                ${years.map(y => `<option value="${escapeHtml(y)}" ${selection.schoolYearValue === y ? 'selected' : ''}>${escapeHtml(y.replace('-', '/'))}</option>`).join('')}
              </select>`;

    const mkTab = (period, label, icon) => {
        const act = selection.period === period;
        return `<button onclick="setClassActivitiesExportPeriod('${period}')" style="padding:10px 6px;border-radius:12px;font-size:12px;font-weight:${act?'700':'600'};cursor:pointer;font-family:'Inter',sans-serif;border:${act?'1px solid rgba(41,151,255,0.6)':'none'};background:${act?'#2997ff':'transparent'};color:${act?'#ffffff':'rgba(255,255,255,0.7)'};box-shadow:${act?'0 4px 14px rgba(41,151,255,0.35)':'none'};display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s ease;">
            <i class="ph-fill ${icon}" style="font-size:14px;color:${act?'#ffffff':'#2997ff'};"></i>
            <span>${label}</span>
        </button>`;
    };

    modalContent.innerHTML = `
        <div style="font-family:'Inter',sans-serif;color:#ffffff;position:relative;">
            <!-- Ambient Top Glow -->
            <div style="position:absolute;top:-20px;right:-20px;width:120px;height:120px;background:#2997ff;opacity:0.2;border-radius:50%;filter:blur(30px);pointer-events:none;"></div>

            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:flex-start;padding:24px 24px 18px;position:relative;z-index:1;">
                <div>
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                        <span style="width:6px;height:6px;border-radius:50%;background:#2997ff;box-shadow:0 0 8px #2997ff;"></span>
                        <span style="font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#2997ff;">REPORT ACCADEMICO</span>
                    </div>
                    <h2 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">Esporta Attività</h2>
                    <p style="margin:3px 0 0;font-size:12px;color:rgba(255,255,255,0.6);font-weight:500;">Attività e lezioni registrate sul diario</p>
                </div>
                <button onclick="(function(){var o=document.querySelector('.modal-overlay.active');if(o)o.remove();else{var mc=document.getElementById('class-activities-export-modal-content');if(mc&&mc.parentNode)mc.parentNode.remove();}})()" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.8);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.9)'" ontouchend="this.style.transform='scale(1)'">
                    <i class="ph ph-x" style="font-size:18px;"></i>
                </button>
            </div>

            <!-- Period tabs + controls -->
            <div style="padding:0 24px 16px;display:flex;flex-direction:column;gap:14px;position:relative;z-index:1;">
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;background:rgba(255,255,255,0.05);padding:4px;border-radius:16px;border:0.5px solid rgba(255,255,255,0.1);">
                    ${mkTab('week','Settimana','ph-calendar')}
                    ${mkTab('month','Mese','ph-calendar-blank')}
                    ${mkTab('school_year','Anno','ph-graduation-cap')}
                </div>
                <div>${periodControls}</div>
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;background:rgba(20,31,54,0.75);border-radius:16px;border:0.5px solid rgba(255,255,255,0.12);">
                    <span style="font-size:13px;color:rgba(255,255,255,0.7);font-weight:500;">${escapeHtml(selection.periodLabel)}</span>
                    <span style="font-size:12px;font-weight:800;color:#2997ff;background:rgba(41,151,255,0.15);padding:4px 12px;border-radius:999px;border:0.5px solid rgba(41,151,255,0.3);">${selection.items.length} trovate</span>
                </div>
            </div>

            <!-- PDF button -->
            <div style="padding:0 24px 8px;position:relative;z-index:1;">
                <button onclick="downloadClassActivitiesPdf()" style="width:100%;height:52px;border-radius:18px;border:1px solid rgba(255,255,255,0.3);background:linear-gradient(135deg,#2997ff 0%,#0058bc 100%);color:white;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 8px 24px rgba(41,151,255,0.4);display:flex;align-items:center;justify-content:center;gap:8px;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform='scale(1)'">
                    <i class="ph-bold ph-file-pdf" style="font-size:20px;"></i>
                    Genera PDF Ufficiale
                </button>
                <p style="text-align:center;font-size:11px;color:rgba(255,255,255,0.45);margin:10px 0 0;line-height:1.4;">Si aprirà l'anteprima di stampa Apple/sistema: seleziona "Salva come PDF".</p>
            </div>
        </div>
    `;
}

window.openClassActivitiesExportModal = function () {
    const modalContainer = getModalContainer();
    if (!modalContainer) return;
    if (!state.classActivitiesExport) {
        state.classActivitiesExport = {
            period: 'month',
            month: getLocalDateString().slice(0, 7),
            week: getIsoWeekInputValue(new Date()),
            schoolYear: getCurrentSchoolYearLabel()
        };
    }
    modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)" style="position:fixed;inset:0;z-index:99990;background:rgba(5,8,17,0.75);display:flex;align-items:flex-end;justify-content:center;backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);">
            <div id="class-activities-export-modal-content" onclick="event.stopPropagation()" style="width:100%;max-width:480px;background:rgba(18,26,44,0.95);border:0.5px solid rgba(255,255,255,0.15);border-top:1px solid rgba(255,255,255,0.25);border-radius:32px 32px 0 0;padding:0 0 calc(28px + env(safe-area-inset-bottom,0px)) 0;box-shadow:0 -12px 40px rgba(0,0,0,0.6);overflow:hidden;max-height:90vh;overflow-y:auto;font-family:'Inter',sans-serif;"></div>
        </div>
    `;
    renderClassActivitiesExportModalContent();
};

window.setClassActivitiesExportPeriod = function (period) {
    state.classActivitiesExport = state.classActivitiesExport || {};
    state.classActivitiesExport.period = period;
    renderClassActivitiesExportModalContent();
};

window.togglePlannerMobileDropdown = function (event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('planner-mobile-menu');
    const toggle = document.getElementById('planner-menu-toggle');
    if (!menu || !toggle) return;

    const isActive = menu.classList.contains('active');

    // Close all other dropdowns first if any (optional but good practice)

    if (isActive) {
        closePlannerMobileDropdown();
    } else {
        menu.classList.add('active');
        toggle.classList.add('active');
        toggle.setAttribute('aria-expanded', 'true');
        repositionPlannerMobileDropdown();
        plannerMobileDropdownRepositionListener = repositionPlannerMobileDropdown;
        window.addEventListener('resize', plannerMobileDropdownRepositionListener, { passive: true });
        window.addEventListener('scroll', plannerMobileDropdownRepositionListener, PLANNER_MOBILE_DROPDOWN_SCROLL_LISTENER_OPTIONS);

        // Add one-time listener to close when clicking outside
        const closeOnOutsideClick = (e) => {
            if (!menu.contains(e.target) && !toggle.contains(e.target)) {
                closePlannerMobileDropdown();
                document.removeEventListener('click', closeOnOutsideClick);
            }
        };
        setTimeout(() => document.addEventListener('click', closeOnOutsideClick), 0);
    }
};

window.closePlannerMobileDropdown = function () {
    const menu = document.getElementById('planner-mobile-menu');
    const toggle = document.getElementById('planner-menu-toggle');
    if (menu) menu.classList.remove('active');
    if (toggle) {
        toggle.classList.remove('active');
        toggle.setAttribute('aria-expanded', 'false');
    }
    if (plannerMobileDropdownRepositionListener) {
        window.removeEventListener('resize', plannerMobileDropdownRepositionListener);
        window.removeEventListener('scroll', plannerMobileDropdownRepositionListener, PLANNER_MOBILE_DROPDOWN_SCROLL_LISTENER_OPTIONS);
        plannerMobileDropdownRepositionListener = null;
    }
};

function repositionPlannerMobileDropdown() {
    const menu = document.getElementById('planner-mobile-menu');
    const toggle = document.getElementById('planner-menu-toggle');
    if (!menu || !toggle || !menu.classList.contains('active')) return;

    const toggleRect = toggle.getBoundingClientRect();
    const viewportWidth = getViewportWidth();
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const menuWidth = menu.offsetWidth || PLANNER_MOBILE_DROPDOWN_DEFAULT_WIDTH;
    const menuHeight = menu.offsetHeight || PLANNER_MOBILE_DROPDOWN_DEFAULT_HEIGHT;
    const margin = PLANNER_MOBILE_DROPDOWN_MARGIN;

    let left = toggleRect.right - menuWidth;
    const minLeft = margin;
    const maxLeft = Math.max(minLeft, viewportWidth - menuWidth - margin);
    left = Math.min(Math.max(left, minLeft), maxLeft);

    let top = toggleRect.bottom + PLANNER_MOBILE_DROPDOWN_OFFSET;
    const spaceBelow = viewportHeight - top - margin;
    if (spaceBelow < menuHeight && toggleRect.top > (menuHeight + PLANNER_MOBILE_DROPDOWN_FLIP_CLEARANCE)) {
        top = Math.max(margin, toggleRect.top - menuHeight - PLANNER_MOBILE_DROPDOWN_OFFSET);
        menu.style.transformOrigin = 'bottom right';
    } else {
        menu.style.transformOrigin = 'top right';
    }

    menu.style.position = 'fixed';
    menu.style.left = `${Math.round(left)}px`;
    menu.style.top = `${Math.round(top)}px`;
    menu.style.right = 'auto';
}

window.handlePlannerMobileMenuAction = function (action) {
    closePlannerMobileDropdown();
    if (action === 'plan') {
        showPlanWeekModal();
        return;
    }
    if (action === 'pdf') {
        openClassActivitiesExportModal();
        return;
    }
    if (action === 'clear') {
        clearPlannedCalendarTasks();
    }
};

window.updateClassActivitiesExportPeriodValue = function (period, value) {
    state.classActivitiesExport = state.classActivitiesExport || {};
    if (period === 'month') state.classActivitiesExport.month = value;
    if (period === 'week') state.classActivitiesExport.week = value;
    if (period === 'school_year') state.classActivitiesExport.schoolYear = value;
    renderClassActivitiesExportModalContent();
};

window.shiftClassActivitiesExportWeek = function (deltaWeeks) {
    state.classActivitiesExport = state.classActivitiesExport || {};
    const current = state.classActivitiesExport.week || getIsoWeekInputValue(new Date());
    state.classActivitiesExport.week = shiftIsoWeekValue(current, deltaWeeks);
    renderClassActivitiesExportModalContent();
};

window.downloadClassActivitiesPdf = function () {
    const selection = getClassActivitiesExportSelection();
    if (!selection.items.length) {
        showToast('Nessuna attività svolta trovata per questo filtro.', 'warning');
        return;
    }
    const renderedItems = selection.items.map((a, idx) => {
        const dateText = (a.date || a.datGiorno || '').trim() || getLocalDateString(a._parsedDate);
        const subjectText = (a.subject || a.materia || 'Materia').trim();
        const contentText = (a.content || a.text || a.argomento || '').trim() || 'Contenuto non disponibile';
        return `
            <div class="entry">
                <div class="entry-head">
                    <span class="entry-index">#${idx + 1}</span>
                    <span class="entry-date">${escapeHtml(dateText)}</span>
                    <span class="entry-subject">${escapeHtml(subjectText)}</span>
                </div>
                <p>${escapeHtml(contentText)}</p>
            </div>
        `;
    }).join('');

    const printableHtml = `
        <!doctype html>
        <html lang="it">
        <head>
            <meta charset="utf-8">
            <title>Attivita_svolte_${selection.period}_${new Date().toISOString().slice(0, 10)}</title>
            <style>
                @page { size: A4; margin: 18mm 14mm; }
                body { font-family: Inter, -apple-system, BlinkMacSystemFont, Arial, sans-serif; color:#111; line-height:1.45; }
                .doc-head { border-bottom: 1px solid var(--outline-variant); padding-bottom: 12px; margin-bottom: 18px; }
                .doc-head h1 { font-size: 20px; margin:0 0 4px 0; letter-spacing:-0.02em; }
                .doc-head .meta { font-size: 12px; color:#555; }
                .note { font-size: 12px; color:#444; background:var(--surface-container-low); border:1px solid var(--outline-variant); border-radius:10px; padding:10px 12px; margin-bottom:16px; }
                .entry { border:1px solid var(--outline-variant); border-radius:10px; padding:10px 12px; margin-bottom:10px; page-break-inside: avoid; }
                .entry-head { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:6px; }
                .entry-index { font-weight:700; font-size:11px; color:var(--info); }
                .entry-date, .entry-subject { font-size:11px; color:#666; font-weight:600; }
                .entry p { margin:0; font-size:13px; color:#111; white-space:pre-wrap; }
            </style>
        </head>
        <body>
            <div class="doc-head">
                <h1>Attività svolte in classe</h1>
                <div class="meta">${escapeHtml(selection.periodLabel)} · ${selection.items.length} attività · Generato il ${new Date().toLocaleString('it-IT')}</div>
            </div>
            <div class="note">
                Documento esportato da G-Diary per condivisione su strumenti esterni. Include esclusivamente attività svolte in classe.
            </div>
            ${renderedItems}
            <script>
                window.addEventListener('load', function () {
                    // Piccolo delay per garantire che layout e font siano renderizzati prima del print dialog.
                    setTimeout(function () { window.print(); }, ${PRINT_DIALOG_DELAY_MS});
                });
            </script>
        </body>
        </html>
    `;

    const popup = window.open('', '_blank');
    if (!popup) {
        showToast('Popup bloccato: abilita i popup per generare il PDF.', 'warning');
        return;
    }
    popup.document.open();
    popup.document.write(printableHtml);
    popup.document.close();
};

window.showPlanWeekModal = function () {
    const modalContainer = getModalContainer();
    if (!modalContainer) return;
    state.planWeekInitialPlannedCount = getPlannedTasksTotalCount();

    modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)" style="position:fixed;top:0;left:0;right:0;bottom:0;z-index:99990;background:rgba(0,0,0,0.35);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(4px);">
            <div id="plan-week-modal-content" class="modal-content glass-panel" onclick="event.stopPropagation()" style="position:relative;z-index:99991;width: 100%; max-width: 450px; padding: 24px; max-height: 90vh; overflow-y: auto;">
            </div>
        </div> `;
    refreshPlanWeekModalContent();
}
function togglePlanDay(taskId, dateStr) {
    if (typeof event !== 'undefined' && event && event.stopPropagation) event.stopPropagation();

    const todayStr = getLocalDateString();
    if (dateStr < todayStr) return;

    if (!state.plannedTasks[dateStr]) state.plannedTasks[dateStr] = [];
    const index = state.plannedTasks[dateStr].indexOf(taskId);
    if (index > -1) {
        state.plannedTasks[dateStr].splice(index, 1);
    } else {
        state.plannedTasks[dateStr].push(taskId);
    }

    saveTasks();
    if (typeof debouncedSavePlannerRemote === 'function') debouncedSavePlannerRemote(500);

    // ✅ FIX: Immediate surgical DOM update — border shorthand, background, color
    const isNowPlanned = state.plannedTasks[dateStr] && state.plannedTasks[dateStr].includes(taskId);
    document.querySelectorAll(`[data-task-id="${taskId}"][data-date="${dateStr}"]`).forEach(btn => {
        btn.style.background = isNowPlanned ? 'var(--on-surface)' : 'var(--surface-container-lowest)';
        btn.style.color = isNowPlanned ? 'white' : '#4F4A43';
        btn.style.border = isNowPlanned
            ? '2px solid var(--on-surface)'
            : (dateStr === todayStr ? '2px solid #007AFF' : '1px solid var(--outline-variant)');
        // Spring feedback
        btn.style.transform = 'scale(0.9)';
        setTimeout(() => { btn.style.transform = 'scale(1)'; btn.style.transition = 'all 0.25s cubic-bezier(0.2,0.8,0.2,1)'; }, 80);
    });

    notifyPlannerChanged();
}
function showVotiView() {
    modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div class="modal-content" onclick="event.stopPropagation()" style="max-height:85vh; overflow-y:auto; padding: 0;">
                <div style="position: sticky; top: 0; background:#1c1c1e; padding: 20px; border-bottom:1px solid rgba(var(--glass-rgb),0.1); display:flex; justify-content:space-between; align-items:center; z-index: 10;">
                    <h2 style="margin:0;">Voti DidUP</h2>
                    <button onclick="closeModal()" style="background:none; border:none; color:var(--blue); font-weight:700; font-size:16px; cursor:pointer;">Chiudi</button>
                </div>
                <div style="padding: 20px;">
                    ${renderVoti()}
                </div>
            </div>
            </div> `;
}
function getGoalProjection(media, goal, count) {
    const safeMedia = Number.isFinite(media) ? media : 0;
    const safeGoal = Number.isFinite(goal) ? goal : 8.0;
    const safeCount = Number.isFinite(count) ? count : 0;
    const currentSum = safeMedia * safeCount;
    const done = safeMedia >= safeGoal;
    const gap = Math.max(0, safeGoal - safeMedia);

    if (done) return { done: true, gap: 0, scenarios: [] };

    const grades = (typeof GOAL_GRADE_OPTIONS_DESC !== 'undefined') ? GOAL_GRADE_OPTIONS_DESC : [10, 9.5, 9, 8.5, 8, 7.5, 7, 6.5, 6];
    const scenarios = [];

    for (const g of grades) {
        if (g <= safeGoal) continue;
        const denom = g - safeGoal;
        if (denom <= 1e-9) continue;

        const nNeeded = Math.ceil((safeGoal * safeCount - currentSum) / denom);

        if (nNeeded >= 1 && nNeeded <= 5) {
            scenarios.push({
                n: nNeeded,
                grade: g,
                label: nNeeded === 1 ? `Prossimo voto: ${g}` : `Prossimi ${nNeeded} voti: ${g}`
            });
        }
    }

    if (safeGoal < MAX_GRADE_VALUE) {
        // Include anche voti sotto-obiettivo (>= sufficienza) per mostrare percorsi realistici:
        // 1) ipotizziamo un prossimo voto g inferiore al goal;
        // 2) stimiamo quanti 10 servono dopo quel voto per rientrare nel target;
        // 3) limitiamo a scenari brevi (massimo 5 voti totali) per mantenere suggerimenti utili.
        for (const g of grades) {
            if (g < PASSING_GRADE_THRESHOLD || g >= safeGoal) continue;
            const sumAfterOne = currentSum + g;
            const countAfterOne = safeCount + 1;
            const denom = MAX_GRADE_VALUE - safeGoal;
            if (denom <= 1e-9) continue;
            const extraTopGrades = Math.ceil((safeGoal * countAfterOne - sumAfterOne) / denom);
            const totalVotes = 1 + extraTopGrades;
            if (extraTopGrades >= 1 && totalVotes <= 5) {
                scenarios.push({
                    n: totalVotes,
                    grade: g,
                    combo: true,
                    extraTopGrades,
                    label: getProjectionComboDetailLabel(g, extraTopGrades, MAX_GRADE_VALUE)
                });
            }
        }
    }

    const uniqueScenarios = [];
    const seenKeys = new Set();
    const sortedScenarios = scenarios.sort((a, b) => a.n - b.n || b.grade - a.grade);
    for (const s of sortedScenarios) {
        const normalizedGrade = Number.isFinite(s.grade) ? s.grade.toFixed(2) : '0.00';
        const normalizedExtra = Number.isFinite(s.extraTopGrades) ? s.extraTopGrades : 0;
        const key = s.combo ? `combo-${normalizedGrade}-${normalizedExtra}` : `single-${normalizedGrade}`;
        if (!seenKeys.has(key)) {
            uniqueScenarios.push(s);
            seenKeys.add(key);
        }
        if (uniqueScenarios.length >= 4) break;
    }

    if (uniqueScenarios.length === 0) {
        const exact = (safeGoal * (safeCount + 1)) - currentSum;
        if (exact > 0 && exact <= 10) {
            uniqueScenarios.push({
                n: 1,
                grade: exact,
                exact: true,
                label: `Prossimo voto esatto: ${exact.toFixed(2)}`
            });
        }
    }

    return {
        done,
        gap,
        scenarios: uniqueScenarios
    };
}
function renderVoti() {
    const votiData = (state.voti && state.voti.length > 0) ? state.voti :
        ((state.grades && state.grades.length > 0) ? state.grades : []);

    if (votiData.length === 0) {
        return `
        <div class="liquid-glass rounded-[40px] p-12 text-center flex flex-col items-center gap-6">
            <div class="w-20 h-20 rounded-[28px] bg-primary/10 flex items-center justify-center text-primary">
                <span class="material-symbols-outlined text-4xl">school</span>
            </div>
            <div>
                <p class="body-lg text-on-surface-variant/60 font-medium mb-6">Nessun voto registrato.</p>
                <button onclick="performArgoSync()" class="btn btn-primary">Sincronizza DidUP</button>
            </div>
        </div> `;
    }

    return `
        <div class="flex flex-col gap-4">
            ${votiData.map(v => {
                const rawVal = (v.valore || v.value || '').toString();
                const giu = isGiustifica(rawVal);
                const displayVal = giu ? 'GIU' : rawVal;
                const mat = v.materia || v.subject || 'Materia';
                const val = getNumericGradeValue(v);
                const isSuff = val >= 6;
                const encodedMat = encodeURIComponent(mat || '').replace(/'/g, '%27');

                return `
                <div class="liquid-glass rounded-[28px] p-6 liquid-shadow cursor-pointer transition-all hover:scale-[1.02] flex items-center gap-6" onclick="handleGradeSubjectClickFromEncoded('${encodedMat}')">
                    <div class="w-14 h-14 rounded-2xl ${giu ? 'bg-surface-dim text-on-surface/40' : (isSuff ? 'bg-green/10 text-green' : 'bg-error/10 text-error')} flex items-center justify-center text-2xl font-bold border border-white/40">
                        ${displayVal}
                    </div>
                    <div class="flex-1 min-width-0">
                        <h3 class="font-bold text-on-surface truncate">${mat}</h3>
                        <p class="text-on-surface-variant/40 text-[12px] font-bold uppercase tracking-wider">${v.data || v.date} • ${v.tipo || v.type}</p>
                    </div>
                    <span class="material-symbols-outlined text-on-surface-variant/20">chevron_right</span>
                </div>`;
            }).join('')}
        </div> `;
}
function showBachecaModal() {
    // ⭐ Prova prima promemoria, poi announcements
    const dataBacheca = state.promemoria && state.promemoria.length > 0 ? state.promemoria :
        (state.announcements && state.announcements.length > 0 ? state.announcements : []);

    console.log("📢 Rendering bacheca - state.promemoria:", state.promemoria?.length || 0, "state.announcements:", state.announcements?.length || 0);

    modalContainer.innerHTML = `
        <div class="modal-overlay active" onclick="closeModal(event)">
            <div class="modal-content" style="max-height:85vh; overflow-y:auto; padding: 0;">
                <div style="position: sticky; top: 0; background:#1c1c1e; padding: 20px; border-bottom:1px solid rgba(var(--glass-rgb),0.1); display:flex; justify-content:space-between; align-items:center; z-index: 10;">
                    <h2 style="margin:0;">Bacheca & Avvisi</h2>
                    <button onclick="closeModal()" style="background:none; border:none; color:var(--orange); font-weight:700; font-size:16px; cursor:pointer;">Chiudi</button>
                </div>
                <div style="padding: 20px; display:flex; flex-direction:column; gap:12px;">
                    ${dataBacheca.length === 0 ?
            `<div style="text-align:center; padding: 40px; color: var(--text-secondary);">
                        <i class="ph ph-megaphone" style="font-size: 48px; opacity: 0.3; margin-bottom: 12px; display: block;"></i>
                        Nessun avviso in bacheca<br>
                        <span style="font-size: 12px; margin-top: 8px; display: block;">Scorri verso il basso dalla parte alta della schermata per aggiornare i dati.</span>
                   </div>` :
            dataBacheca.map(item => {
                const data = item.data || item.date || item.datGiorno || 'Data non disponibile';
                const autore = item.autore || item.docente || 'Docente';
                const oggetto = item.oggetto || item.titolo || item.title || 'Avviso';
                const testo = item.testo || item.text || item.descrizione || item.description || '';
                const url = item.url || item.allegato || null;

                return `
                                <div class="glass-list-item" style="border-left: 4px solid var(--orange); background: rgba(255, 159, 10, 0.08);">
                                    <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                                        <div style="padding:4px 8px; background: rgba(255, 159, 10, 0.2); border-radius:6px; display:flex; gap:6px; align-items:center;">
                                            <i class="ph-fill ph-bell" style="color: var(--orange); font-size: 14px;"></i>
                                            <span style="font-size:11px; color:var(--warning); font-weight:700; text-transform:uppercase;">AVVISO</span>
                                       </div>
                                        <div style="font-size:12px; color:var(--text-secondary); font-weight:600;">
                                            ${data} • ${autore}
                                       </div>
                                   </div>
                                    <div style="font-weight:700; font-size:17px; margin-bottom:8px; color: white; line-height:1.3;">${oggetto}</div>
                                    ${testo ? `<div style="font-size:14px; opacity:0.9; line-height:1.6; color:var(--outline-variant); margin-bottom: ${url ? '8px' : '0'}; white-space: pre-wrap;">${testo}</div>` : ''}
                                    ${url ? `<a href="${url}" target="_blank" style="margin-top:12px; background:rgba(37, 99, 235, 0.2); padding:8px 12px; border-radius:8px; border:1px solid rgba(37, 99, 235, 0.3); color:var(--info); font-size:13px; display:inline-flex; align-items:center; gap:6px; font-weight:600; text-decoration:none;">
                                        <i class="ph ph-paperclip"></i> Apri Allegato <i class="ph-bold ph-arrow-up-right" style="font-size:10px;"></i>
                                   </a>` : ''}
                               </div>
                            `;
            }).join('')
        }
                </div>
            </div>
           </div> `;
}
function promptSetGoal(type) {
    const currentGoal = state.goals?.[type] || 8.0;

    // Build options: 5.0 to 10.0 in steps of 0.5
    const options = [];
    for (let v = 5.0; v <= 10.0; v = Math.round((v + 0.5) * 10) / 10) options.push(v);

    // Overlay
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,0.35);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);display:flex;align-items:flex-end;justify-content:center;';

    // Sheet
    const sheet = document.createElement('div');
    sheet.style.cssText = 'width:100%;max-width:480px;background:var(--surface-container-lowest);border-radius:32px 32px 0 0;padding:0 0 calc(28px + env(safe-area-inset-bottom,0px)) 0;box-shadow:0 -4px 24px rgba(0,0,0,0.10);font-family:Hanken Grotesk,sans-serif;transform:translateY(100%);transition:transform 0.28s cubic-bezier(0.2,0.8,0.2,1);';
    sheet.innerHTML = `
        <div style="display:flex;justify-content:center;padding:14px 0 6px;">
            <div style="width:40px;height:4px;border-radius:999px;background:var(--surface-container-high);"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 22px 16px;">
            <h2 style="margin:0;font-size:20px;font-weight:800;color:var(--on-surface);letter-spacing:-0.01em;">Obiettivo</h2>
            <button id="goal-close-btn" style="width:36px;height:36px;border-radius:50%;background:var(--surface-container-low);border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;">
                <span class="material-symbols-outlined" style="font-size:18px;color:var(--on-surface-variant);">close</span>
            </button>
        </div>
        <div style="padding:0 22px 20px;">
            <p style="font-size:13px;color:var(--on-surface-variant);font-weight:500;margin:0 0 16px;">Seleziona la media che vuoi raggiungere in questa materia.</p>
            <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;">
                ${options.map(v => {
                    const isActive = Math.abs(v - currentGoal) < 0.01;
                    return `<button data-goal-val="${v}" style="padding:14px 8px;border-radius:16px;font-size:16px;font-weight:800;font-family:Hanken Grotesk,sans-serif;cursor:pointer;border:${isActive?'2px solid var(--primary)':'1.5px solid rgba(226,232,240,0.9)'};background:${isActive?'#2563eb':'white'};color:${isActive?'white':'#1e293b'};transition:all 0.12s ease;" ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform='scale(1)'">${v.toFixed(1)}</button>`;
                }).join('')}
            </div>
        </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    requestAnimationFrame(() => { sheet.style.transform = 'translateY(0)'; });

    function closeSheet() {
        sheet.style.transform = 'translateY(100%)';
        setTimeout(() => overlay.remove(), 300);
    }

    overlay.addEventListener('click', e => { if (e.target === overlay) closeSheet(); });
    sheet.querySelector('#goal-close-btn').addEventListener('click', closeSheet);

    sheet.querySelectorAll('[data-goal-val]').forEach(btn => {
        btn.addEventListener('click', () => {
            const val = parseFloat(btn.dataset.goalVal);
            if (!state.goals) state.goals = {};
            state.goals[type] = val;
            localStorage.setItem(lsKey('goals'), JSON.stringify(state.goals));
            closeSheet();
            // Re-render immediately without full page refresh
            state._forceRender = true;
            if (typeof scheduleRender === 'function') scheduleRender(0);
        });
    });
}
function renderFocusTimer() {
    const mins = Math.floor(pomodoroState.timeLeft / 60);
    const secs = pomodoroState.timeLeft % 60;
    const display = `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')} `;
    const isFocus = pomodoroState.mode === 'focus';
    const modeLabel = isFocus ? 'Focus' : 'Pausa';
    const modeColor = isFocus ? '#7c3aed' : 'var(--green)';

    return `
        <div class="card glass-panel" style="padding: 24px; border-radius: 28px; margin-bottom: 24px; text-align:center;">
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
                    <div style="font-size: 15px; font-weight: 800; color:white;">🍅 Timer ${modeLabel}</div>
                    <div style="font-size:11px; font-weight:700; padding:4px 10px; border-radius:8px; background:${modeColor}; color:white;">${modeLabel}</div>
                </div>
                <div style="font-size:48px; font-weight:800; color:white; font-family:monospace; margin:16px 0; letter-spacing:4px;">${display}</div>
                <div style="display:flex; gap:12px; justify-content:center;">
                    <button onclick="togglePomodoro()" style="padding:12px 28px; border-radius:14px; border:none; background:${pomodoroState.running ? 'var(--red)' : modeColor}; color:white; font-weight:800; font-size:15px; cursor:pointer; min-width:120px;">
                        ${pomodoroState.running ? '⏸ Pausa' : '▶ Avvia'}
                    </button>
                    <button onclick="resetPomodoro()" style="padding:12px 20px; border-radius:14px; border:1px solid rgba(var(--glass-rgb),0.15); background:rgba(var(--glass-rgb),0.06); color:white; font-weight:700; font-size:14px; cursor:pointer;">
                        ↺ Reset
                    </button>
                </div>
            </div> `;
}
function togglePomodoro() {
    if (pomodoroState.running) {
        clearInterval(pomodoroState.interval);
        pomodoroState.running = false;
    } else {
        pomodoroState.running = true;
        pomodoroState.interval = setInterval(() => {
            pomodoroState.timeLeft--;
            if (pomodoroState.timeLeft <= 0) {
                clearInterval(pomodoroState.interval);
                pomodoroState.running = false;
                if (pomodoroState.mode === 'focus') {
                    pomodoroState.mode = 'break';
                    pomodoroState.timeLeft = 5 * 60;
                    showToast('🎉 Sessione completata! Pausa di 5 min.', 'success', 'var(--green)');
                } else {
                    pomodoroState.mode = 'focus';
                    pomodoroState.timeLeft = 25 * 60;
                    showToast('💪 Pausa finita! Torna a studiare.', 'success', '#7c3aed');
                }
            }
            const container = document.getElementById('pomodoroContainer');
            if (container) container.innerHTML = renderFocusTimer();
        }, 1000);
    }
    const container = document.getElementById('pomodoroContainer');
    if (container) container.innerHTML = renderFocusTimer();
}
function toggleVoiceInput() {
    // Voice input removed - AI chat functionality has been disabled
}
function promptAddBacklog() { showAddBacklogModal(); }
function showAddBacklogModal() {
    const container = getModalContainer();
    if (!container) return;
    const subjects = getAllSubjects();

    container.innerHTML = `
            <div class="modal-overlay active" onclick="closeModal(event)">
                <div class="modal-content glass-panel" onclick="event.stopPropagation()" style="max-width:420px; padding:24px;">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:20px;">
                        <h2 style="margin:0; font-size:18px; font-weight:800;">📚 Argomento Arretrato</h2>
                        <button onclick="closeModal()" style="background:none; border:none; color:var(--info); font-weight:700; cursor:pointer;">Chiudi</button>
                   </div>

                    <div style="display:flex; flex-direction:column; gap:16px;">
                        <div>
                            <label style="display:block; font-size:11px; font-weight:700; color:rgba(var(--glass-rgb),0.5); text-transform:uppercase; margin-bottom:6px;">Materia</label>
                            <select id="backlogSubject" style="width:100%; height:46px; background:rgba(0,0,0,0.3); border:1px solid rgba(var(--glass-rgb),0.15); border-radius:12px; color:white; padding:0 12px; font-size:14px; outline:none; appearance:none; -webkit-appearance:none;">
                                ${subjects.map(s => `<option value="${s}" style="background:#1a1a2e;">${s}</option>`).join('')}
                           </select>
                       </div>

                        <div>
                            <label style="display:block; font-size:11px; font-weight:700; color:rgba(var(--glass-rgb),0.5); text-transform:uppercase; margin-bottom:6px;">Cosa devi recuperare?</label>
                            <input type="text" id="backlogTopic" placeholder="Es: Equazioni di 2° grado, Canto V Inferno..." style="width:100%; height:46px; background:rgba(0,0,0,0.3); border:1px solid rgba(var(--glass-rgb),0.15); border-radius:12px; color:white; padding:0 12px; font-size:14px; outline:none;">
                       </div>

                        <button onclick="submitBacklogForm()" style="width:100%; height:50px; background:var(--blue); color:white; border:none; border-radius:14px; font-size:16px; font-weight:600; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:8px;">
                            <i class="ph-bold ph-check-circle"></i> Aggiungi Arretrato
                       </button>
                   </div>
               </div>
           </div>`;
}
function renderVerifiche() {
    const exams = state.exams || [];
    // Sort by date
    exams.sort((a, b) => new Date(a.date) - new Date(b.date));

    if (exams.length === 0) {
        return `
                    <div class="view">
                        <h1 style="font-size: 28px; color: var(--text-primary); margin-bottom: 24px;">Verifiche</h1>
                        <div class="glass-panel" style="padding: 40px; text-align: center; display: flex; flex-direction: column; align-items: center;">
                            <div style="width: 64px; height: 64px; background: rgba(var(--glass-rgb),0.05); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                                <i class="ph-bold ph-exam" style="font-size: 32px; color: var(--text-secondary);"></i>
                           </div>
                            <h3 style="font-size: 18px; color: var(--text-primary); margin-bottom: 8px;">Nessuna verifica</h3>
                            <p style="font-size: 15px; color: var(--text-secondary); margin-bottom: 24px;">Non hai verifiche in programma.</p>
                            <button onclick="promptAddExam()" class="btn-primary" style="padding: 12px 24px;">
                                <i class="ph-bold ph-plus"></i> Aggiungi Verifica
                           </button>
                       </div>
                   </div>`;
    }

    return `
                <div class="view">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <div>
                            <h1 style="font-size: 28px; color: var(--text-primary);">Verifiche</h1>
                            <p style="font-size: 15px; color: var(--text-secondary);">Prossimi esami e interrogazioni</p>
                       </div>
                        <button onclick="promptAddExam()" style="width: 40px; height: 40px; border-radius: 12px; background: var(--blue); color: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                            <i class="ph-bold ph-plus" style="font-size: 20px;"></i>
                       </button>
                   </div>

                    <div style="display: flex; flex-direction: column; gap: 16px;">
                        ${exams.map((e, index) => {
        const dateObj = new Date(e.date);
        const dayName = dateObj.toLocaleDateString('it-IT', { weekday: 'short' });
        const dayNum = dateObj.getDate();
        const monthName = dateObj.toLocaleDateString('it-IT', { month: 'short' });
        const color = getSubjectColor(e.subject);

        return `
                            <div class="glass-panel" style="padding: 20px; display: flex; align-items: flex-start; gap: 16px;">
                                <div style="min-width: 50px; display: flex; flex-direction: column; align-items: center; justify-content: center; background: rgba(var(--glass-rgb),0.05); border-radius: 12px; padding: 10px 0; border: 1px solid rgba(var(--glass-rgb),0.05);">
                                    <span style="font-size: 11px; font-weight: 700; color: var(--text-secondary); text-transform: uppercase;">${monthName}</span>
                                    <span style="font-size: 20px; font-weight: 700; color: var(--text-primary); line-height: 1.1;">${dayNum}</span>
                               </div>
                                
                                <div style="flex: 1; min-width: 0;">
                                    <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                                        <div>
                                            <span style="display: inline-block; padding: 4px 8px; border-radius: 6px; background: ${color}20; color: ${color}; font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; border: 1px solid ${color}40;">
                                                ${e.type}
                                           </span>
                                            <h3 style="font-size: 17px; font-weight: 600; color: var(--text-primary); margin-bottom: 4px;">${escapeHtml(e.subject)}</h3>
                                       </div>
                                        <button onclick="removeExam(${index})" style="background: none; border: none; color: var(--text-secondary); padding: 4px; cursor: pointer; opacity: 0.6;">
                                            <i class="ph-bold ph-trash"></i>
                                       </button>
                                   </div>
                                    <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.4;">${e.topic || 'Nessun argomento specificato'}</p>
                               </div>
                           </div>
                            `;
    }).join('')}
                   </div>
               </div>`;
}
function renderRecoveries() {
    const backlog = state.backlog || [];

    if (backlog.length === 0) {
        return `
                    <div class="view">
                        <h1 style="font-size: 28px; color: var(--text-primary); margin-bottom: 24px;">Arretrati</h1>
                        <div class="glass-panel" style="padding: 40px; text-align: center; display: flex; flex-direction: column; align-items: center;">
                            <div style="width: 64px; height: 64px; background: rgba(var(--glass-rgb),0.05); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 16px;">
                                <i class="ph-bold ph-check-fat" style="font-size: 32px; color: var(--green);"></i>
                           </div>
                            <h3 style="font-size: 18px; color: var(--text-primary); margin-bottom: 8px;">Tutto in ordine!</h3>
                            <p style="font-size: 15px; color: var(--text-secondary); margin-bottom: 24px;">Non hai argomenti da recuperare.</p>
                            <button onclick="promptAddBacklog()" class="btn-primary" style="padding: 12px 24px;">
                                <i class="ph-bold ph-plus"></i> Aggiungi Arretrato
                           </button>
                       </div>
                   </div>`;
    }

    return `
                <div class="view">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <div>
                            <h1 style="font-size: 28px; color: var(--text-primary);">Arretrati</h1>
                            <p style="font-size: 15px; color: var(--text-secondary);">Argomenti da recuperare</p>
                       </div>
                        <button onclick="promptAddBacklog()" style="width: 40px; height: 40px; border-radius: 12px; background: var(--blue); color: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                             <i class="ph-bold ph-plus" style="font-size: 20px;"></i>
                       </button>
                   </div>

                    <div style="display: flex; flex-direction: column; gap: 12px;">
                        ${backlog.map((b, index) => `
                            <div class="glass-panel" style="padding: 16px 20px; display: flex; align-items: center; justify-content: space-between; gap: 16px;">
                                <div style="flex: 1; min-width: 0;">
                                    <div style="font-size: 11px; font-weight: 700; color: ${getSubjectColor(b.subject)}; text-transform: uppercase; margin-bottom: 4px;">${escapeHtml(b.subject)}</div>
                                    <div style="font-size: 15px; font-weight: 500; color: var(--text-primary); line-height: 1.3;">${escapeHtml(b.topic)}</div>
                               </div>
                                <button onclick="removeBacklog(${index})" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid rgba(var(--glass-rgb),0.1); background: rgba(var(--glass-rgb),0.05); color: var(--text-secondary); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: all 0.2s;">
                                    <i class="ph-bold ph-check"></i>
                               </button>
                           </div>
                        `).join('')}
                   </div>
               </div>`;
}
// openArgoLogin — definita su window così è raggiungibile da onclick inline
window.openArgoLogin = function openArgoLogin() {
    var modalContainer = getModalContainer();
    if (!modalContainer) {
        console.error('[openArgoLogin] modal container non trovato');
        return;
    }

    modalContainer.innerHTML = `
        <div id="argo-login-backdrop"
             onclick="(typeof closeModal==='function'?closeModal(event):document.getElementById('modal-container').innerHTML='')"
             style="position:fixed;inset:0;z-index:99990;background:rgba(11,19,38,0.7);
                    backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);
                    display:flex;align-items:flex-end;justify-content:center;padding:0;
                    opacity:0;transition:opacity 0.22s ease;">
            <div onclick="event.stopPropagation()" id="argo-login-card"
                 style="width:100%;max-width:440px;background:rgba(23,31,51,0.95);
                        backdrop-filter:blur(40px) saturate(190%);-webkit-backdrop-filter:blur(40px) saturate(190%);
                        border:1px solid rgba(182,196,255,0.18);border-top:1px solid rgba(255,255,255,0.35);
                        border-radius:32px 32px 0 0;
                        padding:20px 24px calc(28px + env(safe-area-inset-bottom,0px));
                        box-shadow:0 -12px 48px -8px rgba(6,14,32,0.8), inset 0 1px 0 rgba(255,255,255,0.2);
                        transform:translateY(40px);transition:transform 0.26s cubic-bezier(0.16,1,0.3,1);font-family:'Inter',sans-serif;color:#dae2fd;">

                <!-- Drag Handle -->
                <div style="display:flex;justify-content:center;margin-bottom:16px;">
                    <div style="width:38px;height:4.5px;border-radius:999px;background:rgba(255,255,255,0.22);"></div>
                </div>

                <!-- Logo + Titolo -->
                <div style="display:flex;align-items:center;gap:14px;margin-bottom:18px;">
                    <div style="width:48px;height:48px;border-radius:15px;overflow:hidden;flex-shrink:0;
                                background:rgba(37,99,235,0.2);border:1px solid rgba(182,196,255,0.25);
                                display:flex;align-items:center;justify-content:center;
                                box-shadow:0 6px 16px -4px rgba(37,99,235,0.4);">
                        <img src="gandhi-diary-icon-192.png" alt="Gandhi Diary"
                             onerror="this.src='gandhi-diary-icon-512.png'"
                             style="width:34px;height:34px;border-radius:10px;object-fit:cover;">
                    </div>
                    <div>
                        <div style="font-size:19px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;line-height:1.2;">Accedi con DidUP</div>
                        <div style="font-size:12px;color:#8e909f;font-weight:500;margin-top:2px;">Inserisci le credenziali del registro Argo</div>
                    </div>
                </div>

                <!-- Status server -->
                <div id="server-status"
                     style="margin-bottom:16px;font-size:11.5px;color:#30d158;font-weight:700;
                            display:flex;align-items:center;justify-content:center;gap:6px;
                            background:rgba(48,209,88,0.12);border:0.5px solid rgba(48,209,88,0.28);border-radius:12px;padding:8px 12px;">
                    <span style="width:6px;height:6px;background:#30d158;border-radius:50%;flex-shrink:0;box-shadow:0 0 6px #30d158;"></span>
                    Server DidUP online & pronto
                </div>

                <!-- Form Inputs -->
                <div style="display:flex;flex-direction:column;gap:10px;margin-bottom:18px;">
                    <!-- Codice Scuola -->
                    <div style="position:relative;display:flex;align-items:center;">
                        <i class="ph-bold ph-buildings" style="position:absolute;left:14px;color:#8e909f;font-size:18px;pointer-events:none;"></i>
                        <input id="argo-school" placeholder="Codice Scuola (es. SG20925)" autocomplete="organization"
                               value="${(() => { const s = localStorage.getItem('argo_school'); return (!s || s === 'SG28499' || s === 'SS19014') ? 'SG20925' : s; })()}"
                               style="height:48px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);
                                      padding:0 14px 0 42px;font-size:14.5px;font-weight:600;
                                      background:rgba(255,255,255,0.05);color:#ffffff;
                                      font-family:'Inter',sans-serif;outline:none;width:100%;box-sizing:border-box;
                                      transition:border-color 0.15s ease, box-shadow 0.15s ease;"
                               onfocus="this.style.borderColor='#2563eb';this.style.boxShadow='0 0 12px rgba(37,99,235,0.35)';"
                               onblur="this.style.borderColor='rgba(255,255,255,0.12)';this.style.boxShadow='none';">
                    </div>

                    <!-- Nome Utente -->
                    <div style="position:relative;display:flex;align-items:center;">
                        <i class="ph-bold ph-user" style="position:absolute;left:14px;color:#8e909f;font-size:18px;pointer-events:none;"></i>
                        <input id="argo-user" placeholder="Nome Utente (es. s.cognome.1234)" autocomplete="username"
                               style="height:48px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);
                                      padding:0 14px 0 42px;font-size:14.5px;font-weight:600;
                                      background:rgba(255,255,255,0.05);color:#ffffff;
                                      font-family:'Inter',sans-serif;outline:none;width:100%;box-sizing:border-box;
                                      transition:border-color 0.15s ease, box-shadow 0.15s ease;"
                               onfocus="this.style.borderColor='#2563eb';this.style.boxShadow='0 0 12px rgba(37,99,235,0.35)';"
                               onblur="this.style.borderColor='rgba(255,255,255,0.12)';this.style.boxShadow='none';">
                    </div>

                    <!-- Password + Eye toggle -->
                    <div style="position:relative;display:flex;align-items:center;">
                        <i class="ph-bold ph-lock-key" style="position:absolute;left:14px;color:#8e909f;font-size:18px;pointer-events:none;"></i>
                        <input id="argo-pass" type="password" placeholder="Password DidUP" autocomplete="current-password"
                               style="height:48px;border-radius:14px;border:1px solid rgba(255,255,255,0.12);
                                      padding:0 42px 0 42px;font-size:14.5px;font-weight:600;
                                      background:rgba(255,255,255,0.05);color:#ffffff;
                                      font-family:'Inter',sans-serif;outline:none;width:100%;box-sizing:border-box;
                                      transition:border-color 0.15s ease, box-shadow 0.15s ease;"
                               onfocus="this.style.borderColor='#2563eb';this.style.boxShadow='0 0 12px rgba(37,99,235,0.35)';"
                               onblur="this.style.borderColor='rgba(255,255,255,0.12)';this.style.boxShadow='none';"
                               onkeydown="if(event.key==='Enter'){if(typeof performArgoSync==='function')performArgoSync();}">
                        <button type="button" onclick="var p=document.getElementById('argo-pass');var ic=this.querySelector('i');if(p){if(p.type==='password'){p.type='text';ic.className='ph-bold ph-eye-slash';}else{p.type='password';ic.className='ph-bold ph-eye';}}"
                                style="position:absolute;right:10px;background:none;border:none;color:#8e909f;cursor:pointer;padding:6px;display:flex;align-items:center;justify-content:center;">
                            <i class="ph-bold ph-eye" style="font-size:18px;"></i>
                        </button>
                    </div>
                </div>

                <!-- Primary Submit Button -->
                <button id="login-btn"
                        onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('medium');if(typeof performArgoSync==='function')performArgoSync();else console.error('performArgoSync non definita')"
                        style="width:100%;height:52px;border-radius:16px;border:none;cursor:pointer;
                               background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%);color:#ffffff;
                               font-size:15.5px;font-weight:800;font-family:'Inter',sans-serif;
                               box-shadow:0 6px 24px -4px rgba(37,99,235,0.55), inset 0 1px 1px rgba(255,255,255,0.3);margin-bottom:10px;
                               display:flex;align-items:center;justify-content:center;gap:8px;transition:transform 0.12s ease;"
                        ontouchstart="this.style.transform='scale(0.98)'"
                        ontouchend="this.style.transform='scale(1)'">
                    <i class="ph-bold ph-sign-in" style="font-size:18px;"></i>
                    Accedi e Sincronizza
                </button>

                <!-- Cancel Button -->
                <button onclick="(typeof closeModal==='function'?closeModal():document.getElementById('modal-container').innerHTML='')"
                        style="width:100%;height:44px;border-radius:14px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;
                               background:rgba(255,255,255,0.05);color:#8e909f;
                               font-size:13.5px;font-weight:700;font-family:'Inter',sans-serif;transition:transform 0.12s ease;"
                        ontouchstart="this.style.transform='scale(0.98)'"
                        ontouchend="this.style.transform='scale(1)'">
                    Annulla
                </button>
            </div>
        </div>`;

    requestAnimationFrame(function() {
        var bd = document.getElementById('argo-login-backdrop');
        var cd = document.getElementById('argo-login-card');
        if (bd) bd.style.opacity = '1';
        if (cd) cd.style.transform = 'translateY(0)';
    });

    try {
        if (typeof checkServerHealth === 'function') checkServerHealth();
    } catch(err) {
        console.warn('[openArgoLogin] checkServerHealth non disponibile:', err.message);
        var ss = document.getElementById('server-status');
        if (ss) {
            ss.style.color = '#30d158';
            ss.style.background = 'rgba(48,209,88,0.12)';
            ss.innerHTML = '<span style="width:6px;height:6px;background:#30d158;border-radius:50%;flex-shrink:0;box-shadow:0 0 6px #30d158;"></span> Server pronto';
        }
    }
};

function showProfileSelectionModal(profiles, credentials) {
    const container = getModalContainer();
    if (!container) return;

    // Build profile cards with Apple Liquid Glass styling
    const profileCards = profiles.map(function(p) {
        const initial = escapeHtml((p.name || 'S')[0].toUpperCase());
        const name    = escapeHtml(p.name  || ('Studente ' + (p.index + 1)));
        const cls     = escapeHtml(p.class || p.school || '');

        return `
        <button class="btn-profile" data-index="${p.index}"
            style="width:100%;display:flex;align-items:center;gap:14px;padding:14px 16px;
                   background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.12);
                   border-radius:20px;cursor:pointer;text-align:left;
                   -webkit-tap-highlight-color:transparent;
                   box-shadow:0 4px 16px -4px rgba(0,0,0,0.3);
                   transition:transform 0.12s ease, background 0.15s ease, border-color 0.15s ease;"
            ontouchstart="this.style.transform='scale(0.97)';this.style.background='rgba(37,99,235,0.15)';this.style.borderColor='rgba(37,99,235,0.4)';"
            ontouchend="this.style.transform='scale(1)';this.style.background='rgba(255,255,255,0.05)';this.style.borderColor='rgba(255,255,255,0.12)';">
            <!-- Student Avatar -->
            <div style="width:48px;height:48px;border-radius:15px;flex-shrink:0;
                        background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%);
                        border:1px solid rgba(255,255,255,0.2);
                        display:flex;align-items:center;justify-content:center;
                        font-size:20px;font-weight:900;color:#ffffff;
                        box-shadow:0 4px 14px -2px rgba(37,99,235,0.5);">
                ${initial}
            </div>
            <!-- Info -->
            <div style="flex:1;min-width:0;">
                <div class="profile-name" style="font-size:15.5px;font-weight:800;color:#ffffff;
                            font-family:'Inter',sans-serif;letter-spacing:-0.01em;line-height:1.2;
                            white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${name}</div>
                ${cls ? `
                <div class="profile-class" style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;
                            font-size:11px;font-weight:700;color:#b6c4ff;
                            background:rgba(37,99,235,0.2);border:0.5px solid rgba(182,196,255,0.25);
                            padding:1px 7px;border-radius:6px;">
                    <i class="ph-bold ph-graduation-cap" style="font-size:11px;"></i> ${cls}
                </div>` : ''}
            </div>
            <i class="ph-bold ph-caret-right" style="font-size:18px;color:#8e909f;flex-shrink:0;"></i>
        </button>`;
    }).join('');

    // Overlay + sheet
    container.innerHTML = `
        <div id="psel-overlay"
             style="position:fixed;inset:0;z-index:99990;
                    background:rgba(11,19,38,0.7);
                    backdrop-filter:blur(24px) saturate(180%);-webkit-backdrop-filter:blur(24px) saturate(180%);
                    display:flex;align-items:flex-end;justify-content:center;
                    opacity:0;transition:opacity 0.22s ease;">

            <div id="psel-card"
                 style="width:100%;max-width:460px;
                        background:rgba(23,31,51,0.95);
                        backdrop-filter:blur(40px) saturate(190%);-webkit-backdrop-filter:blur(40px) saturate(190%);
                        border:1px solid rgba(182,196,255,0.18);border-top:1px solid rgba(255,255,255,0.35);
                        border-radius:32px 32px 0 0;
                        padding:0 22px calc(24px + env(safe-area-inset-bottom,0px)) 22px;
                        box-shadow:0 -12px 48px -8px rgba(6,14,32,0.8), inset 0 1px 0 rgba(255,255,255,0.2);
                        transform:translateY(40px);
                        transition:transform 0.26s cubic-bezier(0.16,1,0.3,1);font-family:'Inter',sans-serif;color:#dae2fd;">

                <!-- Drag Handle -->
                <div style="display:flex;justify-content:center;padding:14px 0 12px;">
                    <div style="width:38px;height:4.5px;border-radius:999px;background:rgba(255,255,255,0.22);"></div>
                </div>

                <!-- Header -->
                <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px;">
                    <div style="width:46px;height:46px;border-radius:15px;overflow:hidden;flex-shrink:0;
                                background:rgba(37,99,235,0.2);border:1px solid rgba(182,196,255,0.25);
                                display:flex;align-items:center;justify-content:center;
                                box-shadow:0 4px 14px rgba(37,99,235,0.4);">
                        <i class="ph-fill ph-users-three" style="font-size:24px;color:#2997ff;"></i>
                    </div>
                    <div>
                        <div style="font-size:18px;font-weight:800;color:#ffffff;
                                    letter-spacing:-0.02em;line-height:1.2;">
                            Seleziona Profilo
                        </div>
                        <div style="font-size:12px;font-weight:500;color:#8e909f;margin-top:2px;">
                            Scegli quale studente visualizzare
                        </div>
                    </div>
                </div>

                <!-- Profiles List -->
                <div class="profiles-list" style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px;max-height:50vh;overflow-y:auto;">
                    ${profileCards}
                </div>

                <!-- Cancel Button -->
                <button onclick="var mc=document.getElementById('modal-container');if(typeof closeModal==='function')closeModal();else if(mc)mc.innerHTML='';"
                        style="width:100%;height:46px;border-radius:14px;border:1px solid rgba(255,255,255,0.1);cursor:pointer;
                               background:rgba(255,255,255,0.05);color:#8e909f;
                               font-size:13.5px;font-weight:700;font-family:'Inter',sans-serif;">
                    Annulla
                </button>

            </div>
        </div>`;

    // Animazione entrata
    requestAnimationFrame(function() {
        var ov = document.getElementById('psel-overlay');
        var cd = document.getElementById('psel-card');
        if (ov) ov.style.opacity = '1';
        if (cd) cd.style.transform = 'translateY(0)';
    });

    // Chiudi cliccando backdrop
    var overlay = document.getElementById('psel-overlay');
    if (overlay) {
        overlay.addEventListener('click', function(e) {
            if (e.target === overlay) {
                overlay.style.opacity = '0';
                setTimeout(function() { container.innerHTML = ''; }, 180);
            }
        });
    }

    // Click su profilo
    var list = container.querySelector('.profiles-list');
    if (!list) return;

    list.addEventListener('click', async function(ev) {
        var btn = ev.target.closest('.btn-profile');
        if (!btn) return;

        var selectedName = btn.querySelector('.profile-name') ?
            btn.querySelector('.profile-name').textContent : 'Studente';

        // Loading screen dentro la card
        var card = document.getElementById('psel-card');
        if (card) {
            card.innerHTML = `
                <div style="display:flex;flex-direction:column;align-items:center;
                            justify-content:center;padding:52px 24px;gap:18px;text-align:center;">
                    <div style="width:54px;height:54px;border-radius:50%;
                                border:3.5px solid rgba(37,99,235,0.2);
                                border-top-color:#2563eb;
                                animation:spin 0.8s cubic-bezier(0.4,0,0.2,1) infinite;
                                box-shadow:0 0 16px rgba(37,99,235,0.4);"></div>
                    <div>
                        <div style="font-size:17px;font-weight:800;color:#ffffff;
                                    letter-spacing:-0.01em;margin-bottom:4px;">
                            Caricamento profilo
                        </div>
                        <div style="font-size:13.5px;color:#b6c4ff;font-weight:600;">
                            ${escapeHtml(selectedName)}
                        </div>
                    </div>
                    <div style="font-size:11.5px;font-weight:700;color:#8e909f;
                                text-transform:uppercase;letter-spacing:0.08em;">
                        Sincronizzazione in corso…
                    </div>
                </div>`;
        }

        await selectProfile(parseInt(btn.dataset.index, 10), credentials);
    }, { once: true });

    if (typeof resolveProfileNamesAsync === 'function') {
        resolveProfileNamesAsync(profiles, credentials, container);
    }
}
function setLoginBtnText(txt) {
    const btn = document.getElementById('login-btn') ||
        document.querySelector('.login-btn') ||
        document.querySelector('#loginBtn') ||
        document.querySelector('button[onclick*="performArgoSync"]') ||
        document.querySelector('button[type="submit"]');

    if (!btn) return;

    btn.innerText = txt;
    btn.disabled = /\.\.\.|Connessione|Sincronizzazione/.test(txt);
}
function toggleTask(id) {
    if (event) event.stopPropagation();

    let t = state.tasks.find(x => x.id === id);
    if (!t) t = state.reminders.find(x => x.id === id);

    if (t) {
        t.done = !t.done;
        saveTasks();
        if (state.reminders && state.reminders.find(x => x.id === id)) {
            localStorage.setItem(lsKey('reminders'), JSON.stringify(state.reminders));
        }


        // === SURGICAL DOM UPDATE ===
        // Update all checkboxes for this task ID without rebuilding
        document.querySelectorAll(`[data-task-toggle="${id}"]`).forEach(cb => {
            const isPlanner = cb.closest('.planner-content') || cb.closest('#weekly-agenda-list');
            if (isPlanner) {
                cb.style.borderColor = t.done ? 'var(--on-surface)' : 'var(--outline-variant)';
                cb.style.background = t.done ? 'var(--on-surface)' : 'transparent';
                cb.innerHTML = t.done ? '<i class="ph-bold ph-check" style="font-size:14px; color:#fff;"></i>' : '';
            } else {
                cb.style.borderColor = t.done ? 'var(--on-surface)' : 'var(--outline-variant)';
                cb.style.background = t.done ? 'var(--on-surface)' : 'var(--surface-container-lowest)';
                cb.innerHTML = t.done ? '<svg width="8" height="5" viewBox="0 0 8 5"><path d="M1 2.5L3 4.5L7 1" stroke="white" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>' : '';
            }
            cb.style.transform = 'scale(0.85)';
            setTimeout(() => { cb.style.transform = 'scale(1)'; }, 120);
        });
        // Update text strikethrough
        document.querySelectorAll(`[data-task-text="${id}"]`).forEach(el => {
            el.style.textDecoration = t.done ? 'line-through' : 'none';
            el.style.opacity = t.done ? '0.5' : '1';
            el.style.color = t.done ? 'var(--on-surface-variant)' : '';
        });

        // Update Home's Focus di Oggi toggle checkboxes (inline onclick) 
        updatePlanTaskUI(id, t.done);

        // Sync calendar events (lightweight, no full re-render)
        const calendarEl = document.getElementById('calendar');
        if (calendarEl && calendarEl._fullCalendar) {
            syncCalendarEvents(calendarEl._fullCalendar);
        }
        if (state.view === 'planner' && typeof renderCustomCalendar === 'function') renderCustomCalendar();

        // Refresh weekly agenda in-place if on planner
        if (state.view === 'planner') {
            const agendaEl = document.getElementById('weekly-agenda-list');
            if (agendaEl) {
                const newContent = renderWeeklyAgenda();
                const temp = document.createElement('div');
                temp.innerHTML = newContent;
                const newList = temp.querySelector('#weekly-agenda-list');
                if (newList) agendaEl.innerHTML = newList.innerHTML;
            }
        }

        // Update completed badge
        const badge = document.querySelector('[data-completed-badge]');
        if (badge) {
            const todayTasks = state.tasks.filter(t => {
                if (!t.dateObj) return false;
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const d = new Date(t.dateObj);
                d.setHours(0, 0, 0, 0);
                return d.getTime() === today.getTime();
            });
            const completedToday = todayTasks.filter(t => t.done).length;
            badge.textContent = `${completedToday}/${todayTasks.length}`;
        }

        // ✅ FIX: Update home view surgically, no full scheduleRender
        if (state.view === 'home' && typeof updateHomeView === 'function') updateHomeView();
    }
}
function showQuickAddTaskModal() {
    const preselectedDate = state.selectedDate || getLocalDateString();
    const allTasks  = (state.tasks||[]).filter(t=>t.subject!=='QUEST');
    const subjects  = [...new Set(allTasks.map(t=>t.subject||t.materia||'').filter(Boolean))].sort();
    const subjectOptions = subjects.length
        ? subjects.map(s=>`<option value="${escapeHtml(s)}">${escapeHtml(formatSubjectTitle(s))}</option>`).join('')
        : '<option value="Generale">Generale</option>';
    const pendingTasks = allTasks.filter(t=>!t.done && (t.due_date||'')>=getLocalDateString());
    const pendingSubjs = [...new Set(pendingTasks.map(t=>t.subject||t.materia||'Generale'))].sort();

    const INP = 'width:100%;padding:13px 16px;border-radius:16px;border:0.5px solid rgba(255,255,255,0.15);background:rgba(255,255,255,0.06);color:#ffffff;font-size:14px;font-weight:500;outline:none;box-sizing:border-box;font-family:\'Inter\',sans-serif;';
    const LBL = 'font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.06em;margin-bottom:7px;display:block;';

    // Full-screen-style bottom sheet in Apple Liquid Glass
    showModal(`
<div style="padding:24px 22px 32px;background:rgba(18,26,44,0.96);backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);border:0.5px solid rgba(255,255,255,0.15);border-top:1px solid rgba(255,255,255,0.25);border-radius:32px 32px 0 0;font-family:'Inter',sans-serif;width:100%;box-sizing:border-box;position:relative;overflow:hidden;">
    <!-- Ambient top glow -->
    <div style="position:absolute;top:-20px;right:-20px;width:120px;height:120px;background:#2997ff;opacity:0.2;border-radius:50%;filter:blur(30px);pointer-events:none;"></div>

    <!-- Header -->
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;position:relative;z-index:1;">
        <div>
            <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
                <span style="width:6px;height:6px;border-radius:50%;background:#2997ff;box-shadow:0 0 8px #2997ff;"></span>
                <span style="font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#2997ff;">NUOVA ATTIVITÀ</span>
            </div>
            <h2 style="margin:0;font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.02em;">Aggiungi</h2>
            <p style="margin:2px 0 0;font-size:12px;color:rgba(255,255,255,0.6);font-weight:500;">Compito, verifica o impegno sul calendario</p>
        </div>
        <button id="qs-close-btn" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.15);color:rgba(255,255,255,0.8);cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.9)'" ontouchend="this.style.transform='scale(1)'">
            <i class="ph ph-x" style="font-size:18px;"></i>
        </button>
    </div>

    <!-- 3 tabs -->
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;background:rgba(255,255,255,0.05);padding:4px;border-radius:16px;border:0.5px solid rgba(255,255,255,0.1);margin-bottom:20px;position:relative;z-index:1;">
        <button id="qs-tab-new"      style="padding:10px 4px;border-radius:12px;border:1px solid rgba(41,151,255,0.6);background:#2997ff;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 4px 14px rgba(41,151,255,0.35);display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s ease;"><i class="ph-fill ph-book-open" style="font-size:14px;"></i> Compito</button>
        <button id="qs-tab-existing" style="padding:10px 4px;border-radius:12px;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s ease;"><i class="ph-fill ph-list-checks" style="font-size:14px;"></i> Assegnati</button>
        <button id="qs-tab-verifica" style="padding:10px 4px;border-radius:12px;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s ease;"><i class="ph-fill ph-pencil-simple-line" style="font-size:14px;"></i> Verifica</button>
    </div>

    <!-- PANEL: Nuovo compito -->
    <div id="qs-panel-new" style="display:flex;flex-direction:column;gap:14px;position:relative;z-index:1;">
        <div><label style="${LBL}">Materia</label><select id="qs-subject" style="${INP}-webkit-appearance:none;">${subjectOptions}</select></div>
        <div><label style="${LBL}">Descrizione</label><textarea id="qs-text" placeholder="Es. Esercizi pag. 47-49, studio cap. 3..." rows="3" style="${INP}resize:none;line-height:1.5;"></textarea></div>
        <div><label style="${LBL}">Data di consegna</label><input id="qs-date" type="date" value="${preselectedDate}" style="${INP}" /></div>
        <button id="qs-submit-new" style="width:100%;height:52px;border-radius:18px;border:1px solid rgba(255,255,255,0.3);background:linear-gradient(135deg,#2997ff 0%,#0058bc 100%);color:#ffffff;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 8px 24px rgba(41,151,255,0.4);display:flex;align-items:center;justify-content:center;gap:7px;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
            <i class="ph-bold ph-plus-circle" style="font-size:20px;"></i> Aggiungi Compito
        </button>
    </div>

    <!-- PANEL: Assegnati -->
    <div id="qs-panel-existing" style="display:none;flex-direction:column;gap:12px;position:relative;z-index:1;">
        <p style="font-size:12px;color:rgba(255,255,255,0.65);margin:0 0 4px;">Seleziona un compito già assegnato dai docenti, poi scegli quando inserirlo nel diario.</p>
        <div style="max-height:38vh;overflow-y:auto;display:flex;flex-direction:column;gap:8px;padding-right:2px;">
        ${pendingSubjs.length>0 ? pendingSubjs.map(s=>`
            <p style="font-size:10px;font-weight:700;color:#2997ff;text-transform:uppercase;letter-spacing:0.08em;margin:6px 0 2px;">${escapeHtml(formatSubjectTitle(s))}</p>
            ${pendingTasks.filter(t=>(t.subject||t.materia||'Generale')===s).map(t=>`
            <div id="qs-ex-${escapeHtml(t.id)}" style="background:rgba(20,31,54,0.75);border-radius:16px;padding:12px 14px;border:0.5px solid rgba(255,255,255,0.12);cursor:pointer;display:flex;flex-direction:column;gap:3px;transition:all 0.15s ease;">
                <span style="font-size:13px;font-weight:600;color:#ffffff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(t.text||'')}</span>
                <span style="font-size:11px;color:rgba(255,255,255,0.5);">Scadenza: ${t.due_date||'—'}</span>
            </div>`).join('')}`).join('') : '<p style="text-align:center;color:rgba(255,255,255,0.4);font-size:13px;padding:24px 0;">Nessun compito pendente trovato</p>'}
        </div>
        <div id="qs-existing-date-row" style="display:none;flex-direction:column;gap:10px;padding-top:10px;border-top:0.5px solid rgba(255,255,255,0.1);">
            <label style="${LBL}">Quando vuoi studiarlo?</label>
            <input id="qs-existing-date" type="date" value="${preselectedDate}" style="${INP}" />
            <button id="qs-submit-existing" style="width:100%;height:50px;border-radius:18px;border:1px solid rgba(255,255,255,0.3);background:linear-gradient(135deg,#30d158 0%,#1e8e3e 100%);color:#ffffff;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 8px 24px rgba(48,209,88,0.35);display:flex;align-items:center;justify-content:center;gap:7px;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
                <i class="ph-bold ph-calendar-plus" style="font-size:19px;"></i> Aggiungi al Planner
            </button>
        </div>
    </div>

    <!-- PANEL: Verifica -->
    <div id="qs-panel-verifica" style="display:none;flex-direction:column;gap:14px;position:relative;z-index:1;">
        <div><label style="${LBL}">Materia</label><select id="qs-v-subject" style="${INP}-webkit-appearance:none;">${subjectOptions}</select></div>
        <div><label style="${LBL}">Argomenti</label><textarea id="qs-v-text" placeholder="Es. Capitoli 3-5, derivate, sintassi..." rows="2" style="${INP}resize:none;line-height:1.5;"></textarea></div>
        <div><label style="${LBL}">Tipologia Prova</label>
            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;background:rgba(255,255,255,0.05);padding:4px;border-radius:16px;border:0.5px solid rgba(255,255,255,0.1);">
                <button id="qs-vt-scritta" style="padding:10px 4px;border-radius:12px;border:1px solid rgba(255,69,58,0.6);background:#ff453a;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 4px 14px rgba(255,69,58,0.35);transition:all 0.2s ease;">Scritta</button>
                <button id="qs-vt-orale"   style="padding:10px 4px;border-radius:12px;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;transition:all 0.2s ease;">Orale</button>
                <button id="qs-vt-pratica" style="padding:10px 4px;border-radius:12px;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;cursor:pointer;font-family:'Inter',sans-serif;transition:all 0.2s ease;">Pratica</button>
            </div>
        </div>
        <div><label style="${LBL}">Data</label><input id="qs-v-date" type="date" value="${preselectedDate}" style="${INP}" /></div>
        <button id="qs-submit-verifica" style="width:100%;height:52px;border-radius:18px;border:1px solid rgba(255,255,255,0.3);background:linear-gradient(135deg,#ff453a 0%,#b91c1c 100%);color:#ffffff;font-size:15px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;box-shadow:0 8px 24px rgba(255,69,58,0.4);display:flex;align-items:center;justify-content:center;gap:7px;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
            <i class="ph-bold ph-warning" style="font-size:19px;"></i> Aggiungi Verifica
        </button>
    </div>
</div>
    `);

    // ── Wire up all interactivity after DOM is ready ────────────────────────────
    requestAnimationFrame(() => {
        // Styles for tabs
        const ACTIVE_BLUE = 'padding:10px 4px;border-radius:12px;border:1px solid rgba(41,151,255,0.6);background:#2997ff;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif;box-shadow:0 4px 14px rgba(41,151,255,0.35);display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s ease;';
        const ACTIVE_GREEN= 'padding:10px 4px;border-radius:12px;border:1px solid rgba(48,209,88,0.6);background:#30d158;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif;box-shadow:0 4px 14px rgba(48,209,88,0.35);display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s ease;';
        const ACTIVE_RED  = 'padding:10px 4px;border-radius:12px;border:1px solid rgba(255,69,58,0.6);background:#ff453a;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif;box-shadow:0 4px 14px rgba(255,69,58,0.35);display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s ease;';
        const INACTIVE    = 'padding:10px 4px;border-radius:12px;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif;display:flex;align-items:center;justify-content:center;gap:5px;transition:all 0.2s ease;';
        const CHIP_ACT = 'padding:10px 4px;border-radius:12px;border:1px solid rgba(255,69,58,0.6);background:#ff453a;color:#ffffff;font-size:12px;font-weight:700;cursor:pointer;font-family:\'Inter\',sans-serif;box-shadow:0 4px 14px rgba(255,69,58,0.35);transition:all 0.2s ease;';
        const CHIP_IN  = 'padding:10px 4px;border-radius:12px;border:none;background:transparent;color:rgba(255,255,255,0.7);font-size:12px;font-weight:600;cursor:pointer;font-family:\'Inter\',sans-serif;transition:all 0.2s ease;';

        let currentTab = 'new';
        let pickedTaskId = null;
        let vTipo = 'scritta';

        function switchTab(tab) {
            currentTab = tab;
            ['new','existing','verifica'].forEach(t => {
                const btn = document.getElementById('qs-tab-'+t);
                const panel = document.getElementById('qs-panel-'+t);
                if (!btn || !panel) return;
                const actStyle = t==='verifica' ? ACTIVE_RED : (t==='existing' ? ACTIVE_GREEN : ACTIVE_BLUE);
                btn.style.cssText = t===tab ? actStyle : INACTIVE;
                panel.style.display = t===tab ? 'flex' : 'none';
            });
        }

        // Close button
        const closeBtn = document.getElementById('qs-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            const overlay = document.querySelector('.modal-overlay.active');
            if (overlay) overlay.remove();
            else if (typeof closeModal === 'function') closeModal();
        });

        // Tab buttons
        ['new','existing','verifica'].forEach(t => {
            const btn = document.getElementById('qs-tab-'+t);
            if (btn) btn.onclick = () => switchTab(t);
        });

        // Existing task cards
        document.querySelectorAll('[id^="qs-ex-"]').forEach(el => {
            el.onclick = () => {
                pickedTaskId = el.id.replace('qs-ex-','');
                document.querySelectorAll('[id^="qs-ex-"]').forEach(e => {
                    e.style.border = '0.5px solid rgba(255,255,255,0.12)';
                    e.style.background = 'rgba(20,31,54,0.75)';
                });
                el.style.border = '1px solid #30d158';
                el.style.background = 'rgba(48,209,88,0.15)';
                const row = document.getElementById('qs-existing-date-row');
                if (row) row.style.display = 'flex';
            };
        });

        // Verifica tipo chips
        ['scritta','orale','pratica'].forEach(t => {
            const btn = document.getElementById('qs-vt-'+t);
            if (!btn) return;
            btn.onclick = () => {
                vTipo = t;
                ['scritta','orale','pratica'].forEach(tt => {
                    const b = document.getElementById('qs-vt-'+tt);
                    if (b) b.style.cssText = tt===t ? CHIP_ACT : CHIP_IN;
                });
            };
        });

        function doAdd(subject, text, date, isExam) {
            if (!text.trim()) return false;
            if (!date) return false;
            const r = applyImmediateCalendarAction({type:'add',missing:[],subject,text,date,time:'',isExam});
            if (r.ok) {
                if(typeof closeModal==='function') closeModal();
                state.selectedDate = date;
                window._plannerDayContentCache = null;
                state._forceRender = true;
                showToast((isExam?'Verifica':'Compito')+' aggiunto!','success');
                scheduleRender(0);
                return true;
            }
            showToast('Errore nell\'aggiunta','error');
            return false;
        }

        // Submit new
        const sbNew = document.getElementById('qs-submit-new');
        if (sbNew) sbNew.onclick = () => {
            const sub = document.getElementById('qs-subject')?.value?.trim()||'Generale';
            const txt = document.getElementById('qs-text')?.value?.trim()||'';
            const dt  = document.getElementById('qs-date')?.value||getLocalDateString();
            if (!txt) { const el=document.getElementById('qs-text'); if(el){el.style.border='2px solid var(--error)';el.focus();} return; }
            doAdd(sub,txt,dt,false);
        };

        // Submit existing
        const sbEx = document.getElementById('qs-submit-existing');
        if (sbEx) sbEx.onclick = () => {
            if (!pickedTaskId) { showToast('Seleziona un compito','warning'); return; }
            const orig=(state.tasks||[]).find(t=>t.id===pickedTaskId);
            if (!orig) { showToast('Compito non trovato','error'); return; }
            const dt=document.getElementById('qs-existing-date')?.value||getLocalDateString();
            doAdd(orig.subject||'Generale',orig.text||'',dt,false);
        };

        // Submit verifica
        const sbVer = document.getElementById('qs-submit-verifica');
        if (sbVer) sbVer.onclick = () => {
            const sub = document.getElementById('qs-v-subject')?.value?.trim()||'Generale';
            const txt = document.getElementById('qs-v-text')?.value?.trim()||'';
            const dt  = document.getElementById('qs-v-date')?.value||getLocalDateString();
            if (!txt) { const el=document.getElementById('qs-v-text'); if(el){el.style.border='2px solid var(--error)';el.focus();} return; }
            doAdd(sub,`${vTipo.charAt(0).toUpperCase()+vTipo.slice(1)} · ${txt}`,dt,true);
        };
    });
}

function showAddRegistroTaskModal() {
    const subjects = [...new Set(state.tasks.map(t => t.subject).filter(Boolean))];
    const subjectOptions = subjects.length > 0
        ? subjects.map(s => `<option value="${s}">${s}</option>`).join('')
        : '<option value="Generale">Generale</option>';

    showModal(`
                <div style="padding: 28px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                        <h2 style="margin: 0; font-size: 22px; font-weight: 800; color:var(--on-surface);">Nuova Verifica</h2>
                        <button onclick="closeModal()" style="width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--outline-variant); background:var(--surface-container-low); color:var(--on-surface); cursor: pointer; display: flex; align-items: center; justify-content: center;"><i class="ph-bold ph-x" style="font-size: 14px;"></i></button>
                    </div>
                    <p style="font-family:'JetBrains Mono', monospace; font-size: 10px; color:var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 24px;">// AGGIUNGI_VERIFICA_O_ORALE</p>
                    <div style="display: flex; flex-direction: column; gap: 18px;">
                        <div>
                            <label style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color:var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: block;">Tipo</label>
                            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
                                <button id="tipo-scritta" onclick="selectRegistroTipo('scritta')" style="padding: 14px; border-radius: 14px; border: 2px solid var(--on-surface); background: #141414; color: #FFF; font-family:'JetBrains Mono', monospace; font-size: 12px; font-weight: 800; text-transform: uppercase; cursor: pointer; transition: all 0.2s;">✏️ Scritta</button>
                                <button id="tipo-orale" onclick="selectRegistroTipo('orale')" style="padding: 14px; border-radius: 14px; border: 1px solid var(--outline-variant); background:var(--surface-container-low); color:var(--on-surface); font-family:'JetBrains Mono', monospace; font-size: 12px; font-weight: 800; text-transform: uppercase; cursor: pointer; transition: all 0.2s;">🎤 Orale</button>
                            </div>
                        </div>
                        <div>
                            <label style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color:var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: block;">Materia</label>
                            <select id="registroTaskSubject" style="width: 100%; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--outline-variant); background:var(--surface-container-low); color:var(--on-surface); font-size: 15px; font-weight: 600; outline: none; box-sizing: border-box; -webkit-appearance: none;">
                                ${subjectOptions}
                            </select>
                        </div>
                        <div>
                            <label style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color:var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: block;">Argomenti</label>
                            <textarea id="registroTaskArgs" placeholder="Es. Capitoli 3-5, Equazioni 2° grado" rows="2"
                                style="width: 100%; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--outline-variant); background:var(--surface-container-low); color:var(--on-surface); font-size: 14px; outline: none; resize: vertical; box-sizing: border-box;"></textarea>
                        </div>
                        <div>
                            <label style="font-family:'JetBrains Mono', monospace; font-size: 10px; font-weight: 800; color:var(--on-surface-variant); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: 8px; display: block;">Data</label>
                            <input id="registroTaskDate" type="date" value="${getLocalDateString()}"
                                style="width: 100%; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--outline-variant); background:var(--surface-container-low); color:var(--on-surface); font-size: 15px; font-weight: 600; outline: none; box-sizing: border-box;" />
                        </div>
                    </div>
                    <button id="submit-registro-btn" onclick="submitRegistroTask()" style="width: 100%; margin-top: 24px; padding: 16px; border-radius: 16px; border: none; background: #141414; color: #FFF; font-family:'JetBrains Mono', monospace; font-size: 13px; font-weight: 800; text-transform: uppercase; cursor: pointer; box-shadow: 0 4px 16px rgba(0,0,0,0.1); transition: all 0.15s cubic-bezier(0.4, 0, 0.2, 1);">
                        <i class="ph-bold ph-plus" style="margin-right: 8px;"></i> Aggiungi Verifica
                    </button>
                    <style>
                        #submit-registro-btn:active { transform: scale(0.96); opacity: 0.8; }
                    </style>
                </div>
        `);
    window._registroTipo = 'scritta';
}
// --- Registro Tipo Selection ---
window.selectRegistroTipo = function (tipo) {
    window._registroTipo = tipo;
    const btnSc = document.getElementById('tipo-scritta');
    const btnOr = document.getElementById('tipo-orale');
    if (btnSc && btnOr) {
        if (tipo === 'scritta') {
            btnSc.style.cssText = 'padding:14px; border-radius:14px; border:2px solid var(--on-surface); background:#141414; color:#FFF; font-family:JetBrains Mono,monospace; font-size:12px; font-weight:800; text-transform:uppercase; cursor:pointer; transition:all 0.2s;';
            btnOr.style.cssText = 'padding:14px; border-radius:14px; border:1px solid var(--outline-variant); background:var(--surface-container-low); color:var(--on-surface); font-family:JetBrains Mono,monospace; font-size:12px; font-weight:800; text-transform:uppercase; cursor:pointer; transition:all 0.2s;';
        } else {
            btnOr.style.cssText = 'padding:14px; border-radius:14px; border:2px solid var(--on-surface); background:#141414; color:#FFF; font-family:JetBrains Mono,monospace; font-size:12px; font-weight:800; text-transform:uppercase; cursor:pointer; transition:all 0.2s;';
            btnSc.style.cssText = 'padding:14px; border-radius:14px; border:1px solid var(--outline-variant); background:var(--surface-container-low); color:var(--on-surface); font-family:JetBrains Mono,monospace; font-size:12px; font-weight:800; text-transform:uppercase; cursor:pointer; transition:all 0.2s;';
        }
    }
};
// --- Submit Registro Task (Handled in index.html) ---
// (Moved to correct global scope with Supabase integration in index.html)
function showCompetencyInputModal() {
    const votiData = getVotiData();
    const subjectsMap = {};
    votiData.forEach(v => {
        const sub = v.materia || v.subject || 'Altro';
        if (!subjectsMap[sub]) subjectsMap[sub] = [];
        subjectsMap[sub].push(v);
    });

    // Also gather all known subjects from tasks (in case there are subjects with no grades yet)
    const allSubjects = new Set(Object.keys(subjectsMap));
    state.tasks.forEach(t => { if (t.subject) allSubjects.add(t.subject); });

    const subjectsList = [...allSubjects].map(name => {
        const list = subjectsMap[name] || [];
        const media = list.length > 0 ? (parseFloat(calcolaMedia(list)) || 0) : 0;
        const color = getSubjectColor(name);
        const savedLevel = (state.prepLevels || {})[name] || 3;
        const priority = media < 6 ? '🔴 Recupero' : media < 7 ? '🟡 Migliorabile' : '🟢 Buona';
        return { name, media, color, priority, count: list.length, savedLevel };
    }).sort((a, b) => a.media - b.media);

    const levelLabels = { 1: 'Per niente pronto', 2: 'Poco pronto', 3: 'Sufficiente', 4: 'Abbastanza pronto', 5: 'Molto pronto' };

    showModal(`
                <div style="padding: 24px; max-height: 80vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                        <h2 style="margin: 0; font-size: 20px; font-weight: 800;">🎯 Competenze & Priorità</h2>
                        <i class="ph ph-x" onclick="closeModal()" style="cursor:pointer; font-size: 22px; opacity: 0.6;"></i>
                    </div>
                    <p style="font-size: 12px; color: var(--text-secondary); margin-bottom: 16px;">Indica la tua preparazione (1-5) per ogni materia. L'AI userà sia i voti sia il tuo livello dichiarato.</p>

                    <div style="display: flex; flex-direction: column; gap: 14px; margin-bottom: 24px;">
                        ${subjectsList.map(s => `
                            <div style="padding: 18px; border-radius: 16px; background: rgba(var(--glass-rgb),0.035); border: 1px solid rgba(var(--glass-rgb),0.08);">
                                <div style="display: flex; align-items: center; gap: 14px; margin-bottom: 12px; cursor: pointer;" onclick="const chk=this.querySelector('input'); chk.checked=!chk.checked">
                                    <input type="checkbox" value="${escapeHtml(s.name)}" class="competency-check" id="comp-${s.name.replace(/[^a-zA-Z0-9]/g, '_')}" ${s.media < 6.5 || s.savedLevel < 3 ? 'checked' : ''} style="accent-color: var(--accent); width: 22px; height: 22px; cursor: pointer;" onclick="event.stopPropagation()" />
                                    <span style="background: ${s.color}; width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;"></span>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-size: 15px; font-weight: 700; color: white;">${escapeHtml(s.name)}</div>
                                        <div style="font-size: 11px; color: var(--text-dim); margin-top: 2px;">${s.count > 0 ? `Media: ${s.media.toFixed(2)} · ${s.priority}` : 'Nessun voto'}</div>
                                    </div>
                                </div>
                                <div style="display: flex; flex-direction: column; gap: 8px; padding-left: 2px;">
                                    <div style="display: flex; justify-content: space-between; align-items: center;">
                                        <span style="font-size: 11px; color: var(--text-dim); text-transform: uppercase; font-weight: 700; letter-spacing: 0.5px;">Preparazione:</span>
                                        <span id="prep-label-${s.name.replace(/[^a-zA-Z0-9]/g, '_')}" style="font-size: 12px; color: var(--accent); font-weight: 800;">${escapeHtml(levelLabels[s.savedLevel])}</span>
                                    </div>
                                    <div style="height: 48px; display: flex; align-items: center;">
                                        <input type="range" min="1" max="5" value="${s.savedLevel}" class="prep-slider" data-subject="${escapeHtml(s.name)}"
                                            oninput="document.getElementById('prep-label-${s.name.replace(/[^a-zA-Z0-9]/g, '_')}').textContent = ['','Per niente','Poco','Sufficiente','Abbastanza','Molto'][this.value]"
                                            style="flex: 1; accent-color: var(--accent); height: 8px; cursor: pointer;" />
                                    </div>
                                </div>
                            </div>
                        `).join('')}
                        ${subjectsList.length === 0 ? '<div style="text-align:center; padding:40px; color:var(--text-dim); font-size:14px;">Nessun voto disponibile. Sincronizza prima i voti.</div>' : ''}
                    </div>

                    <button class="btn-primary" onclick="submitCompetencyRequest()" style="width: 100%; border:none; color:white; font-size: 16px; font-weight: 800; padding: 18px; border-radius: 16px;">
                        <i class="ph-bold ph-sparkle" style="margin-right: 8px;"></i> Chiedi un Piano all'AI
                    </button>
                </div>
        `);
}
function showOrganizeStudyModal() {
    const todayStr = getLocalDateString(getSchoolDate());
    const plannedIds = state.plannedTasks[todayStr] || [];
    const allPendingTasks = state.tasks.filter(t => !t.done);

    modalContainer.innerHTML = `
            <div class="modal-overlay active" onclick="closeModal(event)">
                <div class="modal-content glass-panel" onclick="event.stopPropagation()" style="max-width: 450px; padding: 30px;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <h2 style="margin:0; font-size: 24px;">Cosa fai oggi?</h2>
                        <i class="ph ph-x" onclick="closeModal()" style="cursor:pointer; font-size: 28px; opacity: 0.6;"></i>
                    </div>
                    <p style="font-size: 15px; opacity: 0.8; margin-bottom: 24px; line-height: 1.5;">Seleziona i compiti che vuoi affrontare oggi.</p>
                    
                    <div style="display: flex; flex-direction: column; gap: 16px; margin-bottom: 30px; max-height: 450px; overflow-y: auto;">
                        ${allPendingTasks.length > 0 ? allPendingTasks.map(t => {
        const isPlanned = plannedIds.includes(t.id);
        const subjectColor = getSubjectColor(t.subject);
        return `
                                <div class="glass-list-item" style="padding: 18px; display: flex; align-items: center; gap: 16px; cursor: pointer; border-left: 4px solid ${isPlanned ? 'var(--green)' : 'rgba(var(--glass-rgb),0.05)'}; background: ${isPlanned ? 'rgba(48, 209, 88, 0.08)' : 'rgba(var(--glass-rgb),0.03)'};" onclick="togglePlanTask('${t.id}')">
                                    <div class="plan-checkbox ${isPlanned ? 'checked' : ''}" style="width: 28px; height: 28px; border-radius: 8px; background: ${isPlanned ? 'var(--green)' : 'transparent'}; border: 2px solid ${isPlanned ? 'var(--green)' : 'rgba(var(--glass-rgb),0.2)'}; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                                        ${isPlanned ? '<i class="ph-bold ph-check" style="font-size: 16px; color: black;"></i>' : ''}
                                    </div>
                                    <div style="flex: 1; min-width: 0;">
                                        <div style="font-weight: 700; font-size: 16px; color: white;">${escapeHtml(t.text)}</div>
                                        <div style="font-size: 12px; color: ${subjectColor}; font-weight: 800; text-transform: uppercase;">${escapeHtml(t.subject)}</div>
                                    </div>
                                </div>
                            `;
    }).join('') : '<div style="text-align: center; opacity: 0.5; padding: 40px;">Nessun compito in sospeso.</div>'}
                    </div>
                    <button onclick="closeModal()" class="btn-primary" style="width: 100%; padding: 16px; font-size: 16px; font-weight: 700;">Salva Agenda</button>
                </div>
            </div>
        `;
}
function closePlannerDropdown() {
    const menu = document.getElementById('planner-cloud-menu');
    const btn = document.getElementById('planner-cloud-btn');
    if (menu) menu.classList.remove('active');
    if (btn) {
        btn.classList.remove('active');
        btn.setAttribute('aria-expanded', 'false');
    }
    if (window._plannerMenuCloseHandler) {
        document.removeEventListener('pointerdown', window._plannerMenuCloseHandler);
        window._plannerMenuCloseHandler = null;
    }
}
window.closePlannerDropdown = closePlannerDropdown;

function togglePlannerMenu(event) {
    if (event) event.stopPropagation();
    const menu = document.getElementById('planner-cloud-menu');
    const btn = document.getElementById('planner-cloud-btn') || event?.currentTarget || event?.target?.closest('button');
    if (!menu || !btn) return;

    const isVisible = menu.classList.contains('active');
    if (!isVisible) {
        menu.classList.add('active');
        btn.classList.add('active');
        btn.setAttribute('aria-expanded', 'true');
        const closeHandler = (e) => {
            if (!menu.contains(e.target) && !btn.contains(e.target)) {
                closePlannerDropdown();
            }
        };
        window._plannerMenuCloseHandler = closeHandler;
        // Minimal delay to prevent the same tap used to open the menu from immediately closing it.
        setTimeout(() => {
            document.addEventListener('pointerdown', closeHandler);
        }, 10);
    } else {
        closePlannerDropdown();
    }
}
function showTasksBySubjectModal() {
    const subjects = [...new Set(state.tasks.map(t => t.subject))].sort();
    modalContainer.innerHTML = `
            <div class="modal-overlay active" onclick="closeModal(event)">
                <div class="modal-content glass-panel" onclick="event.stopPropagation()" style="max-width: 500px; padding: 24px; max-height: 85vh; overflow-y: auto;">
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                        <h2 style="margin:0;">Compiti per Materia</h2>
                        <i class="ph ph-x" onclick="closeModal()" style="cursor:pointer; font-size: 24px;"></i>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 24px;">
                        ${subjects.map(s => {
        const subjectTasks = state.tasks.filter(t => t.subject === s);
        const color = getSubjectColor(s);
        return `
                                <div style="border-left: 4px solid ${color}; padding-left: 16px;">
                                    <h3 style="color: ${color}; text-transform: uppercase; font-size: 14px; margin-bottom: 12px; display: flex; align-items: center; gap: 8px;">
                                        <i class="ph-fill ph-book-open"></i> ${s}
                                        <span style="font-size: 10px; padding: 2px 8px; border-radius: 20px; font-weight: 800; border: 1px solid ${color}40;">${subjectTasks.length}</span>
                                    </h3>
                                    <div style="display: flex; flex-direction: column; gap: 10px;">
                                        ${subjectTasks.map(t => `
                                            <div class="glass-list-item" style="padding: 12px; display: flex; align-items: center; gap: 12px; background: rgba(var(--glass-rgb),0.03);">
                                                <div class="task-checkbox ${t.done ? 'checked' : ''}" style="width: 18px; height: 18px; border: 2px solid ${t.done ? 'var(--green)' : 'rgba(var(--glass-rgb),0.2)'}; border-radius: 5px; background: ${t.done ? 'var(--green)' : 'transparent'}; display: flex; align-items: center; justify-content: center;">
                                                    ${t.done ? '<i class="ph-bold ph-check" style="font-size: 10px; color: black;"></i>' : ''}
                                                </div>
                                                <div style="flex: 1;">
                                                    <div style="font-size: 14px; font-weight: 600; color: white; ${t.done ? 'opacity: 0.5; text-decoration: line-through;' : ''}">${escapeHtml(t.text)}</div>
                                                    <div style="font-size: 10px; opacity: 0.5;">${t.display_date}</div>
                                                </div>
                                            </div>
                                        `).join('')}
                                    </div>
                                </div>
                            `;
    }).join('')}
                    </div>
                    <button onclick="closeModal()" class="btn-primary" style="margin-top: 30px; width: 100%;">Chiudi</button>
                </div>
            </div>
        `;
}
function togglePlanTask(id) {
    if (event) event.stopPropagation();

    const todayStr = getLocalDateString(getSchoolDate());
    if (!state.plannedTasks[todayStr]) state.plannedTasks[todayStr] = [];

    const index = state.plannedTasks[todayStr].indexOf(id);
    if (index > -1) {
        state.plannedTasks[todayStr].splice(index, 1);
    } else {
        state.plannedTasks[todayStr].push(id);
    }

    saveTasks();

    updatePlanTaskUI(id, state.plannedTasks[todayStr].includes(id));
    updatePlannerCounter();
    notifyPlannerChanged(); // ✅ aggiorna Planner e Home SUBITO
}
function updateTaskUI(taskId, isDone) {
    const checkbox = document.querySelector(`[data-task-toggle="${taskId}"]`);
    const taskText = document.querySelector(`[data-task-text="${taskId}"]`);

    if (checkbox) {
        checkbox.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';

        if (isDone) {
            checkbox.style.background = 'var(--green, #30D158)';
            checkbox.style.borderColor = 'var(--green, #30D158)';
            checkbox.innerHTML = '<i class="ph-bold ph-check" style="font-size: 10px; color: black;"></i>';
        } else {
            checkbox.style.background = 'transparent';
            checkbox.style.borderColor = 'rgba(var(--glass-rgb),0.2)';
            checkbox.innerHTML = '';
        }

        checkbox.style.transform = 'scale(0.85) translateZ(0)';
        requestAnimationFrame(() => {
            setTimeout(() => {
                checkbox.style.transform = 'scale(1) translateZ(0)';
            }, 50);
        });
    }

    if (taskText) {
        taskText.style.transition = 'all 0.3s cubic-bezier(0.16, 1, 0.3, 1)';
        if (isDone) {
            taskText.style.opacity = '0.5';
            taskText.style.textDecoration = 'line-through';
        } else {
            taskText.style.opacity = '1';
            taskText.style.textDecoration = 'none';
        }
    }
}
function updateMediaWidget(value) { renderMediaGauge(value); }
function initHomeWidgets({ mediaValue = 7.64 } = {}) {
    renderMediaGauge(mediaValue);
}
function togglePollCreatorUI() {
    const ui = document.getElementById('poll-creator-ui');
    if (ui) {
        ui.style.display = (ui.style.display === 'none' || ui.style.display === '') ? 'block' : 'none';
    }
}


// ── 4. PATCH: animationend listener ──
document.addEventListener('animationend', (e) => {
    if (e.target.classList.contains('view') ||
        e.target.classList.contains('hero-container') ||
        e.target.classList.contains('greeting-card')) {
        e.target.classList.add('anim-done');
    }
}, true);

/* ===== GLOBAL SAFETY EXPORTS (hotfix) ===== */
(function attachGlobals() {
    const safeBind = (name, fn) => {
        if (typeof window[name] !== 'function') window[name] = fn;
    };

    // 1) showProfileActions fallback
    safeBind('showProfileActions', function showProfileActionsFallback() {
        try {
            if (typeof closeModal !== 'function' || typeof getModalContainer !== 'function') return;
            const container = getModalContainer();
            if (!container) return;
            container.innerHTML = `
                <div class="modal-overlay active" onclick="closeModal(event)">
                  <div class="modal-content" onclick="event.stopPropagation()" style="width: 100%; max-width: 360px; padding: 16px; border-radius: 20px; background:var(--surface-container-lowest); box-shadow: 0 20px 40px rgba(0,0,0,0.2);">
                    <div style="font-size: 18px; font-weight: 800; color: var(--text-primary); margin-bottom: 12px;">Profilo</div>
                    <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 20px;">Sessione caricata parzialmente. Riprova a navigare nel profilo.</p>
                    <button onclick="closeModal(); if(window.navigate) navigate('profile')" class="btn-primary" style="width:100%; margin-bottom:8px; border-radius: 12px; height: 48px; font-weight: 700;">Apri profilo</button>
                    <button onclick="if(window.logout) logout()" style="width: 100%; height: 48px; border-radius: 12px; border: none; background: rgba(239, 68, 68, 0.05); color: var(--red); font-weight: 800; cursor: pointer;">Esci</button>
                  </div>
                </div>`;
        } catch (e) {
            console.error('showProfileActions fallback error', e);
        }
    });

    // 2) isFutureOrToday fallback (timezone-safe)
    safeBind('isFutureOrToday', function isFutureOrTodayFallback(dateStr) {
        if (!dateStr) return false;
        const today = (typeof getLocalDateString === 'function')
            ? getLocalDateString(new Date())
            : new Date().toISOString().slice(0, 10);
        return String(dateStr) >= today;
    });
})();


// ── RENDERING HEART & NAVIGATION SETTINGS ──
window.allowedViews = ['home', 'planner', 'voti', 'academic_profile', 'profile', 'circolari'];

window.currentViewFromHash = function () {
    const v = (location.hash || '').replace('#', '').trim();
    return window.allowedViews.includes(v) ? v : null;
};

// ── Rendering Deduplication Lock ──
let _lastRenderTime = 0;
const RENDER_MIN_GAP = 50; // ms
// Shared globals so fluidity-engine-v3.js can cancel/take over timers
window._gRenderRAF = null;
window._gRenderTimer = null;

window.render = function () {
    if (window._gRenderRAF || state.booting || state._loggedOut) return;
    const now = performance.now();
    if (now - _lastRenderTime < RENDER_MIN_GAP) {
        clearTimeout(window._gRenderTimer);
        window._gRenderTimer = setTimeout(window.render, RENDER_MIN_GAP);
        return;
    }
    _lastRenderTime = now;
    window._gRenderRAF = requestAnimationFrame(() => {
        window._renderCore();
        window._gRenderRAF = null;
    });
};

window.scheduleRender = function (delay = 80) {
    clearTimeout(window._gRenderTimer);
    if (delay === 0) {
        window._gRenderTimer = setTimeout(window.render, 16);
    } else {
        window._gRenderTimer = setTimeout(window.render, delay);
    }
};

// ── Render deduplication: skip if view+login state unchanged ──
let _lastRenderedView = null;
let _lastRenderedLoggedIn = null;
let _lastRenderedTaskCount = -1;
let _lastRenderedVotiCount = -1;

window._renderCore = function () {
    if (state._loggedOut) return; // Post-logout guard
    const root = document.getElementById('app');
    const nav = document.getElementById('nav-container');
    if (!root || !nav) return;

    if (!state.isLoggedIn) {
        // Deduplicate: skip if already showing login
        if (_lastRenderedLoggedIn === false) return;
        _lastRenderedLoggedIn = false;
        _lastRenderedView = 'login';
        document.body.classList.add('logged-out');
        root.innerHTML = renderLogin();
        nav.innerHTML = '';
        return;
    }

    // Deduplicate: skip full re-render if same view + same data counts + same AI state
    const taskCount = (state.tasks || []).length;
    const votiCount = (state.voti || []).length;
    const _plannerStateKey = state.view === 'planner'
        ? [state.selectedDate||'',state.plannerWeekOffset||0,state.plannerMonthView||false,
           state.plannerMonthViewYear||0,state.plannerMonthViewMonth||0].join('|')
        : '';
    if (_lastRenderedLoggedIn === true &&
        _lastRenderedView === state.view &&
        _lastRenderedTaskCount === taskCount &&
        _lastRenderedVotiCount === votiCount &&
        (window.__lastPlannerKey||'') === _plannerStateKey &&
        !state._forceRender) {
        return;
    }
    window.__lastPlannerKey = _plannerStateKey;
    _lastRenderedLoggedIn = true;
    _lastRenderedView = state.view;
    _lastRenderedTaskCount = taskCount;
    _lastRenderedVotiCount = votiCount;
    state._forceRender = false;

    document.body.classList.remove('logged-out');

    nav.innerHTML = renderNav();

    document.body.style.overflow = '';
    document.body.style.height = '';
    root.style.overflow = 'visible';
    root.style.height = '';

    let html = '';
    switch (state.view) {
        case 'home': html = renderHome(); break;
        case 'planner': html = renderPlanner(); break;
        case 'voti': html = renderGradesView(); break;
        case 'academic_profile': html = renderAcademicProfile(); break;
        case 'profile': html = renderProfile(); break;
        case 'circolari': html = (typeof renderCircolariView === 'function') ? renderCircolariView() : renderHome(); break;
        default: html = renderHome(); break;
    }

    root.innerHTML = html;
    if (state._scrollTopAfterRender) {
        window.scrollTo({ top: 0, behavior: 'auto' });
        state._scrollTopAfterRender = false;
    }
    if (typeof updateOfflineBadge === 'function') updateOfflineBadge();

    requestAnimationFrame(() => {
        const viewEl = root.firstElementChild || root;
        if (typeof window.setupLargeHeaderScroll === 'function') {
            window.setupLargeHeaderScroll(viewEl);
        }

        if (state.view === 'home') {
            const mediaVal = parseFloat(calcolaMedia(state.voti)) || 0;

            if (typeof renderMediaGauge === 'function') renderMediaGauge(mediaVal);
        }
        if (state.view === 'planner') {
            if (typeof renderCustomCalendar === 'function') renderCustomCalendar();
            const doScroll = () => {
                if (typeof window._scrollPlannerToActiveWeek === 'function') {
                    window._scrollPlannerToActiveWeek();
                } else {
                    const _pc = document.getElementById('planner-week-carousel');
                    if (_pc) {
                        const w = _pc.clientWidth || _pc.offsetWidth || window.innerWidth;
                        const idx = window._plannerInitialSlide !== undefined ? window._plannerInitialSlide : 2;
                        _pc.scrollLeft = idx * w;
                    }
                }
            };
            doScroll();
            requestAnimationFrame(doScroll);
            setTimeout(doScroll, 30);
            setTimeout(doScroll, 120);
        }
        if (state.view === 'voti' && typeof initGradesCharts === 'function') {
            initGradesCharts();
        }
        if (state.view === 'voti' && typeof mountSubjectTrendChartFromDom === 'function') {
            mountSubjectTrendChartFromDom();
        }

        if (typeof gsapAnimateView === 'function') {
            gsapAnimateView();
        }
        if (window.removeLoader) window.removeLoader();
        
        // Initialize Lucide icons for new content
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    });
};

// ── UI HELPERS & PROFILE ──
window.removeLoader = function () {
    const loader = document.getElementById('app-loader');
    if (loader) {
        loader.style.transition = 'opacity 0.5s ease';
        loader.style.opacity = '0';
        setTimeout(() => loader.remove(), 500);
    }
};

window.handleLogoutPrompt = function () {
    try {
        if (typeof window.triggerHaptic === 'function') window.triggerHaptic('medium');
    } catch (_) {}
    if (confirm("Sei sicuro di voler uscire dall'account?")) {
        if (typeof window.logout === 'function') {
            window.logout(true);
        }
    }
};

window.logout = async function (skipConfirm = false) {
    if (!skipConfirm) {
        if (!confirm("Sei sicuro di voler uscire dall'account?")) {
            return;
        }
    }
        // ── CRITICAL: Set logout flag FIRST to block ALL async renders ──
        state._loggedOut = true;
        state.isLoggedIn = false;
        state.view = 'login'; // Immediate visual shift target

        // ── Kill all running GSAP animations (prevents late onComplete/onUpdate calls) ──
        if (typeof gsap !== 'undefined') {
            gsap.killTweensOf("*");
        }

        const currentUserId = getUserId();
        const currentLsPrefix = getActiveProfileKey();

        if (currentUserId && currentUserId !== 'guest') {
            localStorage.setItem(`${currentLsPrefix}:planned_tasks`, JSON.stringify(state.plannedTasks || {}));
            localStorage.setItem(`${currentLsPrefix}:planner_updated_at`, new Date().toISOString());
        }

        sessionManager.clear();
        // Clear Argo password from RAM and sessionStorage
        window._argoPasswordRuntime = null;
        try { sessionStorage.removeItem('_argo_pwd_session'); } catch(_) {}
        if (supabaseClient && supabaseClient.auth) supabaseClient.auth.signOut().catch(e => console.warn('[Logout] Supabase signOut failed:', e));

        state.booting = false;
        state.syncing = false;
        state.didup.connected = false;
        state.didup.stale = false;
        state.didup.lastSuccessTs = 0;
        state.user = { name: '', class: '' };
        state.tasks = [];
        state.voti = [];
        state.promemoria = [];
        state.isOffline = false;
        state.lastSync = null;
        state.plannedTasks = {};

        window._bootRenderedOnce = false;
        if (window._threadsPoller) clearInterval(window._threadsPoller);

        // Cancel any pending render timers
        clearTimeout(window._gRenderTimer);
        window._gRenderTimer = null;
        if (window._gRenderRAF) {
            cancelAnimationFrame(window._gRenderRAF);
            window._gRenderRAF = null;
        }

        // Write login directly and imperatively — bypasses all async pipelines
        state.view = 'login';
        if (window.location.hash !== '#login') {
            window.history.replaceState(null, '', '#login');
        }

        const _logoutAppRoot = document.getElementById('app');
        const _logoutNav = document.getElementById('nav-container');

        const forceLoginRender = () => {
            if (_logoutAppRoot) {
                document.body.classList.add('logged-out');
                document.body.classList.remove('is-ai-mode');
                document.body.style.overflow = '';
                document.body.style.height = '';
                _logoutAppRoot.style.overflow = 'visible';
                _logoutAppRoot.style.height = '';
                _logoutAppRoot.innerHTML = (typeof renderLogin === 'function') ? renderLogin() : '';
            }
            if (_logoutNav) _logoutNav.innerHTML = '';
        };

        forceLoginRender();

        // ── Mutation Guard: Prevent any other component from overwriting login for 1s ──
        if (_logoutAppRoot) {
            const observer = new MutationObserver((mutations) => {
                if (state._loggedOut && !_logoutAppRoot.querySelector('.login-container')) {
                    console.warn("[Guard] Detected unathorized DOM write post-logout, reverting to login...");
                    forceLoginRender();
                }
            });
            observer.observe(_logoutAppRoot, { childList: true, subtree: true });
            setTimeout(() => {
                observer.disconnect();
                state._loggedOut = false; // Release lock for future interactions
            }, 1000);
        }

        // Reset render dedup state
        _lastRenderedLoggedIn = false;
        _lastRenderedView = 'login';

        if (currentUserId && currentUserId !== 'guest') {
            const payload = {
                plannedTasks: state.plannedTasks || {},
                plannedDetails: {},
                updatedAt: new Date().toISOString()
            };
            fetch(`${API_BASE_URL}/api/planner/${encodeURIComponent(currentUserId)}`, {
                method: 'PUT',
                headers: getSessionHeaders(),
                body: JSON.stringify(payload),
                keepalive: true
            }).catch((e) => { console.warn("Logout save failed", e); });
        }
};

window.saveProfileToServer = async function (profileData) {
    const userId = getUserId();
    const response = await fetch(`${API_BASE_URL}/api/profile`, {
        method: 'PUT',
        headers: getSessionHeaders(),
        body: JSON.stringify({
            userId: userId,
            name: profileData.name || state.user.name,
            class: profileData.class || state.user.class,
            specialization: profileData.specialization || state.user.specialization,
            avatar: null
        })
    });
    return await response.json();
};

window.saveProfileChanges = async function () {
    const newNameInput = document.getElementById('edit-user-name');
    if (!newNameInput) return;
    const newName = newNameInput.value.trim();
    if (!newName) return alert("Inserisci almeno il nome");

    try {
        if (typeof showBoot === 'function') showBoot("Salvataggio profilo...");
        await window.saveProfileToServer({ name: newName });
        state.user.name = newName;
        localStorage.setItem(lsKey('user'), JSON.stringify(state.user));
        closeModal();
        window.scheduleRender();
        if (typeof hideBoot === 'function') hideBoot();
    } catch (error) {
        if (typeof hideBoot === 'function') hideBoot();
        alert("❌ Errore durante il salvataggio: " + error.message);
    }
};

// ── QUOTES ──
const MOTIVATIONAL_QUOTES = [
    "Il successo è la somma di piccoli sforzi, ripetuti giorno dopo giorno.",
    "There is no tomorrow", "No risk, no story",
    "Non contare i giorni, fai in modo che i giorni contino.",
    "La perseveranza batte il talento quando il talento non persevera.",
    "L'unico modo per fare un ottimo lavoro è amare quello che fai.",
    "Il fallimento è solo l'opportunità di iniziare di nuovo con più intelligenza.",
    "Il miglior momento per piantare un albero era 20 anni fa. Il secondo miglior momento è ora.",
    "Non importa quanto vai piano, l'importante è che non ti fermi.",
    "La tua unica limitazione è la tua immaginazione.",
    "Fai oggi ciò che gli altri non faranno, così domani potrai fare ciò che gli altri non potranno.",
    "La disciplina è fare ciò che va fatto, quando va fatto, anche se non ne hai voglia.",
    "Ogni grande traguardo inizia con la decisione di provare.",
    "Le difficoltà spesso preparano le persone comuni a un destino straordinario.",
    "La motivazione ti dà la spinta, l'abitudine ti fa andare avanti.",
    "Credi in te stesso e sarai a metà strada.",
    "Se puoi sognarlo, puoi farlo.",
    "Il successo non è definitivo, il fallimento non è fatale: ciò che conta è il coraggio di continuare.",
    "Punta alla luna. Anche se sbagli, atterrerai tra le stelle.",
    "Non aspettare che le condizioni siano perfette. Inizia dove sei, usa quello che hai, fai quello che puoi.",
    "La tua mente è la tua risorsa più preziosa. Coltivala.",
    "Ogni errore è una lezione appresa sul cammino verso il successo.",
    "La pazienza è amara, ma il suo frutto è dolce.",
    "Sogna in grande, lavora sodo, rimani umile.",
    "Non smettere mai di imparare, perché la vita non smette mai di insegnare.",
    "Il segreto per andare avanti è iniziare.",
    "La qualità non è un atto, è un'abitudine.",
    "Sii il cambiamento che vuoi vedere nel mondo.",
    "Non paragonare il tuo inizio con la metà del film di qualcun altro.",
    "Colui che sposta una montagna inizia portando via piccole pietre.",
    "Il futuro appartiene a coloro che credono nella bellezza dei propri sogni.",
    "La felicità non è qualcosa di pronto all'uso. Viene dalle tue stesse azioni.",
    "L'ostacolo è la via.", "Rimani concentrato sui tuoi obiettivi, non sulle distrazioni.",
    "Ogni giorno è una nuova opportunità per migliorare.",
    "La forza non deriva dalla capacità fisica, ma da una volontà indomita.",
    "Non fermarti quando sei stanco. Fermati quando hai finito.",
    "L'eccellenza non si ottiene in un giorno, ma attraverso la costanza.",
    "Trasforma le tue ferite in saggezza.",
    "La vita è per il 10% cosa ti accade e per il 90% come reagisci.",
    "Se vuoi qualcosa che non hai mai avuto, devi fare qualcosa che non hai mai fatto.",
    "Agisci come se quello che fai facesse la differenza. La fa.",
    "Non guardare l'orologio; fai quello che fa lui. Continua ad andare.",
    "La tua velocità non conta finché non smetti di muoverti.",
    "Il successo è camminare da un fallimento all'altro senza perdere l'entusiasmo.",
    "Le persone che hanno successo sono quelle che si alzano e cercano le circostanze che vogliono.",
    "Credere di poterlo fare è già metà del lavoro.",
    "Non lasciare che ieri occupi troppo di oggi.",
    "Se non ora, quando?",
    "L'unico limite ai nostri traguardi di domani saranno i nostri dubbi di oggi.",
    "Fai del tuo meglio, e il resto verrà da sé.",
    "Sii orgoglioso di quanto sei arrivato lontano. Abbi fede in quanto lontano puoi andare."
];

window.getDailyQuote = function () {
    const todayStr = getLocalDateString();
    try {
        const cached = JSON.parse(localStorage.getItem('mh_daily_quote') || '{}');
        if (cached.quote && cached.date === todayStr) return cached.quote;
    } catch (e) { }
    const randomQuote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
    localStorage.setItem('mh_daily_quote', JSON.stringify({ quote: randomQuote, date: todayStr }));
    return randomQuote;
};

window.refreshDailyQuote = async function (btn) {
    if (btn) {
        const icon = btn.querySelector('i');
        if (icon) icon.style.transform = 'rotate(360deg)';
        btn.style.opacity = '0.3';
    }
    const todayStr = getLocalDateString();
    const currentQuote = window.getDailyQuote();
    let newQuote = currentQuote;
    for (let i = 0; i < 5; i++) {
        newQuote = MOTIVATIONAL_QUOTES[Math.floor(Math.random() * MOTIVATIONAL_QUOTES.length)];
        if (newQuote !== currentQuote) break;
    }
    localStorage.setItem('mh_daily_quote', JSON.stringify({ quote: newQuote, date: todayStr }));
    await new Promise(r => setTimeout(r, 400));
    if (btn) {
        const icon = btn.querySelector('i');
        if (icon) icon.style.transform = 'rotate(0deg)';
        btn.style.opacity = '0.6';
    }
    window.scheduleRender(0);
};

window.handleManualOwaResyncClick = function (event) {
    if (event && typeof event.stopPropagation === 'function') event.stopPropagation();
    if (!confirm('Eseguire un resync manuale completo dei dati OWA?')) return;
    if (typeof window.runManualOwaResync === 'function') window.runManualOwaResync();
};

window.refreshCircolari = function () {
    if (typeof showToast === 'function') showToast('Aggiornamento circolari...');
    if (typeof loadCircolari === 'function') loadCircolari();
};

window.requestCircularSynthesis = async function (id, link) {
    if (typeof window._circ_startSintesi === 'function') {
        return window._circ_startSintesi(id, link);
    }
    return window.loadCircolareSintesi(id, link);
};

window.renderSafeMarkdown = function(md) {
    if (!md) return '';
    try {
        let rawHtml = typeof marked !== 'undefined' ? marked.parse(String(md)) : escapeHtml(md);
        if (typeof window.DOMPurify !== 'undefined' && typeof window.DOMPurify.sanitize === 'function') {
            return window.DOMPurify.sanitize(rawHtml, {
                ALLOWED_TAGS: ['p', 'b', 'i', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'br', 'hr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre', 'span'],
                ALLOWED_ATTR: ['href', 'target', 'rel', 'class', 'style']
            });
        }
        return escapeHtml(md);
    } catch (_) {
        return escapeHtml(md);
    }
};

window.ensureMarked = function() {
    return new Promise((resolve, reject) => {
        if (typeof marked !== 'undefined') return resolve();
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/marked@14.1.2/marked.min.js';
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
};

window.loadCircolareSintesi = async function (id, link) {
    try {
        console.log(`[Network] Sintesi Request: ${id}`);
        let session = null;
        try {
            if (typeof sessionManager !== 'undefined' && sessionManager.load) {
                session = sessionManager.load();
            } else if (typeof window.sessionManager !== 'undefined' && window.sessionManager.load) {
                session = window.sessionManager.load();
            } else {
                const raw = localStorage.getItem('argo_session');
                if (raw) session = JSON.parse(raw);
            }
        } catch (_) {}

        const sessionToken = (typeof state !== 'undefined' && state.sessionToken) || (session && session.sessionToken) || '';
        const resolvedUserId = (typeof window.getUserId === 'function')
            ? window.getUserId()
            : (session && (session.studentId || session.userId || session.pid)) || (state && state.user && state.user.id) || '';
        const headers = { 'Content-Type': 'application/json' };
        if (sessionToken) headers['x-session-token'] = sessionToken;
        if (resolvedUserId) headers['x-user-id'] = resolvedUserId;

        const response = await fetch(`${API_BASE_URL}/api/circolari/sintesi`, {
            method: 'POST',
            headers,
            body: JSON.stringify({ id, link, userId: resolvedUserId })
        });
        const data = await response.json();
        if (data.success && data.sintesi) {
            const circolare = (typeof state !== 'undefined' && state.circolari) ? state.circolari.find(c => c.id === id) : null;
            if (circolare) circolare.sintesi = data.sintesi;
            return { success: true, sintesi: data.sintesi };
        } else {
            return { success: false, error: data.error || 'Analisi AI non riuscita.' };
        }
    } catch (e) {
        console.error("Synthesis error:", e);
        return { success: false, error: 'Errore di rete durante la richiesta. Riprova più tardi.' };
    }
};

// ── PLANNER & QUESTS ──
window.refreshPlanWeekModalContent = function () {
    const contentEl = document.getElementById('plan-week-modal-content');
    if (!contentEl) return;
    const todayStr = getLocalDateString();
    const todayDate = new Date();
    const dayLabels = ['Dom', 'Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab'];
    const next7Days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(todayDate);
        d.setDate(todayDate.getDate() + i);
        const ds = getLocalDateString(d);
        next7Days.push({ date: d, dateStr: ds, label: dayLabels[d.getDay()], dayNum: d.getDate() });
    }
    const now2w = new Date(); now2w.setHours(0, 0, 0, 0);
    const twoWeeksLater = new Date(now2w); twoWeeksLater.setDate(now2w.getDate() + 14);
    const calendarTasks = (Array.isArray(state.tasks) ? state.tasks : []).filter(t => {
        if (t.done || !t.due_date || t.subject === 'QUEST') return false;
        const d = parseArgoDate(t.due_date);
        return d >= now2w && d <= twoWeeksLater;
    });
    contentEl.innerHTML = `
        <div style="display: flex; align-items: center; margin-bottom: 24px; padding: 0 4px;">
            <h2 style="margin:0; flex:1; min-width:0; font-family:'JetBrains Mono', monospace; font-size: 18px; font-weight: 800; color:var(--on-surface); letter-spacing: 0.01em; text-transform: uppercase; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">Pianifica Settimana</h2>
            <button onclick="closeModal()" style="flex-shrink:0; margin-left:auto; background:var(--surface-container-low); border:1px solid var(--outline-variant); width:32px; height:32px; border-radius:50%; display:flex; align-items:center; justify-content:center; cursor:pointer; color:var(--on-surface);">
                <i class="ph ph-x" style="font-size: 18px;"></i>
            </button>
        </div>
        <div style="display: flex; flex-direction: column; gap: 20px; max-height: 520px; overflow-y: auto; padding-right: 8px; padding-bottom: 20px;">
            ${calendarTasks.length === 0 ? '<div style="text-align:center; padding:40px 20px; color:var(--on-surface-variant); font-family:JetBrains Mono, monospace; font-size:12px; text-transform:uppercase;">Nessun compito nelle prossime 2 settimane.</div>' : ''}
            ${calendarTasks.map(t => {
        const subContent = t.subject || 'N/A';
        const abbr = getSubjectAbbrev(subContent);
        const key = abbr.toLowerCase();
        return `
                <div style="background:var(--surface-container-lowest); padding: 20px; border-radius: 16px; border: 1px solid var(--outline-variant); box-shadow: 0 3px 10px rgba(0,0,0,0.03);">
                    <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 14px;">
                        <div style="min-width: 0; flex:1;">
                            <div style="font-family:'JetBrains Mono', monospace; font-size: 9px; font-weight: 800; color: var(--${key}-t, #141414); text-transform: uppercase; letter-spacing: 0.1em; background: var(--${key}, #EEE); padding: 3px 8px; border-radius: 6px; display: inline-block; margin-bottom: 8px;">${escapeHtml(subContent)}</div>
                            <div style="font-size: 15px; font-weight: 700; color:var(--on-surface); line-height: 1.4; padding-right: 10px;">${escapeHtml(t.text)}</div>
                        </div>
                    </div>
                    <div style="display: flex; gap: 6px;">
                        ${next7Days.map(day => {
            const isPlanned = state.plannedTasks[day.dateStr] && state.plannedTasks[day.dateStr].includes(t.id);
            const isToday = day.dateStr === todayStr;
            return `
                            <div data-task-id="${t.id}" data-date="${day.dateStr}" 
                                onclick="togglePlanDay('${t.id}', '${day.dateStr}')"
                                style="flex: 1; text-align:center; padding: 12px 4px; border-radius: 12px; cursor: pointer; transition: all 0.2s;
                                background: ${isPlanned ? 'var(--on-surface)' : 'var(--surface-container-lowest)'};
                                color: ${isPlanned ? 'white' : '#4F4A43'};
                                border: ${isToday ? '2px solid #007AFF' : '1px solid var(--outline-variant)'};">
                                <div style="font-family:'JetBrains Mono', monospace; font-size: 9px; font-weight: 700; margin-bottom: 4px; opacity: ${isPlanned ? '0.6' : '1'};">${day.label.toUpperCase()}</div>
                                <div style="font-weight: 800; font-size: 15px; letter-spacing: -0.02em;">${day.dayNum}</div>
                            </div>`;
        }).join('')}
                    </div>
                </div>`;
    }).join('')}
        </div>
        <div style="margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--outline-variant); display:flex; align-items:center; gap:10px;">
            <button id="plan-week-done-btn" onclick="finalizePlanWeekModal()" style="width: 100%; height: 50px; background: #141414; color: white; border: none; border-radius: 16px; font-size: 15px; font-weight: 800; cursor: pointer; transition: all 0.25s cubic-bezier(0.2,0.8,0.2,1);">Fatto</button>
            <span id="plan-week-added-badge" class="badge badge-success" style="display:none; white-space:nowrap; font-family:'JetBrains Mono',monospace; font-size:10px; font-weight:700;">0 compiti aggiunti</span>
        </div>`;
};
window.finalizePlanWeekModal = function () {
    const doneBtn = document.getElementById('plan-week-done-btn');
    const addedBadge = document.getElementById('plan-week-added-badge');
    const initialPlannedCount = state.planWeekInitialPlannedCount ?? 0;
    const added = Math.max(0, getPlannedTasksTotalCount() - initialPlannedCount);

    if (doneBtn) {
        doneBtn.style.background = '#2DB86A';
        doneBtn.style.color = 'var(--surface-container-lowest)';
        doneBtn.textContent = 'Fatto ✓';
        doneBtn.style.transform = 'scale(0.98)';
        setTimeout(() => { if (doneBtn) doneBtn.style.transform = 'scale(1)'; }, 180);
    }
    if (addedBadge && added > 0) {
        addedBadge.style.display = 'inline-flex';
        addedBadge.textContent = `${added} compiti aggiunti`;
    }

    // Aggiornamento immediato di calendario e widget oggi/domani prima della chiusura modale
    if (typeof notifyPlannerChanged === 'function') notifyPlannerChanged();

    setTimeout(() => {
        closeModal();
        if (added > 0 && typeof showToast === 'function') {
            showToast(`${added} compiti aggiunti`);
        }
    }, 300); // 300ms: permette all'animazione "Fatto ✓" di essere visibile prima della chiusura modale
};

window.updateWeekDayButton = function (taskId, dateStr) {
    const isPlanned = state.plannedTasks[dateStr] && state.plannedTasks[dateStr].includes(taskId);
    const todayStr = getLocalDateString();
    document.querySelectorAll(`[data-task-id="${taskId}"][data-date="${dateStr}"]`).forEach(btn => {
        if (isPlanned) {
            btn.style.background = 'var(--on-surface)';
            btn.style.borderColor = 'var(--on-surface)';
            btn.style.color = 'var(--surface)';
        } else {
            btn.style.background = 'var(--surface-container-lowest)';
            btn.style.borderColor = (dateStr === todayStr) ? 'var(--primary)' : 'var(--outline-variant)';
            btn.style.color = 'var(--on-surface-variant)';
        }
    });
};

window.addCustomQuestFromInput = function () {
    showToast('Task manuali disattivate: restano solo compiti assegnati.');
};

window.adjustNextGradeSimulator = function (delta) {
    const current = getNextGradeSimulatorValue();
    setNextGradeSimulatorValue(current + (Number(delta) || 0));
    if (state.view === 'voti') {
        if (!updateNextGradeSimulatorWidget()) scheduleRender(0);
    }
};

window.selectDay = function (day) {
    state.selectedDay = day;
    window.scheduleRender(0);
};

window.getVotiData = function () {
    return (state.voti && state.voti.length > 0) ? state.voti : ((state.grades && state.grades.length > 0) ? state.grades : []);
};

window.getAllSubjects = function () {
    const fromGrades = window.getVotiData().map(v => v.materia || v.subject).filter(Boolean);
    const fromTasks = (state.tasks || []).map(t => t.subject).filter(Boolean);
    const fromExams = (state.exams || []).map(e => e.subject).filter(Boolean);
    const all = [...new Set([...fromGrades, ...fromTasks, ...fromExams])];
    return all.length === 0 ? ['Italiano', 'Matematica', 'Inglese', 'Storia', 'Scienze', 'Fisica', 'Filosofia', 'Arte', 'Ed. Fisica', 'Religione'] : all.sort();
};

window.submitExamForm = function () {
    let subject = document.getElementById('examSubject').value;
    if (subject === '__custom') {
        subject = (document.getElementById('examCustomSubject').value || '').trim();
        if (!subject) return showToast('Inserisci il nome della materia', 'error', '#ff453a');
    }
    const type = document.getElementById('examType').value;
    const date = document.getElementById('examDate').value;
    const topic = (document.getElementById('examTopic').value || '').trim();
    if (!date) return showToast('Seleziona una data', 'error', '#ff453a');
    state.exams.push({ subject, type, date, topic });
    const examTask = { id: 'exam_' + Date.now(), text: `${type}: ${topic || subject}`, subject, due_date: date, done: false, isExam: true };
    state.tasks.push(examTask);
    if (typeof saveTasks === 'function') saveTasks();
    closeModal();
    window.scheduleRender();
    showToast(`✅ ${type} di ${subject} aggiunta al ${date}!`, 'success', 'var(--green)');
};

window.removeExam = function (index) {
    state.exams.splice(index, 1);
    if (typeof saveTasks === 'function') saveTasks();
    window.scheduleRender();
};

window.submitBacklogForm = function () {
    const subject = document.getElementById('backlogSubject').value;
    const topic = (document.getElementById('backlogTopic').value || '').trim();
    if (!topic) return showToast('Inserisci l\'argomento da recuperare', 'error', '#ff453a');
    state.backlog.push({ subject, topic });
    if (typeof saveTasks === 'function') saveTasks();
    closeModal();
    window.scheduleRender();
    showToast(`📚 Arretrato di ${subject} aggiunto!`, 'success', 'var(--green)');
};

window.removeBacklog = function (index) {
    state.backlog.splice(index, 1);
    if (typeof saveTasks === 'function') saveTasks();
    window.scheduleRender();
};

// ── AI ASSISTANT HELPERS ──
window.sendAIChatQuick = function (text) {
    // AI chat functionality has been disabled
};
window.sendAIChatQuickAt = function (index) {
    // AI chat functionality has been disabled
};
window.handleAIChatInputKeypress = function (event) {
    // AI chat functionality has been disabled
};
window.startNewAIChat = function () {
    // AI chat functionality has been disabled
};
window.clearAIChat = function (options = {}) {
    // AI chat functionality has been disabled
};
window.deleteAIChatMessage = function (index) {
    // AI chat functionality has been disabled
};
window.stopVoiceInput = function () {
    // AI chat functionality has been disabled
};

function extractImmediateCalendarAction(text) {
    const raw = String(text || '');
    if (!raw) return null;
    const normalized = raw.toLowerCase();
    const wantsAdd = /\b(aggiungi|inserisci|crea|carica|programma)\b/.test(normalized) && /\b(calendario|agenda)\b/.test(normalized);
    const wantsDelete = /\b(elimina|rimuovi|cancella)\b/.test(normalized) && /\b(calendario|agenda)\b/.test(normalized);
    if (!wantsAdd && !wantsDelete) return null;

    const dateIsoMatch = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    const dateSlashMatch = raw.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
    let date = '';
    if (dateIsoMatch) {
        date = dateIsoMatch[1];
    } else if (dateSlashMatch) {
        const day = String(Number(dateSlashMatch[1])).padStart(2, '0');
        const month = String(Number(dateSlashMatch[2])).padStart(2, '0');
        const now = new Date();
        let yearNum = Number(dateSlashMatch[3] || now.getFullYear());
        const candidate = new Date(yearNum, Number(month) - 1, Number(day), 12, 0, 0);
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0);
        if (!dateSlashMatch[3] && !Number.isNaN(candidate.getTime()) && candidate < today) yearNum += 1;
        date = `${String(yearNum).padStart(4, '0')}-${month}-${day}`;
    }

    const timeMatch = raw.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
    const time = timeMatch ? `${String(timeMatch[1]).padStart(2, '0')}:${timeMatch[2]}` : '';

    let subject = '';
    const subjectMatch = raw.match(/(?:materia|subject)\s*[:\-]\s*([^\n,;]+)/i);
    if (subjectMatch) subject = subjectMatch[1].trim();
    if (!subject) {
        const known = ['italiano', 'matematica', 'storia', 'inglese', 'informatica', 'fisica', 'chimica', 'scienze', 'latino', 'filosofia', 'arte', 'motoria', 'religione'];
        const found = known.find(s => normalized.includes(s));
        if (found) subject = found.charAt(0).toUpperCase() + found.slice(1);
    }

    let textTask = '';
    const quoted = raw.match(/["“”']([^"“”']{3,140})["“”']/);
    if (quoted) textTask = quoted[1].trim();
    if (!textTask) {
        const after = raw.split(/(?:aggiungi|inserisci|crea|carica|programma)/i)[1] || '';
        if (after) {
            textTask = after.replace(/\b(calendario|agenda|alle|ore|materia)\b/gi, ' ').replace(/\s+/g, ' ').trim();
        }
    }

    if (wantsDelete) {
        const deleteMissing = [];
        if (!date) deleteMissing.push('data (es. 2026-04-10)');
        if (!textTask) deleteMissing.push('titolo attività');
        return {
            type: 'delete',
            date,
            text: textTask,
            missing: deleteMissing
        };
    }

    const missing = [];
    if (!time) missing.push('orario (es. 16:30)');
    if (!date) missing.push('data (es. 2026-04-10)');
    if (!textTask) missing.push('attività');

    return {
        type: 'add',
        date,
        time,
        subject: subject || 'Studio',
        text: textTask,
        missing
    };
}

function applyImmediateCalendarAction(action) {
    if (!action || action.type !== 'add' || !Array.isArray(action.missing) || action.missing.length) return { ok: false };
    if (!state.plannedTasks || typeof state.plannedTasks !== 'object') state.plannedTasks = {};
    if (!state.plannedDetails || typeof state.plannedDetails !== 'object') state.plannedDetails = {};
    if (!Array.isArray(state.tasks)) state.tasks = [];

    const id = `manual_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const task = {
        id,
        subject: action.subject || 'Studio',
        text: action.text,
        due_date: action.date,
        done: false
    };
    state.tasks.push(task);
    if (!Array.isArray(state.plannedTasks[action.date])) state.plannedTasks[action.date] = [];
    if (!state.plannedTasks[action.date].includes(id)) state.plannedTasks[action.date].push(id);
    state.plannedDetails[id] = { time: action.time };
    if (typeof saveTasks === 'function') saveTasks();
    if (typeof debouncedSavePlannerRemote === 'function') debouncedSavePlannerRemote(200);
    return { ok: true, id };
}

function normalizeAiResponseMarkdown(text) {
    const input = String(text || '').replace(/\r/g, '');
    // Defensive normalization: even if prompt asks for non-table markdown,
    // models may still output tables; convert them to readable bullet sections.
    if (!/(^|\n)\s*\|/.test(input)) return input;
    const lines = input.split('\n');
    const out = [];
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        const isTableRow = /\|/.test(line) && line.trim().startsWith('|');
        if (!isTableRow) {
            out.push(line);
            i += 1;
            continue;
        }
        const table = [];
        while (i < lines.length && /\|/.test(lines[i]) && lines[i].trim().startsWith('|')) {
            table.push(lines[i]);
            i += 1;
        }
        if (table.length < 2) {
            out.push(...table);
            continue;
        }
        const rows = table
            .map(r => r.split('|').map(c => c.trim()).filter(Boolean))
            .filter(cols => cols.length > 0);
        const header = rows[0] || [];
        // Drop markdown table separator rows (---, :---:, etc.).
        const body = rows.slice(1).filter(cols => !cols.every(c => /^:?-{2,}:?$/.test(c)));
        if (!header.length || !body.length) {
            out.push(...table);
            continue;
        }
        body.forEach((cols, rowIdx) => {
            out.push(`- **Riga ${rowIdx + 1}**`);
            cols.forEach((cell, colIdx) => {
                const label = header[colIdx] || `Colonna ${colIdx + 1}`;
                out.push(`  - ${label}: ${cell || '-'}`);
            });
        });
    }
    return out.join('\n').replace(/\n{3,}/g, '\n\n');
}

function deleteImmediateCalendarAction(action) {
    if (!action || action.type !== 'delete') return { ok: false };
    const sourceTasks = Array.isArray(state.tasks) ? state.tasks : [];
    const normalizedNeedle = String(action.text || '').trim().toLowerCase();
    const filtered = sourceTasks.filter((t) => {
        if (!t || !t.id) return false;
        if (!isUserGeneratedTaskId(t.id)) return false;
        if (action.date && t.due_date !== action.date) return false;
        if (normalizedNeedle) {
            const hay = `${t.subject || ''} ${t.text || ''}`.toLowerCase();
            if (!hay.includes(normalizedNeedle)) return false;
        }
        return true;
    });
    if (!filtered.length) return { ok: false, reason: 'not_found' };
    const idsToDelete = new Set(filtered.map(t => t.id));
    state.tasks = sourceTasks.filter(t => !idsToDelete.has(t.id));
    Object.keys(state.plannedTasks || {}).forEach((dateKey) => {
        const ids = state.plannedTasks[dateKey];
        if (Array.isArray(ids)) state.plannedTasks[dateKey] = ids.filter(id => !idsToDelete.has(id));
    });
    Object.keys(state.plannedDetails || {}).forEach((id) => {
        if (idsToDelete.has(id)) delete state.plannedDetails[id];
    });
    if (typeof saveTasks === 'function') saveTasks();
    if (typeof debouncedSavePlannerRemote === 'function') debouncedSavePlannerRemote(200);
    return { ok: true, count: filtered.length };
}

// AI chat functionality has been disabled
window.sendAIChat = async function () {
    // AI chat functionality has been disabled
    showToast('Chat AI disattivata', 'info');
};

window.clearSyncDiagnostics = function () {
    state.syncDiagnostics = [];
    localStorage.setItem(lsKey('sync_diagnostics'), '[]');
    window.scheduleRender();
    showToast('Log sync puliti');
};

window.applyAIPlanFromChat = function (msgIndex) {
    // AI chat functionality has been disabled
};

window.saveGeminiKey = function () {
    // AI chat functionality has been disabled
};

// ========================================
// GSAP ANIMATION SYSTEM — Premium Transitions
// ========================================

function gsapAnimateView() {
    const root = document.getElementById('app');
    if (!root) return;

    // Kill previous ScrollTriggers
    if (typeof ScrollTrigger !== 'undefined') {
        ScrollTrigger.getAll().forEach(t => t.kill());
        gsap.registerPlugin(ScrollTrigger);
    }

    const view = root.querySelector('.view');
    if (!view) return;

    // Master timeline for orchestrated entrance
    const master = gsap.timeline({ defaults: { ease: 'power3.out' } });

    // 1. VIEW ENTRANCE — Cinematic fade + slide + blur
    master.fromTo(view,
        { opacity: 0, y: 40, filter: 'blur(8px)' },
        { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7 }
    );

    // 2. HERO — Apple-style cascading reveal
    const hero = view.querySelector('.greeting-card');
    if (hero) {
        const heroTl = gsap.timeline({ defaults: { ease: 'power3.out' } });
        heroTl.fromTo(hero,
            { opacity: 0, y: 50, scale: 0.95 },
            { opacity: 1, y: 0, scale: 1, duration: 0.8 }
        );

        // Greeting text elements
        const heroTitle = hero.querySelector('.greeting-text');
        if (heroTitle) {
            heroTl.fromTo(heroTitle,
                { opacity: 0, y: 20, filter: 'blur(4px)' },
                { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6 },
                '-=0.5'
            );
        }

        // Period and quote with stagger
        const heroMeta = hero.querySelectorAll('.greeting-period, .greeting-quote');
        if (heroMeta.length) {
            heroTl.fromTo(heroMeta,
                { opacity: 0, y: 15 },
                { opacity: 1, y: 0, duration: 0.5, stagger: 0.1 },
                '-=0.3'
            );
        }

        master.add(heroTl, 0.1);
    }

    // 3. DASHBOARD CARDS — Spring stagger with scale bounce
    const metricCards = view.querySelectorAll('.row-3 > .card, .row-2 > div > .card, .streak-card, .verifica-card, .bigstat, .circ-widget');
    if (metricCards.length) {
        master.fromTo(metricCards,
            { opacity: 0, y: 30, scale: 0.92 },
            {
                opacity: 1, y: 0, scale: 1,
                duration: 0.6,
                stagger: 0.08,
                ease: 'back.out(1.2)'
            },
            0.2
        );
    }

    // 4. GENERAL CARDS — Elastic entrance
    const cards = view.querySelectorAll('.card, .glass-panel, .subject-summary-card, .registro-card');
    if (cards.length) {
        master.fromTo(cards,
            { opacity: 0, y: 35, scale: 0.94 },
            {
                opacity: 1, y: 0, scale: 1,
                duration: 0.55,
                stagger: 0.07,
                ease: 'back.out(1.15)'
            },
            0.15
        );
    }

    // 5. CIRCOLARI — Slide from right with parallax depth
    const circolari = view.querySelectorAll('.circolare-card');
    if (circolari.length) {
        master.fromTo(circolari,
            { opacity: 0, x: 60, rotateY: 8 },
            {
                opacity: 1, x: 0, rotateY: 0,
                duration: 0.6,
                stagger: 0.06,
                ease: 'power2.out'
            },
            0.3
        );
    }

    // 6. SECTION HEADERS — Smooth slide up with slight blur
    const headers = view.querySelectorAll('h1, h2, .section-action');
    if (headers.length) {
        master.fromTo(headers,
            { opacity: 0, y: 15, filter: 'blur(3px)' },
            {
                opacity: 1, y: 0, filter: 'blur(0px)',
                duration: 0.45,
                stagger: 0.05,
                ease: 'power2.out'
            },
            0.1
        );
    }

    // 7. BUTTONS — Scale in with spring
    const buttons = view.querySelectorAll('.btn-primary, .btn-secondary, .fab');
    if (buttons.length) {
        master.fromTo(buttons,
            { opacity: 0, scale: 0.85 },
            {
                opacity: 1, scale: 1,
                duration: 0.5,
                stagger: 0.05,
                ease: 'back.out(2)'
            },
            0.35
        );
    }

    // 8. SCROLL-TRIGGERED REVEALS — with intersection
    if (typeof ScrollTrigger !== 'undefined') {
        // Focus items and list items
        view.querySelectorAll('.focus-item, .glass-list-item, .studio-entry').forEach(item => {
            gsap.fromTo(item,
                { opacity: 0, y: 20, filter: 'blur(3px)' },
                {
                    opacity: 1, y: 0, filter: 'blur(0px)',
                    duration: 0.5,
                    ease: 'power2.out',
                    scrollTrigger: {
                        trigger: item,
                        start: 'top 88%',
                        toggleActions: 'play none none none',
                        once: true
                    }
                }
            );
        });

        // Cards that are below the fold
        view.querySelectorAll('.circolare-card, .registro-card').forEach((card, i) => {
            gsap.fromTo(card,
                { opacity: 0, y: 25, scale: 0.96 },
                {
                    opacity: 1, y: 0, scale: 1,
                    duration: 0.5,
                    delay: i * 0.05,
                    ease: 'back.out(1.1)',
                    scrollTrigger: {
                        trigger: card,
                        start: 'top 92%',
                        toggleActions: 'play none none none',
                        once: true
                    }
                }
            );
        });
    }

    // 9. INTERACTIVE HOVER EFFECTS — magnetic feel on cards
    view.querySelectorAll('.card, .metric-card, .circolare-card, .home-glass-card').forEach(card => {
        card.addEventListener('mouseenter', () => {
            gsap.to(card, {
                scale: 1.02,
                boxShadow: '0 12px 40px rgba(0, 0, 0, 0.12)',
                duration: 0.3,
                ease: 'power2.out'
            });
        });
        card.addEventListener('mouseleave', () => {
            gsap.to(card, {
                scale: 1,
                boxShadow: '0 2px 12px rgba(0, 0, 0, 0.06)',
                duration: 0.4,
                ease: 'elastic.out(1, 0.5)'
            });
        });
    });

    // 10. BUTTON PRESS FEEDBACK
    view.querySelectorAll('.btn-primary, .btn-secondary, .btn-icon-glass').forEach(btn => {
        btn.addEventListener('mousedown', () => {
            gsap.to(btn, { scale: 0.95, duration: 0.1, ease: 'power2.in' });
        });
        btn.addEventListener('mouseup', () => {
            gsap.to(btn, { scale: 1, duration: 0.3, ease: 'elastic.out(1, 0.4)' });
        });
        btn.addEventListener('mouseleave', () => {
            gsap.to(btn, { scale: 1, duration: 0.2, ease: 'power2.out' });
        });
    });

    // 11. COUNTER ANIMATION for numeric values
    view.querySelectorAll('.media-value, [data-animate-number]').forEach(el => {
        const text = el.textContent.trim();
        const num = parseFloat(text);
        if (!isNaN(num) && num > 0) {
            const obj = { val: 0 };
            gsap.to(obj, {
                val: num,
                duration: 1.2,
                delay: 0.5,
                ease: 'power2.out',
                onUpdate: () => {
                    el.textContent = num % 1 !== 0
                        ? obj.val.toFixed(2)
                        : Math.round(obj.val).toString();
                }
            });
        }
    });
}

// GSAP Modal Animations — Spring physics
function gsapOpenModal(overlay) {
    if (!overlay || typeof gsap === 'undefined') return;
    const content = overlay.querySelector('.modal-content');
    gsap.fromTo(overlay,
        { opacity: 0 },
        { opacity: 1, duration: 0.3, ease: 'power2.out' }
    );
    if (content) {
        gsap.fromTo(content,
            { scale: 0.88, y: 30, filter: 'blur(4px)' },
            { scale: 1, y: 0, filter: 'blur(0px)', duration: 0.45, ease: 'back.out(1.4)' }
        );
    }
}

function gsapCloseModal(overlay, onComplete) {
    if (!overlay || typeof gsap === 'undefined') {
        if (onComplete) onComplete();
        return;
    }
    const content = overlay.querySelector('.modal-content');
    const tl = gsap.timeline({ onComplete });
    if (content) {
        tl.to(content, { scale: 0.9, y: 15, opacity: 0, filter: 'blur(4px)', duration: 0.25, ease: 'power2.in' }, 0);
    }
    tl.to(overlay, { opacity: 0, duration: 0.2, ease: 'power2.in' }, 0.08);
}

// Nav transition animation
function gsapAnimateNav() {
    const nav = document.querySelector('.nav-links');
    if (!nav || typeof gsap === 'undefined') return;
    const activeItem = nav.querySelector('.nav-item.active');
    if (activeItem) {
        gsap.fromTo(activeItem,
            { scale: 0.92 },
            { scale: 1, duration: 0.3, ease: 'back.out(2)' }
        );
    }
}

/* Console LOG for GSAP */
console.log('✅ GSAP Animations consolidated into ui.js');

function renderCircolariView() {
    const list = state.circolari || [];

    if ((!list || list.length === 0) && typeof window.loadCircolari === 'function' && !window._loadingCircolariNow) {
        window._loadingCircolariNow = true;
        window.loadCircolari().finally(() => {
            window._loadingCircolariNow = false;
        });
    }

    function fmtDate(raw) {
        if (!raw) return '';
        const d = (typeof parseArgoDate === 'function') ? parseArgoDate(raw) : (typeof window.parseArgoDate === 'function' ? window.parseArgoDate(raw) : new Date(raw));
        if (!d || isNaN(d) || d.getTime() <= 86400000) return raw;
        const diff = Math.round((new Date() - d) / 86400000);
        if (diff === 0) return 'Oggi';
        if (diff === 1) return 'Ieri';
        return d.toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });
    }

    const q = (state.circolariSearchQuery || '').toLowerCase().trim();
    const filteredList = q
        ? list.filter(c => ((c.titolo || '') + ' ' + (c.numero || '') + ' ' + (c.data || '')).toLowerCase().includes(q))
        : list;

    // First card: full-width featured (when not searching)
    const featured = (!q && list.length > 0) ? list[0] : null;
    // Next 2: small grid (when not searching)
    const gridCards = (!q && list.length > 1) ? list.slice(1, 3) : [];
    // Rest: list rows
    const recentList = !q ? list.slice(3) : filteredList;

    const featuredHtml = featured ? `
        <div style="border-radius:28px;padding:22px 20px;margin-bottom:20px;box-shadow:0 28px 56px -14px rgba(6,14,32,0.75), inset 0 1px 1px rgba(255,255,255,0.3);border:1px solid rgba(182,196,255,0.2);border-top:1px solid rgba(255,255,255,0.35);background:linear-gradient(135deg,rgba(47,88,205,0.35) 0%,rgba(23,31,51,0.9) 100%);backdrop-filter:blur(36px) saturate(190%);-webkit-backdrop-filter:blur(36px) saturate(190%);cursor:pointer;position:relative;overflow:hidden;" onclick="mostraCircolare('${escapeJsSingleQuote(featured.id)}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <span style="background:rgba(47,88,205,0.25);border:1px solid rgba(182,196,255,0.3);color:#b6c4ff;font-size:11px;font-weight:800;padding:4px 12px;border-radius:999px;display:inline-flex;align-items:center;gap:6px;letter-spacing:0.04em;">
                    <i class="ph-fill ph-sparkle" style="font-size:13px;"></i> IN EVIDENZA ${featured.numero ? '· N. ' + escapeHtml(featured.numero) : ''}
                </span>
                <span style="font-size:12px;font-weight:600;color:#c4c5d6;display:flex;align-items:center;gap:4px;">
                    <i class="ph-bold ph-calendar" style="color:#b6c4ff;"></i> ${fmtDate(featured.data)}
                </span>
            </div>
            <h2 style="font-size:19px;font-weight:800;color:#dae2fd;line-height:1.35;margin:0 0 20px;letter-spacing:-0.02em;">${escapeHtml(featured.titolo)}</h2>
            <div style="display:flex;justify-content:space-between;align-items:center;">
                <span style="font-size:12px;font-weight:600;color:#8e909f;">Tocca per consultare</span>
                <div style="background:linear-gradient(135deg,#2f58cd 0%,#3b82f6 100%);color:#ffffff;font-size:12px;font-weight:700;padding:8px 16px;border-radius:14px;display:flex;align-items:center;gap:6px;box-shadow:0 4px 16px rgba(47,88,205,0.45);">
                    <i class="ph-bold ph-file-text"></i> Leggi e Sintesi AI →
                </div>
            </div>
        </div>` : '';

    const gridHtml = gridCards.length ? `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:24px;">
            ${gridCards.map((c, i) => {
                const isFirst = i === 0;
                const accentColor = isFirst ? '#b6c4ff' : '#6ee7b7';
                const bgAccent = isFirst ? 'rgba(47,88,205,0.25)' : 'rgba(110,231,183,0.15)';
                const iconName = isFirst ? 'ph-calendar-star' : 'ph-file-text';
                return `<div style="border-radius:22px;padding:18px 16px;background:rgba(23,31,51,0.85);backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);box-shadow:0 12px 28px -10px rgba(6,14,32,0.6);border:1px solid rgba(182,196,255,0.14);border-top:1px solid rgba(255,255,255,0.25);display:flex;flex-direction:column;cursor:pointer;min-height:150px;justify-content:space-between;" onclick="mostraCircolare('${escapeJsSingleQuote(c.id)}')" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform='scale(1)'">
                    <div>
                        <div style="width:36px;height:36px;border-radius:12px;background:${bgAccent};border:1px solid ${accentColor}44;display:flex;align-items:center;justify-content:center;color:${accentColor};margin-bottom:12px;">
                            <i class="ph-fill ${iconName}" style="font-size:18px;"></i>
                        </div>
                        <h3 style="font-size:14px;font-weight:700;color:#dae2fd;line-height:1.3;margin:0;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;">${escapeHtml(c.titolo)}</h3>
                    </div>
                    <div style="display:flex;align-items:center;justify-content:space-between;margin-top:12px;font-size:11px;font-weight:600;color:#8e909f;">
                        <span>${c.numero ? 'N. ' + escapeHtml(c.numero) : ''}</span>
                        <span>${fmtDate(c.data)}</span>
                    </div>
                </div>`;
            }).join('')}
        </div>` : '';

    const recentHtml = recentList.length ? `
        <div style="display:flex;justify-content:space-between;align-items:center;margin:8px 0 14px;">
            <h2 style="font-size:18px;font-weight:800;color:#dae2fd;letter-spacing:-0.01em;margin:0;">${q ? 'Risultati ricerca' : 'Tutte le Circolari'}</h2>
            <span style="font-size:11px;font-weight:700;color:#8e909f;background:rgba(23,31,51,0.85);border:1px solid rgba(182,196,255,0.14);padding:3px 10px;border-radius:999px;">${recentList.length} ${recentList.length === 1 ? 'comunicazione' : 'comunicazioni'}</span>
        </div>
        <div id="circolari-list-container" style="display:flex;flex-direction:column;gap:10px;">
            ${recentList.map(c => `
                <div data-circ-item data-circ-search="${escapeHtml(((c.titolo || '') + ' ' + (c.numero || '') + ' ' + (c.data || '')).toLowerCase())}" style="background:rgba(23,31,51,0.82);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(182,196,255,0.12);border-top:1px solid rgba(255,255,255,0.22);box-shadow:0 6px 20px -8px rgba(6,14,32,0.6);border-radius:20px;padding:14px 16px;display:flex;align-items:center;gap:14px;cursor:pointer;transition:transform 0.12s ease;" onclick="mostraCircolare('${escapeJsSingleQuote(c.id)}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
                    <div style="width:42px;height:42px;border-radius:14px;background:rgba(47,88,205,0.2);border:1px solid rgba(182,196,255,0.25);display:flex;align-items:center;justify-content:center;color:#b6c4ff;flex-shrink:0;">
                        <i class="ph-fill ph-file-text" style="font-size:20px;"></i>
                    </div>
                    <div style="flex:1;min-width:0;">
                        <p style="font-size:14px;font-weight:700;color:#dae2fd;margin:0 0 4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;line-height:1.3;">${escapeHtml(c.titolo)}</p>
                        <div style="display:flex;align-items:center;gap:8px;font-size:11px;color:#8e909f;font-weight:600;">
                            ${c.numero ? `<span style="background:rgba(182,196,255,0.1);padding:1px 6px;border-radius:6px;color:#b6c4ff;">N. ${escapeHtml(c.numero)}</span>` : ''}
                            <span>${fmtDate(c.data)}</span>
                            ${c.sintesi ? '<span style="color:#b6c4ff;font-weight:700;display:flex;align-items:center;gap:3px;"><i class="ph-bold ph-sparkle"></i> AI</span>' : ''}
                        </div>
                    </div>
                    <i class="ph-bold ph-caret-right" style="font-size:16px;color:rgba(182,196,255,0.4);flex-shrink:0;"></i>
                </div>`).join('')}
        </div>` : '';

    const emptyHtml = (!list.length || (q && !filteredList.length)) ? `
        <div id="circ-search-empty" style="display:flex;flex-direction:column;align-items:center;justify-content:center;padding:60px 20px;text-align:center;">
            <div style="width:56px;height:56px;border-radius:20px;background:rgba(23,31,51,0.85);border:1px solid rgba(182,196,255,0.16);display:flex;align-items:center;justify-content:center;color:#8e909f;margin-bottom:14px;">
                <i class="ph-bold ph-tray" style="font-size:28px;"></i>
            </div>
            <p style="font-size:16px;font-weight:700;color:#dae2fd;margin:0 0 4px;">Nessuna circolare trovata</p>
            <p style="font-size:13px;font-weight:500;color:#8e909f;margin:0;">${q ? 'Nessun elemento corrisponde ai criteri di ricerca' : 'Non ci sono comunicazioni pubblicate al momento'}</p>
        </div>` : '';

    return `
    <div class="view-fullbleed min-h-screen pb-32" style="background:var(--background, #0b1326);font-family:'Inter',sans-serif;color:#dae2fd;">
        <header class="ios-header-wrapper" style="display:flex;justify-content:space-between;align-items:flex-end;padding:max(env(safe-area-inset-top,0px),24px) 20px 16px;">
            <div>
                <div class="ios-sub-title" style="color:#b6c4ff;font-weight:800;letter-spacing:0.08em;font-size:11px;">COMUNICAZIONI SCUOLA</div>
                <h1 class="ios-large-title" style="color:#dae2fd;font-weight:800;font-size:32px;letter-spacing:-0.03em;margin:2px 0 0;">Circolari</h1>
            </div>
            <button onclick="if(typeof loadCircolari==='function'){loadCircolari().then(()=>render());}" style="width:38px;height:38px;border-radius:12px;background:rgba(23,31,51,0.85);border:1px solid rgba(182,196,255,0.16);color:#b6c4ff;cursor:pointer;display:flex;align-items:center;justify-content:center;" aria-label="Aggiorna circolari">
                <i class="ph-bold ph-arrows-clockwise" style="font-size:18px;"></i>
            </button>
        </header>

        <div style="padding:0 20px;">
            <!-- Search Bar -->
            <div style="margin-bottom:18px;position:relative;">
                <div style="display:flex;align-items:center;background:rgba(23,31,51,0.85);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(182,196,255,0.16);border-radius:18px;padding:12px 16px;gap:10px;box-shadow:0 8px 24px -6px rgba(6,14,32,0.6);">
                    <i class="ph-bold ph-magnifying-glass" style="color:#b6c4ff;font-size:18px;flex-shrink:0;"></i>
                    <input id="circ-search-input" type="text" placeholder="Cerca per titolo, numero o data..." oninput="window.filterCircolari(this.value)" value="${escapeHtml(state.circolariSearchQuery || '')}" style="background:none;border:none;color:#dae2fd;font-size:14px;width:100%;outline:none;font-family:'Inter',sans-serif;" />
                    ${state.circolariSearchQuery ? `<i class="ph-bold ph-x-circle" style="color:#8e909f;cursor:pointer;font-size:18px;" onclick="const si=document.getElementById('circ-search-input');if(si){si.value='';window.filterCircolari('');}"></i>` : ''}
                </div>
            </div>

            ${featuredHtml}
            ${gridHtml}
            ${recentHtml}
            ${emptyHtml}
        </div>
    </div>`;
}

window.filterCircolari = function(query) {
    state.circolariSearchQuery = query;
    const container = document.getElementById('circolari-list-container');
    if (!container) {
        if (typeof render === 'function') render();
        return;
    }
    const items = container.querySelectorAll('[data-circ-item]');
    const q = (query || '').toLowerCase().trim();
    let visibleCount = 0;
    items.forEach(el => {
        const text = el.getAttribute('data-circ-search') || '';
        const match = !q || text.includes(q);
        el.style.display = match ? 'flex' : 'none';
        if (match) visibleCount++;
    });
    const emptyEl = document.getElementById('circ-search-empty');
    if (emptyEl) {
        emptyEl.style.display = (visibleCount === 0 && q) ? 'flex' : 'none';
    }
};

function getSubjectTheme(rawSubject) {
    const s = (typeof normalizeSubjectName === 'function' ? normalizeSubjectName(rawSubject) : String(rawSubject || '')).toLowerCase();
    
    // 1. Scienze Motorie e Sportive (Educazione Fisica - Bianco ghiaccio tendente all'azzurro)
    if (s.includes('motor') || s.includes('ed. fis') || s.includes('sport') || s.includes('ginnas') || (s.includes('educazione') && s.includes('fisic'))) {
        return {
            color: '#e0f2fe',
            gradient: 'linear-gradient(135deg, rgba(224, 242, 254, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)',
            border: 'rgba(224, 242, 254, 0.38)',
            icon: 'ph-person-simple-run',
            iconBg: 'rgba(224, 242, 254, 0.18)',
            glow: 'rgba(224, 242, 254, 0.35)'
        };
    }
    // 2. Educazione Civica (Marrone Acceso / Cuoio Caldo - netto contrasto da Italiano)
    if (s.includes('civic') || s.includes('cittadin')) {
        return {
            color: '#b46534',
            gradient: 'linear-gradient(135deg, rgba(180, 101, 52, 0.20) 0%, rgba(23, 31, 51, 0.92) 100%)',
            border: 'rgba(180, 101, 52, 0.38)',
            icon: 'ph-scales',
            iconBg: 'rgba(180, 101, 52, 0.22)',
            glow: 'rgba(180, 101, 52, 0.35)'
        };
    }
    // 3. Informatica (Cyber Neon Cyan - contrasto netto da Matematica)
    if (s.includes('inform') || s.includes('sistemi') || s.includes('tps') || s.includes('telecom') || s.includes('tecnol')) {
        return {
            color: '#06b6d4',
            gradient: 'linear-gradient(135deg, rgba(6, 182, 212, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)',
            border: 'rgba(6, 182, 212, 0.35)',
            icon: 'ph-code',
            iconBg: 'rgba(6, 182, 212, 0.22)',
            glow: 'rgba(6, 182, 212, 0.40)'
        };
    }
    // 4. Matematica (Classic Royal Cobalt Blue)
    if (s.includes('matem') || s.includes('algeb') || s.includes('geom') || s.includes('trigon')) {
        return {
            color: '#2563eb',
            gradient: 'linear-gradient(135deg, rgba(37, 99, 235, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)',
            border: 'rgba(37, 99, 235, 0.35)',
            icon: 'ph-calculator',
            iconBg: 'rgba(37, 99, 235, 0.22)',
            glow: 'rgba(37, 99, 235, 0.35)'
        };
    }
    // 5. Italiano (Rosso Vivo)
    if (s.includes('ital') || s.includes('letter') || s.includes('epic') || s.includes('antol') || s.includes('narrat') || s.includes('gramm')) {
        return {
            color: '#ef4444',
            gradient: 'linear-gradient(135deg, rgba(239, 68, 68, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)',
            border: 'rgba(239, 68, 68, 0.35)',
            icon: 'ph-book-open-text',
            iconBg: 'rgba(239, 68, 68, 0.22)',
            glow: 'rgba(239, 68, 68, 0.35)'
        };
    }
    // 6. Storia Triennio (Oro Giallo Antico - nettamente distinto dall'arancione)
    if ((s.includes('storia') || s.includes('geogr')) && !s.includes('arte')) {
        return {
            color: '#eab308',
            gradient: 'linear-gradient(135deg, rgba(234, 179, 8, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)',
            border: 'rgba(234, 179, 8, 0.35)',
            icon: 'ph-scroll',
            iconBg: 'rgba(234, 179, 8, 0.22)',
            glow: 'rgba(234, 179, 8, 0.35)'
        };
    }
    // 7. Filosofia (Viola Ametista)
    if (s.includes('filos')) {
        return {
            color: '#a855f7',
            gradient: 'linear-gradient(135deg, rgba(168, 85, 247, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)',
            border: 'rgba(168, 85, 247, 0.35)',
            icon: 'ph-brain',
            iconBg: 'rgba(168, 85, 247, 0.22)',
            glow: 'rgba(168, 85, 247, 0.35)'
        };
    }
    // 8. Inglese (Teal / Verde Marino)
    if (s.includes('ingl') || s.includes('franc') || s.includes('spag') || s.includes('tedes') || s.includes('lingua')) {
        return {
            color: '#14b8a6',
            gradient: 'linear-gradient(135deg, rgba(20, 184, 166, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)',
            border: 'rgba(20, 184, 166, 0.35)',
            icon: 'ph-globe',
            iconBg: 'rgba(20, 184, 166, 0.22)',
            glow: 'rgba(20, 184, 166, 0.35)'
        };
    }
    // 9. Fisica (Cosmic Indigo)
    if (s.includes('fisic') && !s.includes('educazione') && !s.includes('motor')) {
        return {
            color: '#6366f1',
            gradient: 'linear-gradient(135deg, rgba(99, 102, 241, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)',
            border: 'rgba(99, 102, 241, 0.35)',
            icon: 'ph-atom',
            iconBg: 'rgba(99, 102, 241, 0.22)',
            glow: 'rgba(99, 102, 241, 0.35)'
        };
    }
    // 10. Scienze Naturali (Verde Smeraldo Natura)
    if (s.includes('scienz') || s.includes('chimic') || s.includes('biol') || s.includes('geol') || s.includes('natura')) {
        return {
            color: '#22c55e',
            gradient: 'linear-gradient(135deg, rgba(34, 197, 94, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)',
            border: 'rgba(34, 197, 94, 0.35)',
            icon: 'ph-flask',
            iconBg: 'rgba(34, 197, 94, 0.22)',
            glow: 'rgba(34, 197, 94, 0.35)'
        };
    }
    // 11. Disegno e Storia dell'Arte Triennio (Flame Orange - arancione vivo)
    if (s.includes('arte') || s.includes('disegn')) {
        return {
            color: '#ff6b00',
            gradient: 'linear-gradient(135deg, rgba(255, 107, 0, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)',
            border: 'rgba(255, 107, 0, 0.35)',
            icon: 'ph-palette',
            iconBg: 'rgba(255, 107, 0, 0.22)',
            glow: 'rgba(255, 107, 0, 0.35)'
        };
    }
    if (s.includes('diritto') || s.includes('econ')) {
        return {
            color: '#cbd5e1',
            gradient: 'linear-gradient(135deg, rgba(148, 163, 184, 0.18) 0%, rgba(23, 31, 51, 0.92) 100%)',
            border: 'rgba(203, 213, 225, 0.32)',
            icon: 'ph-scales',
            iconBg: 'rgba(148, 163, 184, 0.22)',
            glow: 'rgba(148, 163, 184, 0.35)'
        };
    }
    if (s.includes('relig') || s.includes('rc')) {
        return {
            color: '#e2e8f0',
            gradient: 'linear-gradient(135deg, rgba(226, 232, 240, 0.15) 0%, rgba(23, 31, 51, 0.92) 100%)',
            border: 'rgba(226, 232, 240, 0.28)',
            icon: 'ph-hands-praying',
            iconBg: 'rgba(226, 232, 240, 0.18)',
            glow: 'rgba(226, 232, 240, 0.25)'
        };
    }
    // Default Stitch Periwinkle
    return {
        color: '#b6c4ff',
        gradient: 'linear-gradient(135deg, rgba(47, 88, 205, 0.2) 0%, rgba(23, 31, 51, 0.92) 100%)',
        border: 'rgba(182, 196, 255, 0.25)',
        icon: 'ph-book-bookmark',
        iconBg: 'rgba(47, 88, 205, 0.25)',
        glow: 'rgba(182, 196, 255, 0.3)'
    };
}
window.getSubjectTheme = getSubjectTheme;

function getSubjectIcon(subject) {
    const t = getSubjectTheme(subject);
    return t.icon ? t.icon.replace('ph-', '') : 'book';
}

window.openTaskDetailModal = function(taskId) {
    const t = (state.tasks || []).find(x => String(x.id) === String(taskId))
           || (state.verifiche || []).find(x => String(x.id) === String(taskId))
           || (state.manualVerifiche || []).find(x => String(x.id) === String(taskId));
    if (!t) return;
    
    const isExam = t.isExam || t.type === 'verifica' || /verifica|interrogazione|test|esame|simulazione/i.test(t.text || '');
    const subj = t.subject || t.materia || 'Attività';
    const txt = t.text || t.args || t.descrizione || 'Nessuna descrizione specificata.';
    const dueDate = t.due_date || t.data || t.date || '';
    const theme = getSubjectTheme(subj);
    
    let formattedDate = dueDate;
    if (dueDate) {
        const d = (typeof parseLocalDate === 'function') ? parseLocalDate(dueDate) : new Date(dueDate + 'T00:00:00');
        if (!isNaN(d.getTime())) {
            formattedDate = d.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            formattedDate = formattedDate.charAt(0).toUpperCase() + formattedDate.slice(1);
        }
    }

    const canDel = typeof isUserGeneratedTaskId === 'function' ? isUserGeneratedTaskId(t.id) : false;

    // Remove existing overlay if present
    const existing = document.getElementById('task-detail-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'task-detail-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(6,14,32,0.65);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);display:flex;align-items:flex-end;justify-content:center;';

    const sheet = document.createElement('div');
    sheet.style.cssText = 'width:100%;max-width:540px;background:rgba(18,29,50,0.96);backdrop-filter:blur(40px) saturate(200%);-webkit-backdrop-filter:blur(40px) saturate(200%);border:1px solid rgba(182,196,255,0.18);border-top:1px solid rgba(255,255,255,0.35);border-radius:32px 32px 0 0;display:flex;flex-direction:column;max-height:90vh;box-shadow:0 -12px 48px rgba(6,14,32,0.85);transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);font-family:\'Inter\',sans-serif;color:#dae2fd;';

    sheet.innerHTML = `
        <!-- Drag handle -->
        <div style="display:flex;justify-content:center;padding:14px 0 8px;flex-shrink:0;">
            <div style="width:44px;height:5px;border-radius:999px;background:rgba(182,196,255,0.3);"></div>
        </div>

        <!-- Header -->
        <div style="padding:8px 22px 14px;flex-shrink:0;border-bottom:1px solid rgba(182,196,255,0.12);">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">
                <div style="display:inline-flex;align-items:center;gap:6px;padding:4px 12px;border-radius:999px;background:${theme.iconBg};border:1px solid ${theme.border};color:${theme.color};font-size:12px;font-weight:800;letter-spacing:0.03em;">
                    <i class="ph-fill ${theme.icon}" style="font-size:14px;"></i>
                    <span>${escapeHtml(subj)}</span>
                </div>
                ${isExam ? `
                    <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:rgba(239,68,68,0.2);border:1px solid rgba(239,68,68,0.35);color:#ffb4ab;font-size:11px;font-weight:800;letter-spacing:0.04em;">
                        <i class="ph-bold ph-warning" style="font-size:13px;"></i> VERIFICA
                    </span>
                ` : `
                    <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;background:${t.done ? 'rgba(110,231,183,0.18)' : 'rgba(47,88,205,0.22)'};border:1px solid ${t.done ? 'rgba(110,231,183,0.35)' : 'rgba(182,196,255,0.25)'};color:${t.done ? '#6ee7b7' : '#b6c4ff'};font-size:11px;font-weight:700;">
                        <i class="ph-bold ${t.done ? 'ph-check-circle' : 'ph-clock'}" style="font-size:13px;"></i> ${t.done ? 'Completato' : 'Da svolgere'}
                    </span>
                `}
            </div>

            <div style="display:flex;align-items:center;gap:6px;color:#8e909f;font-size:13px;font-weight:500;">
                <i class="ph-bold ph-calendar-blank" style="color:${theme.color};font-size:15px;"></i>
                <span>${escapeHtml(formattedDate)}</span>
            </div>
        </div>

        <!-- Body -->
        <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:20px 22px;">
            <div style="background:rgba(23,31,51,0.85);border:1px solid rgba(182,196,255,0.14);border-radius:20px;padding:18px 20px;box-shadow:0 8px 24px -6px rgba(6,14,32,0.6);">
                <h3 style="font-size:11px;font-weight:800;color:${theme.color};text-transform:uppercase;letter-spacing:0.08em;margin:0 0 10px;">Dettaglio Assegnazione</h3>
                <p style="font-size:15px;line-height:1.65;color:#dae2fd;margin:0;white-space:pre-wrap;word-break:break-word;user-select:text;-webkit-user-select:text;">${escapeHtml(txt)}</p>
            </div>
        </div>

        <!-- Actions -->
        <div style="padding:14px 22px calc(24px + env(safe-area-inset-bottom,0px));flex-shrink:0;display:flex;flex-direction:column;gap:10px;border-top:1px solid rgba(182,196,255,0.12);">
            <button onclick="toggleTask('${escapeJsSingleQuote(t.id)}'); openTaskDetailModal('${escapeJsSingleQuote(t.id)}'); if(typeof window.updatePlannerSearchModalResults==='function')window.updatePlannerSearchModalResults(); state._forceRender=true; scheduleRender(0);" style="width:100%;height:48px;border-radius:15px;background:${t.done ? 'rgba(110,231,183,0.18)' : 'linear-gradient(135deg,#2f58cd 0%,#3b82f6 100%)'};border:${t.done ? '1px solid rgba(110,231,183,0.35)' : 'none'};color:${t.done ? '#6ee7b7' : '#ffffff'};font-size:14px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;font-family:'Inter',sans-serif;box-shadow:${t.done ? 'none' : '0 4px 16px rgba(47,88,205,0.45)'};">
                <i class="ph-bold ${t.done ? 'ph-arrow-counter-clockwise' : 'ph-check'}" style="font-size:18px;"></i>
                <span>${t.done ? 'Riapri (Segna come Da Svolgere)' : 'Segna come Completato'}</span>
            </button>

            ${canDel ? `
            <button onclick="deleteCalendarTask('${escapeJsSingleQuote(t.id)}'); window.closeTaskDetailModal(); if(typeof window.updatePlannerSearchModalResults==='function')window.updatePlannerSearchModalResults(); state._forceRender=true; scheduleRender(0);" style="width:100%;height:44px;border-radius:14px;background:rgba(255,59,48,0.12);border:1px solid rgba(255,59,48,0.25);color:#ffb4ab;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;font-family:'Inter',sans-serif;">
                <i class="ph-bold ph-trash" style="font-size:16px;"></i> Elimina Attività
            </button>
            ` : ''}

            <button onclick="window.closeTaskDetailModal()" style="width:100%;height:38px;background:none;border:none;color:#b6c4ff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Inter',sans-serif;">Chiudi</button>
        </div>
    `;

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);
    requestAnimationFrame(() => { sheet.style.transform = 'translateY(0)'; });

    window.closeTaskDetailModal = function() {
        sheet.style.transform = 'translateY(100%)';
        setTimeout(() => { if (overlay.parentNode) overlay.remove(); }, 320);
    };

    overlay.addEventListener('click', e => { if (e.target === overlay) window.closeTaskDetailModal(); });
};

window._plannerGetDayContentHTML = function() {
    // Usa la cache se disponibile (invalidata da ogni render completo o cambio giorno)
    if (window._plannerDayContentCache) return window._plannerDayContentCache;
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayISO = getLocalDateString(today);
    const selectedDate = state.selectedDate || todayISO;
    const MN = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const dayLabels = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
    
    const allTasks = (state.tasks||[]).filter(t=>t.subject!=='QUEST');
    const dayTasks = allTasks.filter(t=>t.due_date===selectedDate);
    const upcomingCount = allTasks.filter(t=>{
        if(t.done) return false;
        const d = parseLocalDate(t.due_date);
        if(isNaN(d.getTime())) return false;
        return (d-today)/86400000>0 && (d-today)/86400000<=7;
    }).length;

    const TC = window._plannerTC;
    if(!TC) return '';

    // Aggiunto padding-bottom: 120px per evitare l'accavallamento con la Navbar
    let html = '<div style="padding:0 24px 120px 24px;display:flex;flex-direction:column;gap:10px;">';

    const d = new Date(selectedDate+'T00:00:00');
    const diff = Math.round((d-today)/86400000);
    const base = `${dayLabels[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`;
    let title = base;
    if(diff===0) title = `Oggi · ${base}`;
    else if(diff===1) title = `Domani · ${base}`;
    else if(diff===-1) title = `Ieri · ${base}`;

    html += `<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;">
        <h2 style="font-size:15px;font-weight:700;color:var(--on-surface);margin:0;">${title}</h2>
        <span style="font-size:11px;font-weight:700;color:var(--outline);">${dayTasks.length} ${dayTasks.length===1?'evento':'eventi'}</span>
    </div>`;

    if (upcomingCount>0 && selectedDate===todayISO) {
        html += `<div style="background:var(--info-container);border:1.5px solid rgba(191,219,254,0.6);border-radius:20px;padding:14px 16px;box-shadow:0 4px 16px -8px rgba(37,99,235,0.12);">
            <div style="display:flex;align-items:center;gap:9px;margin-bottom:5px;">
                <div style="width:30px;height:30px;border-radius:50%;background:#1e40af;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:15px;color:white;font-variation-settings:'FILL' 1;">lightbulb</span></div>
                <span style="font-size:13px;font-weight:700;color:var(--info);">Smart Planner</span>
            </div>
            <p style="font-size:12px;color:var(--on-surface-variant);line-height:1.5;margin:0 0 6px;">Hai <strong>${upcomingCount}</strong> compiti nei prossimi 7 giorni.</p>
            <button onclick="const si=document.getElementById('planner-search-input');if(si){si.focus();si.select();}" style="color:var(--info);font-weight:700;font-size:11px;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:3px;font-family:Hanken Grotesk,sans-serif;padding:0;">Cerca <span class="material-symbols-outlined" style="font-size:13px;">arrow_forward</span></button>
        </div>`;
    }

    if (dayTasks.length) {
        html += dayTasks.map(t=>TC(t,false)).join('');
    } else {
        html += `<div class="planner-empty-card" style="background:var(--surface-container-lowest);border-radius:22px;padding:44px 16px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:10px;border:none;box-shadow:0 3px 14px -6px rgba(0,0,0,0.05);">
            <span class="material-symbols-outlined" style="font-size:44px;color:var(--outline-variant);">event_busy</span>
            <p style="font-size:14px;font-weight:600;color:var(--outline);margin:0;">Nessuna attività per questo giorno</p>
        </div>`;
    }

    html += `</div>`;
    window._plannerDayContentCache = html; // salva cache
    return html;
};

function renderPlanner() {
    const today = new Date();
    today.setHours(0,0,0,0);
    const todayISO = getLocalDateString(today);

    const selectedDate = state.selectedDate || todayISO;

    const showSearchPanel = !!(state.plannerSearchOpen || (state.agendaSearchQuery || '').trim() || (state.agendaSearchSubject && state.agendaSearchSubject !== 'all'));
    const query = (state.agendaSearchQuery || '').toLowerCase().trim();
    const filterSubject = state.agendaSearchSubject || 'all';

    const MN = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const selDate = new Date(selectedDate+'T00:00:00');
    const dayLabels = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];

    // Build 5 weeks: prev, current-2, current-1, current, next (centred on today)
    // We render 5 week slides; on mount we scroll to index 2 (today's week)
    const TOTAL_WEEKS = 5;      // slides total
    const CENTER_IDX  = 2;      // today's week is slide index 2

    // Build all 5 weeks centred on the SELECTED date (not always on today)
    // This allows navigating to any school-year date via the month picker.
    const weeks = [];
    for (let w = -CENTER_IDX; w <= TOTAL_WEEKS - CENTER_IDX - 1; w++) {
        const wStart = new Date(selDate);
        wStart.setDate(selDate.getDate() - selDate.getDay() + w * 7); // Sun-start
        const days = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(wStart);
            d.setDate(wStart.getDate() + i);
            const iso = getLocalDateString(d);
            days.push({
                label: dayLabels[d.getDay()],
                dayNum: d.getDate(),
                iso,
                isToday: iso === todayISO,
                hasTask: (state.tasks||[]).some(t=>t.due_date===iso&&t.subject!=='QUEST')
            });
        }
        weeks.push(days);
    }

    // Since carousel is centred on selDate, selected date is ALWAYS in CENTER_IDX slide
    const activeSlide = CENTER_IDX;

    const allTasks   = (state.tasks||[]).filter(t=>t.subject!=='QUEST');
    const subjects   = [...new Set(allTasks.map(t=>t.subject||t.materia||'').filter(Boolean))].sort();
    const dayTasks   = allTasks.filter(t=>t.due_date===selectedDate);
    const upcomingCount = allTasks.filter(t=>{
        if(t.done) return false;
        const d = parseLocalDate(t.due_date);
        if(isNaN(d.getTime())) return false;
        return (d-today)/86400000>0 && (d-today)/86400000<=7;
    }).length;

    // searchResults: attivo quando c'è query, filtro materia o search aperto (ordinato dal più recente al meno recente)
    const searchResults = showSearchPanel ? allTasks.filter(t=>{
        if(filterSubject!=='all'&&(t.subject||t.materia||'')!==filterSubject) return false;
        if(!query) return true;
        return (t.subject||'').toLowerCase().includes(query)
            || (t.materia||'').toLowerCase().includes(query)
            || (t.text||'').toLowerCase().includes(query);
    }).sort((a,b)=>(b.due_date||'').localeCompare(a.due_date||'')) : [];

    // ── Month label derived from selected date ───────────────────
    const monthLabel = `${MN[selDate.getMonth()]} ${selDate.getFullYear()}`;

    // ── Task card renderer ───────────────────────────────────────
    function TC(t, showDate) {
        const isExam = t.isExam||t.type==='verifica'||/verifica|interrogazione|test|esame|simulazione/i.test(t.text||'');
        const subj = escapeHtml(t.subject||t.materia||'');
        const txt  = escapeHtml(t.text||'');
        const tid  = escapeJsSingleQuote(t.id);
        const theme = getSubjectTheme(t.subject||t.materia||'');
        const canDel = typeof isUserGeneratedTaskId==='function' ? isUserGeneratedTaskId(t.id) : false;
        const dLabel = showDate&&t.due_date ? (()=>{
            const d=new Date(t.due_date+'T00:00:00');
            return `<span style="font-size:10px;font-weight:700;color:rgba(218,226,253,0.6);display:block;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.05em;">${d.getDate()} ${MN[d.getMonth()]}</span>`;
        })() : '';
        const delBtn = canDel ? `<button onclick="event.stopPropagation();deleteCalendarTask('${tid}');if(typeof window.updatePlannerSearchModalResults==='function')window.updatePlannerSearchModalResults();state._forceRender=true;scheduleRender(0);" style="width:30px;height:30px;border-radius:50%;background:rgba(255,59,48,0.2);border:1px solid rgba(255,59,48,0.3);display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:14px;color:#ffb4ab;">delete</span></button>` : '';
        const rerender = "if(typeof window.updatePlannerSearchModalResults==='function')window.updatePlannerSearchModalResults();state._forceRender=true;scheduleRender(0);";

        if (isExam) return `
        <div class="planner-task-exam" onclick="openTaskDetailModal('${tid}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'" style="background:linear-gradient(135deg, rgba(239,68,68,0.22) 0%, rgba(23,31,51,0.9) 100%);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(239,68,68,0.4);border-top:1px solid rgba(255,255,255,0.25);border-radius:20px;padding:14px 16px;position:relative;overflow:hidden;cursor:pointer;${t.done?'opacity:0.5;':''}box-shadow:0 0 20px rgba(239,68,68,0.25);transition:transform 0.12s ease;">
            <div style="position:absolute;top:-24px;right:-24px;width:80px;height:80px;background:rgba(239,68,68,0.25);border-radius:50%;filter:blur(16px);pointer-events:none;"></div>
            ${dLabel}
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;position:relative;z-index:1;">
                <div style="flex:1;min-width:0;">
                    <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                        <span style="font-size:10px;font-weight:800;color:${theme.color};text-transform:uppercase;letter-spacing:0.04em;">${subj}</span>
                    </div>
                    <p style="font-size:13px;font-weight:600;color:#dae2fd;margin:0 0 10px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;${t.done?'text-decoration:line-through;':''}">${txt}</p>
                </div>
                <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
                    ${delBtn}
                    <div onclick="event.stopPropagation();toggleTask('${tid}');${rerender}" style="width:36px;height:36px;border-radius:12px;background:rgba(239,68,68,0.25);border:1px solid rgba(239,68,68,0.4);display:flex;align-items:center;justify-content:center;color:#ffb4ab;cursor:pointer;" title="Segna come completato">
                        <i class="ph-bold ${t.done ? 'ph-check-circle' : 'ph-warning'}" style="font-size:18px;"></i>
                    </div>
                </div>
            </div>
            <div style="display:flex;align-items:center;justify-content:space-between;position:relative;z-index:1;">
                <div style="display:inline-flex;background:rgba(239,68,68,0.3);color:#ffb4ab;font-size:9px;font-weight:800;padding:3px 8px;border-radius:999px;letter-spacing:0.05em;border:1px solid rgba(239,68,68,0.45);">VERIFICA${t.done?' · COMPLETATA':''}</div>
                <span style="font-size:11px;font-weight:600;color:rgba(182,196,255,0.7);display:flex;align-items:center;gap:2px;">Dettagli <i class="ph-bold ph-caret-right" style="font-size:12px;"></i></span>
            </div>
        </div>`;

        if (t.done) return `
        <div class="planner-task-done" onclick="openTaskDetailModal('${tid}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'" style="background:rgba(23,31,51,0.7);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);border:1px solid rgba(182,196,255,0.1);border-radius:20px;padding:14px 16px;display:flex;align-items:center;gap:12px;opacity:0.55;cursor:pointer;transition:transform 0.12s ease;">
            <div onclick="event.stopPropagation();toggleTask('${tid}');${rerender}" style="width:40px;height:40px;flex-shrink:0;background:rgba(52,211,153,0.18);border:1px solid rgba(52,211,153,0.35);border-radius:12px;display:flex;align-items:center;justify-content:center;color:#34d399;cursor:pointer;" title="Riapri compito">
                <i class="ph-fill ph-check-circle" style="font-size:20px;"></i>
            </div>
            <div style="flex:1;min-width:0;">
                ${dLabel}
                <h3 style="font-size:13px;font-weight:800;color:${theme.color};text-decoration:line-through;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 0 2px;">${subj}</h3>
                <p style="font-size:12px;color:rgba(196,197,214,0.6);text-decoration:line-through;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0;">${txt}</p>
            </div>
            ${delBtn}
            <i class="ph-bold ph-caret-right" style="font-size:16px;color:rgba(182,196,255,0.3);flex-shrink:0;"></i>
        </div>`;

        return `
        <div class="planner-task-todo" onclick="openTaskDetailModal('${tid}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'" style="background:${theme.gradient};backdrop-filter:blur(28px);-webkit-backdrop-filter:blur(28px);border:1px solid ${theme.border};border-top:1px solid rgba(255,255,255,0.25);box-shadow:0 8px 24px -8px rgba(6,14,32,0.6), inset 0 1px 0 rgba(255,255,255,0.15);border-radius:20px;padding:14px 16px;display:flex;align-items:center;gap:12px;cursor:pointer;transition:transform 0.12s ease;">
            <div onclick="event.stopPropagation();toggleTask('${tid}');${rerender}" style="width:40px;height:40px;flex-shrink:0;background:${theme.iconBg};border:1px solid ${theme.border};border-radius:12px;display:flex;align-items:center;justify-content:center;color:${theme.color};cursor:pointer;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.9)'" ontouchend="this.style.transform='scale(1)'" title="Segna come completato">
                <i class="ph-fill ${theme.icon}" style="font-size:20px;"></i>
            </div>
            <div style="flex:1;min-width:0;">
                ${dLabel}
                <h3 style="font-size:13px;font-weight:800;color:${theme.color};overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0 0 2px;letter-spacing:0.02em;">${subj}</h3>
                <p style="font-size:13px;font-weight:500;color:#dae2fd;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;margin:0;line-height:1.35;">${txt}</p>
            </div>
            ${delBtn}
            <i class="ph-bold ph-caret-right" style="font-size:16px;color:rgba(182,196,255,0.4);flex-shrink:0;"></i>
        </div>`;
    }

    // Salva TC e MN su window per openPlannerSearchModal()
    window._plannerTC = TC;
    window._plannerMN = MN;
    window._plannerDayContentCache = null; // invalidata ad ogni render completo

    // ── Week slide HTML (one slide = one week of 7 day capsules) ────
    function weekSlide(days, slideIdx) {
        return `<div class="planner-week-slide" style="flex:0 0 100%;min-width:100%;width:100%;max-width:100%;display:flex;justify-content:space-between;gap:6px;padding:16px 20px 24px 20px;box-sizing:border-box;scroll-snap-align:start;scroll-snap-stop:always;">
            ${days.map(d => {
                const isSel = d.iso === selectedDate;
                const dayMood = (typeof window.getDailyMoodForDate === 'function') ? window.getDailyMoodForDate(d.iso) : null;
                const indicatorHtml = dayMood
                    ? `<span style="font-size:14px;line-height:1;margin-top:5px;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5));">${dayMood.emoji}</span>`
                    : (isSel
                        ? `<div style="width:6px;height:6px;border-radius:9999px;background:#ffffff;margin-top:8px;box-shadow:0 0 8px rgba(255,255,255,0.8);"></div>`
                        : `<div style="width:5px;height:5px;border-radius:9999px;background:${(d.isToday || d.hasTask) ? 'rgba(182,196,255,0.6)' : 'transparent'};margin-top:6px;"></div>`);

                if (isSel) {
                    return `<div class="planner-day-pill active-blue-glow squircle-full" onclick="plannerSelectDay('${d.iso}')" style="
                        flex:1 1 0%;min-width:0;height:96px;
                        display:flex;flex-direction:column;align-items:center;justify-content:center;
                        cursor:pointer;transition:transform 0.15s ease;
                        -webkit-tap-highlight-color:transparent;
                    " ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform='scale(1)'">
                        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#ffffff;margin-bottom:4px;opacity:0.8;">${d.label}</span>
                        <span style="font-size:22px;font-weight:700;color:#ffffff;line-height:1;">${d.dayNum}</span>
                        ${indicatorHtml}
                    </div>`;
                } else {
                    return `<div class="planner-day-pill liquid-glass-v8 rim-light squircle-full" onclick="plannerSelectDay('${d.iso}')" style="
                        flex:1 1 0%;min-width:0;height:96px;
                        display:flex;flex-direction:column;align-items:center;justify-content:center;
                        cursor:pointer;opacity:0.65;transition:transform 0.15s ease, opacity 0.15s ease;
                        -webkit-tap-highlight-color:transparent;
                    " ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform='scale(1)'">
                        <span style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;color:#c4c5d6;margin-bottom:4px;">${d.label}</span>
                        <span style="font-size:20px;font-weight:700;color:#dae2fd;line-height:1;">${d.dayNum}</span>
                        ${indicatorHtml}
                    </div>`;
                }
            }).join('')}
        </div>`;
    }

    // Dot indicators (5 dots, one per week)
    const dotsHtml = weeks.map((_, i) => `
        <div class="planner-week-dot" data-idx="${i}" style="
            width:${i===activeSlide?'20px':'6px'};height:6px;border-radius:9999px;
            background:${i===activeSlide?'rgba(47,88,205,0.8)':'rgba(255,255,255,0.2)'};
            transition:all 0.3s ease;cursor:pointer;
        " onclick="plannerJumpToWeek(${i})"></div>
    `).join('');

    window._plannerInitialSlide = activeSlide; // per post-render scroll
    return `
    <div class="view-fullbleed planner-view min-h-screen pb-40" style="padding:0;background:var(--bg-base, #050811);">

        <!-- ══ HEADER (iOS HIG Large Title) ══ -->
        <header class="ios-header-wrapper" style="display:flex;justify-content:space-between;align-items:flex-end;padding:max(env(safe-area-inset-top,0px),24px) 20px 16px;">
            <div>
                <div class="ios-sub-title">AGENDA SCOLASTICA</div>
                <h1 class="ios-large-title">Planner</h1>
            </div>
            <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('light');window.openPlannerMonthPicker()" class="liquid-glass-v8 rim-light squircle-full shadow-lg" style="display:flex;align-items:center;gap:6px;padding:8px 16px;border:none;cursor:pointer;backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);" ontouchstart="this.style.transform='scale(0.95)'" ontouchend="this.style.transform='scale(1)'">
                <i class="ph ph-calendar-blank text-[18px] text-[rgba(218,226,253,0.8)]"></i>
                <span style="font-size:14px;font-weight:600;color:var(--text-primary);letter-spacing:0.02em;">${monthLabel}</span>
            </button>
        </header>

        <!-- ══ SEARCH TRIGGER (Apple Liquid Glass Spotlight Button) ══ -->
        <div style="padding:0 20px 16px;">
            <div onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('light');window.openPlannerSearchModal&&window.openPlannerSearchModal();"
                class="liquid-glass-v8 squircle-md rim-light"
                style="padding:13px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;cursor:pointer;background:rgba(20,31,54,0.75);border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);border-radius:20px;box-shadow:0 4px 20px -6px rgba(0,0,0,0.3);transition:transform 0.15s ease;"
                ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
                <div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0;">
                    <i class="ph ph-magnifying-glass" style="font-size:18px;color:#2997ff;flex-shrink:0;"></i>
                    <span style="font-size:14px;color:rgba(255,255,255,0.55);font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-family:'Inter',sans-serif;">Cerca compiti, verifiche o filtra per materia...</span>
                </div>
                <div style="display:flex;align-items:center;gap:5px;background:rgba(41,151,255,0.12);border:0.5px solid rgba(41,151,255,0.25);border-radius:999px;padding:4px 10px;flex-shrink:0;">
                    <i class="ph-bold ph-funnel" style="font-size:12px;color:#2997ff;"></i>
                    <span style="font-size:11px;font-weight:700;color:#2997ff;">Filtri</span>
                </div>
            </div>
        </div>

        <!-- ══ WEEK CAROUSEL (Liquid Glass Capsules) ══ -->
       <div id="planner-week-carousel" style="
            display:flex;
            overflow-x:auto;
            scroll-snap-type:x mandatory;
            -webkit-overflow-scrolling:touch;
            overscroll-behavior-x:contain;
            scrollbar-width:none;
            -ms-overflow-style:none;
            gap:0;
            margin:-12px 0 -12px;
            padding:12px 0;
            width:100%;
        " onscroll="handlePlannerCarouselScroll(this)">
            ${weeks.map((wk,i) => weekSlide(wk, i)).join('')}
        </div>

        <!-- Dot indicators -->
        <div style="display:flex;justify-content:center;align-items:center;gap:6px;margin:12px 0 20px;">
            ${dotsHtml}
        </div>

        <!-- ══ DAY CONTENT ══ -->
        <div id="planner-content-area" style="padding:0 20px 140px 20px;">
            <div style="display:flex;flex-direction:column;gap:16px;">

                <!-- Selected day header -->
                <div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px;">
                    <h2 style="font-size:18px;font-weight:600;color:rgba(218,226,253,0.9);margin:0;line-height:1.2;" class="sentence-case">
                        ${(()=>{
                            const d=new Date(selectedDate+'T00:00:00');
                            const diff=Math.round((d-today)/86400000);
                            const base=`${dayLabels[d.getDay()]} ${d.getDate()} ${MN[d.getMonth()]}`;
                            if(diff===0) return `Oggi · ${base}`;
                            if(diff===1) return `Domani · ${base}`;
                            if(diff===-1) return `Ieri · ${base}`;
                            return base;
                        })()}
                    </h2>
                    <span style="font-size:12px;font-weight:500;color:rgba(196,197,214,0.6);">${dayTasks.length} ${dayTasks.length===1?'evento':'eventi'}</span>
                </div>

                ${upcomingCount>0 && selectedDate===todayISO ? `
                <div class="liquid-glass-v8 squircle-md rim-light" style="padding:16px 18px;background:linear-gradient(135deg, rgba(47,88,205,0.2) 0%, rgba(255,255,255,0.02) 100%);">
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">
                        <div style="width:32px;height:32px;border-radius:50%;background:#2f58cd;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:16px;color:white;font-variation-settings:'FILL' 1;">lightbulb</span></div>
                        <span style="font-size:14px;font-weight:700;color:#dae2fd;">Smart Planner</span>
                    </div>
                    <p style="font-size:13px;color:rgba(196,197,214,0.8);line-height:1.5;margin:0 0 8px;">Hai <strong>${upcomingCount}</strong> compiti nei prossimi 7 giorni.</p>
                    <button onclick="window.openPlannerSearchModal&&window.openPlannerSearchModal();" style="color:#b6c4ff;font-weight:600;font-size:12px;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:'Inter',sans-serif;padding:0;">Cerca & Filtra tutti <span class="material-symbols-outlined" style="font-size:14px;">arrow_forward</span></button>
                </div>` : ''}

                ${dayTasks.length ? `<div style="display:flex;flex-direction:column;gap:12px;">${dayTasks.map(t=>TC(t,false)).join('')}</div>` : `
                <!-- Empty State Bento Card (Apple Liquid Glass) -->
                <div class="liquid-glass-v8 squircle-lg rim-light" style="padding:40px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;min-height:280px;background:rgba(20,31,54,0.6);border-radius:28px;border:0.5px solid rgba(255,255,255,0.1);">
                    <div style="position:relative;margin-bottom:20px;">
                        <div style="position:absolute;inset:0;background:rgba(41,151,255,0.2);filter:blur(24px);border-radius:9999px;"></div>
                        <div style="position:relative;width:72px;height:72px;border-radius:22px;background:rgba(41,151,255,0.1);border:1px solid rgba(41,151,255,0.25);display:flex;align-items:center;justify-content:center;color:#2997ff;">
                            <i class="ph ph-calendar-x" style="font-size:36px;"></i>
                        </div>
                    </div>
                    <h4 style="font-size:16px;font-weight:700;color:#ffffff;margin:0 0 4px;">Nessuna attività</h4>
                    <p style="font-size:13px;font-weight:500;color:rgba(255,255,255,0.5);max-width:240px;line-height:1.5;margin:0;">
                        Nessun compito o verifica programmata per questo giorno.
                    </p>
                </div>`}
            </div>
        </div><!-- /planner-content-area -->

        <!-- ══ FLOATING ACTIONS (Apple Liquid Glass Aligned Dock) ══ -->
        <div style="position:fixed;bottom:calc(110px + env(safe-area-inset-bottom,0px));right:20px;display:flex;flex-direction:column;align-items:center;gap:12px;z-index:40;">
            <button onclick="window.openClassActivitiesExportModal&&openClassActivitiesExportModal();" title="Esporta attività" class="liquid-glass-v8 rim-light shadow-lg" style="width:48px;height:48px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:0.5px solid rgba(255,255,255,0.18);border-top:1px solid rgba(255,255,255,0.3);background:rgba(20,31,54,0.85);backdrop-filter:blur(24px);-webkit-backdrop-filter:blur(24px);color:#2997ff;cursor:pointer;transition:transform 0.15s ease;box-shadow:0 8px 24px -4px rgba(0,0,0,0.5);" ontouchstart="this.style.transform='scale(0.9)'" ontouchend="this.style.transform='scale(1)'">
                <i class="ph-bold ph-export" style="font-size:20px;"></i>
            </button>
            <button onclick="showQuickAddTaskModal()" title="Aggiungi attività" class="shadow-2xl" style="width:54px;height:54px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:1px solid rgba(255,255,255,0.35);background:linear-gradient(135deg,#2997ff 0%,#0058bc 100%);color:#ffffff;cursor:pointer;transition:transform 0.15s ease;box-shadow:0 8px 28px rgba(41,151,255,0.5);" ontouchstart="this.style.transform='scale(0.92)'" ontouchend="this.style.transform='scale(1)'">
                <i class="ph-bold ph-plus" style="font-size:26px;"></i>
            </button>
        </div>

    </div>`;
}



// ══════════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════════
// CLASS REPRESENTATIVE & PROPOSALS SYSTEM (Supabase Realtime & Backend Sync)
// ══════════════════════════════════════════════════════════════════════════════

function getEffectiveUserClass() {
    const override = localStorage.getItem('gc_user_class_override');
    if (override) {
        const normOverride = (typeof normalizeClassUi === 'function') ? normalizeClassUi(override) : override;
        if (normOverride && normOverride !== 'N/D' && normOverride !== 'Studente') {
            return normOverride.trim().toUpperCase();
        }
    }
    const savedSession = (typeof sessionManager !== 'undefined' && sessionManager.load) ? sessionManager.load() : null;
    const candidates = [
        { c: state.user?.class, t: state.user?.specialization },
        { c: state.userData?.class, t: state.userData?.specialization },
        { c: savedSession?.class, t: savedSession?.specialization },
        { c: localStorage.getItem('gc_cached_user_class'), t: null }
    ];
    for (const cand of candidates) {
        if (cand.c && cand.c !== '...' && cand.c !== 'N/D' && cand.c !== 'Studente') {
            const norm = (typeof normalizeClassUi === 'function') ? normalizeClassUi(cand.c, cand.t) : cand.c;
            if (norm && norm !== '...' && norm !== 'N/D' && norm !== 'Studente') {
                const res = norm.trim().toUpperCase();
                try { localStorage.setItem('gc_cached_user_class', res); } catch(_) {}
                return res;
            }
        }
    }
    return '';
}

function getClassRepresentativeStorageKey(className) {
    return 'gc_class_reps_' + (className || 'DEFAULT').toUpperCase();
}

function getClassProposalsStorageKey(className) {
    return 'gc_class_proposals_' + (className || 'DEFAULT').toUpperCase();
}

function getStoredClassRepresentatives(className) {
    const key = getClassRepresentativeStorageKey(className);
    try {
        const data = JSON.parse(localStorage.getItem(key));
        return Array.isArray(data) ? data : [];
    } catch (e) {
        return [];
    }
}

function saveStoredClassRepresentatives(className, reps) {
    const key = getClassRepresentativeStorageKey(className);
    localStorage.setItem(key, JSON.stringify(reps || []));
}

function getStoredClassProposals(className) {
    const key = getClassProposalsStorageKey(className);
    try {
        const data = JSON.parse(localStorage.getItem(key));
        if (Array.isArray(data)) return data;
    } catch (e) {}
    return [];
}

function saveStoredClassProposals(className, props) {
    const key = getClassProposalsStorageKey(className);
    localStorage.setItem(key, JSON.stringify(props || []));
}

function isCurrentUserRepresentative() {
    const userClass = getEffectiveUserClass();
    if (!userClass) return false;
    const userId = String(state.user?.id || 'utente');
    const reps = getStoredClassRepresentatives(userClass);
    return reps.some(r => String(r.userId || r.user_id) === userId);
}

// ── Remote Database Fetching & Realtime Synchronization ──
window._classRealtimeChannel = null;
window._classRealtimeSubscribedClass = null;
window._isFetchingClassData = false;

window._fetchClassDataSilent = async function(className) {
    const targetClass = className || getEffectiveUserClass();
    if (!targetClass) return;
    if (window._isFetchingClassDataSilent) return;
    window._isFetchingClassDataSilent = true;
    try {
        const apiBase = window.API_BASE_URL || (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '');
        const res = await fetch(`${apiBase}/api/class-representative?class=${encodeURIComponent(targetClass)}`);
        const json = await res.json();
        if (json && json.success) {
            if (Array.isArray(json.representatives)) {
                saveStoredClassRepresentatives(targetClass, json.representatives);
            }
            if (Array.isArray(json.proposals)) {
                saveStoredClassProposals(targetClass, json.proposals);
            }
        }
    } catch (err) {
        console.warn('[ClassDataSync] Silent fetch failed:', err.message);
    } finally {
        window._isFetchingClassDataSilent = false;
    }
};

window.fetchRemoteClassData = async function(className, forceRender = false) {
    const targetClass = className || getEffectiveUserClass();
    if (!targetClass) return;
    if (window._isFetchingClassData) return;
    window._isFetchingClassData = true;

    try {
        const apiBase = window.API_BASE_URL || (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '');
        const res = await fetch(`${apiBase}/api/class-representative?class=${encodeURIComponent(targetClass)}`);
        const json = await res.json();
        if (json && json.success) {
            if (Array.isArray(json.representatives)) {
                saveStoredClassRepresentatives(targetClass, json.representatives);
            }
            if (Array.isArray(json.proposals)) {
                saveStoredClassProposals(targetClass, json.proposals);
            }
            // If the notification overlay is open, do a soft in-place content refresh
            if (document.getElementById('today-notif-overlay') && typeof window.openTodayNotifications === 'function') {
                const scrollContainer = document.getElementById('today-notif-overlay')?.querySelector('[style*="overflow-y"]');
                const currentScroll = scrollContainer?.scrollTop || 0;
                window.openTodayNotifications(); // Will do in-place update since overlay exists
                const updatedScroll = document.getElementById('today-notif-overlay')?.querySelector('[style*="overflow-y"]');
                if (updatedScroll && currentScroll > 0) updatedScroll.scrollTop = currentScroll;
            } else if (forceRender) {
                state._forceRender = true;
                scheduleRender(0);
            }
        }
    } catch (err) {
        console.warn('[ClassDataSync] Remote fetch failed:', err.message);
    } finally {
        window._isFetchingClassData = false;
    }
};

window.setupClassRealtimeSubscription = async function() {
    const userClass = getEffectiveUserClass();
    if (!userClass) return;
    if (window._classRealtimeSubscribedClass === userClass && window._classRealtimeChannel) return;

    try {
        const client = typeof getSupabaseClient === 'function' 
            ? await getSupabaseClient() 
            : (typeof window.getSupabaseClient === 'function' ? await window.getSupabaseClient() : null);
        if (!client) return;

        if (window._classRealtimeChannel) {
            try { client.removeChannel(window._classRealtimeChannel); } catch (_) {}
            window._classRealtimeChannel = null;
        }

        window._classRealtimeSubscribedClass = userClass;

        // Debounced handler: coalesce rapid-fire Realtime events
        const debouncedFetch = () => {
            clearTimeout(window._classRealtimeDebounce);
            window._classRealtimeDebounce = setTimeout(() => {
                window.fetchRemoteClassData(userClass, true);
            }, 500);
        };

        window._classRealtimeChannel = client
            .channel('realtime:class:' + userClass)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'proposals', filter: `class_id=eq.${userClass}` }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'proposal_votes' }, debouncedFetch)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'class_representatives', filter: `class=eq.${userClass}` }, debouncedFetch)
            .subscribe((status) => {
                if (status === 'SUBSCRIBED') {
                    console.log(`[Supabase Realtime] Connected to class room: ${userClass}`);
                }
            });
    } catch (e) {
        console.warn('[ClassRealtime] Subscription error:', e.message);
    }
};

window.toggleClassRepresentative = async function(enable) {
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');

    let userClass = getEffectiveUserClass();
    if (!userClass) {
        window.promptSetUserClass((enteredClass) => {
            if (enteredClass) {
                window.toggleClassRepresentative(enable);
            }
        });
        return;
    }

    const userId = String(state.user?.id || 'utente');
    const userName = state.user?.name || 'Studente';
    const currentReps = getStoredClassRepresentatives(userClass);

    if (enable) {
        const isAlreadyRep = currentReps.some(r => String(r.userId || r.user_id) === userId);
        if (!isAlreadyRep) {
            // Rule: Maximum 2 active representatives per class
            if (currentReps.length >= 2) {
                if (typeof window.triggerHaptic === 'function') window.triggerHaptic('error');
                alert("Limite massimo raggiunto (2/2 Rappresentanti attivi per questa classe). Uno dei rappresentanti attuali deve prima disattivare il proprio ruolo.");
                state._forceRender = true;
                scheduleRender(0);
                return;
            }
            currentReps.push({
                userId,
                name: userName,
                class: userClass,
                updatedAt: new Date().toISOString()
            });
            saveStoredClassRepresentatives(userClass, currentReps);
            showToast('Ruolo Rappresentante di Classe attivato!', 'success');
        }
    } else {
        const updated = currentReps.filter(r => String(r.userId || r.user_id) !== userId);
        saveStoredClassRepresentatives(userClass, updated);
        showToast('Ruolo Rappresentante disattivato', 'info');
    }

    // Sync with remote database and handle backend limit validation
    try {
        const apiBase = window.API_BASE_URL || (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '');
        const res = await fetch(`${apiBase}/api/class-representative`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'set_representative',
                class: userClass,
                userId,
                userName,
                enable
            })
        });
        const json = await res.json();
        if (json.limitReached) {
            if (typeof window.triggerHaptic === 'function') window.triggerHaptic('error');
            alert(json.error || "Limite massimo raggiunto (2/2 Rappresentanti attivi per questa classe).");
            const reverted = currentReps.filter(r => String(r.userId || r.user_id) !== userId);
            saveStoredClassRepresentatives(userClass, reverted);
        } else if (json.success && Array.isArray(json.representatives)) {
            saveStoredClassRepresentatives(userClass, json.representatives);
        }
    } catch (e) {
        console.warn('[ClassRep] Sync error:', e.message);
    }

    state._forceRender = true;
    scheduleRender(0);
};

window.promptSetUserClass = function(callback) {
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');

    const overlay = document.createElement('div');
    overlay.id = 'set-class-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px;opacity:0;transition:opacity 0.2s ease;';

    const currentCls = getEffectiveUserClass();

    overlay.innerHTML = `
    <div style="width:100%;max-width:380px;background:rgba(20,31,54,0.88);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border:0.5px solid rgba(255,255,255,0.15);border-top:1px solid rgba(255,255,255,0.25);border-radius:28px;padding:24px;box-shadow:0 20px 50px rgba(0,0,0,0.6);display:flex;flex-direction:column;gap:16px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:38px;height:38px;border-radius:12px;background:rgba(41,151,255,0.15);border:1px solid rgba(41,151,255,0.3);display:flex;align-items:center;justify-content:center;color:#2997ff;">
                    <i class="ph-fill ph-graduation-cap text-[20px]"></i>
                </div>
                <h3 style="font-size:18px;font-weight:700;color:#ffffff;margin:0;">Seleziona Classe</h3>
            </div>
            <button onclick="document.getElementById('set-class-modal-overlay')?.remove();" style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.6);display:flex;align-items:center;justify-content:center;cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:18px;">close</span>
            </button>
        </div>
        <p style="font-size:13px;color:rgba(255,255,255,0.7);line-height:1.45;margin:0;">
            Non siamo riusciti a rilevare automaticamente la tua classe dal registro. Inserisci la tua classe e indirizzo (es. <strong>4D (SA)</strong>, <strong>5A (LS)</strong>, <strong>3B</strong>) per attivare le funzioni di classe.
        </p>
        <div>
            <label style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px;">Nome Classe e Indirizzo</label>
            <input id="user-manual-class-input" type="text" placeholder="Es. 4D (SA)" value="${escapeHtml(currentCls)}" style="width:100%;height:46px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:0 14px;color:#ffffff;font-size:16px;font-weight:700;outline:none;box-sizing:border-box;text-transform:uppercase;" />
        </div>
        <div style="display:flex;gap:10px;margin-top:6px;">
            <button onclick="document.getElementById('set-class-modal-overlay')?.remove();" style="flex:1;height:46px;border-radius:14px;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.12);color:rgba(255,255,255,0.8);font-size:14px;font-weight:600;cursor:pointer;">Annulla</button>
            <button id="save-manual-class-btn" style="flex:1;height:46px;border-radius:14px;background:#2997ff;border:none;color:#ffffff;font-size:14px;font-weight:700;cursor:pointer;box-shadow:0 4px 14px rgba(41,151,255,0.4);">Salva</button>
        </div>
    </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    document.getElementById('save-manual-class-btn').onclick = function() {
        const inp = document.getElementById('user-manual-class-input');
        const val = (inp?.value || '').trim().toUpperCase();
        if (!val) {
            alert('Inserisci una classe valida (es. 4D (SA))');
            return;
        }
        const normVal = (typeof normalizeClassUi === 'function') ? (normalizeClassUi(val) || val) : val;
        if (!state.user) state.user = {};
        state.user.class = normVal;
        localStorage.setItem('gc_user_class_override', normVal);
        showToast(`Classe impostata: ${normVal}`, 'success');
        overlay.remove();
        if (typeof callback === 'function') callback(normVal);
        state._forceRender = true;
        scheduleRender(0);
    };
};

// ── Inline Modal Calendar & Hour Picker Support ──
window._modalCalStates = {};

window._createModalCalendarState = function(initialIso) {
    const sel = new Date((initialIso || getLocalDateString(new Date())) + 'T00:00:00');
    return {
        selectedIso: initialIso || getLocalDateString(new Date()),
        year: sel.getFullYear(),
        month: sel.getMonth()
    };
};

window._renderInlineCalendarHTML = function(containerId) {
    const calState = window._modalCalStates[containerId];
    if (!calState) return '';

    const MN_FULL = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                     'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const { year, month, selectedIso } = calState;
    const todayISO = getLocalDateString(new Date());

    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; 

    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<div></div>');

    for (let d = 1; d <= lastDay.getDate(); d++) {
        const iso       = year + '-' + String(month + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
        const isToday   = iso === todayISO;
        const isSel     = iso === selectedIso;
        const hasVerif  = (state.verifiche  || []).some(function(v){ return (v.data||v.date||'') === iso; });
        const hasTask   = (state.tasks      || []).some(function(t){ return t.due_date === iso && t.subject !== 'QUEST' && !t.done; });
        const dotColor  = hasVerif ? '#ff453a' : '#2997ff';

        let bg = 'transparent', color = '#ffffff', fw = '500', ring = 'none', shadow = 'none';
        if (isSel)   { bg = '#2997ff'; color = '#ffffff'; fw = '700'; shadow = '0 4px 12px rgba(41,151,255,0.45)'; }
        else if (isToday) { bg = 'rgba(41,151,255,0.15)'; color = '#2997ff'; fw = '700'; ring = '1px solid rgba(41,151,255,0.3)'; }

        const dot = (hasTask || hasVerif) && !isSel
            ? '<span style="position:absolute;bottom:3px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;display:block;background:' + dotColor + ';"></span>'
            : '';

        cells.push(
            '<button type="button" onclick="window._onModalCalSelect(\'' + containerId + '\',\'' + iso + '\')" ' +
            'style="position:relative;width:100%;aspect-ratio:1/1;border-radius:50%;border:' + ring + ';' +
            'cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
            'background:' + bg + ';' +
            'box-shadow:' + shadow + ';' +
            'font-size:13px;font-weight:' + fw + ';color:' + color + ';' +
            'font-family:\'Inter\',sans-serif;transition:transform 0.1s ease;' +
            '-webkit-tap-highlight-color:transparent;" ' +
            'ontouchstart="this.style.transform=\'scale(0.88)\'" ontouchend="this.style.transform=\'scale(1)\'">' +
            d + dot + '</button>'
        );
    }

    const dayVerifiche = (state.verifiche || []).concat(state.manualVerifiche || [])
        .filter(v => (v.data || v.date || '') === selectedIso);
    const dayTasks = (state.tasks || []).filter(t => t.due_date === selectedIso && t.subject !== 'QUEST' && !t.done);

    let eventsInfo = '';
    if (dayVerifiche.length > 0) {
        eventsInfo = `<div style="display:flex;align-items:center;gap:6px;color:#ff453a;font-size:11px;font-weight:600;"><span class="material-symbols-outlined" style="font-size:15px;">warning</span> Verifica: ${escapeHtml(dayVerifiche.map(v => v.materia || v.subject).join(', '))}</div>`;
    } else if (dayTasks.length > 0) {
        eventsInfo = `<div style="display:flex;align-items:center;gap:6px;color:#2997ff;font-size:11px;font-weight:600;"><span class="material-symbols-outlined" style="font-size:15px;">assignment</span> ${dayTasks.length} compiti</div>`;
    } else {
        eventsInfo = `<div style="display:flex;align-items:center;gap:6px;color:#30d158;font-size:11px;font-weight:600;"><span class="material-symbols-outlined" style="font-size:15px;">check_circle</span> Nessun impegno</div>`;
    }

    return `
    <div style="background:rgba(255,255,255,0.04);border:1px solid rgba(255,255,255,0.1);border-radius:20px;padding:12px 14px;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px;">
            <button type="button" onclick="window._onModalCalNav('${containerId}', -1)" style="width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:#2997ff;display:flex;align-items:center;justify-content:center;cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:18px;">chevron_left</span>
            </button>
            <div style="font-size:14px;font-weight:700;color:#ffffff;">${MN_FULL[month]} ${year}</div>
            <button type="button" onclick="window._onModalCalNav('${containerId}', 1)" style="width:30px;height:30px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:#2997ff;display:flex;align-items:center;justify-content:center;cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:18px;">chevron_right</span>
            </button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);text-align:center;font-size:10px;font-weight:700;color:rgba(255,255,255,0.45);margin-bottom:6px;">
            ${['L','M','M','G','V','S','D'].map(l => `<div>${l}</div>`).join('')}
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:2px;margin-bottom:10px;">
            ${cells.join('')}
        </div>
        <div style="padding-top:8px;border-top:1px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;">
            <span style="font-size:11px;color:rgba(255,255,255,0.7);">Data: <strong style="color:#2997ff;">${selectedIso}</strong></span>
            ${eventsInfo}
        </div>
    </div>
    `;
};

window._onModalCalNav = function(containerId, delta) {
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');
    const calState = window._modalCalStates[containerId];
    if (!calState) return;
    calState.month += delta;
    if (calState.month < 0) { calState.month = 11; calState.year--; }
    if (calState.month > 11) { calState.month = 0; calState.year++; }
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = window._renderInlineCalendarHTML(containerId);
};

window._onModalCalSelect = function(containerId, iso) {
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');
    const calState = window._modalCalStates[containerId];
    if (!calState) return;
    calState.selectedIso = iso;
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = window._renderInlineCalendarHTML(containerId);
};

window._selectedAssemblyHours = ['4ª Ora', '5ª Ora'];

window._toggleAssemblyHour = function(hour) {
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');
    if (!Array.isArray(window._selectedAssemblyHours)) window._selectedAssemblyHours = [];

    const idx = window._selectedAssemblyHours.indexOf(hour);
    if (idx >= 0) {
        window._selectedAssemblyHours.splice(idx, 1);
    } else {
        if (window._selectedAssemblyHours.length >= 2) {
            window._selectedAssemblyHours.shift(); // remove oldest to keep max 2
        }
        window._selectedAssemblyHours.push(hour);
    }
    window._updateAssemblyHoursUI();
};

window._updateAssemblyHoursUI = function() {
    const allHours = ['1ª Ora', '2ª Ora', '3ª Ora', '4ª Ora', '5ª Ora'];
    allHours.forEach(h => {
        const btn = document.getElementById('ashour-btn-' + h.replace(/\s/g, ''));
        if (btn) {
            const isSel = (window._selectedAssemblyHours || []).includes(h);
            btn.style.background = isSel ? '#30d158' : 'rgba(255,255,255,0.08)';
            btn.style.color = isSel ? '#ffffff' : 'rgba(255,255,255,0.8)';
            btn.style.borderColor = isSel ? '#30d158' : 'rgba(255,255,255,0.15)';
        }
    });
    const label = document.getElementById('ashour-selected-label');
    if (label) {
        const count = (window._selectedAssemblyHours || []).length;
        label.textContent = count > 0 
            ? `Selezionate: ${window._selectedAssemblyHours.join(', ')} (${count}/2 ore)`
            : `Nessuna ora selezionata (seleziona max 2)`;
    }
};

window.openRequestAssemblyModal = function() {
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');

    let userClass = getEffectiveUserClass();
    if (!userClass) {
        window.promptSetUserClass((cls) => {
            if (cls) window.openRequestAssemblyModal();
        });
        return;
    }

    const defaultDate = state.selectedDate || getLocalDateString(new Date());
    window._modalCalStates['assembly-cal-container'] = window._createModalCalendarState(defaultDate);
    window._selectedAssemblyHours = ['4ª Ora', '5ª Ora'];

    const overlay = document.createElement('div');
    overlay.id = 'request-assembly-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);z-index:99999;display:flex;align-items:flex-end;justify-content:center;padding:0;opacity:0;transition:opacity 0.2s ease;';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

    const hoursChips = ['1ª Ora', '2ª Ora', '3ª Ora', '4ª Ora', '5ª Ora'].map(h => {
        const isSel = window._selectedAssemblyHours.includes(h);
        return `<button type="button" id="ashour-btn-${h.replace(/\s/g, '')}" onclick="window._toggleAssemblyHour('${h}')" style="flex:1;min-height:44px;border-radius:12px;border:1px solid ${isSel ? '#30d158' : 'rgba(255,255,255,0.15)'};background:${isSel ? '#30d158' : 'rgba(255,255,255,0.08)'};color:${isSel ? '#ffffff' : 'rgba(255,255,255,0.8)'};font-size:12px;font-weight:700;cursor:pointer;transition:all 0.15s ease;-webkit-tap-highlight-color:transparent;">${h}</button>`;
    }).join('');

    overlay.innerHTML = `
    <div style="width:100%;max-width:440px;max-height:88dvh;overflow-y:auto;background:rgba(20,31,54,0.92);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-top:1px solid rgba(255,255,255,0.22);border-radius:32px 32px 0 0;padding:20px 20px calc(28px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:16px;box-sizing:border-box;">
        <div data-drag-handle style="display:flex;justify-content:center;padding:4px 0 6px;cursor:grab;">
            <div style="width:40px;height:4px;border-radius:999px;background:rgba(255,255,255,0.25);"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:40px;height:40px;border-radius:12px;background:rgba(48,209,88,0.15);border:1px solid rgba(48,209,88,0.3);display:flex;align-items:center;justify-content:center;color:#30d158;">
                    <i class="ph-fill ph-users-three text-[22px]"></i>
                </div>
                <div>
                    <h3 style="font-size:18px;font-weight:700;color:#ffffff;margin:0;">Richiedi Assemblea</h3>
                    <p style="font-size:12px;color:rgba(255,255,255,0.6);margin:2px 0 0;">Classe ${escapeHtml(userClass)}</p>
                </div>
            </div>
            <button onclick="document.getElementById('request-assembly-modal')?.remove();" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.7);display:flex;align-items:center;justify-content:center;cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:20px;">close</span>
            </button>
        </div>

        <!-- Selettore Data con Calendario e Indicatori Verifiche/Compiti -->
        <div>
            <label style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px;">Scegli Data Assemblea</label>
            <div id="assembly-cal-container">
                ${window._renderInlineCalendarHTML('assembly-cal-container')}
            </div>
        </div>

        <!-- Selettore 5 Ore Scolastiche (Max 2 ore) -->
        <div>
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                <label style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;margin:0;">Ore Assemblea (Max 2 ore)</label>
                <span id="ashour-selected-label" style="font-size:11px;color:#30d158;font-weight:600;">Selezionate: 4ª Ora, 5ª Ora (2/2)</span>
            </div>
            <div style="display:flex;gap:6px;">
                ${hoursChips}
            </div>
        </div>

        <div>
            <label style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px;">Ordine del Giorno / Motivazione</label>
            <textarea id="assembly-reason-input" placeholder="Es. Discussione gita scolastica, organizzazione eventi..." rows="3" style="width:100%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:12px 14px;color:#ffffff;font-size:14px;font-weight:500;outline:none;box-sizing:border-box;resize:none;line-height:1.4;"></textarea>
        </div>

        <button id="submit-assembly-btn" style="width:100%;min-height:50px;border-radius:16px;background:linear-gradient(180deg,#30d158 0%,#28b84d 100%);border:none;color:#ffffff;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 6px 20px rgba(48,209,88,0.35);margin-top:4px;">
            <i class="ph-bold ph-paper-plane-tilt text-[18px]"></i>
            Invia Richiesta alla Classe
        </button>
    </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    document.getElementById('submit-assembly-btn').onclick = function() {
        const targetDate = window._modalCalStates['assembly-cal-container']?.selectedIso || defaultDate;
        const selectedHours = window._selectedAssemblyHours || [];
        const reason = (document.getElementById('assembly-reason-input')?.value || '').trim();

        if (!targetDate) { alert('Seleziona una data per l\'assemblea'); return; }
        if (!selectedHours.length) { alert('Seleziona almeno 1 ora scolastica (max 2)'); return; }
        if (!reason) { alert('Inserisci l\'ordine del giorno o la motivazione'); return; }

        if (typeof window.triggerHaptic === 'function') window.triggerHaptic('medium');

        window.submitClassProposal({
            type: 'assembly',
            class: userClass,
            targetDate,
            duration: selectedHours.join(', '),
            reason
        });

        overlay.remove();
        showToast('Richiesta assemblea inviata ai compagni e rappresentanti!', 'success');
    };
};

window.openRescheduleExamModal = function() {
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');

    let userClass = getEffectiveUserClass();
    if (!userClass) {
        window.promptSetUserClass((cls) => {
            if (cls) window.openRescheduleExamModal();
        });
        return;
    }

    const defaultDate = state.selectedDate || getLocalDateString(new Date());
    window._modalCalStates['reschedule-cal-container'] = window._createModalCalendarState(defaultDate);

    const upcomingVerifiche = (state.verifiche || []).concat(state.manualVerifiche || [])
        .filter(v => (v.data || v.date || '') >= getLocalDateString(new Date()))
        .map(v => ({
            id: v.id,
            subject: v.materia || v.subject || 'Verifica',
            date: v.data || v.date || '',
            desc: v.text || v.descrizione || v.args || ''
        }));

    const subjectOptions = upcomingVerifiche.map(v => 
        `<option value="${escapeHtml(v.subject)}||${escapeHtml(v.date)}">${escapeHtml(v.subject)} (${v.date})</option>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.id = 'reschedule-exam-modal';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.65);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);z-index:99999;display:flex;align-items:flex-end;justify-content:center;padding:0;opacity:0;transition:opacity 0.2s ease;';
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

    overlay.innerHTML = `
    <div style="width:100%;max-width:440px;max-height:88dvh;overflow-y:auto;background:rgba(20,31,54,0.92);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-top:1px solid rgba(255,255,255,0.22);border-radius:32px 32px 0 0;padding:20px 20px calc(28px + env(safe-area-inset-bottom,0px));box-shadow:0 -10px 40px rgba(0,0,0,0.5);display:flex;flex-direction:column;gap:16px;box-sizing:border-box;">
        <div data-drag-handle style="display:flex;justify-content:center;padding:4px 0 6px;cursor:grab;">
            <div style="width:40px;height:4px;border-radius:999px;background:rgba(255,255,255,0.25);"></div>
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;">
            <div style="display:flex;align-items:center;gap:10px;">
                <div style="width:40px;height:40px;border-radius:12px;background:rgba(255,159,10,0.15);border:1px solid rgba(255,159,10,0.3);display:flex;align-items:center;justify-content:center;color:#ff9f0a;">
                    <i class="ph-fill ph-calendar-plus text-[22px]"></i>
                </div>
                <div>
                    <h3 style="font-size:18px;font-weight:700;color:#ffffff;margin:0;">Sposta Verifica</h3>
                    <p style="font-size:12px;color:rgba(255,255,255,0.6);margin:2px 0 0;">Classe ${escapeHtml(userClass)}</p>
                </div>
            </div>
            <button onclick="document.getElementById('reschedule-exam-modal')?.remove();" style="width:36px;height:36px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;color:rgba(255,255,255,0.7);display:flex;align-items:center;justify-content:center;cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:20px;">close</span>
            </button>
        </div>

        <div>
            <label style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px;">Materia / Verifica da Spostare</label>
            ${subjectOptions ? `
            <select id="exam-select-picker" onchange="const p=this.value.split('||');if(p[1])document.getElementById('exam-orig-date-input').value=p[1];if(p[0])document.getElementById('exam-subject-input').value=p[0];" style="width:100%;height:48px;background:rgba(20,31,54,0.95);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:0 14px;color:#ffffff;font-size:14px;font-weight:600;outline:none;box-sizing:border-box;margin-bottom:8px;">
                <option value="">-- Seleziona Verifica Esistente --</option>
                ${subjectOptions}
                <option value="Altro||">Altra materia (inserimento manuale)</option>
            </select>` : ''}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">
                <input id="exam-subject-input" type="text" placeholder="Nome Materia (es. Matematica)" style="width:100%;height:46px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:0 14px;color:#ffffff;font-size:14px;font-weight:600;outline:none;box-sizing:border-box;" />
                <input id="exam-orig-date-input" type="date" value="${defaultDate}" style="width:100%;height:46px;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:0 12px;color:#ffffff;font-size:14px;font-weight:600;outline:none;box-sizing:border-box;" />
            </div>
        </div>

        <!-- Selettore Nuova Data con Calendario e Indicatori Verifiche/Compiti -->
        <div>
            <label style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px;">Nuova Data Proposta</label>
            <div id="reschedule-cal-container">
                ${window._renderInlineCalendarHTML('reschedule-cal-container')}
            </div>
        </div>

        <div>
            <label style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.5);text-transform:uppercase;letter-spacing:0.06em;display:block;margin-bottom:6px;">Motivazione dello Spostamento</label>
            <textarea id="exam-reason-input" placeholder="Es. Sovrapposizione con altra verifica, richiesta tempo per ripasso..." rows="3" style="width:100%;background:rgba(255,255,255,0.07);border:1px solid rgba(255,255,255,0.15);border-radius:14px;padding:12px 14px;color:#ffffff;font-size:14px;font-weight:500;outline:none;box-sizing:border-box;resize:none;line-height:1.4;"></textarea>
        </div>

        <button id="submit-reschedule-btn" style="width:100%;min-height:50px;border-radius:16px;background:linear-gradient(180deg,#ff9f0a 0%,#e08b00 100%);border:none;color:#ffffff;font-size:15px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 6px 20px rgba(255,159,10,0.35);margin-top:4px;">
            <i class="ph-bold ph-calendar-plus text-[18px]"></i>
            Proponi Spostamento alla Classe
        </button>
    </div>
    `;

    document.body.appendChild(overlay);
    requestAnimationFrame(() => { overlay.style.opacity = '1'; });

    document.getElementById('submit-reschedule-btn').onclick = function() {
        let subject = (document.getElementById('exam-subject-input')?.value || '').trim();
        const pickerVal = document.getElementById('exam-select-picker')?.value;
        if (!subject && pickerVal && !pickerVal.startsWith('Altro')) {
            subject = pickerVal.split('||')[0];
        }
        const originalDate = document.getElementById('exam-orig-date-input')?.value;
        const targetDate = window._modalCalStates['reschedule-cal-container']?.selectedIso || defaultDate;
        const reason = (document.getElementById('exam-reason-input')?.value || '').trim();

        if (!subject) { alert('Inserisci la materia della verifica'); return; }
        if (!targetDate) { alert('Seleziona la nuova data proposta'); return; }
        if (!reason) { alert('Inserisci la motivazione dello spostamento'); return; }

        if (typeof window.triggerHaptic === 'function') window.triggerHaptic('medium');

        window.submitClassProposal({
            type: 'exam_reschedule',
            class: userClass,
            subject,
            originalDate,
            targetDate,
            reason
        });

        overlay.remove();
        showToast('Proposta di spostamento verifica inviata!', 'success');
    };
};

window.submitClassProposal = async function(proposalData) {
    const userClass = proposalData.class || getEffectiveUserClass();
    const userId = String(state.user?.id || 'utente');
    const userName = state.user?.name || 'Studente';

    const newProp = {
        id: 'prop_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        type: proposalData.type,
        class: userClass,
        class_id: userClass,
        subject: proposalData.subject || null,
        originalDate: proposalData.originalDate || null,
        targetDate: proposalData.targetDate,
        duration: proposalData.duration || null,
        reason: proposalData.reason,
        authorId: userId,
        authorName: userName,
        status: 'pending',
        votes: {
            accept: [userId],
            decline: [],
            alternatives: []
        },
        createdAt: new Date().toISOString()
    };

    const currentProps = getStoredClassProposals(userClass);
    currentProps.unshift(newProp);
    saveStoredClassProposals(userClass, currentProps);

    // Soft refresh: update notification overlay in-place if open
    if (document.getElementById('today-notif-overlay') && typeof window.openTodayNotifications === 'function') {
        window.openTodayNotifications(); // In-place update, no re-creation
    } else {
        state._forceRender = true;
        scheduleRender(0);
    }

    // Sync in background with backend
    try {
        const apiBase = window.API_BASE_URL || (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '');
        const res = await fetch(`${apiBase}/api/class-representative`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'create_proposal',
                ...proposalData,
                class: userClass,
                authorId: userId,
                authorName: userName
            })
        });
        const json = await res.json();
        if (json && json.success && json.proposal) {
            // Replace temporary optimistic proposal with real persisted database proposal
            const current = getStoredClassProposals(userClass);
            const idx = current.findIndex(p => p.id === newProp.id);
            if (idx >= 0) {
                current[idx] = json.proposal;
            } else if (!current.some(p => p.id === json.proposal.id)) {
                current.unshift(json.proposal);
            }
            saveStoredClassProposals(userClass, current);
            if (document.getElementById('today-notif-overlay') && typeof window.openTodayNotifications === 'function') {
                window.openTodayNotifications();
            }
            window._fetchClassDataSilent(userClass);
        }
    } catch (e) {
        console.warn('[ClassProposal] Create sync failed:', e.message);
    }
};

window.voteClassProposal = async function(proposalId, voteType, alternativeDate, note) {
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');

    const userClass = getEffectiveUserClass();
    const userId = String(state.user?.id || 'utente');
    const userName = state.user?.name || 'Studente';
    const currentProps = getStoredClassProposals(userClass);
    const prop = currentProps.find(p => p.id === proposalId);
    if (!prop) return;

    if (!prop.votes) prop.votes = { accept: [], decline: [], alternatives: [] };
    if (!Array.isArray(prop.votes.accept)) prop.votes.accept = [];
    if (!Array.isArray(prop.votes.decline)) prop.votes.decline = [];
    if (!Array.isArray(prop.votes.alternatives)) prop.votes.alternatives = [];

    prop.votes.accept = prop.votes.accept.filter(id => id !== userId);
    prop.votes.decline = prop.votes.decline.filter(id => id !== userId);
    prop.votes.alternatives = prop.votes.alternatives.filter(a => a.userId !== userId);

    if (voteType === 'accept') {
        prop.votes.accept.push(userId);
        showToast('Hai votato a favore', 'success');
    } else if (voteType === 'decline') {
        prop.votes.decline.push(userId);
        showToast('Hai votato contro', 'info');
    } else if (voteType === 'alternative') {
        prop.votes.alternatives.push({
            userId,
            date: alternativeDate || prop.targetDate,
            note: note || ''
        });
        showToast('Proposta data alternativa inviata', 'success');
    }

    saveStoredClassProposals(userClass, currentProps);

    // Refresh notifications panel if open
    // Soft refresh: update notification overlay in-place if open
    if (document.getElementById('today-notif-overlay') && typeof window.openTodayNotifications === 'function') {
        openTodayNotifications(); // In-place update, no re-creation
    }

    // Sync in background with backend
    try {
        const apiBase = window.API_BASE_URL || (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '');
        await fetch(`${apiBase}/api/class-representative`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'vote',
                class: userClass,
                proposalId,
                userId,
                userName,
                voteType,
                alternativeDate,
                note
            })
        });
        // Realtime subscription handles sync. Silent fetch to keep cache fresh.
        window._fetchClassDataSilent(userClass);
    } catch (e) {
        console.warn('[ClassProposal] Vote sync failed:', e.message);
    }
};

window.manageClassProposal = async function(proposalId, newStatus) {
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('medium');

    const userClass = getEffectiveUserClass();
    const currentProps = getStoredClassProposals(userClass);
    const prop = currentProps.find(p => p.id === proposalId);
    if (!prop) return;

    prop.status = newStatus === 'approved' ? 'approved' : 'rejected';
    prop.managedAt = new Date().toISOString();
    saveStoredClassProposals(userClass, currentProps);

    showToast(newStatus === 'approved' ? 'Proposta approvata ufficialmente!' : 'Proposta archiviata', 'success');

    // Refresh notifications panel if open
    // Soft refresh: update notification overlay in-place if open
    if (document.getElementById('today-notif-overlay') && typeof window.openTodayNotifications === 'function') {
        openTodayNotifications(); // In-place update, no re-creation
    }

    // Sync in background with backend
    try {
        const apiBase = window.API_BASE_URL || (typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : '');
        await fetch(`${apiBase}/api/class-representative`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'manage_proposal',
                class: userClass,
                proposalId,
                status: prop.status
            })
        });
        // Realtime subscription handles sync. Silent fetch to keep cache fresh.
        window._fetchClassDataSilent(userClass);
    } catch (e) {
        console.warn('[ClassProposal] Manage sync failed:', e.message);
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// MONTH PICKER — bottom-sheet overlay per navigare all'anno scolastico
// Aperto dal badge mese nella header del planner.
// Gestisce il proprio DOM separatamente dal ciclo di render principale.
// ══════════════════════════════════════════════════════════════════════════════

window.openPlannerMonthPicker = function() {
    if (document.getElementById('month-picker-overlay')) {
        window.closePlannerMonthPicker();
        return;
    }
    const sel = new Date((state.selectedDate || getLocalDateString(new Date())) + 'T00:00:00');
    window._pk = { year: sel.getFullYear(), month: sel.getMonth() };
    window._renderMonthPicker();
};

window.closePlannerMonthPicker = function() {
    const el = document.getElementById('month-picker-overlay');
    if (el) {
        el.style.opacity = '0';
        el.style.transition = 'opacity 0.15s ease';
        setTimeout(() => el.remove(), 150);
    }
};

window._renderMonthPicker = function() {
    const MN_FULL = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                     'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const { year, month } = window._pk;
    const todayISO    = getLocalDateString(new Date());
    const selectedISO = state.selectedDate || todayISO;

    const firstDay = new Date(year, month, 1);
    const lastDay  = new Date(year, month + 1, 0);
    const startDow = (firstDay.getDay() + 6) % 7; 

    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push('<div></div>');

    for (let d = 1; d <= lastDay.getDate(); d++) {
        const iso       = year + '-' + String(month + 1).padStart(2,'0') + '-' + String(d).padStart(2,'0');
        const isToday   = iso === todayISO;
        const isSel     = iso === selectedISO;
        const hasVerif  = (state.verifiche  || []).some(function(v){ return (v.data||v.date||'') === iso; });
        const hasTask   = (state.tasks      || []).some(function(t){ return t.due_date === iso && t.subject !== 'QUEST' && !t.done; });
        const dotColor  = hasVerif ? '#ff453a' : '#2997ff';
        const dayMood   = (typeof window.getDailyMoodForDate === 'function') ? window.getDailyMoodForDate(iso) : null;

        let bg = 'transparent', color = '#ffffff', fw = '500', ring = 'none', shadow = 'none';
        if (isSel)   { bg = '#2997ff'; color = '#ffffff'; fw = '700'; shadow = '0 4px 14px rgba(41,151,255,0.5)'; }
        else if (isToday) { bg = 'rgba(41,151,255,0.18)'; color = '#2997ff'; fw = '700'; ring = '1px solid rgba(41,151,255,0.35)'; }

        let indicator = '';
        if (dayMood) {
            indicator = '<span style="position:absolute;bottom:2px;left:50%;transform:translateX(-50%);font-size:10px;line-height:1;">' + dayMood.emoji + '</span>';
        } else if ((hasTask || hasVerif) && !isSel) {
            indicator = '<span style="position:absolute;bottom:4px;left:50%;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;display:block;background:' + dotColor + ';"></span>';
        }

        cells.push(
            '<button onclick="window._pkSelectDay(\'' + iso + '\')" ' +
            'style="position:relative;width:100%;aspect-ratio:1/1;border-radius:50%;border:' + ring + ';' +
            'cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;' +
            'background:' + bg + ';' +
            'box-shadow:' + shadow + ';' +
            'font-size:14px;font-weight:' + fw + ';color:' + color + ';' +
            'font-family:\'Inter\',sans-serif;transition:transform 0.1s ease;' +
            '-webkit-tap-highlight-color:transparent;" ' +
            'ontouchstart="this.style.transform=\'scale(0.88)\'" ontouchend="this.style.transform=\'scale(1)\'">' +
            d + indicator + '</button>'
        );
    }

    const schoolYear = (month >= 8) ? year + '\u2013' + (year + 1) : (year - 1) + '\u2013' + year;

    const innerHTML = 
        '<div data-drag-handle style="display:flex;justify-content:center;padding:16px 0 6px;cursor:grab;touch-action:none;">' +
            '<div style="width:40px;height:4px;border-radius:999px;background:rgba(255,255,255,0.25);"></div>' +
        '</div>' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 20px 8px;">' +
            '<button onclick="window._pkPrev()" class="liquid-glass-v8 squircle-full rim-light" style="width:38px;height:38px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#ffffff;background:rgba(255,255,255,0.08);">' +
                '<span class="material-symbols-outlined" style="font-size:20px;color:#2997ff;">chevron_left</span>' +
            '</button>' +
            '<div style="text-align:center;">' +
                '<div style="font-size:18px;font-weight:700;color:#ffffff;letter-spacing:-0.02em;">' + MN_FULL[month] + ' ' + year + '</div>' +
                '<div style="font-size:10px;font-weight:700;color:rgba(255,255,255,0.6);letter-spacing:0.06em;text-transform:uppercase;margin-top:1px;">A.S.\u00a0' + schoolYear + '</div>' +
            '</div>' +
            '<div style="display:flex;align-items:center;gap:6px;">' +
                '<button onclick="window._pkNext()" class="liquid-glass-v8 squircle-full rim-light" style="width:38px;height:38px;border-radius:50%;border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;color:#ffffff;background:rgba(255,255,255,0.08);">' +
                    '<span class="material-symbols-outlined" style="font-size:20px;color:#2997ff;">chevron_right</span>' +
                '</button>' +
                '<button onclick="window.closePlannerMonthPicker()" style="padding:6px 14px;border-radius:9999px;background:rgba(41,151,255,0.18);border:1px solid rgba(41,151,255,0.35);color:#2997ff;font-size:12px;font-weight:700;cursor:pointer;min-height:36px;display:flex;align-items:center;justify-content:center;">Fine</button>' +
            '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(7,1fr);padding:10px 16px 4px;">' +
            ['L','M','M','G','V','S','D'].map(function(l){ return '<div style="text-align:center;font-size:11px;font-weight:700;color:rgba(255,255,255,0.45);">' + l + '</div>'; }).join('') +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;padding:0 16px;">' + cells.join('') + '</div>' +
        
        // ── Interactive Action Triggers in Calendar (Apple Liquid Glass) ──
        '<div style="padding:14px 16px 0;display:flex;flex-direction:column;gap:8px;">' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;">' +
                '<button onclick="window.openRequestAssemblyModal()" style="min-height:48px;padding:10px 12px;background:rgba(48,209,88,0.14);border:1px solid rgba(48,209,88,0.35);border-radius:16px;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;color:#30d158;font-size:13px;font-weight:700;font-family:\'Inter\',sans-serif;-webkit-tap-highlight-color:transparent;" ontouchstart="this.style.transform=\'scale(0.96)\'" ontouchend="this.style.transform=\'scale(1)\'">' +
                    '<i class="ph-fill ph-users-three text-[18px]"></i>' +
                    '<span>Assemblea</span>' +
                '</button>' +
                '<button onclick="window.openRescheduleExamModal()" style="min-height:48px;padding:10px 12px;background:rgba(255,159,10,0.14);border:1px solid rgba(255,159,10,0.35);border-radius:16px;display:flex;align-items:center;justify-content:center;gap:8px;cursor:pointer;color:#ff9f0a;font-size:13px;font-weight:700;font-family:\'Inter\',sans-serif;-webkit-tap-highlight-color:transparent;" ontouchstart="this.style.transform=\'scale(0.96)\'" ontouchend="this.style.transform=\'scale(1)\'">' +
                    '<i class="ph-fill ph-calendar-plus text-[18px]"></i>' +
                    '<span>Sposta Verifica</span>' +
                '</button>' +
            '</div>' +
        '</div>';

    // FIX SCATTO MESE: Aggiorniamo solo il contenuto senza rimuovere l'overlay!
    const existing = document.getElementById('month-picker-overlay');
    if (existing) {
        const card = existing.querySelector('.month-picker-card');
        if (card) card.innerHTML = innerHTML;
        return;
    }

    const overlay = document.createElement('div');
    overlay.id = 'month-picker-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(7,13,27,0.7);backdrop-filter:blur(20px) saturate(180%);-webkit-backdrop-filter:blur(20px) saturate(180%);z-index:9000;display:flex;align-items:flex-end;justify-content:center;padding:0;opacity:0;transition:opacity 0.18s ease;';
    overlay.onclick = function(e) { if (e.target === overlay) window.closePlannerMonthPicker(); };

    const card = document.createElement('div');
    card.className = 'month-picker-card';
    card.style.cssText = 'width:100%;max-width:430px;background:rgba(20,31,54,0.85);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);border-top:1px solid rgba(255,255,255,0.22);border-radius:32px 32px 0 0;padding:0 0 calc(24px + env(safe-area-inset-bottom,0px)) 0;box-shadow:0 -8px 36px rgba(0,0,0,0.5);overflow:hidden;transform:translateY(100%);transition:transform 0.28s cubic-bezier(0.2,0.8,0.2,1);';
    card.innerHTML = innerHTML;

    overlay.appendChild(card);
    document.body.appendChild(overlay);

    requestAnimationFrame(function() {
        overlay.style.opacity = '1';
        card.style.transform  = 'translateY(0px)';
    });

    // ── Drag-to-dismiss sul drag handle ─────────────────────────────────────
    var handle = card.querySelector('[data-drag-handle]');
    if (!handle) handle = card.firstElementChild; // fallback: prima div (drag handle)
    var startY = 0, currentY = 0, dragging = false;
    function onTouchStart(e) {
        startY = e.touches[0].clientY;
        currentY = 0;
        dragging = true;
        card.style.transition = 'none';
    }
    function onTouchMove(e) {
        if (!dragging) return;
        currentY = e.touches[0].clientY - startY;
        if (currentY < 0) currentY = 0;
        card.style.transform = 'translateY(' + currentY + 'px)';
    }
    function onTouchEnd() {
        if (!dragging) return;
        dragging = false;
        card.style.transition = 'transform 0.28s cubic-bezier(0.2,0.8,0.2,1)';
        if (currentY > 100) {
            window.closePlannerMonthPicker();
        } else {
            card.style.transform = 'translateY(0px)';
        }
    }
    handle.addEventListener('touchstart', onTouchStart, { passive: true });
    handle.addEventListener('touchmove',  onTouchMove,  { passive: true });
    handle.addEventListener('touchend',   onTouchEnd);
};

window._pkPrev = function() {
    window._pk.month--;
    if (window._pk.month < 0) { window._pk.month = 11; window._pk.year--; }
    window._renderMonthPicker();
};

window._pkNext = function() {
    window._pk.month++;
    if (window._pk.month > 11) { window._pk.month = 0; window._pk.year++; }
    window._renderMonthPicker();
};

window._pkSelectDay = function(iso) {
    state.selectedDate = iso;
    window._plannerDayContentCache = null;
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');
    window._renderMonthPicker(); // Highlights the tapped date and keeps modal open!
    state._forceRender = true;
    scheduleRender(0); // Updates background planner
};


// ══════════════════════════════════════════════════════════════════════════════
// refreshPlannerSearch — aggiornamento CHIRURGICO dei risultati ricerca
// Aggiorna solo #planner-content-area senza toccare header, search bar o carousel.
// Chiamata dall'oninput della search bar e dai chip filtro materia.
// ══════════════════════════════════════════════════════════════════════════════
// ── Builder chirurgico day content (usato da refreshPlannerSearch quando query svuotata) ──
window._buildPlannerDayContentHTML = function() {
    const TC = window._plannerTC;
    if (!TC) return null;
    const MN = window._plannerMN || ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                                      'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const dayLabels  = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
    const today      = new Date(); today.setHours(0,0,0,0);
    const todayISO   = getLocalDateString(today);
    const selDate    = state.selectedDate || todayISO;
    const allTasks   = (state.tasks || []).filter(function(t){ return t.subject !== 'QUEST'; });
    const dayTasks   = allTasks.filter(function(t){ return t.due_date === selDate; });
    const upcoming   = allTasks.filter(function(t){
        if(t.done) return false;
        try { var d = parseLocalDate(t.due_date); var diff = (d-today)/86400000; return diff > 0 && diff <= 7; }
        catch(e){ return false; }
    }).length;
    var d    = new Date(selDate + 'T00:00:00');
    var diff = Math.round((d-today)/86400000);
    var base = dayLabels[d.getDay()] + ' ' + d.getDate() + ' ' + MN[d.getMonth()];
    var dayLabel = diff===0 ? 'Oggi · '+base : diff===1 ? 'Domani · '+base : diff===-1 ? 'Ieri · '+base : base;
    var smart = upcoming > 0 && selDate === todayISO
        ? '<div class="liquid-glass-v8 squircle-md rim-light" style="padding:16px 18px;background:linear-gradient(135deg, rgba(47,88,205,0.2) 0%, rgba(255,255,255,0.02) 100%);">' +
          '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px;">' +
          '<div style="width:32px;height:32px;border-radius:50%;background:#2f58cd;display:flex;align-items:center;justify-content:center;flex-shrink:0;"><span class="material-symbols-outlined" style="font-size:16px;color:white;font-variation-settings:\'FILL\' 1;">lightbulb</span></div>' +
          '<span style="font-size:14px;font-weight:700;color:#dae2fd;">Smart Planner</span></div>' +
          '<p style="font-size:13px;color:rgba(196,197,214,0.8);line-height:1.5;margin:0 0 8px;">Hai <strong>' + upcoming + '</strong> compiti nei prossimi 7 giorni.</p>' +
          '<button onclick="const si=document.getElementById(\'planner-search-input\');if(si){si.focus();si.select();}" style="color:#b6c4ff;font-weight:600;font-size:12px;background:none;border:none;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:\'Inter\',sans-serif;padding:0;">Cerca <span class="material-symbols-outlined" style="font-size:14px;">arrow_forward</span></button>' +
          '</div>' : '';
    var empty = '<div class="liquid-glass-v8 squircle-lg rim-light" style="padding:40px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;min-height:280px;background:rgba(20,31,54,0.6);border-radius:28px;border:0.5px solid rgba(255,255,255,0.1);">' +
        '<div style="position:relative;margin-bottom:20px;">' +
        '<div style="position:absolute;inset:0;background:rgba(41,151,255,0.2);filter:blur(24px);border-radius:9999px;"></div>' +
        '<div style="position:relative;width:72px;height:72px;border-radius:22px;background:rgba(41,151,255,0.1);border:1px solid rgba(41,151,255,0.25);display:flex;align-items:center;justify-content:center;color:#2997ff;">' +
        '<i class="ph ph-calendar-x" style="font-size:36px;"></i>' +
        '</div></div>' +
        '<h4 style="font-size:16px;font-weight:700;color:#ffffff;margin:0 0 4px;">Nessuna attività</h4>' +
        '<p style="font-size:13px;font-weight:500;color:rgba(255,255,255,0.5);max-width:240px;line-height:1.5;margin:0;">Nessun compito o verifica programmata per questo giorno.</p>' +
        '</div>';
    return '<div style="display:flex;flex-direction:column;gap:16px;padding-bottom:140px;">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;padding:0 4px;">' +
        '<h2 style="font-size:18px;font-weight:600;color:rgba(218,226,253,0.9);margin:0;line-height:1.2;" class="sentence-case">' + dayLabel + '</h2>' +
        '<span style="font-size:12px;font-weight:500;color:rgba(196,197,214,0.6);">' + dayTasks.length + (dayTasks.length===1?' evento':' eventi') + '</span></div>' +
        smart + (dayTasks.length ? '<div style="display:flex;flex-direction:column;gap:12px;">' + dayTasks.map(function(t){ return TC(t,false); }).join('') + '</div>' : empty) +
        '</div>';
};

// ══════════════════════════════════════════════════════════════════════════════
// PLANNER SEARCH & DISCOVERY MODAL (Dedicated Apple Liquid Glass Layer)
// ══════════════════════════════════════════════════════════════════════════════

window.openPlannerSearchModal = function(initialQuery, initialSubject) {
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');

    if (initialQuery !== undefined) state.plannerSearchModalQuery = initialQuery;
    if (initialSubject !== undefined) state.plannerSearchModalSubject = initialSubject;
    if (!state.plannerSearchModalCategory) state.plannerSearchModalCategory = 'all';

    // Remove existing if any
    const existing = document.getElementById('planner-search-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.id = 'planner-search-modal-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(5,8,17,0.75);backdrop-filter:blur(30px) saturate(190%);-webkit-backdrop-filter:blur(30px) saturate(190%);display:flex;flex-direction:column;justify-content:flex-end;opacity:0;transition:opacity 0.25s ease;font-family:\'Inter\',sans-serif;';

    const sheet = document.createElement('div');
    sheet.id = 'planner-search-modal-sheet';
    sheet.style.cssText = 'width:100%;max-width:640px;margin:0 auto;height:92vh;max-height:92vh;background:rgba(12,20,36,0.96);border:1px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.25);border-radius:32px 32px 0 0;display:flex;flex-direction:column;box-shadow:0 -12px 48px rgba(0,0,0,0.75);transform:translateY(100%);transition:transform 0.35s cubic-bezier(0.16,1,0.3,1);overflow:hidden;';

    overlay.appendChild(sheet);
    document.body.appendChild(overlay);

    window.renderPlannerSearchModalContent(sheet);

    requestAnimationFrame(() => {
        overlay.style.opacity = '1';
        sheet.style.transform = 'translateY(0)';
    });

    overlay.addEventListener('click', (e) => {
        if (e.target === overlay) window.closePlannerSearchModal();
    });
};

window.closePlannerSearchModal = function() {
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');
    const overlay = document.getElementById('planner-search-modal-overlay');
    const sheet = document.getElementById('planner-search-modal-sheet');
    if (!overlay) return;
    if (sheet) sheet.style.transform = 'translateY(100%)';
    overlay.style.opacity = '0';
    setTimeout(() => {
        if (overlay && overlay.parentNode) overlay.remove();
    }, 320);
};

window.clearPlannerModalSearchInput = function() {
    state.plannerSearchModalQuery = '';
    const inp = document.getElementById('planner-modal-search-input');
    if (inp) { inp.value = ''; inp.focus(); }
    const btn = document.getElementById('planner-modal-search-clear-btn');
    if (btn) btn.style.display = 'none';
    window.updatePlannerSearchModalResults && window.updatePlannerSearchModalResults();
};

window.renderPlannerSearchModalContent = function(sheet) {
    if (!sheet) sheet = document.getElementById('planner-search-modal-sheet');
    if (!sheet) return;

    const allTasks = (state.tasks || []).filter(t => t.subject !== 'QUEST');
    const subjects = [...new Set(allTasks.map(t => t.subject || t.materia || '').filter(Boolean))].sort();

    const allCount = allTasks.length;
    const tasksOnlyCount = allTasks.filter(t => !t.done && !(t.isExam || t.type === 'verifica' || /verifica|interrogazione|test|esame|simulazione/i.test(t.text || ''))).length;
    const examsOnlyCount = allTasks.filter(t => !t.done && (t.isExam || t.type === 'verifica' || /verifica|interrogazione|test|esame|simulazione/i.test(t.text || ''))).length;
    const doneCount = allTasks.filter(t => t.done).length;

    const curCategory = state.plannerSearchModalCategory || 'all';
    const curSubject = state.plannerSearchModalSubject || 'all';
    const curQuery = state.plannerSearchModalQuery || '';

    sheet.innerHTML = `
        <!-- Drag Handle -->
        <div style="display:flex;justify-content:center;padding:12px 0 6px;flex-shrink:0;">
            <div style="width:40px;height:5px;border-radius:999px;background:rgba(255,255,255,0.25);"></div>
        </div>

        <!-- Header Bar -->
        <div style="display:flex;align-items:center;justify-content:space-between;padding:6px 20px 14px;flex-shrink:0;">
            <div>
                <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#2997ff;">ARCHIVIO COMPITI & VERIFICHE</div>
                <h2 style="font-size:20px;font-weight:800;color:#ffffff;margin:2px 0 0;letter-spacing:-0.02em;">Cerca & Filtri</h2>
            </div>
            <button onclick="window.closePlannerSearchModal()" class="liquid-glass-v8 rim-light squircle-full" style="display:flex;align-items:center;gap:6px;padding:7px 14px;border:none;cursor:pointer;background:rgba(255,255,255,0.08);color:#ffffff;font-size:12px;font-weight:700;font-family:'Inter',sans-serif;">
                <i class="ph ph-x" style="font-size:14px;"></i>
                <span>Chiudi</span>
            </button>
        </div>

        <!-- Search Bar (Apple Spotlight Input) -->
        <div style="padding:0 20px 12px;flex-shrink:0;">
            <div class="liquid-glass-v8 squircle-md rim-light" style="padding:11px 15px;display:flex;align-items:center;gap:10px;background:rgba(20,31,54,0.85);border:0.5px solid rgba(255,255,255,0.15);border-top:1px solid rgba(255,255,255,0.25);border-radius:18px;box-shadow:0 4px 16px -4px rgba(0,0,0,0.4);">
                <i class="ph ph-magnifying-glass" style="font-size:18px;color:#2997ff;flex-shrink:0;"></i>
                <input id="planner-modal-search-input" type="text"
                    placeholder="Cerca per titolo, materia o argomento..."
                    value="${escapeHtml(curQuery)}"
                    oninput="state.plannerSearchModalQuery=this.value;const clr=document.getElementById('planner-modal-search-clear-btn');if(clr)clr.style.display=this.value?'flex':'none';window.updatePlannerSearchModalResults&&window.updatePlannerSearchModalResults();"
                    style="width:100%;background:transparent;border:none;outline:none;font-size:14px;color:#ffffff;padding:0;font-family:'Inter',sans-serif;" />
                <button id="planner-modal-search-clear-btn" onclick="window.clearPlannerModalSearchInput()" style="display:${curQuery ? 'flex' : 'none'};background:none;border:none;color:rgba(255,255,255,0.5);cursor:pointer;padding:0;align-items:center;justify-content:center;flex-shrink:0;" title="Cancella">
                    <i class="ph-fill ph-x-circle" style="font-size:18px;"></i>
                </button>
            </div>
        </div>

        <!-- Category Filter Segments -->
        <div style="padding:0 20px 10px;flex-shrink:0;">
            <div style="display:flex;gap:8px;background:rgba(10,16,28,0.7);padding:5px;border-radius:16px;border:0.5px solid rgba(255,255,255,0.08);">
                ${[
                    { id: 'all', label: 'Tutti', icon: 'ph-squares-four', count: allCount },
                    { id: 'tasks', label: 'Compiti', icon: 'ph-book-open', count: tasksOnlyCount },
                    { id: 'exams', label: 'Verifiche', icon: 'ph-pencil-simple', count: examsOnlyCount }
                ].map(cat => {
                    const active = curCategory === cat.id;
                    return `
                    <button onclick="state.plannerSearchModalCategory='${cat.id}';window.renderPlannerSearchModalContent();" style="flex:1;padding:8px 6px;border-radius:12px;font-size:12px;font-weight:${active ? '700' : '600'};border:none;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px;font-family:'Inter',sans-serif;transition:all 0.2s ease;background:${active ? '#2997ff' : 'transparent'};color:${active ? '#ffffff' : 'rgba(255,255,255,0.6)'};box-shadow:${active ? '0 2px 8px rgba(41,151,255,0.35)' : 'none'};">
                        <i class="ph-bold ${cat.icon}" style="font-size:14px;"></i>
                        <span>${cat.label}</span>
                        <span style="font-size:10px;opacity:0.85;padding:1px 6px;border-radius:999px;background:${active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'};">${cat.count}</span>
                    </button>`;
                }).join('')}
            </div>
        </div>

        <!-- Subject Chips Filter Bar -->
        <div style="padding:0 20px 12px;flex-shrink:0;">
            <div id="planner-modal-chips-bar" style="display:flex;overflow-x:auto;gap:8px;padding-bottom:4px;scrollbar-width:none;-webkit-overflow-scrolling:touch;">
                ${[{l:'Tutte le materie', s:'all', count: allCount}, ...subjects.map(s => ({l:s, s:s, count: allTasks.filter(t => (t.subject||t.materia||'') === s).length}))].map(item => {
                    const isAll = item.s === 'all';
                    const active = curSubject === item.s;
                    const theme = isAll ? { color: '#2997ff', icon: 'ph-squares-four' } : getSubjectTheme(item.s);
                    const safeS = escapeJsSingleQuote(item.s);
                    return `
                    <button onclick="state.plannerSearchModalSubject='${safeS}';window.updatePlannerSearchModalResults&&window.updatePlannerSearchModalResults();" style="flex-shrink:0;padding:6px 12px;border-radius:9999px;font-size:11px;font-weight:${active ? '700' : '600'};cursor:pointer;font-family:'Inter',sans-serif;white-space:nowrap;display:flex;align-items:center;gap:6px;transition:all 0.2s ease;background:${active ? '#2997ff' : 'rgba(20,31,54,0.75)'};border:${active ? '1px solid rgba(41,151,255,0.6)' : '0.5px solid rgba(255,255,255,0.12)'};color:${active ? '#ffffff' : 'rgba(255,255,255,0.8)'};box-shadow:${active ? '0 4px 12px rgba(41,151,255,0.3)' : 'none'};">
                        <i class="ph-fill ${theme.icon || 'ph-bookmark'}" style="font-size:13px;color:${active ? '#ffffff' : theme.color};"></i>
                        <span>${escapeHtml(formatSubjectTitle(item.l))}</span>
                        <span style="font-size:9px;opacity:0.8;background:${active ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)'};padding:1px 5px;border-radius:999px;">${item.count}</span>
                    </button>`;
                }).join('')}
            </div>
        </div>

        <!-- Scrollable Results Container -->
        <div id="planner-modal-results-container" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;padding:0 20px 80px 20px;">
        </div>
    `;

    window.updatePlannerSearchModalResults();
};

window.updatePlannerSearchModalResults = function() {
    const container = document.getElementById('planner-modal-results-container');
    if (!container) return;

    const allTasks = (state.tasks || []).filter(t => t.subject !== 'QUEST');
    const query = (state.plannerSearchModalQuery || '').toLowerCase().trim();
    const filterSubject = state.plannerSearchModalSubject || 'all';
    const filterCategory = state.plannerSearchModalCategory || 'all';

    // Update chips bar active state smoothly
    const chipsBar = document.getElementById('planner-modal-chips-bar');
    if (chipsBar) {
        chipsBar.querySelectorAll('button').forEach(btn => {
            const onclickAttr = btn.getAttribute('onclick') || '';
            const m = onclickAttr.match(/plannerSearchModalSubject='([^']+)'/);
            const s = m ? m[1] : '';
            const active = filterSubject === s;
            btn.style.background = active ? '#2997ff' : 'rgba(20,31,54,0.75)';
            btn.style.border = active ? '1px solid rgba(41,151,255,0.6)' : '0.5px solid rgba(255,255,255,0.12)';
            btn.style.color = active ? '#ffffff' : 'rgba(255,255,255,0.8)';
            btn.style.boxShadow = active ? '0 4px 12px rgba(41,151,255,0.3)' : 'none';
        });
    }

    const filtered = allTasks.filter(t => {
        const isExam = t.isExam || t.type === 'verifica' || /verifica|interrogazione|test|esame|simulazione/i.test(t.text || '');
        if (filterCategory === 'tasks' && (isExam || t.done)) return false;
        if (filterCategory === 'exams' && (!isExam || t.done)) return false;

        if (filterSubject !== 'all' && (t.subject || t.materia || '') !== filterSubject) return false;

        if (!query) return true;
        return (t.subject || '').toLowerCase().includes(query)
            || (t.materia || '').toLowerCase().includes(query)
            || (t.text || '').toLowerCase().includes(query);
    }).sort((a, b) => (b.due_date || '').localeCompare(a.due_date || ''));

    const TC = window._plannerTC;
    if (!TC) return;

    const countLabel = filtered.length + (filtered.length === 1 ? ' attività trovata' : ' attività trovate');

    container.innerHTML = `
        <div style="font-size:12px;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:12px;display:flex;align-items:center;justify-content:space-between;padding:0 2px;">
            <span style="display:flex;align-items:center;gap:6px;">
                <i class="ph-bold ph-funnel" style="color:#2997ff;"></i> ${countLabel}
            </span>
        </div>
        <div style="display:flex;flex-direction:column;gap:12px;">
            ${filtered.length ? filtered.map(t => TC(t, true)).join('') : `
            <div class="liquid-glass-v8 squircle-lg rim-light" style="text-align:center;padding:44px 20px;background:rgba(20,31,54,0.7);border-radius:24px;border:0.5px solid rgba(255,255,255,0.12);">
                <i class="ph ph-magnifying-glass" style="font-size:40px;color:rgba(255,255,255,0.25);"></i>
                <h4 style="color:#ffffff;font-size:15px;font-weight:700;margin:12px 0 4px;">Nessuna attività trovata</h4>
                <p style="color:rgba(255,255,255,0.5);font-size:13px;font-weight:500;margin:0;">Prova a modificare i termini di ricerca o i filtri selezionati.</p>
            </div>`}
        </div>
    `;
};

// Aliases for compatibility
window.refreshPlannerSearch = function() {
    window.updatePlannerSearchModalResults && window.updatePlannerSearchModalResults();
};
window.closePlannerSearch = function() {
    window.closePlannerSearchModal && window.closePlannerSearchModal();
};

// ══════════════════════════════════════════════════════════════════════════════
// DAILY MOOD TRACKER (Faccine Giornaliere & Planner Integration)
// ══════════════════════════════════════════════════════════════════════════════

window.getDailyMoods = function() {
    if (!state.dailyMoods) {
        try {
            state.dailyMoods = JSON.parse(localStorage.getItem('gc_daily_moods') || '{}');
        } catch(e) {
            state.dailyMoods = {};
        }
    }
    return state.dailyMoods || {};
};

window.getDailyMoodForDate = function(isoDate) {
    if (!isoDate) return null;
    const moods = window.getDailyMoods();
    return moods[isoDate] || null;
};

window.setDailyMood = function(moodIdx) {
    const moodsList = [
        { index: 0, emoji: '😫', label: 'Pessima', color: '#ff453a', bg: 'rgba(255,69,58,0.22)' },
        { index: 1, emoji: '🥱', label: 'Faticosa', color: '#ff9f0a', bg: 'rgba(255,159,10,0.22)' },
        { index: 2, emoji: '😐', label: 'Normale', color: '#ffd60a', bg: 'rgba(255,214,10,0.22)' },
        { index: 3, emoji: '😊', label: 'Buona', color: '#64d2ff', bg: 'rgba(100,210,255,0.22)' },
        { index: 4, emoji: '🤩', label: 'Top!', color: '#30d158', bg: 'rgba(48,209,88,0.22)' }
    ];
    const selected = moodsList[moodIdx];
    if (!selected) return;

    const todayISO = getLocalDateString(new Date());
    const moods = window.getDailyMoods();
    moods[todayISO] = {
        index: selected.index,
        emoji: selected.emoji,
        label: selected.label,
        color: selected.color,
        date: todayISO,
        updatedAt: new Date().toISOString()
    };
    state.dailyMoods = moods;
    try {
        localStorage.setItem('gc_daily_moods', JSON.stringify(moods));
    } catch(e) {}

    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('medium');

    // Aggiorna visivamente i pulsanti nella Home senza re-render distruttivo
    const moodContainer = document.getElementById('home-daily-mood-buttons');
    if (moodContainer) {
        moodContainer.querySelectorAll('[data-mood-idx]').forEach(btn => {
            const idx = parseInt(btn.getAttribute('data-mood-idx'));
            const isCur = idx === selected.index;
            btn.style.background = isCur ? selected.bg : 'rgba(255,255,255,0.06)';
            btn.style.border = isCur ? `1.5px solid ${selected.color}` : '0.5px solid rgba(255,255,255,0.12)';
            btn.style.boxShadow = isCur ? `0 0 16px ${selected.color}50, 0 4px 12px rgba(0,0,0,0.3)` : 'none';
            btn.style.transform = isCur ? 'scale(1.15)' : 'scale(1)';
        });
        const labelEl = document.getElementById('home-daily-mood-label');
        if (labelEl) {
            labelEl.innerHTML = `✨ Mood registrato: <strong style="color:${selected.color};">${selected.emoji} ${selected.label}</strong>`;
        }
    }
};

// ══════════════════════════════════════════════════════════════════════════════
// SCHOOL COUNTDOWNS ("Quanto Manca A..." Traguardi Scolastici)
// ══════════════════════════════════════════════════════════════════════════════

window.getSchoolCountdowns = function() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const curYear = today.getFullYear();
    const curMonth = today.getMonth(); // 0..11

    const startYear = curMonth >= 8 ? curYear : curYear - 1;
    const endYear = startYear + 1;

    const milestones = [
        {
            id: 'natale',
            title: 'Vacanze di Natale',
            desc: 'Pausa natalizia & Capodanno',
            emoji: '🎄',
            color: '#30d158',
            bg: 'rgba(48,209,88,0.15)',
            border: 'rgba(48,209,88,0.35)',
            date: new Date(startYear, 11, 23) // 23 Dic
        },
        {
            id: 'quadrimestre',
            title: 'Fine 1° Quadrimestre',
            desc: 'Chiusura pagelle e valutazioni',
            emoji: '📑',
            color: '#64d2ff',
            bg: 'rgba(100,210,255,0.15)',
            border: 'rgba(100,210,255,0.35)',
            date: new Date(endYear, 0, 31) // 31 Gen
        },
        {
            id: '100giorni',
            title: '100 Giorni alla Fine',
            desc: 'Tradizionale conto alla rovescia',
            emoji: '💯',
            color: '#bf5af2',
            bg: 'rgba(191,90,242,0.15)',
            border: 'rgba(191,90,242,0.35)',
            date: new Date(endYear, 2, 10) // 10 Mar
        },
        {
            id: 'pasqua',
            title: 'Vacanze di Pasqua',
            desc: 'Pausa pasquale di primavera',
            emoji: '🕊️',
            color: '#ffd60a',
            bg: 'rgba(255,214,10,0.15)',
            border: 'rgba(255,214,10,0.35)',
            date: new Date(endYear, 3, 16) // ~16 Apr
        },
        {
            id: 'fine_scuola',
            title: 'Fine della Scuola',
            desc: 'Inizio vacanze estive!',
            emoji: '🏖️',
            color: '#ff9f0a',
            bg: 'rgba(255,159,10,0.15)',
            border: 'rgba(255,159,10,0.35)',
            date: new Date(endYear, 5, 8) // 8 Giu
        },
        {
            id: 'maturita',
            title: 'Esami di Stato / Maturità',
            desc: 'Inizio prove d\'esame ufficiali',
            emoji: '🎓',
            color: '#2997ff',
            bg: 'rgba(41,151,255,0.15)',
            border: 'rgba(41,151,255,0.35)',
            date: new Date(endYear, 5, 18) // 18 Giu
        }
    ];

    const schoolStart = new Date(startYear, 8, 12);
    const schoolEnd = new Date(endYear, 5, 8);
    const totalSchoolDays = Math.max(1, (schoolEnd - schoolStart) / 86400000);
    const daysPassed = Math.max(0, Math.min(totalSchoolDays, (today - schoolStart) / 86400000));
    const schoolYearProgress = Math.min(100, Math.max(0, Math.round((daysPassed / totalSchoolDays) * 100)));

    const result = milestones.map(m => {
        const timeDiff = m.date.getTime() - today.getTime();
        const daysLeft = Math.ceil(timeDiff / 86400000);
        let badgeText = '';
        let isPast = false;
        let isToday = false;

        if (daysLeft < 0) {
            badgeText = 'Passato';
            isPast = true;
        } else if (daysLeft === 0) {
            badgeText = 'Oggi!';
            isToday = true;
        } else if (daysLeft === 1) {
            badgeText = 'Domani';
        } else {
            badgeText = `${daysLeft} giorni`;
        }

        const dateStr = `${m.date.getDate()} ${['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'][m.date.getMonth()]} ${m.date.getFullYear()}`;

        return {
            ...m,
            daysLeft,
            badgeText,
            isPast,
            isToday,
            dateFormatted: dateStr
        };
    });

    const upcoming = result.filter(m => !m.isPast);
    const nearest = upcoming.length > 0 ? upcoming[0] : result[result.length - 1];

    return {
        milestones: result,
        nearest,
        schoolYearProgress,
        schoolYearLabel: `${startYear}/${endYear}`
    };
};

window.openSchoolCountdownsModal = function() {
    if (document.getElementById('school-countdowns-modal-overlay')) return;
    if (typeof window.triggerHaptic === 'function') window.triggerHaptic('light');

    const data = window.getSchoolCountdowns();

    const overlay = document.createElement('div');
    overlay.id = 'school-countdowns-modal-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        background: rgba(5,8,17,0.78);
        backdrop-filter: blur(28px) saturate(190%);
        -webkit-backdrop-filter: blur(28px) saturate(190%);
        display: flex; flex-direction: column; justify-content: flex-end;
        animation: fadeInOverlay 0.25s ease-out forwards;
    `;

    overlay.innerHTML = `
        <div onclick="window.closeSchoolCountdownsModal()" style="flex:1;"></div>
        <div id="school-countdowns-modal-sheet" style="
            background: linear-gradient(160deg, rgba(22,34,58,0.96) 0%, rgba(10,16,30,0.98) 100%);
            backdrop-filter: blur(40px) saturate(210%);
            -webkit-backdrop-filter: blur(40px) saturate(210%);
            border: 0.5px solid rgba(255,255,255,0.15);
            border-top: 1.5px solid rgba(255,255,255,0.30);
            border-radius: 32px 32px 0 0;
            padding: 12px 20px 40px 20px;
            max-height: 85vh;
            display: flex; flex-direction: column;
            box-shadow: 0 -12px 40px rgba(0,0,0,0.7);
            animation: slideUpModal 0.3s cubic-bezier(0.16,1,0.3,1) forwards;
        ">
            <!-- Drag Handle -->
            <div style="display:flex;justify-content:center;padding:6px 0 12px;">
                <div style="width:40px;height:5px;border-radius:999px;background:rgba(255,255,255,0.25);"></div>
            </div>

            <!-- Header -->
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;">
                <div>
                    <div style="font-size:10px;font-weight:800;letter-spacing:0.08em;text-transform:uppercase;color:#ff9f0a;">CONTO ALLA ROVESCIA</div>
                    <h2 style="font-size:20px;font-weight:800;color:#ffffff;margin:2px 0 0;letter-spacing:-0.02em;">Quanto Manca A...</h2>
                </div>
                <button onclick="window.closeSchoolCountdownsModal()" class="liquid-glass-v8 rim-light squircle-full" style="display:flex;align-items:center;gap:6px;padding:7px 14px;border:none;cursor:pointer;background:rgba(255,255,255,0.08);color:#ffffff;font-size:12px;font-weight:700;font-family:'Inter',sans-serif;">
                    <i class="ph ph-x" style="font-size:14px;"></i>
                    <span>Chiudi</span>
                </button>
            </div>

            <!-- School Year Progress Card -->
            <div style="background:rgba(255,255,255,0.04);border:0.5px solid rgba(255,255,255,0.12);border-radius:20px;padding:14px 16px;margin-bottom:16px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">
                    <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.05em;">ANNO SCOLASTICO ${data.schoolYearLabel}</span>
                    <span style="font-size:12px;font-weight:800;color:#2997ff;">${data.schoolYearProgress}% completato</span>
                </div>
                <div style="width:100%;height:7px;background:rgba(255,255,255,0.08);border-radius:999px;overflow:hidden;">
                    <div style="width:${data.schoolYearProgress}%;height:100%;background:linear-gradient(90deg,#2997ff,#30d158);border-radius:999px;"></div>
                </div>
            </div>

            <!-- Milestones List -->
            <div style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;display:flex;flex-direction:column;gap:10px;padding-bottom:10px;">
                ${data.milestones.map(m => `
                <div style="
                    background: ${m.isToday ? 'rgba(255,214,10,0.12)' : 'rgba(255,255,255,0.03)'};
                    border: 0.5px solid ${m.isToday ? 'rgba(255,214,10,0.4)' : 'rgba(255,255,255,0.09)'};
                    border-radius: 18px; padding: 12px 14px;
                    display: flex; align-items: center; justify-content: space-between; gap: 12px;
                    opacity: ${m.isPast ? '0.5' : '1'};
                ">
                    <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                        <div style="width:40px;height:40px;border-radius:14px;background:${m.bg};border:0.5px solid ${m.border};display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">
                            ${m.emoji}
                        </div>
                        <div style="min-width:0;">
                            <h4 style="font-size:14px;font-weight:700;color:#ffffff;margin:0 0 2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.title}</h4>
                            <p style="font-size:11.5px;color:rgba(255,255,255,0.5);margin:0;">${m.dateFormatted} · ${m.desc}</p>
                        </div>
                    </div>
                    <span style="
                        flex-shrink: 0; font-size: 12px; font-weight: 800; font-variant-numeric: tabular-nums;
                        padding: 5px 12px; border-radius: 999px;
                        background: ${m.isPast ? 'rgba(255,255,255,0.06)' : m.bg};
                        color: ${m.isPast ? 'rgba(255,255,255,0.4)' : m.color};
                        border: 0.5px solid ${m.isPast ? 'transparent' : m.border};
                    ">
                        ${m.badgeText}
                    </span>
                </div>
                `).join('')}
            </div>
        </div>
    `;

    document.body.appendChild(overlay);
};

window.closeSchoolCountdownsModal = function() {
    const overlay = document.getElementById('school-countdowns-modal-overlay');
    if (!overlay) return;
    const sheet = document.getElementById('school-countdowns-modal-sheet');
    if (sheet) sheet.style.animation = 'slideDownModal 0.2s cubic-bezier(0.16,1,0.3,1) forwards';
    overlay.style.animation = 'fadeOutOverlay 0.2s ease-in forwards';
    setTimeout(() => overlay.remove(), 200);
};

// ══════════════════════════════════════════════════════════════════════════════
// PLANNER CAROUSEL FUNCTIONS
// ══════════════════════════════════════════════════════════════════════════════

window.plannerSelectDay = function(iso) {
    state.selectedDate = iso;
    document.querySelectorAll('.planner-day-pill').forEach(function(el) {
        const onclickAttr = el.getAttribute('onclick') || '';
        const m = onclickAttr.match(/'([^']+)'/);
        const elIso = m ? m[1] : null;
        if (!elIso) return;
        const isSel = elIso === iso;
        if (isSel) {
            el.className = 'planner-day-pill active-blue-glow squircle-full';
            el.style.opacity = '1';
        } else {
            el.className = 'planner-day-pill liquid-glass-v8 rim-light squircle-full';
            el.style.opacity = '0.65';
        }
        const spans = el.querySelectorAll('span');
        if (spans[0]) {
            spans[0].style.color = '#ffffff';
            spans[0].style.opacity = isSel ? '0.8' : '0.6';
        }
        if (spans[1]) {
            spans[1].style.color = isSel ? '#ffffff' : '#dae2fd';
        }
        const dot = el.querySelector('div');
        if (dot) {
            if (isSel) {
                dot.style.background = '#ffffff';
                dot.style.boxShadow = '0 0 8px rgba(255,255,255,0.8)';
                dot.style.width = '6px';
                dot.style.height = '6px';
            } else {
                dot.style.boxShadow = 'none';
                dot.style.width = '5px';
                dot.style.height = '5px';
            }
        }
    });

    try {
        const d = new Date(iso + 'T00:00:00');
        const MN = window._plannerMN || ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                                          'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
        const monthHeaderSpan = document.querySelector('.planner-view header button span:nth-child(2)');
        if (monthHeaderSpan && !isNaN(d.getTime())) {
            monthHeaderSpan.textContent = `${MN[d.getMonth()]} ${d.getFullYear()}`;
        }
    } catch(e) {}
    
    var _area = document.getElementById('planner-content-area');
    var _dayHtml = window._buildPlannerDayContentHTML && window._buildPlannerDayContentHTML();
    if (_area && _dayHtml) {
        _area.innerHTML = _dayHtml;
    } else {
        state._forceRender = true;
        scheduleRender(0);
    }
};

window.handlePlannerCarouselScroll = function(el) {
    if (!el) return;
    const slideWidth = el.clientWidth || el.offsetWidth || window.innerWidth;
    if (!slideWidth) return;
    const idx = Math.max(0, Math.min(4, Math.round(el.scrollLeft / slideWidth)));
    if (window._lastPlannerScrollIdx === idx) return;
    window._lastPlannerScrollIdx = idx;
    document.querySelectorAll('.planner-week-dot').forEach(function(dot, i) {
        dot.style.width = i === idx ? '20px' : '6px';
        dot.style.background = i === idx ? 'rgba(47, 88, 205, 0.8)' : 'rgba(255, 255, 255, 0.2)';
        dot.style.borderRadius = '9999px';
    });
};

window.plannerJumpToWeek = function(idx) {
    const el = document.getElementById('planner-week-carousel');
    if (el) {
        const slides = el.querySelectorAll('.planner-week-slide');
        const targetSlide = slides[idx];
        if (targetSlide) {
            el.scrollTo({ left: targetSlide.offsetLeft, behavior: 'smooth' });
        } else {
            const slideWidth = el.clientWidth || el.offsetWidth || window.innerWidth;
            el.scrollTo({ left: idx * slideWidth, behavior: 'smooth' });
        }
    }
};

window._scrollPlannerToActiveWeek = function() {
    const _pc = document.getElementById('planner-week-carousel');
    if (!_pc) return;
    const slides = _pc.querySelectorAll('.planner-week-slide');
    const targetIdx = 2; // Week 2 is always the week containing the active/selected date
    const targetSlide = slides[targetIdx] || slides[0];
    if (targetSlide) {
        const offset = targetSlide.offsetLeft;
        _pc.scrollTo({ left: offset, behavior: 'instant' });
        _pc.scrollLeft = offset;
        document.querySelectorAll('.planner-week-dot').forEach(function(dot, i) {
            dot.style.width = i === targetIdx ? '20px' : '6px';
            dot.style.background = i === targetIdx ? 'rgba(47, 88, 205, 0.8)' : 'rgba(255, 255, 255, 0.2)';
            dot.style.borderRadius = '9999px';
        });
    }
};

function formatFullDate(dateInput) {
    if (!dateInput) return '';
    const date = new Date(dateInput);
    if (isNaN(date.getTime())) return '';
    const months = ["Gennaio", "Febbraio", "Marzo", "Aprile", "Maggio", "Giugno", "Luglio", "Agosto", "Settembre", "Ottobre", "Novembre", "Dicembre"];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const time = date.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    return `${day} ${month} ${year} • ${time} `;
}

function renderProfile() {
    const isGoogleConnected = !!(state.googleConnected || localStorage.getItem('gc_google_connected_cache') === '1');
    const rawName = (typeof getSafeUserName === 'function') ? getSafeUserName() : (state.user?.name || 'Utente');
    const userName = escapeHtml((typeof toDisplayName === 'function') ? toDisplayName(rawName) : rawName);
    const effClass = (typeof getEffectiveUserClass === 'function') ? getEffectiveUserClass() : '';
    const userClass = escapeHtml(effClass || (typeof normalizeClassUi === 'function' ? normalizeClassUi(state.user?.class || '', state.user?.specialization || '') : (state.user?.class || '')) || 'Studente');
    const initials = (rawName || 'U').trim().split(' ').map(function(w){ return w[0]; }).slice(0,2).join('').toUpperCase() || 'U';
    const isRep = (typeof isCurrentUserRepresentative === 'function') ? isCurrentUserRepresentative() : false;

    // Last Sync timestamp
    const lastSyncTs = (typeof getPersistedLastSyncAt === 'function') ? getPersistedLastSyncAt() : (state.didup?.lastSuccessTs || null);
    let lastSyncLabel = 'Recentemente';
    if (lastSyncTs) {
        const syncD = new Date(lastSyncTs);
        if (!isNaN(syncD.getTime())) {
            const isToday = syncD.toDateString() === new Date().toDateString();
            const timeStr = syncD.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
            lastSyncLabel = isToday ? `Oggi, ${timeStr}` : `${syncD.getDate()}/${syncD.getMonth()+1}, ${timeStr}`;
        }
    }

    return `
    <div class="view-fullbleed profile-view hide-scrollbar"
         style="padding:0 20px 140px 20px;min-height:100vh;height:100dvh;overflow-y:scroll;-webkit-overflow-scrolling:touch;background:var(--background, #0b1326);font-family:'Inter',sans-serif;color:#dae2fd;">

        <!-- ── AMBIENT GLOW SPHERES (Classic Blue) ── -->
        <div style="position:fixed;top:0;right:0;width:320px;height:320px;background:radial-gradient(circle,rgba(37,99,235,0.14) 0%,transparent 70%);filter:blur(60px);pointer-events:none;z-index:0;"></div>
        <div style="position:fixed;bottom:100px;left:0;width:280px;height:280px;background:radial-gradient(circle,rgba(41,151,255,0.1) 0%,transparent 70%);filter:blur(50px);pointer-events:none;z-index:0;"></div>

        <div style="position:relative;z-index:1;max-width:540px;margin:0 auto;">

            <!-- ── HEADER (iOS HIG) ── -->
            <header class="ios-header-wrapper" style="display:flex;align-items:center;justify-content:space-between;padding:max(env(safe-area-inset-top,0px),24px) 0 20px 0;">
                <div style="display:flex;align-items:center;gap:14px;">
                    <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('light');navigate('home')"
                        style="width:40px;height:40px;border-radius:14px;
                               background:rgba(23,31,51,0.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
                               border:1px solid rgba(182,196,255,0.16);border-top:1px solid rgba(255,255,255,0.25);
                               display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:#b6c4ff;
                               box-shadow:0 4px 16px rgba(0,0,0,0.3);transition:transform 0.15s ease;"
                        ontouchstart="this.style.transform='scale(0.92)'"
                        ontouchend="this.style.transform='scale(1)'"
                        aria-label="Torna alla Home">
                        <i class="ph-bold ph-arrow-left" style="font-size:18px;"></i>
                    </button>
                    <div>
                        <div class="ios-sub-title" style="color:#b6c4ff;font-weight:800;letter-spacing:0.08em;font-size:11px;">ACCOUNT & SISTEMA</div>
                        <h1 class="ios-large-title" style="color:#dae2fd;font-weight:800;font-size:32px;letter-spacing:-0.03em;margin:2px 0 0;">Profilo</h1>
                    </div>
                </div>
                <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('medium');if(typeof showToast==='function')showToast('Sincronizzazione DidUP in corso...','info');if(typeof runAutomaticSyncCycle==='function')runAutomaticSyncCycle('manual',{force:true});"
                    style="width:40px;height:40px;border-radius:14px;
                           background:rgba(23,31,51,0.85);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);
                           border:1px solid rgba(182,196,255,0.16);border-top:1px solid rgba(255,255,255,0.25);
                           display:flex;align-items:center;justify-content:center;cursor:pointer;color:#b6c4ff;
                           box-shadow:0 4px 16px rgba(0,0,0,0.3);transition:transform 0.15s ease;"
                    ontouchstart="this.style.transform='scale(0.92)'"
                    ontouchend="this.style.transform='scale(1)'"
                    aria-label="Sincronizza">
                    <i class="ph-bold ph-arrows-clockwise" style="font-size:18px;"></i>
                </button>
            </header>

            <!-- ── HERO USER CARD (Clean Liquid Glass with Solid Blue Avatar) ── -->
            <div style="
                background:linear-gradient(135deg, rgba(37,99,235,0.22) 0%, rgba(20,29,51,0.92) 100%);
                backdrop-filter:blur(36px) saturate(190%);-webkit-backdrop-filter:blur(36px) saturate(190%);
                border:1px solid rgba(182,196,255,0.18);border-top:1px solid rgba(255,255,255,0.35);
                border-radius:28px;padding:22px 20px;margin-bottom:20px;
                box-shadow:0 16px 40px -10px rgba(6,14,32,0.75), inset 0 1px 0 rgba(255,255,255,0.18);
                position:relative;overflow:hidden;
            ">
                <!-- Ambient Blue Glow -->
                <div style="position:absolute;top:0;right:0;width:140px;height:140px;background:radial-gradient(circle,rgba(37,99,235,0.25) 0%,transparent 70%);filter:blur(24px);pointer-events:none;"></div>

                <div style="display:flex;align-items:center;gap:16px;">
                    <!-- Classic Blue Avatar -->
                    <div style="
                        width:60px;height:60px;border-radius:18px;
                        background:linear-gradient(135deg, #1d4ed8 0%, #2563eb 60%, #3b82f6 100%);
                        display:flex;align-items:center;justify-content:center;flex-shrink:0;
                        box-shadow:0 8px 24px -4px rgba(37,99,235,0.5), inset 0 1px 1px rgba(255,255,255,0.35);
                        border:1px solid rgba(255,255,255,0.22);
                    ">
                        <span style="font-size:24px;font-weight:900;color:#ffffff;letter-spacing:-0.02em;">${initials}</span>
                    </div>

                    <div style="min-width:0;flex:1;">
                        <h2 style="font-size:20px;font-weight:800;color:#ffffff;margin:0 0 4px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;letter-spacing:-0.02em;">
                            ${userName}
                        </h2>
                        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                            <span style="font-size:11.5px;font-weight:700;color:#b6c4ff;background:rgba(37,99,235,0.22);border:0.5px solid rgba(182,196,255,0.25);padding:2px 8px;border-radius:8px;">
                                ${userClass}
                            </span>
                            <div style="display:inline-flex;align-items:center;gap:5px;background:rgba(48,209,88,0.14);border:0.5px solid rgba(48,209,88,0.3);padding:2px 8px;border-radius:999px;">
                                <span style="width:6px;height:6px;border-radius:50%;background:#30d158;box-shadow:0 0 8px #30d158;display:inline-block;"></span>
                                <span style="font-size:10.5px;font-weight:800;color:#30d158;letter-spacing:0.02em;">DidUP Sincronizzato</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ── SEZIONE: RUOLO DI CLASSE (Rappresentante) ── -->
            <div style="margin-bottom:20px;">
                <p style="font-size:11px;font-weight:800;color:#8e909f;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px 4px;display:flex;align-items:center;gap:6px;">
                    <i class="ph-fill ph-users-three" style="color:#2997ff;"></i> RUOLO DI CLASSE
                </p>
                <div style="
                    background:rgba(23,31,51,0.85);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);
                    border:1px solid rgba(182,196,255,0.14);border-top:1px solid rgba(255,255,255,0.25);
                    border-radius:26px;padding:18px 20px;
                    box-shadow:0 12px 32px -8px rgba(6,14,32,0.6);
                ">
                    <div style="display:flex;align-items:center;justify-content:space-between;gap:14px;">
                        <div style="display:flex;align-items:center;gap:14px;min-width:0;flex:1;">
                            <div style="
                                width:46px;height:46px;border-radius:15px;
                                background:${isRep ? 'rgba(48,209,88,0.16)' : 'rgba(41,151,255,0.14)'};
                                border:1px solid ${isRep ? 'rgba(48,209,88,0.35)' : 'rgba(41,151,255,0.25)'};
                                display:flex;align-items:center;justify-content:center;flex-shrink:0;
                                color:${isRep ? '#30d158' : '#2997ff'};
                                box-shadow:0 0 14px ${isRep ? 'rgba(48,209,88,0.25)' : 'rgba(41,151,255,0.2)'};
                            ">
                                <i class="ph-fill ph-identification-badge" style="font-size:24px;"></i>
                            </div>
                            <div style="min-width:0;">
                                <div style="font-size:16px;font-weight:800;color:#ffffff;line-height:1.2;">
                                    Rappresentante di Classe
                                </div>
                                <div style="font-size:12px;font-weight:600;color:${isRep ? '#30d158' : '#8e909f'};margin-top:3px;">
                                    ${isRep ? `Attivo · Classe ${escapeHtml(effClass)}` : `Non attivo · Classe: ${escapeHtml(effClass || 'Non impostata')}`}
                                </div>
                            </div>
                        </div>

                        <!-- Apple HIG Native Smooth Switch -->
                        <label style="position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:54px;min-height:44px;cursor:pointer;-webkit-tap-highlight-color:transparent;">
                            <input type="checkbox" ${isRep ? 'checked' : ''} onchange="window.toggleClassRepresentative(this.checked)" style="opacity:0;width:0;height:0;position:absolute;" />
                            <span style="position:relative;display:inline-block;width:51px;height:31px;background:${isRep ? '#30d158' : 'rgba(120,120,128,0.32)'};border-radius:34px;transition:all 0.25s cubic-bezier(0.16,1,0.3,1);box-shadow:${isRep ? '0 0 12px rgba(48,209,88,0.4)' : 'none'};">
                                <span style="position:absolute;content:'';height:27px;width:27px;left:2px;bottom:2px;background:#ffffff;border-radius:50%;transition:transform 0.25s cubic-bezier(0.16,1,0.3,1);box-shadow:0 3px 8px rgba(0,0,0,0.3);transform:${isRep ? 'translateX(20px)' : 'translateX(0)'};"></span>
                            </span>
                        </label>
                    </div>

                    <div style="margin-top:14px;padding-top:14px;border-top:0.5px solid rgba(255,255,255,0.08);display:flex;align-items:center;justify-content:space-between;">
                        <span style="font-size:12px;color:#8e909f;font-weight:500;">
                            ${effClass ? `Classe attiva: <strong style="color:#b6c4ff;">${escapeHtml(effClass)}</strong>` : 'Classe non definita'}
                        </span>
                    </div>
                </div>
            </div>

            <!-- ── SEZIONE: GOOGLE CALENDAR CLOUD ── -->
            <div style="margin-bottom:20px;">
                <p style="font-size:11px;font-weight:800;color:#8e909f;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px 4px;display:flex;align-items:center;gap:6px;">
                    <i class="ph-fill ph-calendar-check" style="color:#30d158;"></i> GOOGLE CALENDAR SYNC
                </p>
                <div style="
                    background:rgba(23,31,51,0.85);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);
                    border:1px solid rgba(182,196,255,0.14);border-top:1px solid rgba(255,255,255,0.25);
                    border-radius:26px;overflow:hidden;
                    box-shadow:0 12px 32px -8px rgba(6,14,32,0.6);
                ">
                    ${isGoogleConnected ? `
                    <div style="padding:20px;">
                        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:14px;">
                            <div style="display:flex;align-items:center;gap:12px;">
                                <div style="width:44px;height:44px;border-radius:14px;background:rgba(48,209,88,0.16);border:1px solid rgba(48,209,88,0.35);display:flex;align-items:center;justify-content:center;color:#30d158;flex-shrink:0;box-shadow:0 0 14px rgba(48,209,88,0.25);">
                                    <i class="ph-fill ph-google-logo" style="font-size:22px;"></i>
                                </div>
                                <div>
                                    <div style="font-size:16px;font-weight:800;color:#ffffff;line-height:1.2;">Google Calendar</div>
                                    <div style="font-size:11.5px;font-weight:700;color:#30d158;display:flex;align-items:center;gap:5px;margin-top:2px;">
                                        <span style="width:6px;height:6px;border-radius:50%;background:#30d158;box-shadow:0 0 6px #30d158;"></span>
                                        Sincronizzazione Cloud Attiva
                                    </div>
                                </div>
                            </div>
                            <span style="font-size:10.5px;font-weight:700;color:#8e909f;background:rgba(255,255,255,0.06);padding:3px 8px;border-radius:8px;">
                                Cloud 24/7
                            </span>
                        </div>
                        <p style="font-size:12.5px;color:#c4c5d6;line-height:1.55;margin:0 0 12px;">
                            Compiti, verifiche e <strong>assenze da giustificare</strong> vengono sincronizzati automaticamente con il tuo calendario Google. I promemoria per le assenze rimangono visibili nel calendario finché non vengono giustificate.
                        </p>

                        <!-- Feature highlights -->
                        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;">
                            <span style="font-size:11px;font-weight:600;color:#b6c4ff;background:rgba(37,99,235,0.16);border:0.5px solid rgba(182,196,255,0.2);padding:3px 9px;border-radius:8px;">
                                📝 Compiti ed esercizi
                            </span>
                            <span style="font-size:11px;font-weight:600;color:#30d158;background:rgba(48,209,88,0.14);border:0.5px solid rgba(48,209,88,0.25);padding:3px 9px;border-radius:8px;">
                                🎯 Verifiche ed esami
                            </span>
                            <span style="font-size:11px;font-weight:600;color:#ff9f0a;background:rgba(255,159,10,0.14);border:0.5px solid rgba(255,159,10,0.25);padding:3px 9px;border-radius:8px;">
                                ⚠️ Assenze da giustificare
                            </span>
                        </div>

                        <div style="display:flex;gap:10px;">
                            <button onclick="if(typeof window.triggerHaptic==='function')window.triggerHaptic('medium');if(typeof syncGoogleCalendar==='function')syncGoogleCalendar();"
                                style="flex:1;height:46px;border-radius:14px;border:none;cursor:pointer;
                                       background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%);color:#ffffff;
                                       font-size:13.5px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:7px;
                                       box-shadow:0 4px 16px rgba(37,99,235,0.45);transition:transform 0.12s ease;"
                                ontouchstart="this.style.transform='scale(0.97)'"
                                ontouchend="this.style.transform='scale(1)'">
                                <i class="ph-bold ph-arrows-clockwise" style="font-size:16px;"></i>
                                Sincronizza Ora
                            </button>
                            <button onclick="if(confirm('Disconnettere Google Calendar?')){if(typeof disconnectGoogle==='function')disconnectGoogle();}"
                                style="height:46px;padding:0 16px;border-radius:14px;cursor:pointer;
                                       background:rgba(255,69,58,0.12);border:1px solid rgba(255,69,58,0.25);
                                       color:#ff453a;font-size:13px;font-weight:700;white-space:nowrap;transition:transform 0.12s ease;"
                                ontouchstart="this.style.transform='scale(0.97)'"
                                ontouchend="this.style.transform='scale(1)'">
                                Disconnetti
                            </button>
                        </div>
                    </div>` : `
                    <div style="padding:20px;">
                        <div style="display:flex;align-items:center;gap:12px;margin-bottom:14px;">
                            <div style="width:44px;height:44px;border-radius:14px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;color:#8e909f;flex-shrink:0;">
                                <i class="ph-fill ph-google-logo" style="font-size:22px;"></i>
                            </div>
                            <div>
                                <div style="font-size:16px;font-weight:800;color:#ffffff;line-height:1.2;">Google Calendar</div>
                                <div style="font-size:12px;font-weight:600;color:#8e909f;margin-top:2px;">Non collegato</div>
                            </div>
                        </div>
                        <p style="font-size:12.5px;color:#c4c5d6;line-height:1.55;margin:0 0 14px;">
                            Collega Google Calendar per sincronizzare automaticamente verifiche, compiti e i <strong>promemoria delle assenze/ritardi da giustificare</strong> (che rimarranno nel tuo calendario fino all'avvenuta giustificazione).
                        </p>
                        <div style="background:rgba(37,99,235,0.12);border:1px solid rgba(182,196,255,0.18);border-radius:16px;padding:12px 14px;margin-bottom:16px;">
                            <div style="font-size:10px;font-weight:800;color:#b6c4ff;text-transform:uppercase;letter-spacing:0.07em;margin-bottom:8px;">
                                Come Funziona
                            </div>
                            ${[
                                'Tocca "Collega Google Calendar" qui sotto',
                                'Accedi con il tuo account Google scolastico o personale',
                                'Sincronizzazione automatica di compiti, verifiche e assenze da giustificare'
                              ].map((step, idx) => `
                            <div style="display:flex;align-items:flex-start;gap:10px;margin-bottom:${idx < 2 ? '8px' : '0'};">
                                <div style="width:18px;height:18px;border-radius:50%;background:#2563eb;color:#ffffff;font-size:10px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px;">
                                    ${idx + 1}
                                </div>
                                <span style="font-size:12px;color:#dae2fd;line-height:1.4;">${step}</span>
                            </div>`).join('')}
                        </div>
                        <button onclick="if(typeof window.connectGoogle==='function')window.connectGoogle();"
                            style="width:100%;height:48px;border-radius:16px;border:none;cursor:pointer;
                                   background:linear-gradient(135deg,#1d4ed8 0%,#2563eb 100%);color:#ffffff;
                                   font-size:14.5px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:8px;
                                   box-shadow:0 6px 20px -4px rgba(37,99,235,0.5);transition:transform 0.12s ease;"
                            ontouchstart="this.style.transform='scale(0.98)'"
                            ontouchend="this.style.transform='scale(1)'">
                            <i class="ph-bold ph-link" style="font-size:17px;"></i>
                            Collega Google Calendar
                        </button>
                    </div>`}
                </div>
            </div>

            <!-- ── SEZIONE: SISTEMA & DIAGNOSTICA ── -->
            <div style="margin-bottom:24px;">
                <p style="font-size:11px;font-weight:800;color:#8e909f;letter-spacing:0.08em;text-transform:uppercase;margin:0 0 10px 4px;display:flex;align-items:center;gap:6px;">
                    <i class="ph-fill ph-gear-six" style="color:#8e909f;"></i> SISTEMA & DIAGNOSTICA
                </p>
                <div style="
                    background:rgba(23,31,51,0.85);backdrop-filter:blur(30px);-webkit-backdrop-filter:blur(30px);
                    border:1px solid rgba(182,196,255,0.14);border-top:1px solid rgba(255,255,255,0.25);
                    border-radius:26px;overflow:hidden;
                    box-shadow:0 12px 32px -8px rgba(6,14,32,0.6);
                ">
                    <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 18px;">
                        <span style="font-size:13.5px;font-weight:600;color:#c4c5d6;">Ultima Sincronizzazione</span>
                        <span style="font-size:12.5px;font-weight:700;color:#b6c4ff;background:rgba(37,99,235,0.18);padding:3px 9px;border-radius:8px;">${lastSyncLabel}</span>
                    </div>

                    <div style="height:0.5px;background:rgba(255,255,255,0.08);margin:0 18px;"></div>

                    <div style="display:flex;align-items:center;justify-content:space-between;padding:15px 18px;">
                        <span style="font-size:13.5px;font-weight:600;color:#c4c5d6;">Serverless Engine</span>
                        <span style="font-size:12.5px;font-weight:700;color:#30d158;display:flex;align-items:center;gap:4px;">
                            <i class="ph-fill ph-check-circle" style="font-size:14px;"></i> Attivo & Reattivo
                        </span>
                    </div>

                    <div style="height:0.5px;background:rgba(255,255,255,0.08);margin:0 18px;"></div>

                    <div onclick="if(confirm('Svuotare la cache locale e ricaricare i dati?')){try{localStorage.clear();sessionStorage.clear();}catch(e){}location.reload();}"
                        style="display:flex;align-items:center;justify-content:space-between;padding:15px 18px;cursor:pointer;transition:background 0.15s ease;"
                        ontouchstart="this.style.background='rgba(255,255,255,0.06)'"
                        ontouchend="this.style.background='transparent'">
                        <span style="font-size:13.5px;font-weight:600;color:#ff9f0a;display:flex;align-items:center;gap:8px;">
                            <i class="ph-bold ph-trash" style="font-size:16px;"></i> Svuota Cache & Reset Dati
                        </span>
                        <i class="ph-bold ph-caret-right" style="font-size:16px;color:#8e909f;"></i>
                    </div>
                </div>
            </div>

            <!-- ── LOGOUT (Apple Frosted Danger Button) ── -->
            <button onclick="window.handleLogoutPrompt()"
                style="
                    width:100%;height:54px;border-radius:20px;
                    background:rgba(255,69,58,0.12);
                    border:1px solid rgba(255,69,58,0.28);border-top:1px solid rgba(255,255,255,0.2);
                    display:flex;align-items:center;justify-content:center;gap:10px;
                    color:#ff453a;font-size:15px;font-weight:800;cursor:pointer;
                    font-family:'Inter',sans-serif;
                    margin-bottom:28px;
                    box-shadow:0 6px 20px -6px rgba(255,69,58,0.3);
                    transition:transform 0.15s ease, background 0.15s ease;
                "
                ontouchstart="this.style.transform='scale(0.98)';this.style.background='rgba(255,69,58,0.2)'"
                ontouchend="this.style.transform='scale(1)';this.style.background='rgba(255,69,58,0.12)'">
                <i class="ph-bold ph-sign-out" style="font-size:20px;"></i>
                Esci dall'Account
            </button>

            <!-- ── FOOTER APP INFO ── -->
            <div style="text-align:center;padding-bottom:20px;">
                <p style="font-size:12px;font-weight:700;color:#8e909f;letter-spacing:0.04em;margin:0 0 4px;">
                    Gandhi Diary • v4.0.3
                </p>
                <p style="font-size:11px;font-weight:500;color:rgba(255,255,255,0.35);margin:0;">
                    Liceo Gandhi · Liquid Glass Interface
                </p>
            </div>

            <!-- ── DEDICATED BOTTOM SPACER FOR NAVBAR SCROLLING ── -->
            <div style="height:140px;flex-shrink:0;"></div>

        </div>
    </div>
    `;
}

function formatSubjectTitle(str) {
    if (!str) return 'Materia';
    if (typeof getSubjectCanonicalName === 'function') {
        const canonical = getSubjectCanonicalName(str);
        if (canonical) return canonical;
    }
    // Sentence case capitalizer fallback
    let s = str.trim();
    const lower = s.toLowerCase();
    return lower.replace(/(^|\s|-|\/)\S/g, l => l.toUpperCase())
                .replace(/\b(e|ed|di|del|della|degli|in|con|su|per|tra|fra)\b/gi, w => w.toLowerCase())
                .replace(/^[a-z]/, l => l.toUpperCase());
}

function formatFriendlyDate(dateStr) {
    if (!dateStr || dateStr === 'recentissimo') return 'ieri';
    if (dateStr.includes('ieri') || dateStr.includes('fa')) return dateStr;
    const d = (typeof parseArgoDate === 'function') ? parseArgoDate(dateStr) : new Date(dateStr);
    if (!d || isNaN(d)) return dateStr;
    const now = new Date();
    const dDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const nowDate = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.round((nowDate - dDate) / 86400000);
    if (diffDays === 0) return 'oggi';
    if (diffDays === 1) return 'ieri';
    if (diffDays > 1 && diffDays <= 7) return `${diffDays} giorni fa`;
    const MONTHS_SHORT = ['gen','feb','mar','apr','mag','giu','lug','ago','set','ott','nov','dic'];
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
}

function renderGradesView() {
    if (state.activeSubject) return renderSubjectDetailView(state.activeSubject);

    const allVoti = getVotiData();
    const currentYearKey = getCurrentSchoolYearKey();
    const availableYears = getAvailableSchoolYears(allVoti);
    let activeYearKey = getActiveSchoolYear();
    if (!availableYears.includes(activeYearKey)) {
        activeYearKey = currentYearKey;
        state.selectedSchoolYear = activeYearKey;
    }
    const isCurrentSchoolYear = activeYearKey === currentYearKey;
    const archiveYears = availableYears.filter(yk => yk !== activeYearKey);

    const votiData = getVotesForSchoolYear(activeYearKey, allVoti);
    const trendSummary = getGradeMonthlyTrendSummary(votiData);
    const media = trendSummary.media;
    const hasMedia = media !== null && Number.isFinite(media) && votiData.length > 0;
    const monthList = trendSummary.monthList || [];
    const diffStr = trendSummary.diffStr;
    const isPositive = trendSummary.isPositive;

    const MN_FULL = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                     'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const now = new Date();
    const monthYearLabel = `${MN_FULL[now.getMonth()]} ${now.getFullYear()}`;

    // ── Build Geometrically Clean Straight Line Graph ──
    let graphHtml = '';
    if (monthList.length >= 2) {
        const rawVals = monthList.map(m => m.avg);
        const minV = Math.min(...rawVals);
        const maxV = Math.max(...rawVals);
        const span = (maxV - minV) || 1.0;

        const pts = rawVals.map((val, i) => {
            const x = Math.round(14 + (i / (rawVals.length - 1)) * 312);
            const norm = (val - minV) / span;
            const y = Math.round(54 - norm * 40); // 14 .. 54
            return { x, y };
        });

        const linePathD = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
        const areaPathD = `${linePathD} L ${pts[pts.length - 1].x} 70 L ${pts[0].x} 70 Z`;
        const lastPt = pts[pts.length - 1];

        graphHtml = `
        <div style="height:70px;width:100%;position:relative;z-index:1;">
            <svg viewBox="0 0 340 70" style="width:100%;height:100%;display:block;overflow:visible;" preserveAspectRatio="none">
                <defs>
                    <linearGradient id="voti-area-gradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stop-color="#2997ff" stop-opacity="0.25"></stop>
                        <stop offset="50%" stop-color="#30d158" stop-opacity="0.08"></stop>
                        <stop offset="100%" stop-color="#30d158" stop-opacity="0"></stop>
                    </linearGradient>
                    <linearGradient id="voti-line-gradient" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stop-color="#2997ff"></stop>
                        <stop offset="100%" stop-color="#30d158"></stop>
                    </linearGradient>
                </defs>
                <path class="grade-chart-area" d="${areaPathD}" fill="url(#voti-area-gradient)"></path>
                <path class="grade-chart-line" d="${linePathD}" fill="none" stroke="url(#voti-line-gradient)" stroke-width="2.8" stroke-linecap="round" stroke-linejoin="round"></path>
                <circle class="grade-chart-dot" cx="${lastPt.x}" cy="${lastPt.y}" r="4.5" fill="#30d158" stroke="#ffffff" stroke-width="2"></circle>
            </svg>
        </div>
        <div style="display:flex;justify-content:space-between;margin-top:6px;padding:0 4px;font-size:11px;font-weight:700;color:rgba(255,255,255,0.45);position:relative;z-index:1;">
            ${monthList.map((m, idx) => `<span style="${idx === monthList.length - 1 ? 'color:#30d158;font-weight:800;' : ''}">${m.label}</span>`).join('')}
        </div>`;
    } else {
        graphHtml = '';
    }

    // ── Per-subject stats ────────────────────────────────────────────────────
    const subjectsMap = {};

    // 1. Always initialize all 11 canonical subjects so all widgets are present in the carousel
    const canonicalSubjects = (typeof CANONICAL_GRADES_SUBJECTS !== 'undefined' && Array.isArray(CANONICAL_GRADES_SUBJECTS))
        ? CANONICAL_GRADES_SUBJECTS
        : [
            'Italiano',
            'Matematica',
            'Fisica',
            'Inglese',
            'Scienze Naturali',
            'Informatica',
            'Filosofia',
            'Storia Triennio',
            "Disegno e Storia Dell'arte Triennio",
            'Educazione Civica',
            'Scienze Motorie e Sportive'
        ];

    canonicalSubjects.forEach(sub => {
        const key = getSubjectGroupKey(sub);
        subjectsMap[key] = { name: sub, list: [] };
    });

    // 2. Populate votes for the active school year
    votiData.forEach(v => {
        const sub = v.materia || v.subject || 'Altro';
        const key = getSubjectGroupKey(sub);
        if (!subjectsMap[key]) {
            const canonicalName = (typeof getSubjectCanonicalName === 'function') ? getSubjectCanonicalName(sub) : null;
            subjectsMap[key] = { name: canonicalName || formatSubjectTitle(sub), list: [] };
        }
        subjectsMap[key].list.push(v);
    });

    let subjects = Object.values(subjectsMap).map(({ name, list }) => {
        const nums = list.map(getNumericGradeValue).filter(v => Number.isFinite(v));
        const hasVotes = nums.length > 0;
        const subMedia = hasVotes ? (averageFromNumeric(nums) || 0) : null;
        const lastVote = hasVotes ? [...list].sort((a, b) =>
            (b.data || b.date || '').localeCompare(a.data || a.date || '')
        )[0] : null;
        const lastVal = lastVote ? getNumericGradeValue(lastVote) : null;
        const lastDate = lastVote ? (lastVote.data || lastVote.date || '') : '';
        return { name, media: subMedia, hasVotes, lastVote: lastVal, lastVoteDate: lastDate };
    }).sort((a, b) => {
        const idxA = canonicalSubjects.indexOf(a.name);
        const idxB = canonicalSubjects.indexOf(b.name);
        if (idxA !== -1 && idxB !== -1) return idxA - idxB;
        if (idxA !== -1) return -1;
        if (idxB !== -1) return 1;
        return a.name.localeCompare(b.name);
    });

    let materieContentHtml = '';
    let subjectSlidesCount = 0;
    if (subjects.length > 0) {
        const SLIDE_SIZE = 5;
        const subjectSlides = [];
        for (let i = 0; i < subjects.length; i += SLIDE_SIZE) {
            subjectSlides.push(subjects.slice(i, i + SLIDE_SIZE));
        }
        subjectSlidesCount = subjectSlides.length;

        const slidesHtml = subjectSlides.map((slideItems) => {
            const featureItem = slideItems[0];
            const gridItems = slideItems.slice(1);

            const featureNameFormatted = formatSubjectTitle(featureItem ? featureItem.name : '');
            const featureDateFormatted = (featureItem && featureItem.lastVoteDate) ? formatFriendlyDate(featureItem.lastVoteDate) : '';
            const featureTheme = featureItem ? getSubjectTheme(featureItem.name) : getSubjectTheme('');
            const hasFeatVotes = !!(featureItem && featureItem.hasVotes && featureItem.media !== null);

            const featureHtml = featureItem ? `
            <div style="position:relative;padding:16px 18px;background:rgba(20,31,54,0.85);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);border:0.5px solid ${featureTheme.border};border-top:1px solid rgba(255,255,255,0.25);border-radius:24px;display:flex;align-items:center;justify-content:space-between;cursor:pointer;margin-bottom:12px;transition:transform 0.15s ease;box-shadow:0 8px 24px -6px rgba(6,14,32,0.6);overflow:hidden;" onclick="navigateSubject('${escapeJsSingleQuote(featureItem.name)}')" ontouchstart="this.style.transform='scale(0.98)'" ontouchend="this.style.transform='scale(1)'">
                <!-- Sfumatura cromatica in angolo del colore della materia -->
                <div style="position:absolute;top:-28px;right:-28px;width:100px;height:100px;background:${featureTheme.color};opacity:0.22;border-radius:50%;filter:blur(26px);pointer-events:none;"></div>

                <div style="display:flex;align-items:center;gap:14px;min-width:0;flex:1;position:relative;z-index:1;">
                    <div style="width:44px;height:44px;border-radius:14px;background:${featureTheme.iconBg};border:1px solid ${featureTheme.border};display:flex;align-items:center;justify-content:center;color:${featureTheme.color};flex-shrink:0;">
                        <i class="ph-fill ${featureTheme.icon}" style="font-size:22px;"></i>
                    </div>
                    <div style="min-width:0;flex:1;">
                        <h3 style="font-size:15px;font-weight:700;color:#ffffff;margin:0 0 3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(featureNameFormatted)}</h3>
                        <p style="font-size:12px;color:rgba(255,255,255,0.6);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${hasFeatVotes ? `Ultimo: ${featureItem.lastVote !== null ? featureItem.lastVote : '—'} (${featureDateFormatted})` : 'Nessuna valutazione per ora'}</p>
                    </div>
                </div>
                <div style="text-align:right;flex-shrink:0;margin-left:12px;position:relative;z-index:1;">
                    <span style="font-size:22px;font-weight:800;color:${hasFeatVotes ? (featureItem.media >= 6 ? '#ffffff' : '#ffb4ab') : 'rgba(255,255,255,0.45)'};letter-spacing:-0.02em;">${hasFeatVotes ? featureItem.media.toFixed(1) : '—'}</span>
                </div>
            </div>` : '';

            const gridCardsHtml = gridItems.map((item) => {
                const itemFormattedName = formatSubjectTitle(item.name);
                const itemTheme = getSubjectTheme(item.name);
                const hasItemVotes = !!(item.hasVotes && item.media !== null);
                return `
                <div style="position:relative;padding:14px 16px;background:rgba(20,31,54,0.85);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);border:0.5px solid ${itemTheme.border};border-top:1px solid rgba(255,255,255,0.22);border-radius:20px;display:flex;flex-direction:column;justify-content:space-between;height:114px;box-sizing:border-box;cursor:pointer;transition:transform 0.15s ease;overflow:hidden;" onclick="navigateSubject('${escapeJsSingleQuote(item.name)}')" ontouchstart="this.style.transform='scale(0.97)'" ontouchend="this.style.transform='scale(1)'">
                    <!-- Sfumatura cromatica in angolo del colore della materia -->
                    <div style="position:absolute;top:-22px;right:-22px;width:76px;height:76px;background:${itemTheme.color};opacity:0.20;border-radius:50%;filter:blur(20px);pointer-events:none;"></div>

                    <div style="display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1;">
                        <div style="width:36px;height:36px;border-radius:12px;background:${itemTheme.iconBg};border:1px solid ${itemTheme.border};display:flex;align-items:center;justify-content:center;color:${itemTheme.color};flex-shrink:0;">
                            <i class="ph-fill ${itemTheme.icon}" style="font-size:18px;"></i>
                        </div>
                        <span style="font-size:20px;font-weight:800;color:${hasItemVotes ? (item.media >= 6 ? '#ffffff' : '#ffb4ab') : 'rgba(255,255,255,0.45)'};letter-spacing:-0.02em;flex-shrink:0;">${hasItemVotes ? item.media.toFixed(1) : '—'}</span>
                    </div>
                    <h3 style="font-size:13px;font-weight:700;color:${itemTheme.color};line-height:1.25;margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;position:relative;z-index:1;">${escapeHtml(itemFormattedName)}</h3>
                </div>`;
            }).join('');

            return `
            <div class="voti-subjects-slide" style="flex:0 0 100%;min-width:100%;width:100%;max-width:100%;box-sizing:border-box;scroll-snap-align:start;scroll-snap-stop:always;display:flex;flex-direction:column;justify-content:flex-start;min-height:310px;padding:0 20px;">
                ${featureHtml}
                ${gridCardsHtml ? `<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    ${gridCardsHtml}
                </div>` : ''}
            </div>`;
        }).join('');

        const dotsHtml = subjectSlides.map((_, i) => `
            <div class="voti-subjects-dot" data-idx="${i}" onclick="window.votiJumpToSlide(${i})" style="width:${i===0?'20px':'6px'};height:6px;border-radius:9999px;background:${i===0?'#2997ff':'rgba(255,255,255,0.25)'};transition:all 0.3s cubic-bezier(0.2,0.8,0.2,1);cursor:pointer;-webkit-tap-highlight-color:transparent;"></div>
        `).join('');

        materieContentHtml = `
        <div id="voti-subjects-carousel" style="
            display: flex;
            overflow-x: auto;
            scroll-snap-type: x mandatory;
            scroll-behavior: smooth;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior-x: contain;
            scrollbar-width: none;
            -ms-overflow-style: none;
            gap: 0;
            margin: 0 -20px;
            padding: 0;
            width: calc(100% + 40px);
        " onscroll="handleVotiSubjectsScroll(this)">
            ${slidesHtml}
        </div>
        ${subjectSlides.length > 1 ? `
        <div style="display:flex;justify-content:center;align-items:center;gap:6px;margin-top:6px;">
            ${dotsHtml}
        </div>` : ''}`;
    }

    let aiInsightText = "L'anno scolastico è appena iniziato. Appena riceverai le prime valutazioni, l'AI analizzerà il tuo rendimento e suggerirà strategie di studio personalizzate.";
    if (votiData.length > 0 && subjects.length > 0) {
        const validWithVotes = subjects.filter(s => s.hasVotes && s.media !== null);
        const minSubj = validWithVotes.length > 0 ? [...validWithVotes].sort((a,b) => a.media - b.media)[0] : null;
        if (minSubj && minSubj.media < 7 && minSubj.media > 0) {
            aiInsightText = `Il tuo rendimento complessivo è solido. Ti suggeriamo di dedicare 30m extra a ${formatSubjectTitle(minSubj.name)} per equilibrare la media generale.`;
        } else if (hasMedia && media >= 8.5) {
            aiInsightText = "Rendimento straordinario in tutte le materie! Mantieni questo ritmo costante per il prossimo trimestre.";
        } else {
            aiInsightText = "Rendimento equilibrato nelle materie registrate. Continua con costanza nello studio quotidiano.";
        }
    }

    // ── Global Stats & Highlights ──
    const totVoti = votiData.length;
    const suffCount = votiData.filter(v => getNumericGradeValue(v) >= 6).length;
    const insuffCount = totVoti - suffCount;
    const suffPct = totVoti > 0 ? Math.round((suffCount / totVoti) * 100) : 0;
    const validSubjects = subjects.filter(s => s.hasVotes && s.media !== null);
    const bestSubject = validSubjects.length > 0 ? validSubjects[0] : null;
    const minSubject = validSubjects.length > 0 ? [...validSubjects].sort((a, b) => a.media - b.media)[0] : null;



    // Status Badge
    let globalStatusBadge = { label: 'In attesa', color: 'rgba(255,255,255,0.6)', bg: 'rgba(255,255,255,0.08)', border: 'rgba(255,255,255,0.14)', icon: 'ph-hourglass-simple' };
    if (hasMedia) {
        if (media >= 8.5) {
            globalStatusBadge = { label: 'Eccellente', color: '#30d158', bg: 'rgba(48,209,88,0.18)', border: 'rgba(48,209,88,0.38)', icon: 'ph-star' };
        } else if (media >= 7.5) {
            globalStatusBadge = { label: 'Ottimo', color: '#30d158', bg: 'rgba(48,209,88,0.15)', border: 'rgba(48,209,88,0.35)', icon: 'ph-trend-up' };
        } else if (media >= 6.5) {
            globalStatusBadge = { label: 'Discreto', color: '#64d2ff', bg: 'rgba(100,210,255,0.15)', border: 'rgba(100,210,255,0.35)', icon: 'ph-thumbs-up' };
        } else if (media >= 6.0) {
            globalStatusBadge = { label: 'Sufficiente', color: '#2997ff', bg: 'rgba(41,151,255,0.15)', border: 'rgba(41,151,255,0.35)', icon: 'ph-check' };
        } else {
            globalStatusBadge = { label: 'Critico', color: '#ff453a', bg: 'rgba(255,69,58,0.18)', border: 'rgba(255,69,58,0.38)', icon: 'ph-warning' };
        }
    }

    return `
    <div class="view-fullbleed min-h-screen" style="padding:0 0 160px 0;background:var(--bg-base, #0c1424);font-family:'Inter',sans-serif;">

        <!-- ══ HEADER (iOS HIG Large Title) ══ -->
        <header class="ios-header-wrapper" style="padding:max(env(safe-area-inset-top,0px),24px) 20px 14px;">
            <div class="ios-sub-title">VALUTAZIONI & MEDIE</div>
            <h1 class="ios-large-title">Voti</h1>
        </header>

        ${availableYears.length > 1 ? `
        <!-- ══ SCHOOL YEAR SELECTOR (ANNO SCOLASTICO) ══ -->
        <div style="display:flex;align-items:center;gap:8px;padding:0 20px 14px;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;">
            ${availableYears.map(yk => {
                const isSelected = yk === activeYearKey;
                const isCurr = yk === currentYearKey;
                const label = `A.S. ${yk}${isCurr ? ' (In corso)' : ' (Archivio)'}`;
                return `
                <button onclick="window.selectSchoolYear('${yk}')" style="
                    display:inline-flex;align-items:center;gap:6px;
                    padding:7px 14px;border-radius:9999px;font-size:12px;font-weight:700;
                    white-space:nowrap;cursor:pointer;transition:all 0.2s ease;
                    background:${isSelected ? 'rgba(41,151,255,0.22)' : 'rgba(255,255,255,0.06)'};
                    border:${isSelected ? '1px solid rgba(41,151,255,0.6)' : '1px solid rgba(255,255,255,0.1)'};
                    color:${isSelected ? '#ffffff' : 'rgba(255,255,255,0.65)'};
                    box-shadow:${isSelected ? '0 2px 10px rgba(41,151,255,0.25)' : 'none'};
                " ontouchstart="this.style.transform='scale(0.96)'" ontouchend="this.style.transform='scale(1)'">
                    <i class="ph-bold ${isCurr ? 'ph-graduation-cap' : 'ph-archive'}" style="font-size:13px;color:${isSelected ? '#2997ff' : 'rgba(255,255,255,0.5)'};"></i>
                    <span>${label}</span>
                </button>`;
            }).join('')}
        </div>` : ''}

        <main style="padding:0 20px;display:flex;flex-direction:column;gap:18px;">
            <!-- ══ HERO CARD: MEDIA GENERALE & STATISTICHE ══ -->
            <section style="position:relative;padding:22px 20px 20px;background:rgba(18,26,44,0.76);backdrop-filter:blur(30px) saturate(180%);-webkit-backdrop-filter:blur(30px) saturate(180%);border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.24);border-radius:28px;box-shadow:0 20px 48px -12px rgba(0,0,0,0.65);overflow:hidden;">
                <!-- Dual Corner Chromatic Glows (Azure top-right, Emerald bottom-left) -->
                <div style="position:absolute;top:-30px;right:-30px;width:120px;height:120px;background:#2997ff;opacity:0.22;border-radius:50%;filter:blur(30px);pointer-events:none;"></div>
                <div style="position:absolute;bottom:-30px;left:-30px;width:100px;height:100px;background:#30d158;opacity:0.14;border-radius:50%;filter:blur(28px);pointer-events:none;"></div>

                <!-- Header Row -->
                <div style="display:flex;justify-content:space-between;align-items:center;position:relative;z-index:1;margin-bottom:12px;">
                    <div style="display:flex;align-items:center;gap:6px;">
                        <span style="width:7px;height:7px;border-radius:50%;background:#2997ff;box-shadow:0 0 8px rgba(41,151,255,0.8);"></span>
                        <span style="font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;color:#2997ff;">MEDIA GENERALE</span>
                    </div>
                    <div style="display:flex;align-items:center;gap:8px;">
                        <span style="display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:9999px;background:rgba(41,151,255,0.14);border:0.5px solid rgba(41,151,255,0.35);font-size:10px;font-weight:700;color:#2997ff;backdrop-filter:blur(12px);">
                            <i class="ph-bold ph-graduation-cap" style="font-size:12px;"></i> A.S. ${escapeHtml(activeYearKey)}
                        </span>
                        <button onclick="if(navigator.share){navigator.share({title:'Media Generale',text:'La mia media su Gandhi Diary per l\\'A.S. ${escapeJsSingleQuote(activeYearKey)} è ${hasMedia ? media.toFixed(2) : 'in aggiornamento'}!'}).catch(()=>{});}" style="width:34px;height:34px;border-radius:50%;background:rgba(255,255,255,0.08);border:0.5px solid rgba(255,255,255,0.15);display:flex;align-items:center;justify-content:center;cursor:pointer;color:#ffffff;transition:transform 0.15s ease;" ontouchstart="this.style.transform='scale(0.9)'" ontouchend="this.style.transform='scale(1)'">
                            <i class="ph ph-share-network text-[16px] text-[#ffffff]"></i>
                        </button>
                    </div>
                </div>

                <!-- Primary Number & Badges -->
                <div style="display:flex;align-items:baseline;justify-content:space-between;position:relative;z-index:1;margin-bottom:16px;">
                    <div style="display:flex;align-items:baseline;gap:12px;">
                        <span style="font-size:52px;font-weight:800;color:#ffffff;letter-spacing:-0.03em;line-height:1;font-variant-numeric:tabular-nums;">${hasMedia ? media.toFixed(2) : '—'}</span>
                        ${hasMedia && diffStr ? `
                        <div style="background:${isPositive ? 'rgba(48,209,88,0.18)' : 'rgba(255,69,58,0.18)'};padding:3px 9px;border-radius:9999px;display:inline-flex;align-items:center;gap:4px;border:1px solid ${isPositive ? 'rgba(48,209,88,0.4)' : 'rgba(255,69,58,0.4)'};box-shadow:0 2px 6px ${isPositive ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)'};">
                            <i class="ph-bold ${isPositive ? 'ph-trend-up' : 'ph-trend-down'}" style="font-size:12px;color:${isPositive ? '#30d158' : '#ff453a'};"></i>
                            <span style="font-size:11px;font-weight:700;color:${isPositive ? '#30d158' : '#ff453a'};">${diffStr}</span>
                        </div>` : ''}
                    </div>
                    <span style="display:inline-flex;align-items:center;gap:5px;padding:4px 11px;border-radius:9999px;background:${globalStatusBadge.bg};border:1px solid ${globalStatusBadge.border};font-size:11px;font-weight:700;color:${globalStatusBadge.color};">
                        <i class="ph-fill ${globalStatusBadge.icon}" style="font-size:13px;"></i> ${globalStatusBadge.label}
                    </span>
                </div>



                <!-- 4 Bento Metric Pills (2x2 Grid) -->
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;position:relative;z-index:1;margin-bottom:16px;">
                    <!-- Bento 1: Totale Voti -->
                    <div style="background:rgba(41,151,255,0.08);padding:9px 12px;border-radius:14px;border:0.5px solid rgba(41,151,255,0.22);display:flex;flex-direction:column;gap:2px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.04em;">Valutazioni</span>
                            <i class="ph-fill ph-list-numbers" style="font-size:13px;color:#2997ff;"></i>
                        </div>
                        <span style="font-size:16px;font-weight:800;color:#2997ff;font-variant-numeric:tabular-nums;">${totVoti} <span style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);">totali</span></span>
                    </div>

                    <!-- Bento 2: Tasso Sufficienze -->
                    <div style="background:rgba(48,209,88,0.08);padding:9px 12px;border-radius:14px;border:0.5px solid rgba(48,209,88,0.22);display:flex;flex-direction:column;gap:2px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.04em;">Sufficienze</span>
                            <i class="ph-fill ph-check-circle" style="font-size:13px;color:#30d158;"></i>
                        </div>
                        <span style="font-size:16px;font-weight:800;color:#30d158;font-variant-numeric:tabular-nums;">${totVoti > 0 ? `${suffPct}% <span style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);">(${suffCount}/${totVoti})</span>` : '—'}</span>
                    </div>

                    <!-- Bento 3: Materia Top -->
                    <div style="background:rgba(255,159,10,0.08);padding:9px 12px;border-radius:14px;border:0.5px solid rgba(255,159,10,0.22);display:flex;flex-direction:column;gap:2px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.04em;">Materia Top</span>
                            <i class="ph-fill ph-trophy" style="font-size:13px;color:#ff9f0a;"></i>
                        </div>
                        <span style="font-size:14px;font-weight:800;color:#ff9f0a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${bestSubject && totVoti > 0 ? `${bestSubject.media.toFixed(1)} ${formatSubjectTitle(bestSubject.name)}` : '—'}</span>
                    </div>

                    <!-- Bento 4: Da Monitorare -->
                    <div style="background:rgba(191,90,242,0.08);padding:9px 12px;border-radius:14px;border:0.5px solid rgba(191,90,242,0.22);display:flex;flex-direction:column;gap:2px;">
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span style="font-size:9px;font-weight:700;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.04em;">Da Monitorare</span>
                            <i class="ph-fill ph-crosshair" style="font-size:13px;color:#bf5af2;"></i>
                        </div>
                        <span style="font-size:14px;font-weight:800;color:#bf5af2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${minSubject && totVoti > 0 ? `${minSubject.media.toFixed(1)} ${formatSubjectTitle(minSubject.name)}` : '—'}</span>
                    </div>
                </div>

                <!-- Bilancio Sufficienze vs Insufficienze Ratio Bar -->
                <div style="position:relative;z-index:1;margin-bottom:14px;">
                    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;font-size:10px;font-weight:700;">
                        <span style="color:#30d158;display:flex;align-items:center;gap:3px;"><i class="ph-bold ph-check" style="font-size:10px;"></i> ${suffCount} Sufficienze</span>
                        <span style="color:${insuffCount > 0 ? '#ff453a' : 'rgba(255,255,255,0.4)'};display:flex;align-items:center;gap:3px;">${insuffCount} Insufficienze <i class="ph-bold ph-x" style="font-size:10px;"></i></span>
                    </div>
                    <div style="width:100%;height:5px;background:rgba(255,255,255,0.06);border-radius:9999px;overflow:hidden;display:flex;">
                        <div style="width:${totVoti > 0 ? suffPct : 0}%;height:100%;background:#30d158;border-radius:9999px 0 0 9999px;transition:width 0.4s ease;"></div>
                        <div style="width:${totVoti > 0 ? (100 - suffPct) : 0}%;height:100%;background:#ff453a;border-radius:0 9999px 9999px 0;transition:width 0.4s ease;"></div>
                    </div>
                </div>

                <!-- Trend Graph SVG or Empty State -->
                ${graphHtml}
            </section>

            <!-- Subjects Bento Section -->
            <section style="display:flex;flex-direction:column;gap:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;padding:0 4px;">
                    <h2 style="font-size:20px;font-weight:700;color:#ffffff;margin:0;line-height:1.2;letter-spacing:-0.01em;">Materie</h2>
                    <span style="font-size:13px;font-weight:600;color:#2997ff;cursor:pointer;opacity:0.9;transition:opacity 0.15s ease;" onmouseenter="this.style.opacity='1'" onmouseleave="this.style.opacity='0.9'" onclick="if(typeof openAllGradesModal==='function')openAllGradesModal();">Tutti i voti</span>
                </div>

                ${materieContentHtml}
            </section>

            <!-- AI Insight Card (Apple Material) -->
            <section style="padding:16px 18px;background:rgba(20,31,54,0.78);backdrop-filter:blur(25px) saturate(180%);-webkit-backdrop-filter:blur(25px) saturate(180%);border:0.5px solid rgba(255,255,255,0.12);border-top:1px solid rgba(255,255,255,0.22);border-radius:24px;display:flex;align-items:center;gap:14px;">
                <div style="width:40px;height:40px;border-radius:50%;background:linear-gradient(135deg,#2997ff 0%,#0058bc 100%);display:flex;align-items:center;justify-content:center;color:#ffffff;box-shadow:0 4px 14px rgba(41,151,255,0.35);flex-shrink:0;">
                    <i class="ph-fill ph-sparkle text-[20px]"></i>
                </div>
                <div style="flex:1;min-width:0;">
                    <h4 style="font-size:11px;font-weight:700;color:#2997ff;text-transform:uppercase;letter-spacing:0.06em;margin:0 0 2px;">AI Insight</h4>
                    <p style="font-size:13px;color:rgba(255,255,255,0.85);line-height:1.45;margin:0;">${aiInsightText}</p>
                </div>
            </section>
        </main>
    </div>`;
}

window.votiJumpToSlide = function(idx) {
    const el = document.getElementById('voti-subjects-carousel');
    if (el) {
        const slides = el.querySelectorAll('.voti-subjects-slide');
        const targetSlide = slides[idx];
        if (targetSlide) {
            el.scrollTo({ left: targetSlide.offsetLeft, behavior: 'smooth' });
        } else {
            const slideWidth = el.clientWidth || el.offsetWidth || window.innerWidth;
            el.scrollTo({ left: idx * slideWidth, behavior: 'smooth' });
        }
    }
};

window.handleVotiSubjectsScroll = function(el) {
    if (!el) return;
    const slideWidth = el.clientWidth || el.offsetWidth || window.innerWidth;
    if (!slideWidth) return;
    const idx = Math.round(el.scrollLeft / slideWidth);
    document.querySelectorAll('.voti-subjects-dot').forEach(function(dot, i) {
        dot.style.width = i === idx ? '20px' : '6px';
        dot.style.background = i === idx ? '#2997ff' : 'rgba(255, 255, 255, 0.25)';
        dot.style.borderRadius = '9999px';
    });
};

window.openAllGradesModal = function() {
    const activeYearKey = (typeof getActiveSchoolYear === 'function') ? getActiveSchoolYear() : getCurrentSchoolYearKey();
    const allVoti = getVotiData();
    const rawVoti = (typeof getVotesForSchoolYear === 'function') ? getVotesForSchoolYear(activeYearKey, allVoti) : allVoti;

    if (!rawVoti || rawVoti.length === 0) {
        if (typeof window.openBottomSheet === 'function') {
            window.openBottomSheet({
                title: `Tutti i Voti · A.S. ${escapeHtml(activeYearKey)} (0)`,
                html: `
                    <div style="text-align:center;padding:36px 20px 24px;color:rgba(255,255,255,0.7);">
                        <div style="width:58px;height:58px;border-radius:18px;background:rgba(255,255,255,0.06);border:1px solid rgba(255,255,255,0.12);display:flex;align-items:center;justify-content:center;margin:0 auto 16px;color:#0a84ff;font-size:26px;">
                            <i class="ph-fill ph-student"></i>
                        </div>
                        <h4 style="font-size:16px;font-weight:700;color:#fff;margin:0 0 6px;">Nessun voto registrato</h4>
                        <p style="font-size:13px;color:rgba(255,255,255,0.5);margin:0;line-height:1.4;">Non sono ancora presenti valutazioni per l'anno scolastico ${escapeHtml(activeYearKey)}.</p>
                    </div>
                `
            });
        } else if (typeof window.showToast === 'function') {
            window.showToast(`Nessuna valutazione registrata per l'A.S. ${activeYearKey}`, 'info');
        }
        return;
    }

    const sortedVoti = [...rawVoti].sort((a, b) => parseArgoDate(b.data || b.date) - parseArgoDate(a.data || a.date));

    const html = `
        <div style="display:flex;flex-direction:column;gap:10px;padding-bottom:20px;">
            ${sortedVoti.map((v) => {
                const val = getNumericGradeValue(v);
                const isSuff = val >= 6;
                const color = isSuff ? '#30d158' : '#ff453a';
                const bgBadge = isSuff ? 'rgba(48,209,88,0.15)' : 'rgba(255,69,58,0.15)';
                const borderBadge = isSuff ? 'rgba(48,209,88,0.3)' : 'rgba(255,69,58,0.3)';
                const date = (v.data || v.date || '').split('T')[0].split('-').reverse().join('/');
                const subj = formatSubjectTitle(v.materia || v.subject || 'Materia');
                const itemTheme = getSubjectTheme(v.materia || v.subject || '');
                const tipo = normalizeTipoVerifica(v.tipo, false);
                const desc = v.descrizione || v.comment || '';

                return `
                <div style="position:relative;overflow:hidden;padding:14px 16px;background:rgba(20,31,54,0.78);backdrop-filter:blur(20px);-webkit-backdrop-filter:blur(20px);border:0.5px solid rgba(255,255,255,0.1);border-top:1px solid rgba(255,255,255,0.18);border-radius:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;">
                    <!-- Sfumatura cromatica in angolo del colore della materia -->
                    <div style="position:absolute;top:-20px;right:-20px;width:64px;height:64px;background:${itemTheme.color};opacity:0.18;border-radius:50%;filter:blur(18px);pointer-events:none;"></div>

                    <div style="width:36px;height:36px;border-radius:12px;background:${itemTheme.iconBg};border:1px solid ${itemTheme.border};display:flex;align-items:center;justify-content:center;color:${itemTheme.color};flex-shrink:0;position:relative;z-index:1;">
                        <i class="ph-fill ${itemTheme.icon}" style="font-size:18px;"></i>
                    </div>
                    <div style="min-width:0;flex:1;position:relative;z-index:1;">
                        <div style="display:flex;align-items:center;gap:6px;margin-bottom:3px;">
                            <span style="font-size:14px;font-weight:700;color:#ffffff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${escapeHtml(subj)}</span>
                            <span style="font-size:11px;padding:2px 6px;border-radius:6px;background:rgba(255,255,255,0.08);color:rgba(255,255,255,0.6);font-weight:600;">${escapeHtml(tipo)}</span>
                        </div>
                        <p style="font-size:12px;color:rgba(255,255,255,0.5);margin:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${date}${desc ? ` · ${escapeHtml(desc)}` : ''}</p>
                    </div>
                    <span style="display:inline-flex;align-items:center;justify-content:center;min-width:38px;padding:4px 10px;border-radius:9999px;font-size:16px;font-weight:800;background:${bgBadge};border:1px solid ${borderBadge};color:${color};flex-shrink:0;position:relative;z-index:1;">${v.valore || v.value}</span>
                </div>`;
            }).join('')}
        </div>
    `;

    if (typeof window.openBottomSheet === 'function') {
        window.openBottomSheet({
            title: `Tutti i Voti · A.S. ${escapeHtml(activeYearKey)} (${sortedVoti.length})`,
            html: html
        });
    }
};
