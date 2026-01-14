// State
const state = {
    user: null, // null = not logged in
    currentView: 'login'
};

const app = document.getElementById('app');
const nav = document.getElementById('bottom-nav');

// --- COMPONENTS ---

// Login Component
function renderLogin(onLoginSuccess) {
    const container = document.createElement('div');
    container.className = 'view';
    container.style.height = '100vh';
    container.style.display = 'flex';
    container.style.flexDirection = 'column';
    container.style.justifyContent = 'center';

    container.innerHTML = `
        <h1 class="title" style="text-align: center; margin-bottom: 40px;">G-Connect</h1>
        
        <input type="email" placeholder="Email Istituzionale" id="email" value="student@school.edu">
        <input type="password" placeholder="Password" id="password" value="password">
        
        <button class="btn-primary">Accedi</button>
        
        <p style="text-align: center; color: var(--text-secondary); margin-top: 20px; font-size: 14px;">
            Accedendo accetti i termini di servizio della scuola.
        </p>
    `;

    const btn = container.querySelector('button');
    btn.addEventListener('click', () => {
        const email = container.querySelector('#email').value;
        if (email) {
            btn.innerHTML = 'Caricamento...';
            setTimeout(() => {
                onLoginSuccess({ name: 'Andrea', class: '5B' });
            }, 800);
        }
    });

    return container;
}

