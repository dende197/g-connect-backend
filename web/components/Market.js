export function renderMarket() {
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
