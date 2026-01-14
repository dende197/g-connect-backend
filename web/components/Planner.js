export function renderPlanner() {
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
        <div id="tasks-list">
            ${tasks.map(t => renderTask(t)).join('')}
        </div>
    `;

    return container;
}

function renderTask(task) {
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
}
