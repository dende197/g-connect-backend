export function renderLogin(onLoginSuccess) {
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
        // Mock Login
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
