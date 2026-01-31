// ============================================
// GESTIONE LOGIN CON MULTI-PROFILO - VERSIONE CORRETTA
// Allineata al backend reale (server.js)
// ============================================

// Configurazione (definisci nel tuo main.js o config)
// const API_BASE_URL = 'https://your-backend.onrender.com';

// ============================================
// STEP 1: Login Iniziale
// ============================================

async function performLogin(schoolCode, username, password) {
    try {
        console.log('🔐 Tentativo login...', { schoolCode, username });

        // Setup timeout
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 secondi

        let response;
        try {
            response = await fetch(`${API_BASE_URL}/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    schoolCode,
                    username,
                    password
                }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);
        } catch (error) {
            clearTimeout(timeoutId);
            if (error.name === 'AbortError') {
                throw new Error('⏱️ Timeout: il server non risponde. Controlla la connessione.');
            }
            throw new Error('🌐 Errore di rete: impossibile contattare il server.');
        }

        // Verifica HTTP status
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Login fallito');
        }

        console.log('✅ Login riuscito', data);

        // Salva credenziali (solo per sync future)
        // NOTA: Salvare password è un rischio di sicurezza
        // Idealmente il backend dovrebbe fornire un refresh token
        localStorage.setItem('schoolCode', schoolCode);
        localStorage.setItem('userName', username);

        // Password codificata (NON è sicuro, solo offuscamento)
        // TODO: Sostituire con refresh token dal backend
        localStorage.setItem('storedUser', btoa(encodeURIComponent(username)));
        localStorage.setItem('storedPass', btoa(encodeURIComponent(password)));

        // CASO 1: Multi-profilo - Backend ritorna status: "MULTIPLE_PROFILES"
        if (data.status === "MULTIPLE_PROFILES" &&
            data.profiles &&
            data.profiles.length > 1) {

            console.log(`👥 Multi-profilo: ${data.profiles.length} studenti trovati`);

            // Salva sessione e profili temporaneamente
            sessionStorage.setItem('tempSession', JSON.stringify(data.session));
            sessionStorage.setItem('tempProfiles', JSON.stringify(data.profiles));

            // Salva anche i dati del primo profilo (default)
            sessionStorage.setItem('tempStudent', JSON.stringify(data.student));
            sessionStorage.setItem('tempTasks', JSON.stringify(data.tasks));
            sessionStorage.setItem('tempVoti', JSON.stringify(data.voti));
            sessionStorage.setItem('tempPromemoria', JSON.stringify(data.promemoria));

            // Mostra UI selezione profilo
            showProfileSelector(data.profiles);
            return;
        }

        // CASO 2: Profilo singolo o già selezionato
        console.log('✅ Profilo singolo - salvataggio dati...');

        // Salva sessione permanentemente
        localStorage.setItem('session', JSON.stringify(data.session));

        // Salva dati studente
        localStorage.setItem('student', JSON.stringify(data.student));
        localStorage.setItem('tasks', JSON.stringify(data.tasks || []));
        localStorage.setItem('voti', JSON.stringify(data.voti || []));
        localStorage.setItem('promemoria', JSON.stringify(data.promemoria || []));

        // Salva profileIndex (default: 0)
        const session = data.session;
        session.profileIndex = data.session.profileIndex || 0;
        localStorage.setItem('session', JSON.stringify(session));

        console.log('💾 Dati salvati - redirect a dashboard');

        // Vai alla dashboard
        navigateToDashboard();

    } catch (error) {
        console.error('❌ Errore login:', error);

        // Mostra errore user-friendly
        showError('Errore di login', error.message);
    }
}


// ============================================
// STEP 2: UI Selezione Profilo
// ============================================

function showProfileSelector(profiles) {
    console.log('🎨 Mostrando UI selezione profilo', profiles);

    // Nascondi form login
    const loginContainer = document.getElementById('login-form-container');
    if (loginContainer) {
        loginContainer.style.display = 'none';
    }

    // Container selezione profilo
    const container = document.getElementById('profile-selector-container');
    if (!container) {
        console.error('❌ Elemento #profile-selector-container non trovato!');
        return;
    }

    // Pulisci container
    container.innerHTML = '';

    // Crea wrapper
    const wrapper = document.createElement('div');
    wrapper.className = 'profile-selector';

    // Titolo
    const title = document.createElement('h2');
    title.innerHTML = '👨👩👧👦 Seleziona un profilo';
    wrapper.appendChild(title);

    // Sottotitolo
    const subtitle = document.createElement('p');
    subtitle.textContent = `Questo account ha ${profiles.length} studenti collegati:`;
    wrapper.appendChild(subtitle);

    // Lista profili
    const profileList = document.createElement('div');
    profileList.className = 'profile-list';

    profiles.forEach((profile, index) => {
        const card = createProfileCard(profile, index);
        profileList.appendChild(card);
    });

    wrapper.appendChild(profileList);

    // Bottone annulla
    const cancelBtn = document.createElement('button');
    cancelBtn.className = 'btn-cancel';
    cancelBtn.innerHTML = '← Annulla';
    cancelBtn.onclick = cancelProfileSelection;
    wrapper.appendChild(cancelBtn);

    // Aggiungi al container
    container.appendChild(wrapper);
    container.style.display = 'block';
}


// Crea card profilo (DOM safety - no XSS)
function createProfileCard(profile, index) {
    const card = document.createElement('div');
    card.className = 'profile-card';
    card.onclick = () => selectProfile(index);
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');

    // Avatar
    const avatar = document.createElement('div');
    avatar.className = 'profile-avatar';
    avatar.textContent = getInitials(profile.name);
    card.appendChild(avatar);

    // Info
    const info = document.createElement('div');
    info.className = 'profile-info';

    const nameEl = document.createElement('h3');
    nameEl.textContent = profile.name || `Studente ${index + 1}`;
    info.appendChild(nameEl);

    const classEl = document.createElement('p');
    classEl.className = 'profile-class';
    classEl.textContent = `Classe: ${profile.class || 'N/D'}`;
    info.appendChild(classEl);

    if (profile.school) {
        const schoolEl = document.createElement('p');
        schoolEl.className = 'profile-school';
        schoolEl.textContent = profile.school;
        info.appendChild(schoolEl);
    }

    card.appendChild(info);

    // Arrow
    const arrow = document.createElement('div');
    arrow.className = 'profile-arrow';
    arrow.textContent = '→';
    card.appendChild(arrow);

    return card;
}


// ============================================
// STEP 3: Selezione Profilo
// ============================================

async function selectProfile(profileIndex) {
    try {
        console.log(`📌 Profilo selezionato: index ${profileIndex}`);

        // Recupera credenziali e profili
        const schoolCode = localStorage.getItem('schoolCode');
        const storedUser = localStorage.getItem('storedUser');
        const storedPass = localStorage.getItem('storedPass');
        const tempProfiles = sessionStorage.getItem('tempProfiles');

        if (!schoolCode || !storedUser || !storedPass) {
            throw new Error('Credenziali mancanti. Riprova il login.');
        }

        if (!tempProfiles) {
            throw new Error('Profili non trovati. Riprova il login.');
        }

        const profiles = JSON.parse(tempProfiles);

        if (profileIndex < 0 || profileIndex >= profiles.length) {
            throw new Error(`Profilo index ${profileIndex} non valido`);
        }

        // Mostra loading
        showLoadingOverlay(`Caricamento dati di ${profiles[profileIndex].name}...`);

        // Decodifica credenziali
        const username = decodeURIComponent(atob(storedUser));
        const password = decodeURIComponent(atob(storedPass));

        // ═══════════════════════════════════════════════════════════
        // OPZIONE A: Ri-login con selectedProfileIndex (RACCOMANDATO)
        // Il backend /login supporta già questo parametro
        // ═══════════════════════════════════════════════════════════

        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                schoolCode,
                username,
                password,
                selectedProfileIndex: profileIndex  // ← Backend supporta questo
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Errore nel caricamento del profilo');
        }

        console.log('✅ Dati profilo caricati:', data.student);

        // Salva sessione permanentemente
        const session = data.session;
        session.profileIndex = profileIndex;
        localStorage.setItem('session', JSON.stringify(session));

        // Salva dati studente
        localStorage.setItem('student', JSON.stringify(data.student));
        localStorage.setItem('tasks', JSON.stringify(data.tasks || []));
        localStorage.setItem('voti', JSON.stringify(data.voti || []));
        localStorage.setItem('promemoria', JSON.stringify(data.promemoria || []));

        // Pulisci dati temporanei
        sessionStorage.removeItem('tempSession');
        sessionStorage.removeItem('tempProfiles');
        sessionStorage.removeItem('tempStudent');
        sessionStorage.removeItem('tempTasks');
        sessionStorage.removeItem('tempVoti');
        sessionStorage.removeItem('tempPromemoria');

        console.log('💾 Dati salvati - redirect a dashboard');

        // Vai alla dashboard
        hideLoadingOverlay();
        navigateToDashboard();

    } catch (error) {
        console.error('❌ Errore selezione profilo:', error);
        hideLoadingOverlay();
        showError('Errore selezione profilo', error.message);
    }
}


// ============================================
// STEP 4: Sync (Background Update)
// ============================================

async function performSync(silent = true) {
    try {
        const session = JSON.parse(localStorage.getItem('session'));
        const storedUser = localStorage.getItem('storedUser');
        const storedPass = localStorage.getItem('storedPass');

        if (!session || !storedUser || !storedPass) {
            console.warn('⚠️ Sessione non valida - richiesto nuovo login');

            if (!silent) {
                showError('Sessione scaduta', 'Effettua nuovamente il login');
            }

            // Redirect a login
            setTimeout(() => {
                localStorage.clear();
                window.location.href = '/index.html';
            }, 2000);

            return;
        }

        if (!silent) {
            console.log('🔄 Sincronizzazione manuale...');
        } else {
            console.log('🔄 Sincronizzazione background...');
        }

        const response = await fetch(`${API_BASE_URL}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                schoolCode: session.schoolCode,
                storedUser: storedUser,
                storedPass: storedPass,
                profileIndex: session.profileIndex || 0  // ← CORRETTO: profileIndex
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Sync fallito');
        }

        // Aggiorna dati locali
        localStorage.setItem('tasks', JSON.stringify(data.tasks || []));
        localStorage.setItem('voti', JSON.stringify(data.voti || []));
        localStorage.setItem('promemoria', JSON.stringify(data.promemoria || []));

        // Aggiorna token se presenti
        if (data.new_tokens) {
            const sessionData = JSON.parse(localStorage.getItem('session'));
            sessionData.authToken = data.new_tokens.authToken;
            sessionData.accessToken = data.new_tokens.accessToken;
            localStorage.setItem('session', JSON.stringify(sessionData));
        }

        console.log('✅ Sync completato');

        // Aggiorna UI se funzioni disponibili
        if (typeof window.updateDashboard === 'function') {
            window.updateDashboard();
        }

        // Event custom per notificare altri componenti
        window.dispatchEvent(new CustomEvent('syncCompleted', {
            detail: {
                tasks: data.tasks,
                voti: data.voti,
                promemoria: data.promemoria
            }
        }));

    } catch (error) {
        console.error('⚠️ Errore Sync:', error);

        if (!silent) {
            showError('Errore sincronizzazione', error.message);
        }
    }
}


// ============================================
// HELPER FUNCTIONS
// ============================================

function getInitials(name) {
    if (!name) return '?';

    return name
        .trim()
        .split(/\s+/)  // Gestisce spazi multipli
        .filter(word => word.length > 0)
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .substring(0, 2) || '?';
}


function cancelProfileSelection() {
    console.log('🚫 Selezione profilo annullata');

    // Pulisci dati temporanei
    sessionStorage.removeItem('tempSession');
    sessionStorage.removeItem('tempProfiles');
    sessionStorage.removeItem('tempStudent');
    sessionStorage.removeItem('tempTasks');
    sessionStorage.removeItem('tempVoti');
    sessionStorage.removeItem('tempPromemoria');

    // Mostra form login
    const selectorContainer = document.getElementById('profile-selector-container');
    const loginContainer = document.getElementById('login-form-container');

    if (selectorContainer) {
        selectorContainer.style.display = 'none';
    }

    if (loginContainer) {
        loginContainer.style.display = 'block';
    }
}


function showLoadingOverlay(message = 'Caricamento...') {
    const overlay = document.getElementById('loading-overlay');

    if (overlay) {
        const msgEl = overlay.querySelector('.loading-message');
        if (msgEl) {
            msgEl.textContent = message;
        }
        overlay.style.display = 'flex';
    } else {
        console.warn('⚠️ Loading overlay element not found');
    }
}


function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');

    if (overlay) {
        overlay.style.display = 'none';
    }
}


