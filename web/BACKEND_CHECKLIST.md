# Checklist Backend - Verifica Connessione DidUP

## 🔍 Problema Identificato

Il frontend non riusciva a recuperare i dati (scadenze, voti, promemoria) da DidUP perché:
1. Il login iniziale recuperava solo i `tasks`, non anche `voti` e `promemoria`
2. La funzione `performSync()` non gestiva correttamente le credenziali
3. Mancava gestione errori per sessioni scadute

## ✅ Correzioni Applicate al Frontend

### 1. Login Iniziale - Carica TUTTI i Dati
Ora dopo il login vengono caricati:
- ✅ Tasks/Compiti
- ✅ Voti
- ✅ Promemoria/Announcements

### 2. Sincronizzazione Migliorata
- Gestisce sia credenziali separate che sessione completa
- Logging dettagliato per debug
- Gestione errori migliorata (sessione scaduta, errori di rete)

### 3. Test di Connessione
Aggiunto pulsante "Test Connessione Backend" nel modal di login

## 🔧 Cosa Verificare nel Backend

### Endpoint `/login` - Deve Restituire:

```json
{
  "success": true,
  "session": { /* dati sessione */ },
  "student": { "name": "...", "class": "..." },
  "tasks": [ /* array compiti */ ],
  "voti": [ /* array voti */ ],
  "promemoria": [ /* array promemoria */ ]
}
```

**Formato Atteso:**

#### Tasks/Compiti:
```json
{
  "id": "...",
  "text": "Descrizione compito",
  "desCompito": "Descrizione compito",
  "subject": "Materia",
  "materia": "Materia",
  "datCompito": "2024-02-15",
  "due_date": "2024-02-15",
  "dataProva": "2024-02-15",
  "date": "2024-02-15"
}
```

#### Voti:
```json
{
  "valore": "7.5",
  "value": "7.5",
  "materia": "Matematica",
  "subject": "Matematica",
  "data": "15/02/2024",
  "date": "15/02/2024",
  "tipo": "Scritto",
  "type": "Scritto"
}
```

#### Promemoria:
```json
{
  "oggetto": "Titolo avviso",
  "titolo": "Titolo avviso",
  "title": "Titolo avviso",
  "testo": "Testo dell'avviso",
  "text": "Testo dell'avviso",
  "descrizione": "Testo dell'avviso",
  "data": "15/02/2024",
  "date": "15/02/2024",
  "autore": "Nome Docente",
  "docente": "Nome Docente",
  "url": "https://...",
  "allegato": "https://..."
}
```

### Endpoint `/sync` - Deve Accettare:

**Metodo 1 - Credenziali Separate:**
```json
{
  "schoolCode": "SG12345",
  "storedUser": "base64_encoded_username",
  "storedPass": "base64_encoded_password"
}
```

**Metodo 2 - Sessione Completa:**
```json
{
  "schoolCode": "SG12345",
  "storedUser": "base64_encoded_username",
  "storedPass": "base64_encoded_password",
  /* altri campi sessione */
}
```

**E Deve Restituire:**
```json
{
  "success": true,
  "tasks": [ /* array compiti */ ],
  "voti": [ /* array voti */ ],
  "promemoria": [ /* array promemoria */ ],
  "announcements": [ /* array promemoria alternativo */ ]
}
```

## 🐛 Debug - Come Verificare

### 1. Apri Console Browser (F12)
Dopo il login, controlla i log:
- `📥 Dati ricevuti dal login:` - mostra cosa arriva dal backend
- `✅ Compiti caricati:` - conferma caricamento tasks
- `✅ Voti caricati:` - conferma caricamento voti
- `✅ Promemoria caricati:` - conferma caricamento promemoria

### 2. Test Connessione
Nel modal di login, clicca "🔍 Test Connessione Backend" per verificare:
- Backend raggiungibile
- Health endpoint funzionante

### 3. Verifica Network Tab
Nella tab Network del browser:
- Controlla la richiesta a `/login` e `/sync`
- Verifica lo status code (dovrebbe essere 200)
- Controlla il body della risposta

## ⚠️ Problemi Comuni

### Backend non restituisce `voti` o `promemoria`
**Causa:** Il backend non sta recuperando questi dati da DidUP
**Soluzione:** Verifica nel backend che vengano chiamati gli endpoint corretti di DidUP per:
- Voti: endpoint voti/valutazioni
- Promemoria: endpoint bacheca/avvisi

### Errore "Sessione scaduta"
**Causa:** La sessione DidUP è scaduta
**Soluzione:** Il backend deve rifare il login a DidUP prima di recuperare i dati

### Errore CORS
**Causa:** Il backend non ha configurato CORS correttamente
**Soluzione:** Aggiungi header CORS nel backend:
```
Access-Control-Allow-Origin: *
Access-Control-Allow-Methods: POST, GET, OPTIONS
Access-Control-Allow-Headers: Content-Type
```

### Dati vuoti ma `success: true`
**Causa:** Il backend restituisce success ma non ha dati
**Soluzione:** Verifica che il backend stia effettivamente recuperando dati da DidUP e non restituisca array vuoti

## 📝 Note per il Backend

Il frontend ora:
1. ✅ Gestisce array vuoti (mostra messaggio "nessun dato")
2. ✅ Supporta formati alternativi dei campi (es. `data` o `date`, `materia` o `subject`)
3. ✅ Salva tutto in localStorage per uso offline
4. ✅ Ha logging dettagliato per debug

Il backend deve:
1. ✅ Recuperare TUTTI i dati da DidUP (tasks, voti, promemoria)
2. ✅ Gestire sessioni scadute (rifare login)
3. ✅ Restituire sempre `success: true/false`
4. ✅ In caso di errore, restituire `error: "messaggio"`
