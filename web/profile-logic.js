// ============================================
// GESTIONE LOGIN CON MULTI-PROFILO
// ============================================

// STEP 1: Login iniziale
async function performLogin(schoolCode, username, password) {
    try {
        const response = await fetch(`${API_BASE_URL}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ schoolCode, username, password })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error);
        }

        // Salva credenziali per usi futuri (sync/silent login)
        localStorage.setItem('schoolCode', schoolCode);
        localStorage.setItem('storedUser', btoa(unescape(encodeURIComponent(username))));
        localStorage.setItem('storedPass', btoa(unescape(encodeURIComponent(password))));

        // CASO 1: Profilo singolo - procedi direttamente
        if (!data.multiProfile) {
            console.log("✅ Profilo singolo, salvo dati...");

            // Salva sessione
            localStorage.setItem('session', JSON.stringify(data.session));

            // Salva dati studente
            localStorage.setItem('student', JSON.stringify(data.student));
            localStorage.setItem('tasks', JSON.stringify(data.tasks));
            localStorage.setItem('voti', JSON.stringify(data.voti));
            localStorage.setItem('promemoria', JSON.stringify(data.promemoria));

            // Vai alla dashboard (reload o cambio vista)
            window.location.reload();
            return;
        }

        // CASO 2: Multi-profilo - mostra selezione
        if (data.multiProfile && data.requiresSelection) {
            console.log(`👥 Trovati ${data.profili.length} profili`);

            // Salva temporaneamente la sessione
            sessionStorage.setItem('tempSession', JSON.stringify(data.session));

            // Mostra UI di selezione profilo
            showProfileSelector(data.profili);
            return;
        }

    } catch (error) {
        console.error('❌ Errore login:', error);
        alert('Errore durante il login: ' + error.message);
    }
}


// STEP 2: Mostra UI selezione profilo
function showProfileSelector(profili) {
    // Nascondi form login
    document.getElementById('login-form-container').style.display = 'none';

    // Crea UI selezione
    const container = document.getElementById('profile-selector-container');
    container.innerHTML = `
        <div class="profile-selector">
            <h2>👨👩👧👦 Seleziona un profilo</h2>
            <p>Questo account ha ${profili.length} studenti collegati:</p>
            
            <div class="profile-list">
                ${profili.map(profile => `
                    <div class="profile-card" onclick="selectProfile('${profile.id}')">
                        <div class="profile-avatar">
                            ${getInitials(profile.nome)}
                        </div>
                        <div class="profile-info">
                            <h3>${profile.nome}</h3>
                            <p class="profile-class">Classe: ${profile.classe}</p>
                            <p class="profile-year">${profile.annoScolastico}</p>
                        </div>
                        <div class="profile-arrow">→</div>
                    </div>
                `).join('')}
            </div>
            
            <button onclick="cancelProfileSelection()" class="btn-cancel">
                ← Annulla
            </button>
        </div>
    `;

    container.style.display = 'block';
}


// STEP 3: Selezione profilo
async function selectProfile(profileId) {
    try {
        console.log(`📌 Profilo selezionato: ${profileId}`);

        // Recupera sessione temporanea
        const tempSession = JSON.parse(sessionStorage.getItem('tempSession'));

        if (!tempSession || !tempSession.sessionId) {
            throw new Error('Sessione non trovata. Riprova il login.');
        }

        // Mostra loading
        showLoadingOverlay('Caricamento dati studente...');

        // Richiesta al backend
        const response = await fetch(`${API_BASE_URL}/select-profile`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: tempSession.sessionId,
                profileId: profileId
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error);
        }

        console.log('✅ Dati profilo caricati:', data.student);

        // Salva tutti i dati
        localStorage.setItem('session', JSON.stringify(tempSession));
        localStorage.setItem('student', JSON.stringify(data.student));
        localStorage.setItem('tasks', JSON.stringify(data.tasks));
        localStorage.setItem('voti', JSON.stringify(data.voti));
        localStorage.setItem('promemoria', JSON.stringify(data.promemoria));

        // Salva profileId per sync futuri
        const sessionData = JSON.parse(localStorage.getItem('session'));
        sessionData.profileId = profileId;
        localStorage.setItem('session', JSON.stringify(sessionData));

        // Pulisci sessione temporanea
        sessionStorage.removeItem('tempSession');

        // Vai alla dashboard
        hideLoadingOverlay();
        window.location.reload();

    } catch (error) {
        console.error('❌ Errore selezione profilo:', error);
        hideLoadingOverlay();
        alert('Errore nella selezione: ' + error.message);
    }
}


// STEP 4: Sync aggiornato (include profileId)
async function performSync() {
    try {
        const session = JSON.parse(localStorage.getItem('session'));
        const storedUser = localStorage.getItem('storedUser');
        const storedPass = localStorage.getItem('storedPass');

        if (!session || !storedUser || !storedPass) {
            console.log('⚠️ Sessione non valida, richiesto nuovo login');
            // Gestione logout/redirect
            return;
        }

        console.log('🔄 Sincronizzazione in background...');

        const response = await fetch(`${API_BASE_URL}/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                schoolCode: session.schoolCode,
                storedUser: storedUser,
                storedPass: storedPass,
                profileId: session.profileId  // NUOVO: passa il profilo selezionato
            })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error);
        }

        // Aggiorna dati locali
        localStorage.setItem('tasks', JSON.stringify(data.tasks));
        localStorage.setItem('voti', JSON.stringify(data.voti));
        localStorage.setItem('promemoria', JSON.stringify(data.promemoria));

        // Aggiorna token se presenti
        if (data.new_tokens) {
            const sessionData = JSON.parse(localStorage.getItem('session'));
            sessionData.authToken = data.new_tokens.authToken;
            sessionData.accessToken = data.new_tokens.accessToken;
            localStorage.setItem('session', JSON.stringify(sessionData));
        }

        console.log('✅ Sync completato');

        // Ricarica UI se necessario (qui si potrebbe chiamare una funzione globale di refresh)
        if (typeof renderVoti === 'function') {
            renderVoti(data.voti);
        }
        if (typeof renderTasks === 'function') {
            // Assumes updateTasks or similar exists, but local storage is source of truth for rendering mostly
            // updateTasks() parses from local storage usually? No, it takes args sometimes.
            // Let's reload page if critical
            // Or call updateTasks() if defined globally
        }

    } catch (error) {
        console.error('⚠️ Errore Sync:', error);
    }
}


// ============================================
// HELPER FUNCTIONS
// ============================================

function getInitials(name) {
    if (!name) return '?';
    return name
        .split(' ')
        .map(word => word[0])
        .join('')
        .toUpperCase()
        .substring(0, 2);
}

function cancelProfileSelection() {
    sessionStorage.removeItem('tempSession');
    document.getElementById('profile-selector-container').style.display = 'none';
    document.getElementById('login-form-container').style.display = 'block';
}

function showLoadingOverlay(message) {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.querySelector('.loading-message').textContent = message;
        overlay.style.display = 'flex';
    }
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) {
        overlay.style.display = 'none';
    }
}
