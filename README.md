# G-Connect 🎓

**G-Connect** è una Progressive Web App (PWA) moderna per studenti, progettata per integrarsi con il registro elettronico **Argo DidUP**.

## ✨ Caratteristiche
- **Design Premium**: Interfaccia stile iOS/Glassmorphism.
- **Argo Integration**: Login sicuro e sincronizzazione Compiti, Voti e Promemoria.
- **Multi-Profilo**: Supporto per account con più studenti (es. genitori con più figli).
- **Planner**: Gestione attività scolastiche con calendario integrato.
- **Cambio Profilo**: Passa tra diversi profili senza dover effettuare nuovamente il login.
- **Social Feed**: Bacheca per la classe/istituto (simulata).
- **Market**: Mercatino libri usati (simulato).

## 🆕 Novità v2.0
- ✅ **Supporto Multi-Profilo**: Gestisci più studenti con un solo account
- ✅ **Cambio Profilo Rapido**: Passa da uno studente all'altro senza re-login
- ✅ **Fix Compiti**: Risolto problema di visualizzazione compiti e date corrette
- ✅ **Gestione Sessione Migliorata**: Persistenza dati tra i profili

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

## 🔐 Supporto Multi-Profilo

### Come Funziona
Quando effettui il login con un account che ha più studenti associati (es. account genitore):
1. Il sistema rileva automaticamente tutti i profili disponibili
2. Ti viene mostrata una schermata di selezione con tutti gli studenti
3. Scegli il profilo che vuoi visualizzare
4. Puoi cambiare profilo in qualsiasi momento dalla pagina "Profilo"

### Endpoint API

#### Login con Multi-Profilo
```bash
POST /login
{
  "schoolCode": "CODICE_SCUOLA",
  "username": "USERNAME",
  "password": "PASSWORD"
}
```

**Risposta (Profilo Singolo):**
```json
{
  "success": true,
  "multiProfile": false,
  "student": { "name": "Nome Studente", "class": "5A" },
  "tasks": [...],
  "voti": [...],
  "promemoria": [...]
}
```

**Risposta (Multi-Profilo):**
```json
{
  "success": true,
  "multiProfile": true,
  "profiles": [
    {
      "id": 0,
      "nome": "Mario",
      "cognome": "Rossi",
      "classe": "3A",
      "scuola": "Liceo Scientifico"
    },
    {
      "id": 1,
      "nome": "Lucia",
      "cognome": "Rossi",
      "classe": "1B",
      "scuola": "Scuola Media"
    }
  ]
}
```

#### Selezione Profilo
```bash
POST /login
{
  "schoolCode": "CODICE_SCUOLA",
  "username": "USERNAME",
  "password": "PASSWORD",
  "selectedProfileIndex": 0
}
```

#### Cambio Profilo
```bash
POST /switch-profile
{
  "schoolCode": "CODICE_SCUOLA",
  "storedUser": "BASE64_USERNAME",
  "storedPass": "BASE64_PASSWORD",
  "profileIndex": 1
}
```

## 📱 Utilizzo

### Login Iniziale
1. Apri l'app
2. Clicca su "Accedi"
3. Inserisci codice scuola, username e password
4. Se hai più profili, seleziona quello desiderato

### Cambio Profilo
1. Vai alla tab "Profilo" (icona utente in basso a destra)
2. Clicca su "Cambia Profilo" (visibile solo se hai più profili)
3. Seleziona il nuovo profilo
4. I dati verranno aggiornati automaticamente

### Sincronizzazione
- Clicca sull'icona di sincronizzazione (freccia circolare) nella home o nel planner
- I dati verranno aggiornati mantenendo il profilo attivo corrente

## 🛠 Tecnologie
- **Frontend**: HTML5, Vanilla JS, CSS3 (No Frameworks).
- **Backend**: Python, Flask.
- **Argo API**: Libreria `argofamiglia`.
- **Storage**: LocalStorage per persistenza offline.

## 📚 Documentazione

- [Guida Test](TESTING_GUIDE.md) - Guida completa per testare tutte le funzionalità
- [Backend Checklist](web/BACKEND_CHECKLIST.md) - Verifica connessione DidUP

## 🐛 Problemi Risolti

### Compiti Non Visualizzati
**Problema**: I compiti non venivano mostrati nell'app.  
**Soluzione**: Verificato ordine di estrazione dati e corretto formato date (fix timezone +1 giorno).

### Date Sbagliate
**Problema**: Le date dei compiti erano sfasate di un giorno.  
**Soluzione**: Implementato `fix_date_timezone()` per correggere automaticamente.

### Account Multi-Studente
**Problema**: Account con più figli non potevano scegliere quale visualizzare.  
**Soluzione**: Implementato sistema completo di selezione e cambio profilo.

## ⚠️ Limitazioni Note

1. Il cambio profilo richiede connessione internet
2. L'endpoint forgot-password è un placeholder (richiede integrazione con sistema scuola)
3. I profili vengono recuperati ad ogni login (potrebbe essere ottimizzato con cache)

## 🔒 Sicurezza

- ✅ Credenziali non esposte nel DOM
- ✅ Sessione con encoding base64
- ✅ Cleanup automatico credenziali temporanee
- ✅ No vulnerabilità SQL injection (usa API Argo)
- ⚠️ Raccomandato HTTPS in produzione
- ⚠️ Considerare rate limiting per login

## 📄 Licenza

Questo progetto è fornito "così com'è" per scopi educativi.
