export function renderFeed() {
    const container = document.createElement('div');
    container.className = 'view';

    const posts = [
        { author: "Marco Rossi", tag: "@4A", time: "10m", content: "Qualcuno ha gli appunti di Fisica? 🤯", likes: 5 },
        { author: "Admin", tag: "@Staff", time: "1h", content: "⚠️ Palestra chiusa per manutenzione.", likes: 120 },
        { author: "Giulia B.", tag: "@5B", time: "2h", content: "Vendo libro di Inglese.", likes: 2 }
    ];

    container.innerHTML = `
        <div class="header">Community Feed</div>
        <div id="posts-container">
            ${posts.map(post => renderPost(post)).join('')}
        </div>

        <!-- FAB -->
        <button style="position: fixed; bottom: 100px; right: 20px; width: 56px; height: 56px; border-radius: 50%; background: var(--accent-gradient); border: none; color: white; box-shadow: 0 4px 12px rgba(99,102,241,0.5); display: flex; align-items: center; justify-content: center; font-size: 24px;">
            <i class="ph ph-plus"></i>
        </button>
    `;

    return container;
}

function renderPost(post) {
    return `
        <div class="card" style="padding-bottom: 10px;">
            <div style="display: flex; gap: 12px; margin-bottom: 12px;">
                <div style="width: 40px; height: 40px; border-radius: 50%; background: #333; display: flex; align-items: center; justify-content: center; font-weight: bold;">
                    ${post.author[0]}
                </div>
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
                <button style="background: none; border: none; color: var(--text-secondary); display: flex; gap: 6px; align-items: center;">
                    <i class="ph ph-heart"></i> ${post.likes}
                </button>
                <button style="background: none; border: none; color: var(--text-secondary); display: flex; gap: 6px; align-items: center;">
                    <i class="ph ph-chat-circle"></i> Commenta
                </button>
            </div>
        </div>
    `;
}