function showError(title, message) {
    // Usa una modale di errore se disponibile
    const errorModal = document.getElementById('error-modal');

    if (errorModal) {
        const titleEl = errorModal.querySelector('.error-title');
        const messageEl = errorModal.querySelector('.error-message');

        if (titleEl) titleEl.textContent = title;
        if (messageEl) messageEl.textContent = message;

        errorModal.style.display = 'flex';
    } else {
        // Fallback: alert
        alert(`${title}\n\n${message}`);
    }
}


function navigateToDashboard() {
    // Opzione 1: Usa history API (mantiene stato)
    if (window.location.pathname !== '/dashboard.html') {
        window.location.href = '/dashboard.html';
    } else {
        // Già nella dashboard, ricarica dati
        if (typeof window.loadDashboardData === 'function') {
            window.loadDashboardData();
        } else {
            window.location.reload();
        }
    }
}


// ============================================
// AUTO-SYNC (Background)
// ============================================

// Avvia sync automatico ogni 5 minuti
let syncInterval = null;

function startAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
    }

    // Sync ogni 5 minuti (300000 ms)
    syncInterval = setInterval(() => {
        performSync(true);  // silent = true
    }, 300000);

    console.log('🔄 Auto-sync abilitato (ogni 5 minuti)');
}

function stopAutoSync() {
    if (syncInterval) {
        clearInterval(syncInterval);
        syncInterval = null;
        console.log('🛑 Auto-sync disabilitato');
    }
}


// ============================================
// EXPORT (se usi moduli)
// ============================================

// Se usi ES modules:
// export { performLogin, selectProfile, performSync, startAutoSync, stopAutoSync };

// Se usi script globali: le funzioni sono già disponibili globalmente

console.log('✅ profile-logic.js caricato correttamente');
