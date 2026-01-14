# G-Connect Project Setup

Benvenuto in G-Connect. Questo progetto contiene il backend (Node.js) e il codice frontend (iOS SwiftUI) per l'applicazione scolastica.

## Prerequisiti
- **Node.js**: v16 o superiore.
- **PostgreSQL**: Installato e funzionante localmente (o usa un servizio cloud come ElephantSQL / Supabase).
- **Xcode**: 15.0 o superiore per compilare l'app iOS.

## 1. Backend Setup

Poiché l'ambiente automatico non disponeva di npm, è necessario installare le dipendenze manualmente.

1. Spostati nella cartella backend:
   ```bash
   cd backend
   ```
2. Installa le dipendenze:
   ```bash
   npm install
   ```
3. Configura le variabili d'ambiente:
   Crea un file `.env` in `backend/` con il seguente contenuto:
   ```env
   DATABASE_URL="postgresql://utente:password@localhost:5432/gconnect_db?schema=public"
   JWT_SECRET="tua_chiave_segreta_super_sicura"
   PORT=3000
   ```
4. Inizializza il Database (Esegui dopo aver avviato Postgres):
   ```bash
   npx prisma generate
   npx prisma db push
   ```
5. Avvia il server:
   ```bash
   npm run dev
   ```

## 2. iOS Setup

1. Apri Xcode.
2. Crea un nuovo progetto "App".
3. Trascina i file dalla cartella `iOS/` che abbiamo generato nel tuo progetto Xcode, mantenendo la struttura delle cartelle o creando "Groups" corrispondenti.
   - `GConnectApp.swift` sostituisce il punto di ingresso dell'app.
   - Copia `Core`, `Features` nel progetto.
4. Assicurati che il *Target* minimo sia iOS 16.0 o 17.0.

## Estensioni Future (Roadmap)

### Backend
- **Real-time Chat**: Migrare da HTTP polling a **Socket.io** per la messaggistica istantanea.
- **File Upload**: Configurare AWS S3 o Firebase Storage per inviare immagini in chat.
- **Scraper Registro**: Creare un microservizio Python o Puppeteer per scaricare voti/assenza da DidUP/Argo usando le credenziali dell'utente (salvate criptate).

### iOS
- **Networking**: Collegare le Views reali alle API usando `URLSession`. Attualmente `LoginView` usa un mock.
- **Push Notifications**: Integrare APNs per avvisi in tempo reale.
