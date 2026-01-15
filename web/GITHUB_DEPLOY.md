# Deploy su GitHub Pages / Netlify

## Cosa fare dopo aver aggiornato il codice su GitHub

### 1. Push su GitHub
```bash
git add .
git commit -m "Aggiornamento PWA - date e persistenza sessione"
git push origin main
```

### 2. Se usi GitHub Pages
- Vai su GitHub → Settings → Pages
- Seleziona il branch (es. `main`)
- Seleziona la cartella (es. `/web` o `/root`)
- Salva

**NON serve fare altro** - GitHub Pages si aggiorna automaticamente quando fai push.

### 3. Se usi Netlify
- Netlify si aggiorna automaticamente se hai collegato il repository
- Oppure vai su Netlify Dashboard → Deploys → Trigger deploy

**NON serve fare altro** - Netlify si aggiorna automaticamente quando fai push su GitHub.

## File importanti da committare

Assicurati di committare:
- ✅ `index.html` (file principale)
- ✅ `manifest.json` (per PWA)
- ✅ `sw.js` (service worker)
- ✅ `netlify.toml` (configurazione Netlify)
- ✅ `_redirects` (redirect per SPA)

## Verifica dopo deploy

1. Apri la PWA su Netlify/GitHub Pages
2. Fai login
3. Ricarica la pagina (F5)
4. Dovresti rimanere loggato ✅
5. Le date dovrebbero essere visibili ✅

## Note

- Il backend deve essere su Render (o altro servizio) e deve essere raggiungibile
- Verifica che `API_BASE_URL` in `index.html` sia corretto
- Se usi GitHub Pages, assicurati che la cartella sia corretta nelle impostazioni
