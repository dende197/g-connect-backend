# G-Connect 🎓

**G-Connect** è una Progressive Web App (PWA) moderna per studenti, progettata per integrarsi con il registro elettronico **Argo DidUP**.

## ✨ Caratteristiche
- **Design Premium**: Interfaccia stile iOS/Glassmorphism.
- **Argo Integration**: Login sicuro e sincronizzazione Compiti.
- **Planner**: Gestione attività scolastiche.
- **Social Feed**: Bacheca per la classe/istituto (simulata).
- **Market**: Mercatino libri usati (simulato).

## 🚀 Installazione Locale

### 1. Backend (Python Server)
Il server fa da ponte tra l'App e Argo.
```bash
# Crea un virtual environment (opzionale ma consigliato)
python3 -m venv venv
source venv/bin/activate

# Installa le dipendenze
pip install -r requirements.txt

# Avvia il server
python3 server.py
# Il server girerà su: http://127.0.0.1:5002
```

### 2. Frontend (App)
Apri semplicemente il file `web/index.html` nel tuo browser (Chrome/Safari).

## ☁️ Deploy (Render/Heroku)
Il progetto è pronto per il deploy cloud.
1. Carica questa cartella su **GitHub**.
2. Collega la repository a **Render.com** (o Railway/Heroku).
3. Il server verrà rilevato automaticamente grazie a `Procfile` e `requirements.txt`.
4. Una volta online, aggiorna la variabile `API_BASE_URL` in `web/index.html` con il tuo nuovo indirizzo HTTPS.

## 🛠 Tecnologie
- **Frontend**: HTML5, Vanilla JS, CSS3 (No Frameworks).
- **Backend**: Python, Flask.
- **Argo API**: Libreria `argofamiglia`.
