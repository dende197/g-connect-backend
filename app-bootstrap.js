// ==============================================================================
        // G-CONNECT CORE SYSTEM v3.0
        // ==============================================================================
        const GCONNECT_DEFAULT_API_BACKEND = 'https://g-connect-backend-r5j1.vercel.app';
        console.log(`🚀 Booting G-Connect on ${window.location.hostname}`);

        function resolveApiBaseUrl() {
            // SECURITY: No user-controlled overrides (?api= or localStorage).
            // Only same-origin or the hardcoded production backend for GitHub Pages.
            const sameOrigin = window.location.origin;
            const isGitHubPages = /(^|\.)github\.io$/i.test(window.location.hostname);
            if (!isGitHubPages) return { url: sameOrigin, source: 'same-origin' };
            return { url: GCONNECT_DEFAULT_API_BACKEND, source: 'github-pages fallback' };
        }

        // Clean up any previously stored override from old versions and sensitive sessionStorage items
        try { localStorage.removeItem('gconnect_api_base_url'); } catch (_) {}
        try { sessionStorage.removeItem('_argo_pwd_session'); } catch (_) {}

        const resolvedApi = resolveApiBaseUrl();
        const API_BASE_URL = resolvedApi.url;
        window.API_BASE_URL = API_BASE_URL;
        console.log(`[Network] API base resolved (${resolvedApi.source}): ${API_BASE_URL}`);

        // Supabase client is initialised lazily once config is loaded from the backend
        let supabaseClient = null;
        async function getSupabaseClient() {
            if (supabaseClient) return supabaseClient;
            try {
                const cfg = await fetch(`${API_BASE_URL}/api/config`).then(r => r.json());
                const sbUrl = cfg.supabaseUrl;
                const sbKey = cfg.supabaseAnonKey;
                if (!sbUrl || !sbKey) {
                    console.error('[Config] Server did not return Supabase configuration.');
                    return null;
                }
                if (window.supabase && typeof window.supabase.createClient === 'function') {
                    supabaseClient = window.supabase.createClient(sbUrl, sbKey);
                }
            } catch (e) {
                console.warn('[Config] Could not load Supabase config:', e.message);
            }
            return supabaseClient;
        }
        window.getSupabaseClient = getSupabaseClient;

        // Global Variable Shims for ui.js
        let calendarState = { weekOffset: 0 };
        let __mediaGaugeRAF = null;
        let offlineBadge = null;

        // --- SESSION MANAGER (v7.0) ---
        const sessionManager = {
            isValidSessionObject(s) {
                return !!(s && typeof s === 'object' && s.schoolCode && s.userName);
            },
            sanitizeSensitiveSessionData(obj) {
                if (!obj || typeof obj !== 'object') return obj;
                delete obj.storedUser;
                delete obj.storedPass;
                delete obj.ephemeralPassword;
                return obj;
            },
            save(data) {
                try {
                    const existing = this.load() || {};
                    const merged = { ...existing };
                    this.sanitizeSensitiveSessionData(merged);
                    for (const [k, v] of Object.entries(data)) if (v !== null && v !== undefined) merged[k] = v;
                    localStorage.setItem('argo_session', JSON.stringify(merged));
                    localStorage.setItem('argo_is_logged_in', 'true');
                } catch (e) { console.error("Session save failed", e); }
            },
            load() {
                try {
                    const s = localStorage.getItem('argo_session');
                    const parsed = s ? JSON.parse(s) : null;
                    if (parsed && (parsed.storedUser || parsed.storedPass || parsed.ephemeralPassword)) {
                        this.sanitizeSensitiveSessionData(parsed);
                        localStorage.setItem('argo_session', JSON.stringify(parsed));
                    }
                    return parsed;
                } catch (e) { return null; }
            },
            isLoggedIn() {
                const hasLoginFlag = localStorage.getItem('argo_is_logged_in') === 'true';
                if (!hasLoginFlag) return false;
                const s = this.load();
                const hasValidSession = this.isValidSessionObject(s);
                if (!hasValidSession) this.clear();
                return hasValidSession;
            },
            clear() {
                localStorage.removeItem('argo_session');
                localStorage.removeItem('argo_is_logged_in');
                localStorage.removeItem('argo_password');
                localStorage.removeItem('gc_user_class_override');
                try {
                    Object.keys(localStorage).forEach(k => {
                        if (k.startsWith('gc_class_') || k.startsWith('gc_cached_')) {
                            localStorage.removeItem(k);
                        }
                    });
                } catch (_) {}
                console.log("Session cleared");
            }
        };

        function getActiveProfileKey() {
            const s = sessionManager.load();
            if (!s || !sessionManager.isLoggedIn()) return 'guest';
            return `p:${s.schoolCode || '0'}:${(s.userName || '0').toLowerCase()}:${s.profileIndex ?? 0}`;
        }
        function lsKey(key) { return `${getActiveProfileKey()}:${key}`; }
        window.lsKey = lsKey;

        function generatePid(s, u, i) { return `p:${s}:${u}:${i ?? 0}`.toLowerCase().replace(/\s+/g, ''); }
        function getUserId() {
            const s = sessionManager.load();
            if (!s) return 'guest';
            return s.studentId || generatePid(s.schoolCode, s.userName, s.profileIndex);
        }
        window.getUserId = getUserId;

        function getSessionHeaders(extra = {}) {
            const s = sessionManager.load();
            const headers = { 'Content-Type': 'application/json', ...extra };
            if (s && s.sessionToken) headers['x-session-token'] = s.sessionToken;
            return headers;
        }
        window.getSessionHeaders = getSessionHeaders;
        window.sessionManager = sessionManager;

        // --- STATE ENGINE ---
        const state = {
            view: 'home',
            user: { id: null, name: 'Studente', class: '', avatar: null, specialization: null },
            didup: { connected: false, lastUpdate: null, lastSuccessTs: 0, stale: false },

            syncDiagnostics: [],
            lastSync: null,
            streak: 0,
            activeSubject: null,
            plannerMode: 'registro',
            plannerView: 'calendar',
            isLoggedIn: false,
            isOffline: false,
            syncing: false,
            booting: true,
            tasks: [],
            voti: [],
            exams: [],
            backlog: [],
            reminders: [],
            promemoria: [],
            plannedTasks: {},
            plannedDetails: {},
            classActivities: [],
            plannedClassActivities: [],
            circolari: [],
            messages: {},
            threads: [],
            googleConnected: false,
            uiMode: 'calendar',
            homeTaskFocus: 'today',
            agendaSearchQuery: '',
            agendaSearchSubject: 'all'
        };
        window.state = state;

        // Keep local data "fresh enough" for fast relaunches without forcing boot sync.
        const SYNC_TTL_MS = 8 * 60 * 60 * 1000;
        window.SYNC_TTL_MS = SYNC_TTL_MS;

        function getPersistedLastSyncAt() {
            const legacyDidupTs = parseInt(localStorage.getItem(lsKey('didup_last_success_ts')) || '0', 10);
            const persisted = parseInt(localStorage.getItem(lsKey('last_sync_at')) || '0', 10);
            const ts = Number.isFinite(persisted) && persisted > 0 ? persisted : legacyDidupTs;
            return Number.isFinite(ts) && ts > 0 ? ts : 0;
        }

        function setPersistedLastSyncAt(ts = Date.now()) {
            const safeTs = Number.isFinite(ts) && ts > 0 ? ts : Date.now();
            localStorage.setItem(lsKey('last_sync_at'), String(safeTs));
            localStorage.setItem(lsKey('didup_last_success_ts'), String(safeTs));
            state.didup.lastSuccessTs = safeTs;
        }

        // Sync on boot only when cache is missing/stale (> 8h).
        function shouldSyncOnBoot(lastSyncAt) {
            const ts = Number(lastSyncAt);
            if (!Number.isFinite(ts) || ts <= 0) return true;
            return (Date.now() - ts) > SYNC_TTL_MS;
        }
        window.shouldSyncOnBoot = shouldSyncOnBoot;

        function appendSyncDiagnostic(entry) {
            try {
                const fallbackSummary = entry?.success ? 'Sync completato' : 'Sync fallito';
                const rawSummary = (entry && typeof entry.summary === 'string') ? entry.summary.trim() : '';
                const item = {
                    ts: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
                    source: entry?.source || 'sync',
                    success: !!entry?.success,
                    summary: rawSummary || fallbackSummary
                };
                const maxItems = 20;
                const next = [item, ...(Array.isArray(state.syncDiagnostics) ? state.syncDiagnostics : [])].slice(0, maxItems);
                state.syncDiagnostics = next;
                localStorage.setItem(lsKey('sync_diagnostics'), JSON.stringify(next));
            } catch (err) {
                console.warn('Failed to append sync diagnostic:', err?.message || err);
            }
        }
        window.appendSyncDiagnostic = appendSyncDiagnostic;

        // --- NAVIGATE (defined early so fluidity-engine can upgrade it to v3) ---
        const _allowedViews = ['home', 'planner', 'voti', 'academic_profile', 'profile', 'circolari'];
        window.navigate = function navigate(v) {
            if (v === 'assenze') {
                if (typeof window.mostraAssenzeModal === 'function') window.mostraAssenzeModal();
                return;
            }
            if (!_allowedViews.includes(v)) v = 'home';
            if (v === 'planner') {
                if (typeof getLocalDateString === 'function') {
                    state.selectedDate = getLocalDateString(new Date());
                }
                state.plannerWeekOffset = 0;
            }
            location.hash = v;
        };

        function saveNavigationState() {
            if (!state.isLoggedIn || state._loggedOut) return;
            try {
                localStorage.setItem(lsKey('last_view'), String(state.view || 'home'));
                localStorage.setItem(lsKey('last_scroll_y'), String(Math.max(0, Math.round(window.scrollY || 0))));
            } catch (_) {}
        }
        window.saveNavigationState = saveNavigationState;

        function restoreNavigationStateFromStorage() {
            try {
                const lastView = String(localStorage.getItem(lsKey('last_view')) || '').trim();
                const view = _allowedViews.includes(lastView) ? lastView : null;
                const scrollY = parseInt(localStorage.getItem(lsKey('last_scroll_y')) || '0', 10);
                return { view, scrollY: Number.isFinite(scrollY) && scrollY > 0 ? scrollY : 0 };
            } catch (_) {
                return { view: null, scrollY: 0 };
            }
        }

        function snapshotUiStateForSync() {
            return {
                view: state.view,
                hash: window.location.hash || '',
                scrollY: Math.max(0, Math.round(window.scrollY || 0)),
                selectedDate: state.selectedDate,
                plannerWeekOffset: state.plannerWeekOffset,
                plannerMonthView: state.plannerMonthView,
                plannerMonthViewYear: state.plannerMonthViewYear,
                plannerMonthViewMonth: state.plannerMonthViewMonth,
                agendaSearchQuery: state.agendaSearchQuery,
                agendaSearchSubject: state.agendaSearchSubject,
                homeTaskFocus: state.homeTaskFocus,
                activeSubject: state.activeSubject
            };
        }

        function restoreUiStateAfterSync(snapshot) {
            if (!snapshot || state._loggedOut || !state.isLoggedIn) return;
            if (_allowedViews.includes(snapshot.view)) {
                state.view = snapshot.view;
            }
            state.selectedDate = snapshot.selectedDate;
            state.plannerWeekOffset = snapshot.plannerWeekOffset;
            state.plannerMonthView = snapshot.plannerMonthView;
            state.plannerMonthViewYear = snapshot.plannerMonthViewYear;
            state.plannerMonthViewMonth = snapshot.plannerMonthViewMonth;
            state.agendaSearchQuery = snapshot.agendaSearchQuery || '';
            state.agendaSearchSubject = snapshot.agendaSearchSubject || 'all';
            state.homeTaskFocus = snapshot.homeTaskFocus || 'today';
            state.activeSubject = snapshot.activeSubject || null;

            if (typeof requestAnimationFrame === 'function') {
                requestAnimationFrame(() => requestAnimationFrame(() => {
                    if (!state._loggedOut) window.scrollTo({ top: Math.max(0, snapshot.scrollY || 0), behavior: 'auto' });
                }));
            } else {
                setTimeout(() => {
                    if (!state._loggedOut) window.scrollTo({ top: Math.max(0, snapshot.scrollY || 0), behavior: 'auto' });
                }, 0);
            }
            saveNavigationState();
        }

        // --- UTILS ---
        function parseArgoDate(dateStr) {
            if (!dateStr) return new Date(0);
            if (dateStr instanceof Date) return new Date(dateStr.getFullYear(), dateStr.getMonth(), dateStr.getDate(), 12, 0, 0);
            if (typeof dateStr === 'string') {
                const trimmed = dateStr.trim();
                const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
                if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2])-1, parseInt(iso[3]), 12, 0, 0);
                const ita = trimmed.match(/^(\d{1,2})[\/\.-](\d{1,2})[\/\.-](\d{4})/);
                if (ita) return new Date(parseInt(ita[3]), parseInt(ita[2])-1, parseInt(ita[1]), 12, 0, 0);
                
                const textMatch = trimmed.match(/^(\d{1,2})\s+([a-zA-Zàèéìòù]+)\s+(\d{4})/i);
                if (textMatch) {
                    const mKey = textMatch[2].toLowerCase();
                    const monthMap = {
                        'gen': 0, 'gennaio': 0, 'feb': 1, 'febbraio': 1, 'mar': 2, 'marzo': 2,
                        'apr': 3, 'aprile': 3, 'mag': 4, 'maggio': 4, 'giu': 5, 'giugno': 5,
                        'lug': 6, 'luglio': 6, 'ago': 7, 'agosto': 7, 'set': 8, 'sett': 8, 'settembre': 8,
                        'ott': 9, 'ottobre': 9, 'nov': 10, 'novembre': 10, 'dic': 11, 'dicembre': 11
                    };
                    const m = monthMap[mKey] !== undefined ? monthMap[mKey] : monthMap[mKey.substring(0, 3)];
                    if (m !== undefined) {
                        return new Date(parseInt(textMatch[3]), m, parseInt(textMatch[1]), 12, 0, 0);
                    }
                }
            }
            const d = new Date(dateStr);
            return (isNaN(d.getTime()) || d.getTime() <= 86400000) ? new Date(0) : new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0);
        }
        window.parseArgoDate = parseArgoDate;

        function djb2(str) {
            let hash = 5381;
            for (let i = 0; i < str.length; i++) hash = ((hash << 5) + hash) + str.charCodeAt(i);
            return (hash >>> 0).toString(36);
        }

        function stableTaskId(raw) {
            const subject = (raw.subject || raw.materia || 'Generico').trim().toLowerCase();
            const text = (raw.text || raw.desCompito || 'Nessuna descrizione').trim().toLowerCase();
            const rawDate = raw.due_date || raw.datConsegna || '';
            const key = `${subject}||${text}||${rawDate}`;
            return 't_' + djb2(key);
        }

        function isUserGeneratedTaskId(id) {
            if (typeof id !== 'string') return false;
            return id.startsWith('manual_') || id.startsWith('ai_') || id.startsWith('quest-');
        }

        function isUserGeneratedTask(task) {
            if (!task || typeof task !== 'object') return false;
            return isUserGeneratedTaskId(task.id) || String(task.subject || '').toUpperCase() === 'QUEST';
        }

        function purgeUserGeneratedTasksAndPlans(syncRemote = false) {
            const tasks = Array.isArray(state.tasks) ? state.tasks : [];
            const planned = (state.plannedTasks && typeof state.plannedTasks === 'object') ? state.plannedTasks : {};

            const cleanedTasks = tasks.filter(t => !isUserGeneratedTask(t));
            const validTaskIds = new Set(cleanedTasks.map(t => t.id).filter(Boolean));
            const cleanedPlanned = {};
            Object.entries(planned).forEach(([dateKey, ids]) => {
                if (!Array.isArray(ids)) return;
                const kept = ids.filter(id => !isUserGeneratedTaskId(id) && validTaskIds.has(id));
                if (kept.length > 0) cleanedPlanned[dateKey] = kept;
            });

            const changed = cleanedTasks.length !== tasks.length || JSON.stringify(cleanedPlanned) !== JSON.stringify(planned);
            if (!changed) return false;

            state.tasks = cleanedTasks;
            state.plannedTasks = cleanedPlanned;
            localStorage.setItem(lsKey('tasks'), JSON.stringify(state.tasks));
            localStorage.setItem(lsKey('planned_tasks'), JSON.stringify(state.plannedTasks));
            if (syncRemote && state.isLoggedIn && typeof saveTasksToSupabase === 'function') {
                saveTasksToSupabase().catch(() => {});
            }
            return true;
        }

        // calcolaMedia is defined in ui.js (returns null for empty — correct behavior)
        // We just ensure it's exposed globally after ui.js loads

        // --- DOM MANIPULATION ---
        function updateLoader(msg) {
            const status = document.getElementById('boot-status');
            if (status) status.innerText = msg;
            console.log(`[Boot] ${msg}`);
        }
        window.updateLoader = updateLoader;

        function hideBoot() {
            const overlay = document.getElementById('boot-overlay');
            if (overlay) {
                overlay.style.opacity = '0';
                setTimeout(() => overlay.style.display = 'none', 350);
            }
        }
        window.hideBoot = hideBoot;

        // --- DATA SYNC & PERSISTENCE ---
        function updateTasks(newTasks, shouldRender = false) {
            if (!newTasks) return;
            const localTasks = JSON.parse(localStorage.getItem(lsKey('tasks')) || '[]');
            
            // Index local tasks by unique key to preserve 'done' status
            const localIndex = new Map();
            localTasks.forEach(lt => {
                const key = `${lt.subject}||${lt.text}||${lt.due_date}`;
                localIndex.set(key, lt);
            });
            const hasAnyField = (obj, fields) => fields.some((field) => !!obj?.[field]);
            const assignedDateFields = ['assigned_date', 'assignedDate', 'datGiorno', 'dataAssegnazione'];
            const assignedAtFields = ['assigned_at', 'assignedAt', 'assigned_datetime', 'assignedDateTime', 'datOraIns', 'datOraInserimento', 'dataOraInserimento'];

            const formatted = newTasks.map(t => {
                const dateObj = parseArgoDate(t.due_date || t.datConsegna);
                const isoDate = !isNaN(dateObj.getTime()) ? dateObj.toISOString().split('T')[0] : '';
                // Canonical hierarchy for assignment date:
                // assigned_date/assignedDate (new normalized fields) → source payload aliases → due date fallback.
                const assignedRawDate = t.assigned_date || t.assignedDate || t.datGiorno || t.dataAssegnazione || t.due_date || t.datConsegna;
                const assignedObj = parseArgoDate(assignedRawDate);
                const assignedIso = !isNaN(assignedObj.getTime()) ? assignedObj.toISOString().split('T')[0] : isoDate;
                const subject = t.subject || t.materia || 'Generico';
                const text = t.text || t.desCompito || "Nessuna descrizione";
                const key = `${subject}||${text}||${isoDate}`;
                const match = localIndex.get(key);
                const serverAssignedAt = t.assigned_at || t.assignedAt || t.assigned_datetime || t.assignedDateTime || t.datOraIns || t.datOraInserimento || t.dataOraInserimento || null;
                const hasServerAssignedDate = hasAnyField(t, assignedDateFields);
                const hasServerAssignedAt = hasAnyField(t, assignedAtFields);
                
                return {
                    id: t.id || stableTaskId({ subject, text, due_date: isoDate }),
                    text, subject, due_date: isoDate,
                    assigned_date: hasServerAssignedDate ? assignedIso : (match?.assigned_date || assignedIso),
                    assigned_at: hasServerAssignedAt ? serverAssignedAt : (match?.assigned_at || null),
                    done: match ? !!match.done : !!t.done,
                    hasValidDate: !isNaN(dateObj.getTime())
                };
            });

            // Keep only assigned tasks from Argo (manual tasks are intentionally discarded)
            const combined = [...formatted];
            
            // Final Deduplicate (by true ID)
            const unique = [];
            const idsSeen = new Set();
            combined.forEach(task => {
                if (!idsSeen.has(task.id)) {
                    unique.push(task);
                    idsSeen.add(task.id);
                }
            });

            state.tasks = unique;
            localStorage.setItem(lsKey('tasks'), JSON.stringify(state.tasks));
            if (shouldRender && window.scheduleRender) window.scheduleRender();
        }
        window.updateTasks = updateTasks;

        function saveTasks() {
            localStorage.setItem(lsKey('tasks'), JSON.stringify(state.tasks));
            localStorage.setItem(lsKey('planned_tasks'), JSON.stringify(state.plannedTasks || {}));
            localStorage.setItem(lsKey('planned_details'), JSON.stringify(state.plannedDetails || {}));
            if (typeof saveTasksToSupabase === 'function') saveTasksToSupabase();
        }
        window.saveTasks = saveTasks;

        // Function to push manual tasks and plannedTasks to Supabase
        async function saveTasksToSupabase() {
            if (!state.isLoggedIn || !state.user || !state.user.id) return;
            
            try {
                await fetch(`${API_BASE_URL}/api/planner/${encodeURIComponent(state.user.id)}`, {
                    method: 'PUT',
                    headers: getSessionHeaders(),
                    body: JSON.stringify({
                        tasks: [],
                        plannedTasks: state.plannedTasks || {},
                        plannedDetails: state.plannedDetails || {}
                    })
                });
                console.log("✅ PlannedTasks synced to Supabase");
            } catch (e) {
                console.warn("⚠️ Failed to sync to Supabase:", e);
            }
        }
        window.saveTasksToSupabase = saveTasksToSupabase;

        const PULL_REFRESH_TRIGGER_PX = 72;
        const PULL_REFRESH_MAX_PX = 120;
        let _pullRefreshInFlight = false;
        let _pullToRefreshBound = false;

        function setPullRefreshIndicator(progress = 0, options = {}) {
            // Disabled per user request (pull-refresh bar removed)
            return;
        }

        async function triggerPullToRefresh() {
            if (_pullRefreshInFlight || state.syncing || !state.isLoggedIn || state._loggedOut) return false;
            const session = sessionManager.load();
            if (!session) return false;
            _pullRefreshInFlight = true;
            try {
                await performSync(session, {
                    suppressRender: false,
                    suppressHideBoot: true,
                    allowAuthRetry: true,
                    preserveUiState: true
                });
                await runSilentGoogleSync(session);
                await loadCircolari();
                return true;
            } finally {
                _pullRefreshInFlight = false;
            }
        }

        function initPullToRefresh() {
            // Disabled per user request (pull-refresh bar removed)
            return;
        }
        window.triggerPullToRefresh = triggerPullToRefresh;

        async function performSync(sessionData, options = {}) {
            const suppressRender = !!options.suppressRender;
            const suppressHideBoot = !!options.suppressHideBoot;
            const allowAuthRetry = options.allowAuthRetry !== false;
            const preserveUiState = options.preserveUiState !== false;
            let uiSnapshot = null;
            if (state.syncing || state._loggedOut) return;
            state.syncing = true;
            console.log(`[Network] Starting global sync with ${API_BASE_URL}...`);
            if (!suppressHideBoot) updateLoader("Contatto Server...");
            if (!sessionData) sessionData = sessionManager.load();
            if (!sessionData) { state.syncing = false; return; }
            
            try {
                // SECURITY: Never persist or restore passwords from sessionStorage.
                // Session synchronization uses server-side encrypted credentials and session tokens.

                const getFreshRequestBody = () => {
                    const s = sessionManager.load() || sessionData;
                    const resolvedUserId = (typeof window.getUserId === 'function')
                        ? window.getUserId()
                        : (s.studentId || null);
                    return {
                        schoolCode: s.schoolCode,
                        username: s.userName || s.username,
                        userId: resolvedUserId,
                        password: window._argoPasswordRuntime || '',
                        profileIndex: s.profileIndex,
                        accessToken: s.accessToken || '',
                        authToken: s.authToken || '',
                        subjectId: s.idSoggetto || null
                    };
                };

                const executeSyncRequest = () => fetch(`${API_BASE_URL}/sync`, {
                    method: 'POST',
                    headers: getSessionHeaders(),
                    body: JSON.stringify(getFreshRequestBody())
                });

                let response = await executeSyncRequest();
                if ((response.status === 401 || response.status === 403) && allowAuthRetry && typeof window.refreshSessionToken === 'function') {
                    console.log('[Sync] Auth failed, attempting session refresh...');
                    const refreshed = await window.refreshSessionToken().catch(() => false);
                    if (refreshed) {
                        // Crucial: After refresh, executeSyncRequest() will now pick up the NEW tokens
                        // from sessionManager.load() via getFreshRequestBody()
                        response = await executeSyncRequest();
                    } else {
                        console.warn('[Sync] Session refresh failed — will retry on next cycle');
                    }
                }
                if (!response.ok) throw new Error("Sync failed: " + response.status);
                const data = await response.json();
                
                if (data.success) {
                    if (preserveUiState) uiSnapshot = snapshotUiStateForSync();
                    updateLoader("Analisi Dati...");
                    
                    // 1. Process Planner Data FIRST (contains remote manual tasks & verifiche)
                    if (data.planner) {
                        state.plannedTasks = data.planner.plannedTasks || {};
                        state.plannedDetails = data.planner.plannedDetails || {};
                        localStorage.setItem(lsKey('planned_tasks'), JSON.stringify(state.plannedTasks));
                        localStorage.setItem(lsKey('planned_details'), JSON.stringify(state.plannedDetails));
                        
                        // Handle manual verifiche from dedicated table
                        if (data.planner.manualVerifiche) {
                            state.manualVerifiche = data.planner.manualVerifiche;
                            localStorage.setItem(lsKey('manual_verifiche'), JSON.stringify(state.manualVerifiche));
                        }

                        // Remote planner.tasks are intentionally ignored: keep only assigned tasks.
                    }

                    // 2. Process Argo Tasks (merges into state.tasks)
                    if (data.tasks) updateTasks(data.tasks, false);
                    purgeUserGeneratedTasksAndPlans(true);

                    if (Array.isArray(data.voti)) {
                        const existing = Array.isArray(state.voti) ? state.voti : [];
                        const incomingIds = new Set(data.voti.map(v => v.id || `${v.materia}-${v.valore}-${v.data}`));
                        const activeYearKey = (typeof getCurrentSchoolYearKey === 'function') ? getCurrentSchoolYearKey() : '2026/27';
                        const preservedPastVotes = existing.filter(v => {
                            const sy = (typeof getSchoolYearFromDate === 'function') ? getSchoolYearFromDate(v.data || v.date) : null;
                            const voteYearKey = sy ? sy.key : null;
                            return voteYearKey && voteYearKey !== activeYearKey && !incomingIds.has(v.id || `${v.materia}-${v.valore}-${v.data}`);
                        });
                        state.voti = [...data.voti, ...preservedPastVotes];
                        localStorage.setItem(lsKey('voti'), JSON.stringify(state.voti));
                    }
                    if (data.circolari) state.circolari = data.circolari;
                    if (data.assenzeData) {
                        state.assenzeData = data.assenzeData;
                        localStorage.setItem(lsKey('assenzeData'), JSON.stringify(state.assenzeData));
                    }
                    if (data.verifiche) {
                        state.verifiche = data.verifiche;
                        localStorage.setItem(lsKey('verifiche'), JSON.stringify(state.verifiche));
                    }
                    if (data.activities) {
                        state.classActivities = data.activities;
                        localStorage.setItem(lsKey('class_activities'), JSON.stringify(state.classActivities));
                    }
                    state.plannedClassActivities = Array.isArray(data.plannedActivities) ? data.plannedActivities : [];
                    localStorage.setItem(lsKey('planned_class_activities'), JSON.stringify(state.plannedClassActivities));
                    if (typeof applyDemoDataIfEnabled === 'function') {
                        applyDemoDataIfEnabled(state);
                    }
                    if (data.student) {
                        const rawCls = data.student.class || state.user?.class || '';
                        const rawSpec = data.student.specialization || state.user?.specialization;
                        const normCls = (typeof normalizeClassUi === 'function')
                            ? (normalizeClassUi(rawCls, rawSpec) || rawCls)
                            : rawCls;
                        state.user = {
                            ...state.user,
                            ...data.student,
                            class: normCls || data.student.class || state.user?.class || ''
                        };
                        if (normCls && normCls !== 'N/D' && normCls !== '...' && normCls !== 'Studente') {
                            try { localStorage.setItem('gc_cached_user_class', normCls); } catch(_) {}
                        }
                        localStorage.setItem(lsKey('user'), JSON.stringify(state.user));
                    }
                    
                    // Sync remote class data & initialize realtime listeners
                    if (typeof window.setupClassRealtimeSubscription === 'function') {
                        window.setupClassRealtimeSubscription();
                    }
                    if (typeof window.fetchRemoteClassData === 'function') {
                        const effClass = (typeof getEffectiveUserClass === 'function') ? getEffectiveUserClass() : (state.user?.class || '');
                        if (effClass) window.fetchRemoteClassData(effClass, false);
                    }
                    
                    const nextAccessToken = String(data?.new_tokens?.accessToken || '').trim();
                    const nextAuthToken = String(data?.new_tokens?.authToken || '').trim();
                    if (nextAccessToken && nextAuthToken) {
                        sessionManager.save({
                            accessToken: nextAccessToken,
                            authToken: nextAuthToken
                        });
                    }

                    const syncCompletedAt = Date.now();
                    state.lastSync = new Date(syncCompletedAt).toLocaleTimeString();
                    state.didup.connected = true;
                    state.didup.stale = false;
                    setPersistedLastSyncAt(syncCompletedAt);
                    state.isOffline = false;
                    const activitiesCount = Array.isArray(data.activities) ? data.activities.length : 0;
                    appendSyncDiagnostic({
                        source: 'sync',
                        success: true,
                        summary: `Scraping OK · Compiti: ${Array.isArray(data.tasks) ? data.tasks.length : 0} · Voti: ${Array.isArray(data.voti) ? data.voti.length : 0} · Attività classe: ${activitiesCount}`
                    });
                    console.log('[performSync] ✅ Sync success updated lastSync:', state.lastSync);
                    if (typeof window.warmWeeklyAgendaCache === 'function') {
                        setTimeout(() => window.warmWeeklyAgendaCache(true), 0);
                    }

                    // Show unjustified absence popup
                    if (data.assenzeData && data.assenzeData.daGiustificare > 0) {
                        setTimeout(() => {
                            if (typeof showToast === 'function') {
                                showToast(`⚠️ Hai ${data.assenzeData.daGiustificare} assenz${data.assenzeData.daGiustificare === 1 ? 'a' : 'e'} da giustificare`, 'warning');
                            }
                        }, 2000);
                    }
                } else {
                    console.warn('[performSync] ⚠️ API returned success:false', data);
                    throw new Error(data.error || 'Il server ha restituito un errore di sincronizzazione.');
                }
            } catch (e) {
                console.error("❌ Sync error:", e);
                appendSyncDiagnostic({
                    source: 'sync',
                    success: false,
                    summary: `Scraping KO · ${e?.message || 'errore sconosciuto'}`
                });
                // ALWAYS mark DiDUP as disconnected on sync failure — no false positives
                state.didup.connected = false;
                const hasLocalData = (state.tasks && state.tasks.length > 0) || (state.voti && state.voti.length > 0);
                state.didup.stale = hasLocalData; // stale = we have cached data but can't verify freshness
                state.isOffline = true;
                // Schedule a retry after 2 minutes if we're online
                if (navigator.onLine && state.isLoggedIn && !state._loggedOut) {
                    setTimeout(() => {
                        console.log('[Sync] Retry after previous failure...');
                        runAutomaticSyncCycle('retry-after-failure', { force: true });
                    }, 2 * 60 * 1000);
                }
            } finally {
                state.syncing = false;
                if (!suppressHideBoot) hideBoot();
                if (state._loggedOut) return; // Don't render after logout
                if (!suppressRender) {
                    state._forceRender = true;
                    if (window.scheduleRender) window.scheduleRender();
                }
                if (uiSnapshot) restoreUiStateAfterSync(uiSnapshot);
            }
        }
        window.performSync = performSync;

        async function runManualOwaResync(options = {}) {
            const showBootOverlay = options.showBootOverlay !== false;
            if (!state.isLoggedIn || state._loggedOut) return false;
            if (state.syncing) {
                if (typeof showToast === 'function') showToast('Sincronizzazione già in corso...');
                return false;
            }
            const session = sessionManager.load();
            if (!session) return false;
            try {
                if (showBootOverlay && typeof showBoot === 'function') showBoot('Resync manuale OWA in corso...');
                await performSync(session, {
                    suppressRender: false,
                    suppressHideBoot: true,
                    allowAuthRetry: true,
                    preserveUiState: true
                });
                await runSilentGoogleSync(session);
                if (typeof loadCircolari === 'function') await loadCircolari();
                if (typeof showToast === 'function') showToast('✅ Resync manuale completato');
                return true;
            } catch (e) {
                if (typeof showToast === 'function') showToast(e?.message || 'Resync manuale fallito. Verifica la connessione e riprova.', 'error', '#ff453a');
                return false;
            } finally {
                if (showBootOverlay && typeof hideBoot === 'function') hideBoot();
            }
        }
        window.runManualOwaResync = runManualOwaResync;

        const AUTO_SYNC_INTERVAL_MS = 60 * 60 * 1000; // 1 hour — full sync including DiDUP rescrape
        const AUTO_SYNC_MIN_GAP_MS = 5 * 60 * 1000;
        const FOREGROUND_RESYNC_THRESHOLD_MS = 3 * 60 * 1000;
        let _autoSyncTimer = null;
        let _autoSyncInFlight = false;
        let _lastAutoSyncAt = 0;
        let _autoSyncListenersBound = false;
        let _lastHiddenAt = null;

        async function runSilentGoogleSync(sessionData = null) {
            if (!state.isLoggedIn || state._loggedOut) return;
            if (typeof window.checkGoogleStatus === 'function') {
                await window.checkGoogleStatus().catch(() => {});
            }
            if (!state.googleConnected) return;

            const userId = typeof window.getUserId === 'function' ? window.getUserId() : (state.user?.id || 'guest');
            if (!userId || userId === 'guest') return;

            const currentSession = sessionData || sessionManager.load();
            if (!currentSession) return;
            const fullSession = { ...currentSession, profileIndex: currentSession.profileIndex ?? 0 };
            const request = () => fetch(`${API_BASE_URL}/api/google?action=sync`, {
                method: 'POST',
                headers: getSessionHeaders(),
                body: JSON.stringify({ userId, session: fullSession })
            });

            let res = await request();
            if ((res.status === 401 || res.status === 403) && typeof window.refreshSessionToken === 'function') {
                const refreshed = await window.refreshSessionToken().catch(() => false);
                if (refreshed) {
                    res = await request();
                }
            }
            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                console.warn('[AutoSync] Google sync failed:', err?.error || res.status);
            }
        }

        async function runAutomaticSyncCycle(reason = 'interval', options = {}) {
            const force = !!options.force;
            if (!state.isLoggedIn || state._loggedOut || state.syncing || _autoSyncInFlight) return;
            const now = Date.now();
            if (!force && _lastAutoSyncAt && (now - _lastAutoSyncAt) < AUTO_SYNC_MIN_GAP_MS) return;

            const session = sessionManager.load();
            if (!session || !sessionManager.isLoggedIn()) return;

            // SECURITY: Never persist or restore passwords from sessionStorage.

            _autoSyncInFlight = true;
            _lastAutoSyncAt = now;
            try {
                // Pre-refresh session tokens to keep DiDUP connection alive
                // This ensures cached Argo tokens on the server are always fresh
                if (typeof window.refreshSessionToken === 'function') {
                    const refreshed = await window.refreshSessionToken().catch(() => false);
                    if (refreshed) {
                        console.log(`[AutoSync:${reason}] Session tokens pre-refreshed`);
                    }
                }
                await performSync(sessionManager.load() || session, { suppressHideBoot: true, suppressRender: false });
                // performSync already sets didup.connected = true on success
                state.isOffline = false;
                await runSilentGoogleSync(sessionManager.load() || session);
            } catch (e) {
                console.warn(`[AutoSync:${reason}] failed:`, e?.message || e);
                state.didup.connected = false;
                const hasLocalData = (state.tasks && state.tasks.length > 0) || (state.voti && state.voti.length > 0);
                state.didup.stale = hasLocalData;
            } finally {
                _autoSyncInFlight = false;
            }
        }

        function ensureAutomaticSyncScheduler() {
            if (!_autoSyncTimer) {
                _autoSyncTimer = setInterval(() => {
                    runAutomaticSyncCycle('interval');
                }, AUTO_SYNC_INTERVAL_MS);
            }
            if (_autoSyncListenersBound) return;
            _autoSyncListenersBound = true;
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') {
                    _lastHiddenAt = Date.now();
                    return;
                }
                // App returned to foreground
                const awayMs = _lastHiddenAt ? Date.now() - _lastHiddenAt : Infinity;
                if (awayMs < FOREGROUND_RESYNC_THRESHOLD_MS) {
                    console.log(`[Foreground] Back after ${Math.round(awayMs/1000)}s — skip resync (< 3min)`);
                    return;
                }
                console.log(`[Foreground] Back after ${Math.round(awayMs/1000)}s — triggering resync`);
                runAutomaticSyncCycle('visible', { force: true });
            });
            window.addEventListener('focus', () => runAutomaticSyncCycle('focus', { force: true }));
            window.addEventListener('online', () => runAutomaticSyncCycle('online', { force: true }));
            // iOS Safari bfcache fallback: page restored from back-forward cache
            window.addEventListener('pageshow', (e) => {
                if (e.persisted) {
                    console.log('[Foreground] Page restored from bfcache — triggering resync');
                    runAutomaticSyncCycle('pageshow', { force: true });
                }
            });
        }

        async function loadCircolari() {
            try {
                const base = typeof API_BASE_URL !== 'undefined' ? API_BASE_URL : (window.API_BASE_URL || '');
                let res = await fetch(`${base}/api/circolari/index`);
                if (!res.ok) res = await fetch(`${base}/api/circolari`);
                const data = await res.json();
                if (data.success && Array.isArray(data.circolari)) {
                    state.circolari = data.circolari;
                    try {
                        localStorage.setItem(lsKey('circolari'), JSON.stringify(state.circolari));
                    } catch (_) {}
                    if (state.view === 'circolari' || state.view === 'home') {
                        if (typeof render === 'function') render();
                    }
                }
            } catch (e) { console.warn("Circolari load failed", e); }
        }
        window.loadCircolari = loadCircolari;

        const RENDER_AVAILABILITY_CHECK_INTERVAL_MS = 30;
        const RENDER_AVAILABILITY_TIMEOUT_MS = 1800;
        const IDLE_BOOT_TASK_TIMEOUT_MS = 180;

        // FIX: previously these two constants were declared but never used anywhere,
        // and the boot flow checked `window.navigate._isV3` exactly ONCE, synchronously,
        // with zero tolerance for the fluidity engine not having installed itself yet.
        // If that single check lost the race (script order, slow network, stale SW
        // cache serving an old fluidity-engine-v3.js) the app would boot on the raw,
        // non-animated render/navigate for the whole session — silently, no errors.
        //
        // This waits for the engine's readiness promise (or polls manually if that
        // promise isn't there yet — e.g. the engine file hasn't parsed at all) before
        // the boot flow decides which render path to use.
        function waitForFluidityEngine() {
            if (window._fluidityEngineReady && typeof window._fluidityEngineReady.then === 'function') {
                return window._fluidityEngineReady;
            }
            return new Promise((resolve) => {
                let elapsed = 0;
                const check = () => {
                    if (window._fluidityEngineReady && typeof window._fluidityEngineReady.then === 'function') {
                        window._fluidityEngineReady.then(resolve);
                        return;
                    }
                    if (window.navigate && window.navigate._isV3 && window.render && window.render._isV3) {
                        resolve(true);
                        return;
                    }
                    elapsed += RENDER_AVAILABILITY_CHECK_INTERVAL_MS;
                    if (elapsed >= RENDER_AVAILABILITY_TIMEOUT_MS) {
                        console.warn('[Boot] fluidity-engine-v3.js never signaled readiness — booting without entrance animations.');
                        resolve(false);
                        return;
                    }
                    setTimeout(check, RENDER_AVAILABILITY_CHECK_INTERVAL_MS);
                };
                check();
            });
        }
        const runWhenIdle = (task) => {
            if (typeof task !== 'function') return;
            if (typeof window.requestIdleCallback === 'function') {
                window.requestIdleCallback(() => task(), { timeout: IDLE_BOOT_TASK_TIMEOUT_MS });
                return;
            }
            setTimeout(task, 32);
        };
        // --- BOOT FLOW ---
        document.addEventListener('DOMContentLoaded', async () => {
            console.log("🚀 G-Connect v2.9.1 Booting...");

            // Give the fluidity (GSAP) engine a chance to finish patching
            // window.render/window.navigate before we decide how to boot.
            // See waitForFluidityEngine() above for why this is necessary.
            const engineReady = await waitForFluidityEngine();
            console.log(engineReady
                ? "✅ Fluidity Engine ready — booting with entrance animations."
                : "⚠️ Fluidity Engine not ready — booting with raw (non-animated) render.");

            const renderBootFallback = () => {
                if (window._bootRenderedOnce) return;
                window._bootRenderedOnce = true;
                const loader = document.getElementById('app-loader');

                // Use navigate() which triggers the full V3 animation pipeline
                // (_renderViewDirect + _animateViewEntrance with GSAP)
                const _doRender = () => {
                    if (typeof window.navigate === 'function' && window.navigate._isV3) {
                        // Force the engine to treat this as a new view and skip exit animations
                        if (typeof window._fluidityResetAnimatedView === 'function') window._fluidityResetAnimatedView();
                        window.navigate(state.view || 'home', true, true);
                        state._forceRender = false;
                        if (window.render && window.render._isV3) {
                            // Tell the engine we consumed the initial render
                            window._fluidityBootRenderConsumed = true;
                        }
                    } else if (window.render) {
                        window.render();
                    }
                    // Fade out the spinner ring after the first paint
                    requestAnimationFrame(() => {
                        requestAnimationFrame(() => {
                            if (loader) {
                                loader.style.opacity = '0';
                                setTimeout(() => { if (loader.parentNode) loader.remove(); }, 300);
                            }
                        });
                    });
                };
                // No delay — render immediately so GSAP animations drive the entrance
                _doRender();
            };
            const finalizeBootHydrationRender = () => {
                state._forceRender = true;
                state._animateOnNextRender = true;
                renderBootFallback();
            };
            
            // Assign offlineBadge reference for updateOfflineBadge()
            offlineBadge = document.getElementById('offline-badge');
            
            const session = sessionManager.load();
            if (session && sessionManager.isLoggedIn()) {
                state.isLoggedIn = true;
                state.booting = false;

                // SECURITY: Never persist or restore passwords from sessionStorage.
                
                // Hydrate
                try {
                    state.user = JSON.parse(localStorage.getItem(lsKey('user'))) || state.user;
                    
                    // Eagerly resolve and normalize class so profile view never flickers or delays
                    const cachedCls = localStorage.getItem('gc_cached_user_class');
                    const overrideCls = localStorage.getItem('gc_user_class_override');
                    const sessCls = session?.class;
                    const sessSpec = session?.specialization || state.user?.specialization;
                    const currentCls = state.user?.class;
                    
                    const candidateCls = (overrideCls && overrideCls !== '...' && overrideCls !== 'N/D') ? overrideCls
                        : (currentCls && currentCls !== '...' && currentCls !== 'N/D') ? currentCls
                        : (sessCls && sessCls !== '...' && sessCls !== 'N/D') ? sessCls
                        : cachedCls;
                        
                    if (candidateCls) {
                        const normalizedCandidate = (typeof normalizeClassUi === 'function')
                            ? (normalizeClassUi(candidateCls, sessSpec) || candidateCls)
                            : candidateCls;
                        if (normalizedCandidate && normalizedCandidate !== '...' && normalizedCandidate !== 'N/D' && normalizedCandidate !== 'Studente') {
                            state.user.class = normalizedCandidate;
                            try { localStorage.setItem('gc_cached_user_class', normalizedCandidate); } catch(_) {}
                        }
                    }
                    if (state.user && state.user.class === '...') {
                        state.user.class = '';
                    }
                    state.tasks = JSON.parse(localStorage.getItem(lsKey('tasks'))) || [];
                    state.lastMedia = parseFloat(localStorage.getItem(lsKey('lastMedia'))) || 0;
                    state.manualVerifiche = JSON.parse(localStorage.getItem(lsKey('manual_verifiche')) || '[]');
                    state.syncing = false;
                    state.voti = JSON.parse(localStorage.getItem(lsKey('voti'))) || [];
                    state.circolari = JSON.parse(localStorage.getItem(lsKey('circolari')) || '[]');
                    state.reminders = JSON.parse(localStorage.getItem(lsKey('reminders'))) || [];
                    state.plannedTasks = JSON.parse(localStorage.getItem(lsKey('planned_tasks'))) || {};
                    state.plannedDetails = JSON.parse(localStorage.getItem(lsKey('planned_details'))) || {};
                    state.assenzeData = JSON.parse(localStorage.getItem(lsKey('assenzeData'))) || null;
                    state.verifiche = JSON.parse(localStorage.getItem(lsKey('verifiche'))) || [];
                    state.classActivities = JSON.parse(localStorage.getItem(lsKey('class_activities'))) || [];
                    state.plannedClassActivities = JSON.parse(localStorage.getItem(lsKey('planned_class_activities'))) || [];
                    const syncDiagnosticsRaw = localStorage.getItem(lsKey('sync_diagnostics'));
                    try {
                        const parsedSyncDiagnostics = JSON.parse(syncDiagnosticsRaw || '[]');
                        state.syncDiagnostics = Array.isArray(parsedSyncDiagnostics) ? parsedSyncDiagnostics : [];
                    } catch (_) {
                        state.syncDiagnostics = [];
                    }
                    state.goals = JSON.parse(localStorage.getItem(lsKey('goals'))) || {};
                    purgeUserGeneratedTasksAndPlans(false);
                    try { localStorage.removeItem(lsKey('ai_chat')); } catch (_) {}
                    if (typeof window !== 'undefined' && window.ENABLE_DEMO_DATA === false && localStorage.getItem('gc_demo_data_active') === '1') {
                        if (typeof clearDemoData === 'function') clearDemoData(state);
                    } else if (typeof applyDemoDataIfEnabled === 'function') {
                        applyDemoDataIfEnabled(state);
                    }
                    // Restore persisted sync timestamp and freshness against SYNC_TTL_MS.
                    const didupTs = getPersistedLastSyncAt();
                    state.didup.lastSuccessTs = didupTs;
                    if (didupTs && !shouldSyncOnBoot(didupTs)) {
                        state.didup.stale = false;
                    } else if (didupTs) {
                        state.didup.stale = true;
                    }
                    // didup.connected remains FALSE until performSync actually succeeds
                } catch(e) {}

                const navState = restoreNavigationStateFromStorage();
                const hashView = (location.hash || '').replace('#', '').split('?')[0].trim();
                state.view = _allowedViews.includes(hashView) ? hashView : (navState.view || 'home');
                if (!_allowedViews.includes(hashView)) {
                    window.history.replaceState(null, '', `#${state.view}`);
                }

                // Check if Google Status is returning from OAuth before render
                if (window.location.hash.includes('google=success')) {
                    state.googleConnected = true;
                    history.replaceState(null, '', '/#profile');
                    state.view = 'profile';
                    setTimeout(() => { if (typeof showToast === 'function') showToast('✅ Google Calendar collegato!', 'var(--green)'); }, 500);
                }

                if (typeof hideLoader === 'function') hideLoader();
                finalizeBootHydrationRender();
                
                if (navState.scrollY > 0) {
                    requestAnimationFrame(() => requestAnimationFrame(() => {
                        window.scrollTo({ top: navState.scrollY, behavior: 'auto' });
                    }));
                }

                const lastSyncAt = getPersistedLastSyncAt();
                const needsBootSync = shouldSyncOnBoot(lastSyncAt);
                runWhenIdle(() => {
                    const jobs = [loadCircolari()];
                    if (needsBootSync) {
                        // Stale cache: refresh in background without blocking first paint/navigation state.
                        jobs.push(performSync(session, { suppressRender: false, suppressHideBoot: true, preserveUiState: true }));
                    } else {
                        console.log(`[Boot] Fresh cache (< ${Math.round(SYNC_TTL_MS / (60 * 60 * 1000))}h) — skipping boot sync`);
                    }
                    Promise.all(jobs)
                        .then(() => {
                            if (typeof window.warmWeeklyAgendaCache === 'function') {
                                setTimeout(() => window.warmWeeklyAgendaCache(true), 0);
                            }
                            if (typeof window.setupClassRealtimeSubscription === 'function') {
                                window.setupClassRealtimeSubscription();
                            }
                            if (typeof window.fetchRemoteClassData === 'function') {
                                const effClass = (typeof getEffectiveUserClass === 'function') ? getEffectiveUserClass() : (state.user?.class || '');
                                if (effClass) window.fetchRemoteClassData(effClass, false);
                            }
                        })
                        .catch((e) => {
                            console.warn('Background sync failed:', e);
                        });
                });
            } else {
                state.isLoggedIn = false;
                state.view = 'login';
                state.booting = false;
                window._bootRenderedOnce = false;
                state._animateOnNextRender = true;
                renderBootFallback();
            }

            // Check Google connection status (async, fires a re-render only on state change)
            if (state.isLoggedIn && typeof window.checkGoogleStatus === 'function') {
                window.checkGoogleStatus().then(() => {
                    if (state.googleConnected && typeof window.saveArgoToSupabase === 'function') {
                        window.saveArgoToSupabase();
                    }
                    runSilentGoogleSync(sessionManager.load()).catch(() => {});
                });
            }
            if (state.isLoggedIn) ensureAutomaticSyncScheduler();
            initPullToRefresh();

            // Handle hash-based navigation: update view when URL hash changes
            // (covers both the simple navigate fallback and browser back/forward)
            function _handleNavFromHash() {
                if (state._loggedOut) return; // Don't navigate after logout
                const raw = (location.hash || '#home').replace('#', '').split('?')[0].trim() || 'home';
                // After logout the hash may be 'login' — render login view
                if (!state.isLoggedIn) {
                    if (state.view !== 'login') {
                        state.view = 'login';
                        if (window.scheduleRender) window.scheduleRender(0);
                    }
                    return;
                }
                const newView = _allowedViews.includes(raw) ? raw : 'home';
                if (state.view !== newView) {
                    state.view = newView;
                    window.scrollTo({ top: 0, behavior: 'auto' });
                    saveNavigationState();
                    if (window.scheduleRender) window.scheduleRender(0);
                }
            }
            window.addEventListener('hashchange', _handleNavFromHash);
            window.addEventListener('popstate', _handleNavFromHash);
            window.addEventListener('pagehide', saveNavigationState);
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'hidden') saveNavigationState();
            });

        // Global APIs
        window.saveTasks = () => {
            localStorage.setItem(lsKey('tasks'), JSON.stringify(state.tasks));
            localStorage.setItem(lsKey('planned_tasks'), JSON.stringify(state.plannedTasks || {}));
            localStorage.setItem(lsKey('planned_details'), JSON.stringify(state.plannedDetails || {}));
            if (state.isLoggedIn) {
                if (window.saveTasksToSupabase) window.saveTasksToSupabase();
            }
        };

        // Debounced remote save for plannedTasks (called from ui.js after togglePlanDay)
        let _savePlannerTimer = null;
        window.debouncedSavePlannerRemote = function(delay) {
            // Always persist plannedTasks to localStorage immediately
            localStorage.setItem(lsKey('planned_tasks'), JSON.stringify(state.plannedTasks || {}));
            localStorage.setItem(lsKey('planned_details'), JSON.stringify(state.plannedDetails || {}));
            // Debounce the Supabase save
            clearTimeout(_savePlannerTimer);
            _savePlannerTimer = setTimeout(function() {
                if (window.saveTasksToSupabase) window.saveTasksToSupabase();
            }, delay || 500);
        };
        // getLocalDateString is defined in ui.js (uses local timezone — correct)
        // We just set a simple fallback until ui.js loads
        window.getLocalDateString = window.getLocalDateString || function(d) {
            const date = d || new Date();
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            return `${year}-${month}-${day}`;
        };

        // --- TEMPORARY CREDENTIALS STORE ---
        let tempCreds = { school: '', user: '', pass: '' };

        // --- CRYPTO HELPER ---
        async function hashPassword(password) {
            if (!password) return '';
            const encoder = new TextEncoder();
            const data = encoder.encode(password);
            const hashBuffer = await crypto.subtle.digest('SHA-256', data);
            const hashArray = Array.from(new Uint8Array(hashBuffer));
            return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        }
        window.hashPassword = hashPassword;

        // --- SERVER HEALTH CHECK ---
        async function checkServerHealth(attempt = 1) {
            const statusEl = document.getElementById('server-status');
            if (!statusEl) return;
            try {
                const controller = new AbortController();
                const id = setTimeout(() => controller.abort(), 3500);
                const res = await fetch(`${API_BASE_URL}/health`, {
                    method: 'GET',
                    signal: controller.signal
                });
                clearTimeout(id);
                if (res.ok) {
                    statusEl.innerHTML = `<span style="width: 8px; height: 8px; background: var(--success); border-radius: 50%;"></span> Server Online`;
                    statusEl.style.color = "var(--success)";
                    statusEl.style.background = "var(--success-container)";
                } else {
                    const err = new Error("Server error");
                    err.status = res.status;
                    throw err;
                }
            } catch (e) {
                const shouldRetry = e.status !== 404;
                if (attempt < 15 && shouldRetry) {
                    statusEl.innerHTML = `<span style="width: 8px; height: 8px; background: var(--warning); border-radius: 50%;"></span> Sveglio il server (${attempt})...`;
                    statusEl.style.color = "var(--warning)";
                    statusEl.style.background = "var(--warning-container)";
                    setTimeout(() => checkServerHealth(attempt + 1), 2500);
                } else {
                    statusEl.innerHTML = `<span style="width: 8px; height: 8px; background: var(--error); border-radius: 50%;"></span> Offline (uso dati cached)`;
                    statusEl.style.color = "var(--error)";
                    statusEl.style.background = "var(--error-container)";
                }
            }
        }
        window.checkServerHealth = checkServerHealth;

        // --- PWA SERVICE WORKER ---
        if ('serviceWorker' in navigator) {
            window.addEventListener('load', () => {
                navigator.serviceWorker
                    .register('service-worker.js')
                    .then((registration) => {
                        registration.update().catch(() => {});
                    })
                    .catch((err) => {
                        console.warn('[PWA] Service Worker registration failed:', err?.message || err);
                    });
            });
        }

        // --- ARGO LOGIN & SYNC ---
        async function performArgoSync(profileIndex = null, passedCreds = null) {
            const inputSchool = document.getElementById('argo-school');
            const inputUser = document.getElementById('argo-user');
            const inputPass = document.getElementById('argo-pass');

            const credentials = passedCreds || {
                schoolCode: (inputSchool ? inputSchool.value : (tempCreds.school || "")).trim(),
                username: (inputUser ? inputUser.value : (tempCreds.user || "")).trim(),
                password: inputPass ? inputPass.value : (tempCreds.pass || "")
            };

            if (!credentials.schoolCode || !credentials.username || !credentials.password) {
                alert("Dati mancanti! Reinserisci le credenziali.");
                if (!inputSchool) window.scheduleRender();
                return;
            }

            if (inputSchool) {
                tempCreds = { school: credentials.schoolCode, user: credentials.username, pass: credentials.password };
                try { localStorage.setItem('argo_school', credentials.schoolCode); } catch(_) {}
            }

            if (typeof setLoginBtnText === 'function') setLoginBtnText("Connessione... ");

            try {
                const payload = {
                    schoolCode: credentials.schoolCode,
                    username: credentials.username,
                    password: credentials.password,
                    profileIndex: profileIndex
                };

                if (profileIndex === null) {
                    // Only reuse the saved profileIndex during background re-syncs
                    // (login form is NOT visible). When the user is explicitly logging
                    // in from the form, leave profileIndex null so the backend returns
                    // MULTIPLE_PROFILES and the selection modal is shown.
                    const isExplicitLogin = !!document.getElementById('argo-school');
                    if (!isExplicitLogin) {
                        const savedSession = sessionManager.load();
                        if (savedSession && savedSession.profileIndex !== undefined) {
                            payload.profileIndex = savedSession.profileIndex;
                        }
                    }
                }

                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 60000);

                const response = await fetch(`${API_BASE_URL}/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: controller.signal
                });
                clearTimeout(timeoutId);

                const data = await response.json();

                if (response.ok && data.status === 'MULTIPLE_PROFILES') {
                    if (typeof showProfileSelectionModal === 'function') showProfileSelectionModal(data.profiles, credentials);
                    return;
                }

                if (!response.ok) {
                    if (response.status === 403) {
                        throw new Error("⚠️ Argo ha bloccato la connessione (Errore 403). Attendi 5-10 minuti senza fare refresh e riprova.");
                    }
                    throw new Error(data.error || `Errore Server (${response.status})`);
                }

                if (data.success) {
                    state.isOffline = false;
                    if (typeof updateOfflineBadge === 'function') updateOfflineBadge();
                    await handleLoginSuccess(data, credentials.password);
                } else {
                    throw new Error(data.error || "Login fallito");
                }
            } catch (e) {
                console.error("❌ Login error:", e);
                alert(e.name === 'AbortError' ? "⚠️ Tempo scaduto!" : "❌ Errore: " + e.message);
                navigate('login');
            } finally {
                if (typeof setLoginBtnText === 'function') setLoginBtnText("Accedi");
            }
        }
        window.performArgoSync = performArgoSync;

        // --- HANDLE LOGIN SUCCESS ---
        async function handleLoginSuccess(data, rawPassword) {
            console.log("✅ Login OK, hydrating state...");
            // Clear _loggedOut flag immediately on new login
            state._loggedOut = false;
            const user = data.session.userName;
            const pass = rawPassword || tempCreds.pass || '';
            if (!pass) {
                throw new Error('Password Argo non disponibile nella sessione corrente. Rieffettua il login.');
            }
            // Keep password in volatile memory for session refresh (never persisted to localStorage)
            window._argoPasswordRuntime = pass;
            // SECURITY: Never persist passwords to sessionStorage or localStorage.
            try { sessionStorage.removeItem('_argo_pwd_session'); } catch(_) {}

            // 1. Session Save
            if (data.session) {
                const sessionData = {
                    ...data.session,
                    studentId: data.student?.id || generatePid(data.session.schoolCode, data.session.userName, data.session.profileIndex),
                    name: data.student?.name || data.selectedProfile?.name,
                    class: data.student?.class || data.selectedProfile?.class,
                    specialization: data.student?.specialization || data.selectedProfile?.specialization,
                    avatar: data.student?.avatar || data.selectedProfile?.avatar,
                    idSoggetto: data.selectedProfile?.idSoggetto || null,
                    sessionToken: data.sessionToken || null
                };
                sessionManager.save(sessionData);
            }

            // 2. Identity Update
            const incoming = data.student || data.selectedProfile || {};
            const isValidName = (n) => n && typeof n === 'string' && n.trim().length >= 2 && /^[a-zA-ZÀ-ÿ0-9\s'.\-]+$/.test(n.trim());
            const isValidClass = (c) => c && String(c).trim().length >= 1 && String(c).trim().length <= 20;
            const incomingCls = incoming.class || data.student?.class || data.selectedProfile?.class || '';
            const incomingSpec = incoming.specialization || data.student?.specialization || data.selectedProfile?.specialization || state.user?.specialization;
            const normIncomingCls = (typeof normalizeClassUi === 'function')
                ? (normalizeClassUi(incomingCls, incomingSpec) || incomingCls)
                : incomingCls;
            const finalClass = (isValidClass(normIncomingCls) && normIncomingCls !== '...' && normIncomingCls !== 'N/D')
                ? normIncomingCls
                : ((isValidClass(incomingCls) && incomingCls !== '...' && incomingCls !== 'N/D') ? incomingCls : (state.user?.class || "N/D"));

            state.user = {
                ...state.user,
                id: data.student?.id || (data.session ? generatePid(data.session.schoolCode, data.session.userName, data.session.profileIndex) : 'guest'),
                name: (incoming.name && isValidName(incoming.name)) ? incoming.name : (state.user?.name || "Studente"),
                class: finalClass,
                specialization: incomingSpec || null,
                avatar: incoming.avatar || state.user?.avatar || null
            };
            if (finalClass && finalClass !== 'N/D' && finalClass !== '...' && finalClass !== 'Studente') {
                try { localStorage.setItem('gc_cached_user_class', finalClass); } catch(_) {}
            }
            localStorage.setItem(lsKey('user'), JSON.stringify(state.user));

            // 3. Supabase Auth Bridge
            try {
                const school = (data.session.schoolCode || '').toUpperCase();
                const userName = data.session.userName.toLowerCase();
                const supabaseEmail = `argo.${school}.${userName.replace(/\./g, '_')}@g-connect.it`;
                const supabasePassword = await hashPassword(`Argo_${school}_${userName}_${pass}`);

                const sb = await getSupabaseClient();
                if (!sb) throw new Error('Supabase non disponibile');

                let { data: authData, error: authErr } = await sb.auth.signInWithPassword({
                    email: supabaseEmail,
                    password: supabasePassword
                });

                if (authErr && authErr.message?.includes('Invalid login')) {
                    const { data: upData, error: upErr } = await sb.auth.signUp({
                        email: supabaseEmail,
                        password: supabasePassword,
                        options: { data: { name: state.user.name, class: state.user.class } }
                    });
                    if (!upErr && upData?.user) authData = upData;
                }

                if (authData?.user) {
                    await sb.from('profiles').upsert({
                        id: String(state.user.id).toLowerCase().replace(/\s+/g, ''),
                        name: state.user.name,
                        class: state.user.class,
                        specialization: state.user.specialization,
                        avatar: state.user.avatar || null,
                        last_active: new Date().toISOString()
                    });
                }
            } catch (ex) {
                console.warn("⚠️ Supabase Bridge failed:", ex.message);
            }

            // 4. Planner Sync
            state.syncing = false;
            state.plannedTasks = JSON.parse(localStorage.getItem(lsKey('planned_tasks')) || '{}');
            state.reminders = JSON.parse(localStorage.getItem(lsKey('reminders')) || '[]');
            if (typeof notifyPlannerChanged === 'function') notifyPlannerChanged();

            // 5. Data Hydration
            if (data.tasks) updateTasks(data.tasks, false);
            if (data.voti) {
                const incomingVotes = Array.isArray(data.voti) ? data.voti : [];
                const existing = Array.isArray(state.voti) ? state.voti : [];
                const incomingIds = new Set(incomingVotes.map(v => v.id || `${v.materia}-${v.valore}-${v.data}`));
                const activeYearKey = (typeof getCurrentSchoolYearKey === 'function') ? getCurrentSchoolYearKey() : '2026/27';
                const preservedPastVotes = existing.filter(v => {
                    const sy = (typeof getSchoolYearFromDate === 'function') ? getSchoolYearFromDate(v.data || v.date) : null;
                    const voteYearKey = sy ? sy.key : null;
                    return voteYearKey && voteYearKey !== activeYearKey && !incomingIds.has(v.id || `${v.materia}-${v.valore}-${v.data}`);
                });
                state.voti = [...incomingVotes, ...preservedPastVotes];
                localStorage.setItem(lsKey('voti'), JSON.stringify(state.voti));
            }
            if (Array.isArray(data.activities)) {
                state.classActivities = data.activities;
                localStorage.setItem(lsKey('class_activities'), JSON.stringify(state.classActivities));
            }
            state.plannedClassActivities = Array.isArray(data.plannedActivities) ? data.plannedActivities : [];
            localStorage.setItem(lsKey('planned_class_activities'), JSON.stringify(state.plannedClassActivities));
            if (typeof applyDemoDataIfEnabled === 'function') {
                applyDemoDataIfEnabled(state);
            }

            state.isLoggedIn = true;
            state.didup.connected = true;
            state.didup.stale = false;
            const loginSyncCompletedAt = Date.now();
            setPersistedLastSyncAt(loginSyncCompletedAt);
            state.isOffline = false;
            state.lastSync = new Date(loginSyncCompletedAt).toLocaleTimeString();
            if (typeof updateOfflineBadge === 'function') updateOfflineBadge();
            appendSyncDiagnostic({
                source: 'login',
                success: true,
                summary: `Login+Scraping OK · Compiti: ${Array.isArray(data.tasks) ? data.tasks.length : 0} · Voti: ${Array.isArray(data.voti) ? data.voti.length : 0} · Attività classe: ${Array.isArray(data.activities) ? data.activities.length : 0}`
            });
            // Reset Google state per il profilo appena caricato, poi riverifica dal server
            state.googleConnected = false;
            if (typeof window.checkGoogleStatus === 'function') window.checkGoogleStatus();
            ensureAutomaticSyncScheduler();

            await Promise.all([
                (typeof loadProfileFromServer === 'function' ? loadProfileFromServer() : Promise.resolve()).catch(e => console.error("Profile load failed:", e)),
                performSync(sessionManager.load(), { suppressRender: true }).catch(e => console.error("Post-login sync failed:", e)),
                loadCircolari().catch(e => console.error("Post-login circolari load failed:", e))
            ]);
            runSilentGoogleSync(sessionManager.load()).catch(() => {});

            if (typeof closeModal === 'function') closeModal();
            alert(`✅ Benvenuto ${state.user.name}!`);
            window._bootRenderedOnce = false;
            state._animateOnNextRender = true;
            if (typeof window.setupClassRealtimeSubscription === 'function') {
                window.setupClassRealtimeSubscription();
            }
            if (typeof window.fetchRemoteClassData === 'function') {
                const effClass = (typeof getEffectiveUserClass === 'function') ? getEffectiveUserClass() : (state.user?.class || '');
                if (effClass) window.fetchRemoteClassData(effClass, false);
            }
            navigate('home');
            // navigate() already triggers a render — no extra scheduleRender needed
        }
        window.handleLoginSuccess = handleLoginSuccess;

        // --- PROFILE RESOLUTION ---
        async function resolveProfileNamesAsync(profiles, credentials, container) {
            try {
                await Promise.all(profiles.map(async (p) => {
                    try {
                        const resp = await fetch(`${API_BASE_URL}/api/resolve-profile`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                schoolCode: credentials.schoolCode,
                                username: credentials.username,
                                password: credentials.password,
                                profileIndex: p.index
                            })
                        });
                        if (!resp.ok) return;
                        const j = await resp.json();
                        if (j.success) {
                            p.name = j.name;
                            p.class = j.class;
                            const btn = container.querySelector(`.btn-profile[data-index="${p.index}"]`);
                            if (btn) {
                                const nameEl = btn.querySelector('.profile-name');
                                const classEl = btn.querySelector('.profile-class');
                                const avatarEl = btn.querySelector('.profile-avatar');
                                if (nameEl) nameEl.textContent = j.name;
                                if (classEl) classEl.textContent = j.class || 'N/D';
                                if (avatarEl) avatarEl.textContent = (j.name || 'S')[0].toUpperCase();
                            }
                        }
                    } catch (e) { console.warn(`⚠️ Errore risoluzione profilo ${p.index}:`, e); }
                }));
            } catch (e) { console.warn('⚠️ Impossibile risolvere nomi profili:', e); }
        }
        window.resolveProfileNamesAsync = resolveProfileNamesAsync;

        // --- PROFILE SELECTION ---
        async function selectProfile(profileIndex, credentials) {
            // Don't call showBoot here — the gradient spinner is shown inside the modal.
            // handleLoginSuccess() will close the modal after login completes.
            await performArgoSync(profileIndex, credentials);
        }
        window.selectProfile = selectProfile;

        // --- SWITCH PROFILE ---
        async function switchProfile() {
            const stored = sessionManager.load();
            if (stored && stored.schoolCode && (stored.userName || stored.username)) {
                try {
                    if (typeof showBoot === 'function') showBoot("Ricerca profili...");
                    const user = stored.userName || stored.username;
                    const pass = window._argoPasswordRuntime || '';

                    const response = await fetch(`${API_BASE_URL}/login`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            schoolCode: stored.schoolCode,
                            username: user,
                            password: pass,
                            profileIndex: null
                        })
                    });

                    const data = await response.json().catch(() => ({ success: false }));
                    hideBoot();

                    if (response.ok && data.status === 'MULTIPLE_PROFILES') {
                        if (typeof showProfileSelectionModal === 'function') showProfileSelectionModal(data.profiles, { schoolCode: stored.schoolCode, username: user, password: pass });
                    } else if (response.ok && data.success) {
                        handleLoginSuccess(data, pass);
                    } else {
                        if (typeof openArgoLogin === 'function') openArgoLogin();
                    }
                } catch (e) {
                    hideBoot();
                    console.error("Errore switch profile:", e);
                    if (typeof openArgoLogin === 'function') openArgoLogin();
                }
            } else {
                if (typeof openArgoLogin === 'function') openArgoLogin();
            }
        }
        window.switchProfile = switchProfile;

        // --- QUICK ADD TASK ---
        function submitQuickTask() {
            if (typeof closeModal === 'function') closeModal();
            if (typeof showToast === 'function') showToast('Sono supportati solo i compiti assegnati dal registro.');
            purgeUserGeneratedTasksAndPlans(true);
            if (window.scheduleRender) window.scheduleRender();
        }
        window.submitQuickTask = submitQuickTask;

        // --- REGISTRO TASK (verifica/orale/compito) ---
        function selectRegistroTipo(tipo) {
            window._registroTipo = tipo;
            ['tipo-verifica', 'tipo-orale', 'tipo-compito'].forEach(id => {
                const b = document.getElementById(id);
                if (b) { b.style.border = '1px solid rgba(255,255,255,0.1)'; b.style.background = 'transparent'; b.style.color = 'var(--text-dim)'; }
            });
            const map = { 'Verifica': 'tipo-verifica', 'Interrogazione': 'tipo-orale', 'Compito in classe': 'tipo-compito' };
            const active = document.getElementById(map[tipo]);
            if (active) { active.style.border = '1px solid var(--accent)'; active.style.background = 'rgba(99,102,241,0.15)'; active.style.color = 'var(--accent)'; }
        }
        window.selectRegistroTipo = selectRegistroTipo;

        async function submitRegistroTask() {
            const btn = document.getElementById('submit-registro-btn');
            if (btn) {
                btn.disabled = true;
                btn.style.opacity = '0.7';
                btn.innerHTML = '<i class="ph-bold ph-circle-notch ph-spin"></i> Registrazione...';
            }

            const subject = document.getElementById('registroTaskSubject')?.value || 'Generale';
            const args = document.getElementById('registroTaskArgs')?.value?.trim() || '';
            const dateVal = document.getElementById('registroTaskDate')?.value;
            const tipo = window._registroTipo || 'scritta'; // 'scritta' or 'orale'
            const userId = typeof getUserId === 'function' ? getUserId() : 'guest';
            
            if (state.isLoggedIn && userId !== 'guest') {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/manual-verifiche/${encodeURIComponent(userId)}`, {
                        method: 'POST',
                        headers: getSessionHeaders(),
                        body: JSON.stringify({ subject, date: dateVal, type: tipo, args })
                    });
                    const result = await res.json();
                    if (result.success && result.data) {
                        state.manualVerifiche.push(result.data);
                        localStorage.setItem(lsKey('manual_verifiche'), JSON.stringify(state.manualVerifiche));
                    } else {
                        throw new Error(result.error || 'Errore server');
                    }
                } catch (e) {
                    console.error("Failed to sync verifica:", e);
                    if (btn) { 
                        btn.innerHTML = '<i class="ph-bold ph-x"></i> Errore'; 
                        btn.style.background = 'var(--red, #FF3B30)'; 
                        btn.style.opacity = '1'; 
                    }
                    setTimeout(() => {
                        if (typeof closeModal === 'function') closeModal();
                        else {
                            const modals = document.getElementById('modals');
                            if (modals) modals.innerHTML = '';
                        }
                    }, 1200);
                    if (typeof showToast === 'function') showToast('Errore salvataggio verifica', 'error');
                    return;
                }
            } else {
                // Fallback local if not logged in
                const newTask = { 
                    id: 'manual_' + Date.now(), 
                    subject, 
                    date: dateVal, 
                    type: tipo, 
                    args,
                    done: false
                };
                state.manualVerifiche.push(newTask);
                localStorage.setItem(lsKey('manual_verifiche'), JSON.stringify(state.manualVerifiche));
            }

            if (btn) {
                btn.innerHTML = '<i class="ph-bold ph-check"></i> Registrata!';
                btn.style.background = '#28A745';
                btn.style.opacity = '1';
                if (window.gsap) {
                    gsap.from(btn, { scale: 0.9, duration: 0.4, ease: "back.out(2)" });
                }
            }

            setTimeout(() => {
                // Modal closing logic
                if (typeof closeModal === 'function') {
                    closeModal();
                } else {
                    const modals = document.getElementById('modals');
                    if (modals) modals.innerHTML = '';
                }

                if (typeof showToast === 'function') showToast(`Verifica ${tipo} registrata! 📝`);
                if (window.scheduleRender) window.scheduleRender();
            }, 600);
        }
        window.submitRegistroTask = submitRegistroTask;

        async function deleteManualVerifica(id) {
            if (!confirm("Sei sicuro di voler eliminare questa verifica?")) return;
            
            if (state.isLoggedIn && state.user && state.user.id && !id.startsWith('manual_')) {
                try {
                    const res = await fetch(`${API_BASE_URL}/api/manual-verifiche/${encodeURIComponent(state.user.id)}?id=${id}`, {
                        method: 'DELETE',
                        headers: getSessionHeaders()
                    });
                    if (!res.ok) throw new Error("Delete failed");
                } catch (e) {
                    console.error("Failed to delete remote verifica:", e);
                    if (typeof showToast === 'function') showToast("Errore eliminazione server", "error");
                    return;
                }
            }
            
            state.manualVerifiche = state.manualVerifiche.filter(v => (v.id || v.id_manuale) !== id);
            localStorage.setItem(lsKey('manual_verifiche'), JSON.stringify(state.manualVerifiche));
            
            if (typeof showToast === 'function') showToast("Verifica eliminata");
            if (window.scheduleRender) window.scheduleRender();
            
            // Re-open/refresh modal if it was open
            if (typeof mostraVerificheModal === 'function') {
                setTimeout(mostraVerificheModal, 10);
            }
        }
        window.deleteManualVerifica = deleteManualVerifica;

        // --- MANUAL REMINDER ---
        function addManualReminder() {
            const text = prompt("Cosa devi fare? (es. Compito Mate per il 20/01)");
            if (text) {
                state.reminders.push({ id: Date.now(), text, done: false });
                localStorage.setItem(lsKey('reminders'), JSON.stringify(state.reminders));
                if (window.scheduleRender) window.scheduleRender();
            }
        }
        window.addManualReminder = addManualReminder;

        });
