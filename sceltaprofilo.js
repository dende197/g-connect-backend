// Funzione che "comanda" il login
async function eseguiLoginSicuro() {
    const dati = {
        schoolCode: document.getElementById('schoolCode').value,
        username: document.getElementById('username').value,
        password: document.getElementById('password').value
    };

    // 1. Chiamata al server (usando la rotta v2 che abbiamo creato nell'extended_server)
    const response = await fetch('https://tuo-server.com/login-v2', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dati)
    });

    const risultato = await response.json();

    if (risultato.multi_profile) {
        // Se ci sono più figli, nascondi il login e mostra le card
        document.getElementById('schermata-login').style.display = 'none';
        document.getElementById('schermata-selezione').style.display = 'block';
        
        generaCardFigli(risultato.profiles, dati);
    } else {
        // Se è un figlio solo, vai direttamente alla home
        mostraDatiHome(risultato);
    }
}

function generaCardFigli(lista, credenziali) {
    const container = document.getElementById('container-profili');
    container.innerHTML = ''; 

    lista.forEach(figlio => {
        const card = document.createElement('div');
        card.className = 'profile-card'; // Usa il CSS che avevi già scritto
        card.innerHTML = `
            <h3>${figlio.nome}</h3>
            <p>${figlio.classe}</p>
        `;
        
        // Quando clicchi la card, rifà il login mandando l'ID del figlio
        card.onclick = async () => {
            const res = await fetch('https://tuo-server.com/login-v2', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    ...credenziali,
                    selectedProfileIndex: figlio.id
                })
            });
            const datiFinali = await res.json();
            mostraDatiHome(datiFinali);
        };
        container.appendChild(card);
    });
}
