const {
    handleCors, debugLog, generatePid, normalizeClass, isValidName, createHeaders, generateSessionToken,
    isSessionSecurityConfigured, getRequestBody, encryptArgoPassword, parseClassDetails, CLASS_REGEX
} = require('../lib/helpers');
const { getSupabase } = require('../lib/supabase');
const { setArgoCredentials } = require('../lib/session-vault');
const {
    AdvancedArgo, enrichProfiles, resolveIdentityForProfile,
    resolveIdentityFromWebUI, resolveClassFromAnagraficaWeb, extractClassFromDashboard,
    getDashboard, extractGradesFromDashboard, extractHomeworkFromDashboard,
    extractPromemoriaFromDashboard, extractClassActivitiesFromDashboard, extractAssenzeFromDashboard, extractVerificheFromDashboard
} = require('../lib/argo');

module.exports = async function handler(req, res) {
    if (handleCors(req, res)) return;
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
    if (!isSessionSecurityConfigured()) {
        return res.status(500).json({
            success: false,
            error: 'Server auth non configurata: ARGO_ENCRYPTION_KEY mancante o non valida'
        });
    }

    const body = getRequestBody(req);
    const school = (body.schoolCode || body.school || '').trim().toUpperCase();
    const username = (body.username || '').trim().toLowerCase();
    const password = body.password;
    const selectedProfileIndex = (body.selectedProfileIndex !== undefined) ? body.selectedProfileIndex :
        (body.profileIndex !== undefined ? body.profileIndex : null);

    if (!school || !username || !password) {
        return res.status(400).json({ success: false, error: 'Dati mancanti' });
    }

    try {
        debugLog('LOGIN REQUEST', { school, username, idx: selectedProfileIndex });

        const loginRes = await AdvancedArgo.rawLogin(school, username, password);
        const accessToken = loginRes.access_token;
        let profiles = loginRes.profiles || [];

        try {
            profiles = await enrichProfiles(school, accessToken, profiles);
        } catch (e) {
            debugLog('⚠️ enrichProfiles failed during login', e.message);
        }

        if (profiles.length > 1 && selectedProfileIndex === null) {
            return res.status(200).json({
                success: true,
                status: 'MULTIPLE_PROFILES',
                profiles: profiles.map(p => ({
                    index: p.index, name: p.name, class: p.class, school
                }))
            });
        }

        const parsedTargetIndex = parseInt(selectedProfileIndex, 10);
        let targetIndex = (!isNaN(parsedTargetIndex) && parsedTargetIndex >= 0) ? parsedTargetIndex : 0;
        if (targetIndex < 0 || targetIndex >= profiles.length) targetIndex = 0;

        const targetProfile = profiles[targetIndex];
        const authToken = targetProfile.token;

        if (!accessToken || !authToken) throw new Error('Impossibile recuperare i token di sessione');

        let studentName = targetProfile.name;
        let studentClass = targetProfile.class;
        let detectedTrack = targetProfile.specialization || null;

        // Fallback identity resolution via API (or enrich if track missing or class incomplete)
        const hasFullClass = studentClass && studentClass !== 'N/D' && CLASS_REGEX.test(studentClass) && /\([A-Z]{2,3}\)/.test(studentClass);
        if (!studentName || studentName.startsWith('STUDENTE') || !hasFullClass) {
            const resolved = await resolveIdentityForProfile(
                school, username, password, accessToken, authToken,
                studentName, studentClass, targetProfile.idSoggetto
            );
            if (resolved.name) studentName = resolved.name;
            if (resolved.cls && resolved.cls !== 'N/D') studentClass = normalizeClass(resolved.cls) || studentClass;
            if (resolved.track) detectedTrack = detectedTrack || resolved.track;
        }

        // Fallback HTML scraping via cookie jar (per scuole con API limitate)
        const jar = loginRes.jar;
        if (jar && (!isValidName(studentName, username) || studentClass === 'N/D' || !CLASS_REGEX.test(studentClass))) {
            try {
                const webId = await resolveIdentityFromWebUI(jar);
                if (webId.name && isValidName(webId.name, username)) studentName = webId.name;
                if (webId.cls && webId.cls !== 'N/D') studentClass = normalizeClass(webId.cls) || studentClass;
                if (webId.track) detectedTrack = detectedTrack || webId.track;

                if (!isValidName(studentName, username) || !normalizeClass(studentClass)) {
                    const webAna = await resolveClassFromAnagraficaWeb(jar);
                    if (webAna.cls) studentClass = normalizeClass(webAna.cls) || studentClass;
                    if (webAna.name && !isValidName(studentName, username)) studentName = webAna.name;
                    if (webAna.track) detectedTrack = detectedTrack || webAna.track;
                }
            } catch (e) {
                debugLog('⚠️ Login fallback identity resolution failed', e.message);
            }
        }

        const headers = createHeaders(school, accessToken, authToken, targetProfile?.idSoggetto);
        let dashboardData = {};
        try {
            dashboardData = await getDashboard(headers);
        } catch (dashErr) {
            debugLog('⚠️ Login getDashboard failed (non-fatal)', dashErr.message);
        }

        // Dashboard fallback for class / track if still incomplete
        if (!studentClass || studentClass === 'N/D' || !CLASS_REGEX.test(studentClass)) {
            const dashCls = extractClassFromDashboard(dashboardData);
            if (dashCls?.formatted) {
                studentClass = dashCls.formatted;
                if (dashCls.track) detectedTrack = detectedTrack || dashCls.track;
            }
        }

        // Extract track from studentClass if embedded in class string (e.g. 4D (SA))
        const parsedStudentClass = parseClassDetails(studentClass);
        if (parsedStudentClass?.track) {
            detectedTrack = detectedTrack || parsedStudentClass.track;
        }

        const gradesData = extractGradesFromDashboard(dashboardData);
        const tasksData = extractHomeworkFromDashboard(dashboardData);
        const announcementsData = extractPromemoriaFromDashboard(dashboardData);
        const activitiesData = extractClassActivitiesFromDashboard(dashboardData, {
            subjectId: targetProfile?.idSoggetto
        });
        const assenzeData = extractAssenzeFromDashboard(dashboardData);
        const verificheData = extractVerificheFromDashboard(dashboardData);

        const pid = generatePid(school, username, targetIndex);
        setArgoCredentials(pid, {
            schoolCode: school,
            username,
            password,
            profileIndex: targetIndex
        });
        let storedSpecialization = detectedTrack || null;
        let storedAvatar = null;
        const normalizedClass = (studentClass && detectedTrack)
            ? (normalizeClass(studentClass, { track: detectedTrack }) || normalizeClass(studentClass))
            : (studentClass ? normalizeClass(studentClass) : null);
        const finalStudentClass = normalizedClass || studentClass || 'N/D';

        const supabase = getSupabase();
        if (supabase) {
            try {
                const { data: existingProfile } = await supabase.from('profiles')
                    .select('specialization, avatar').eq('id', pid).single();

                if (existingProfile) {
                    storedSpecialization = storedSpecialization || existingProfile.specialization;
                    storedAvatar = existingProfile.avatar;
                }

                await supabase.from('profiles').upsert({
                    id: pid,
                    name: studentName,
                    class: finalStudentClass,
                    specialization: storedSpecialization || null,
                    avatar: storedAvatar || null,
                    last_active: new Date().toISOString()
                }, { onConflict: 'id' });

                const ARGO_TOKEN_TTL_MS = 6 * 60 * 60 * 1000;
                const tokenExpiry = new Date(Date.now() + ARGO_TOKEN_TTL_MS).toISOString();

                // Smart merge: load existing row so we can preserve Google tokens that
                // may already be linked, instead of overwriting them with NULL.
                const { data: existingTokenRow, error: fetchError } = await supabase.from('google_tokens')
                    .select('access_token, refresh_token, expiry_date, calendar_id')
                    .eq('user_id', pid).maybeSingle();
                if (fetchError) console.warn('⚠️ Could not fetch existing token row for merge:', fetchError.message);

                const argoUpsertData = {
                    user_id: pid,
                    argo_school_code: school,
                    argo_username: username,
                    argo_password: encryptArgoPassword(password),
                    profile_index: targetIndex,
                    argo_access_token: accessToken,
                    argo_auth_token: authToken,
                    argo_tokens_expiry: tokenExpiry,
                    argo_id_soggetto: targetProfile?.idSoggetto ?? null,
                    updated_at: new Date().toISOString()
                };

                // Carry forward existing Google tokens so the Argo upsert never nullifies them.
                if (existingTokenRow?.access_token) argoUpsertData.access_token = existingTokenRow.access_token;
                if (existingTokenRow?.refresh_token) argoUpsertData.refresh_token = existingTokenRow.refresh_token;
                if (existingTokenRow?.expiry_date) argoUpsertData.expiry_date = existingTokenRow.expiry_date;
                if (existingTokenRow?.calendar_id) argoUpsertData.calendar_id = existingTokenRow.calendar_id;

                const { error: upsertError } = await supabase.from('google_tokens').upsert(argoUpsertData, { onConflict: 'user_id' });
                if (upsertError) {
                    console.error('❌ LOGIN: Argo credential upsert FAILED:', upsertError.message, JSON.stringify(upsertError));
                    throw upsertError;
                }
                console.log(`✅ LOGIN: Argo credentials saved to Supabase for ${pid} (school=${school}, user=${username})`);
            } catch (e) {
                console.error('❌ Supabase sync error:', e.message);
                debugLog('⚠️ Supabase sync error', e.message);
            }
        }

        const resp = {
            success: true,
            sessionToken: generateSessionToken(pid),
            session: {
                schoolCode: school,
                authToken,
                accessToken,
                userName: username,
                profileIndex: targetIndex,
                idSoggetto: targetProfile?.idSoggetto || null,
                class: finalStudentClass,
                specialization: storedSpecialization
            },
            student: {
                id: pid,
                name: studentName,
                class: finalStudentClass,
                school,
                specialization: storedSpecialization,
                avatar: storedAvatar
            },
            tasks: tasksData,
            voti: gradesData,
            promemoria: announcementsData,
            activities: Array.isArray(activitiesData?.svolte) ? activitiesData.svolte : [],
            plannedActivities: Array.isArray(activitiesData?.pianificate) ? activitiesData.pianificate : [],
            assenzeData,
            verifiche: verificheData
        };

        resp.selectedProfile = {
            index: targetIndex,
            name: studentName,
            class: finalStudentClass,
            school: targetProfile.school || school,
            idSoggetto: targetProfile.idSoggetto
        };

        if (profiles.length > 1) {
            resp.profiles = profiles.map(p => ({
                index: p.index,
                name: p.name,
                class: normalizeClass(p.class) || p.class,
                school: p.school || school
            }));
        }

        res.status(200).json(resp);

    } catch (e) {
        console.error('LOGIN FAILURE:', e.message || 'Authentication error');
        const status = e.status || (e.response?.status) || 401;
        const msg = e.message || "Errore sconosciuto durante il login";
        res.status(status).json({
            success: false,
            error: msg,
            code: status
        });
    }
}