// Dashboard Component
function renderDashboard(user) {
    const container = document.createElement('div');
    container.className = 'view';

    const news = [
        { title: "Chiusura Scuole", date: "OGGI", img: "linear-gradient(to right, #f87171, #fca5a5)" },
        { title: "Olimpiadi Mate", date: "IERI", img: "linear-gradient(to right, #60a5fa, #93c5fd)" },
        { title: "Nuovo Orario", date: "2 GG SA", img: "linear-gradient(to right, #34d399, #6ee7b7)" }
    ];

    container.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <div>
                <div class="subtitle" style="margin-bottom: 4px;">Buongiorno,</div>
                <div class="title">${user.name}</div>
            </div>
            <div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, blue, purple); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px;">
                ${user.name[0]}
            </div>
        </div>

        <div class="header">In Evidenza</div>
        <div style="display: flex; gap: 16px; overflow-x: auto; padding-bottom: 20px; margin-bottom: 10px;">
            ${news.map(n => `
                <div style="min-width: 250px; height: 140px; border-radius: 18px; background: ${n.img}; padding: 16px; display: flex; flex-direction: column; justify-content: flex-end; position: relative;">
                    <div style="font-size: 11px; font-weight: bold; margin-bottom: 4px; opacity: 0.8;">${n.date}</div>
                    <div style="font-size: 18px; font-weight: 700; line-height: 1.2;">${n.title}</div>
                </div>
            `).join('')}
        </div>

        <div class="card" style="display: flex; align-items: center; justify-content: space-between;">
            <div>
                <div class="caption" style="margin-bottom: 4px; color: var(--text-secondary);">TRA 10 MIN</div>
                <div class="header" style="margin-bottom: 4px;">Matematica</div>
                <div style="display: flex; gap: 6px; align-items: center; font-size: 14px; color: var(--text-secondary);">
                    <i class="ph-fill ph-map-pin"></i> Aula 3C
                </div>
            </div>
            <div style="position: relative; width: 60px; height: 60px; display: flex; align-items: center; justify-content: center;">
                <svg width="60" height="60" style="transform: rotate(-90deg);">
                    <circle cx="30" cy="30" r="26" stroke="rgba(255,255,255,0.1)" stroke-width="4" fill="none"></circle>
                    <circle cx="30" cy="30" r="26" stroke="var(--accent-color)" stroke-width="4" fill="none" stroke-dasharray="163" stroke-dashoffset="40"></circle>
                </svg>
                <span style="position: absolute; font-size: 13px; font-weight: bold;">45'</span>
            </div>
        </div>

        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            ${renderActionCard('ph-chart-bar', 'Voti', 'var(--success)', 'openGrades')}
            ${renderActionCard('ph-list-bullets', 'Note', 'var(--danger)', 'openNotes')}
            ${renderActionCard('ph-clock', 'Orario', 'var(--info)', 'openSchedule')}
            ${renderActionCard('ph-bell', 'Avvisi', 'var(--warning)', 'openAlerts')}
        </div>
    `;
    // Attach Global Handlers for Demo purposes
    window.openGrades = () => alert('Apertura registro voti...');
    window.openNotes = () => alert('Caricamento note disciplinari...');
    window.openSchedule = () => alert('Scarico orario aggiornato...');
    window.openAlerts = () => alert('Nessun nuovo avviso importante.');

    return container;
}

function renderActionCard(icon, title, color, action) {
    return `
        <div class="card" onclick="${action}()" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100px; margin-bottom: 0; cursor: pointer; transition: transform 0.1s;" onmousedown="this.style.transform='scale(0.96)'" onmouseup="this.style.transform='scale(1)'" onmouseleave="this.style.transform='scale(1)'">
            <i class="ph-fill ${icon}" style="font-size: 28px; color: ${color}; margin-bottom: 8px;"></i>
            <span style="font-weight: 600; font-size: 15px;">${title}</span>
        </div>
    `;
}

// Feed Component
function renderFeed() {
    const container = document.createElement('div');
    container.className = 'view';
    const posts = [
        { author: "Marco Rossi", tag: "@4A", time: "10m", content: "Qualcuno ha gli appunti di Fisica? 🤯", likes: 5 },
        { author: "Admin", tag: "@Staff", time: "1h", content: "⚠️ Palestra chiusa per manutenzione.", likes: 120 },
        { author: "Giulia B.", tag: "@5B", time: "2h", content: "Vendo libro di Inglese.", likes: 2 }
    ];
    container.innerHTML = `
        <div class="header">Community Feed</div>
        <div id="posts-container">${posts.map(post => `
            <div class="card" style="padding-bottom: 10px;">
                <div style="display: flex; gap: 12px; margin-bottom: 12px;">
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: #333; display: flex; align-items: center; justify-content: center; font-weight: bold;">${post.author[0]}</div>
                    <div>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <span style="font-weight: 700;">${post.author}</span>
                            <span style="font-size: 12px; color: var(--text-secondary);">${post.tag}</span>
                        </div>
                        <div style="font-size: 12px; color: var(--text-secondary);">${post.time}</div>
                    </div>
                </div>
                <div style="margin-bottom: 16px; line-height: 1.5;">${post.content}</div>
                <div style="border-top: 1px solid var(--border-color); padding-top: 10px; display: flex; gap: 20px;">
                    <button style="background: none; border: none; color: var(--text-secondary); display: flex; gap: 6px; align-items: center;"><i class="ph ph-heart"></i> ${post.likes}</button>
                    <button style="background: none; border: none; color: var(--text-secondary); display: flex; gap: 6px; align-items: center;"><i class="ph ph-chat-circle"></i> Commenta</button>
                </div>
            </div>
        `).join('')}</div>
        <button style="position: fixed; bottom: 100px; right: 20px; width: 56px; height: 56px; border-radius: 50%; background: var(--accent-gradient); border: none; color: white; box-shadow: 0 4px 12px rgba(99,102,241,0.5); display: flex; align-items: center; justify-content: center; font-size: 24px;">
            <i class="ph ph-plus"></i>
        </button>
    `;
    return container;
}

// Planner Component
function renderPlanner() {
    const container = document.createElement('div');
    container.className = 'view';
    const tasks = [
        { title: "Esercizi Mat 20-30", sub: "Matematica", done: false, type: "homework" },
        { title: "Studiare Cap. 4", sub: "Storia", done: true, type: "homework" },
        { title: "Verifica Sommativa", sub: "Fisica", done: false, type: "exam" }
    ];
    container.innerHTML = `
        <div class="header">Planner</div>
        <div class="caption" style="margin-bottom: 12px;">OGGI</div>
        <div id="tasks-list">${tasks.map(task => {
        const icon = task.type === 'homework' ? 'ph-book' : 'ph-graduation-cap';
        const color = task.type === 'homework' ? 'var(--info)' : 'var(--danger)';
        return `
                <div class="card" style="display: flex; align-items: center; gap: 16px; padding: 16px;">
                    <div style="font-size: 24px; color: ${task.done ? 'var(--success)' : 'var(--text-secondary)'}; cursor: pointer;">
                        <i class="${task.done ? 'ph-fill ph-check-circle' : 'ph ph-circle'}"></i>
                    </div>
                    <div style="flex: 1; ${task.done ? 'opacity: 0.5; text-decoration: line-through;' : ''}">
                        <div style="font-weight: 600; font-size: 16px;">${task.title}</div>
                        <div style="font-size: 13px; color: ${color}; display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                            <i class="ph-fill ${icon}"></i> ${task.sub}
                        </div>
                    </div>
                </div>
            `;
    }).join('')}</div>
    `;
    return container;
}

// Market Component
function renderMarket() {
    const container = document.createElement('div');
    container.className = 'view';
    const items = [
        { title: "Matematica Blu", price: "€15", img: "ph-book-open" },
        { title: "Appunti Storia", price: "€5", img: "ph-files" },
        { title: "Calcolatrice", price: "€10", img: "ph-calculator" },
        { title: "Tablet Wacom", price: "€30", img: "ph-pen-nib" }
    ];
    container.innerHTML = `
        <div class="header">Mercatino</div>
        <input type="text" placeholder="Cerca libri, appunti...">
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            ${items.map(item => `
                <div class="card" style="margin-bottom: 0; padding: 12px;">
                    <div style="height: 100px; background: rgba(255,255,255,0.05); border-radius: 12px; display: flex; align-items: center; justify-content: center; margin-bottom: 12px;">
                        <i class="ph ${item.img}" style="font-size: 40px; color: var(--text-secondary);"></i>
                    </div>
                    <div style="font-weight: 700; font-size: 16px; margin-bottom: 2px;">${item.price}</div>
                    <div style="font-size: 13px; color: var(--text-secondary);">${item.title}</div>
                </div>
            `).join('')}
        </div>
    `;
    return container;
}

// --- ROUTER ---

function navigate(view) {
    state.currentView = view;
    render();
    updateNav();
}

function render() {
    app.innerHTML = '';

    if (!state.user && state.currentView !== 'login') {
        state.currentView = 'login';
    }

    switch (state.currentView) {
        case 'login':
            nav.classList.add('hidden');
            app.appendChild(renderLogin(onLogin));
            break;
        case 'home':
            nav.classList.remove('hidden');
            app.appendChild(renderDashboard(state.user));
            break;
        case 'feed':
            nav.classList.remove('hidden');
            app.appendChild(renderFeed());
            break;
        case 'planner':
            nav.classList.remove('hidden');
            app.appendChild(renderPlanner());
            break;
        case 'market':
            nav.classList.remove('hidden');
            app.appendChild(renderMarket());
            break;
        case 'profile':
            nav.classList.remove('hidden');
            const profileDiv = document.createElement('div');
            profileDiv.className = 'view';
            profileDiv.innerHTML = `
                <h1 class="title">Profilo</h1>
                <p class="subtitle">Gestisci il tuo account</p>
                <button class="btn-primary" style="background: var(--danger)" id="logout-btn">Logout</button>
            `;
            setTimeout(() => {
                profileDiv.querySelector('#logout-btn').addEventListener('click', onLogout);
            }, 0);
            app.appendChild(profileDiv);
            break;
    }
}

document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
        // Find closest button in case icon/span click
        const targetBtn = e.target.closest('.nav-item');
        if (targetBtn) {
            navigate(targetBtn.dataset.target);
        }
    });
});

function updateNav() {
    document.querySelectorAll('.nav-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.target === state.currentView);
    });
}

function onLogin(user) {
    state.user = user;
    navigate('home');
}

function onLogout() {
    state.user = null;
    navigate('login');
}

// Init
render();
