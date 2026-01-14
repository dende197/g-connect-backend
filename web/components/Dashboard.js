export function renderDashboard(user) {
    const container = document.createElement('div');
    container.className = 'view';

    // Mock News Data
    const news = [
        { title: "Chiusura Scuole", date: "OGGI", img: "linear-gradient(to right, #f87171, #fca5a5)" },
        { title: "Olimpiadi Mate", date: "IERI", img: "linear-gradient(to right, #60a5fa, #93c5fd)" },
        { title: "Nuovo Orario", date: "2 GG SA", img: "linear-gradient(to right, #34d399, #6ee7b7)" }
    ];

    container.innerHTML = `
        <!-- Header -->
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
            <div>
                <div class="subtitle" style="margin-bottom: 4px;">Buongiorno,</div>
                <div class="title">${user.name}</div>
            </div>
            <div style="width: 50px; height: 50px; border-radius: 50%; background: linear-gradient(135deg, blue, purple); display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 20px;">
                ${user.name[0]}
            </div>
        </div>

        <!-- News Carousel -->
        <div class="header">In Evidenza</div>
        <div style="display: flex; gap: 16px; overflow-x: auto; padding-bottom: 20px; margin-bottom: 10px;">
            ${news.map(n => `
                <div style="min-width: 250px; height: 140px; border-radius: 18px; background: ${n.img}; padding: 16px; display: flex; flex-direction: column; justify-content: flex-end; position: relative;">
                    <div style="font-size: 11px; font-weight: bold; margin-bottom: 4px; opacity: 0.8;">${n.date}</div>
                    <div style="font-size: 18px; font-weight: 700; line-height: 1.2;">${n.title}</div>
                </div>
            `).join('')}
        </div>

        <!-- Smart Widget -->
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
                    <circle cx="30" cy="30" r="26" stroke="url(#gradient)" stroke-width="4" fill="none" stroke-dasharray="163" stroke-dashoffset="40"></circle>
                    <defs>
                        <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                            <stop offset="0%" stop-color="#6366f1" />
                            <stop offset="100%" stop-color="#8b5cf6" />
                        </linearGradient>
                    </defs>
                </svg>
                <span style="position: absolute; font-size: 13px; font-weight: bold;">45'</span>
            </div>
        </div>

        <!-- Quick Actions Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
            ${renderActionCard('ph-chart-bar', 'Voti', 'var(--success)')}
            ${renderActionCard('ph-list-bullets', 'Note', 'var(--danger)')}
            ${renderActionCard('ph-clock', 'Orario', 'var(--info)')}
            ${renderActionCard('ph-bell', 'Avvisi', 'var(--warning)')}
        </div>
    `;

    return container;
}

function renderActionCard(icon, title, color) {
    return `
        <div class="card" style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100px; margin-bottom: 0;">
            <i class="ph-fill ${icon}" style="font-size: 28px; color: ${color}; margin-bottom: 8px;"></i>
            <span style="font-weight: 600; font-size: 15px;">${title}</span>
        </div>
    `;
}
