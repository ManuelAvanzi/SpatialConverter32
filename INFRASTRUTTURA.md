# Infrastruttura — SpatialConverter (Railway + Cloudflare R2)

Procedura completa e aggiornata per: **deploy su Railway** e **storage su Cloudflare R2**.
Questo documento è la fonte autorevole per l'infrastruttura multi-progetto
(il vecchio `DEPLOY.md` descrive solo il primo flusso del progetto "32").

---

## 1. Come è fatta (architettura)

Due pezzi separati:

- **Engine** = questo repository (cartella `viewer/` + server Express `server/`).
  Sta su **Railway**, si auto-deploya a ogni push su GitHub.
- **Contenuto** = i progetti e i loro asset 3D. Stanno su **Cloudflare R2**.
  - Ogni progetto è un file JSON: `_projects/<slug>.json` (record + scene-config).
  - Gli asset pesanti stanno sotto un prefisso per-progetto: `<prefisso>/...`.

Niente database: i progetti **sono** i file JSON su R2. Questo è il motivo per cui
il server, su Railway, **ha bisogno delle credenziali R2** (le legge e le scrive).

```
Browser (viewer) ──HTTP──> Railway (server Express)
        │                        │  legge/scrive _projects/<slug>.json
        └────────fetch GLB/img───┴──> Cloudflare R2 (bucket pubblico)
```

---

## 2. Cloudflare R2 — storage

### 2.1 Bucket
- Bucket attuale: **`immersivelab-assets`** (riusato anche da ImmersiveLab).
- Si crea da: Cloudflare Dashboard → **R2** → *Create bucket*.

### 2.2 Accesso pubblico (per il viewer)
Il viewer scarica i modelli via HTTP, quindi il bucket deve avere un URL pubblico:
- Bucket → **Settings** → **Public access** → abilita **R2.dev subdomain**.
- Ottieni un URL del tipo: `https://pub-xxxxxxxxxxxx.r2.dev`
  (valore attuale: `https://pub-65bfcfd457cf478aa6e918c9a86eb10b.r2.dev`).
- Questo URL è il valore di **`R2_PUBLIC_URL`**.

### 2.3 CORS (necessario per WebGL/Three.js)
Three.js carica i GLB/texture in fetch cross-origin: il bucket deve rispondere con CORS.
- Bucket → **Settings** → **CORS policy** → consenti GET dal dominio del sito.
- Regola permissiva (sufficiente per asset pubblici):
  ```json
  [
    { "AllowedOrigins": ["*"], "AllowedMethods": ["GET", "HEAD"], "AllowedHeaders": ["*"] }
  ]
  ```
- Senza CORS: i modelli falliscono con errore cross-origin nel browser.

### 2.4 Credenziali API (per il server e per l'upload)
Servono a leggere/scrivere gli oggetti (non basta l'URL pubblico, quello è sola lettura GET):
- Cloudflare → **R2** → **Manage R2 API Tokens** → *Create API token*
  (permessi **Object Read & Write** sul bucket).
- Ottieni:
  - **Access Key ID** → `R2_ACCESS_KEY_ID`
  - **Secret Access Key** → `R2_SECRET_ACCESS_KEY`
  - **Endpoint S3** del tipo `https://<accountid>.r2.cloudflarestorage.com` → `R2_ENDPOINT`

### 2.5 Struttura dei file su R2
```
immersivelab-assets/
├── _projects/
│   ├── 32-sicurezza-nel-cantiere.json     ← record progetto + scene-config
│   ├── 165-metaverso-platonico.json
│   └── <slug>.json
└── <prefisso-progetto>/                    ← assetPrefix (di solito = slug)
    ├── cover.png                           ← copertina dashboard
    ├── gltfModels/
    │   ├── models.json                     ← elenco dei .glb del progetto
    │   └── *.glb                            ← ambiente + personaggi/modelli
    └── objects/                            ← oggetti del menu ＋ (immagini, pdf, mp4, 360, glb)
        └── <timestamp>_<nomefile>
```
> Il progetto storico "32" usa il prefisso `spatial32` (non lo slug) per ragioni storiche.

---

## 3. Variabili d'ambiente

| Variabile | A cosa serve | Dove va impostata |
|-----------|--------------|-------------------|
| `R2_ENDPOINT` | endpoint S3 del bucket | **Railway** + `.env` locale |
| `R2_ACCESS_KEY_ID` | credenziale API R2 | **Railway** + `.env` locale |
| `R2_SECRET_ACCESS_KEY` | credenziale API R2 | **Railway** + `.env` locale |
| `R2_BUCKET` | nome bucket (`immersivelab-assets`) | **Railway** + `.env` locale |
| `R2_PUBLIC_URL` | URL pubblico `pub-….r2.dev` (lo usa il viewer) | **Railway** + `.env` locale |
| `EDITOR_PASSWORD` | password della redazione (login `/admin`) | **Railway** (+ `.env` per test) |
| `JWT_SECRET` | firma stabile del cookie di login | **Railway** |
| `ASSET_BASE` | base URL asset del **solo progetto 32** | **Railway** (vuoto in locale) |
| `R2_PREFIX` | prefisso per lo script di upload da CLI | solo `.env` locale |
| `PORT` | porta del server | gestita da Railway; in locale opzionale |

Note importanti:
- **Senza `EDITOR_PASSWORD`** il login è disabilitato (default sicuro: nessuno entra in redazione).
- **Senza `JWT_SECRET`** il cookie usa un segreto casuale a ogni avvio → tutti sloggati a ogni redeploy. Impostalo su Railway.
- Le `R2_*` su Railway **servono** (il server legge/scrive i progetti). Questa è la differenza rispetto al vecchio `DEPLOY.md`.
- `ASSET_BASE` riguarda solo il 32; gli altri progetti calcolano la base da `R2_PUBLIC_URL` + prefisso.

---

## 4. Deploy su Railway

### 4.1 Primo collegamento (una tantum)
1. [railway.app](https://railway.app) → **New Project** → **Deploy from GitHub repo**.
2. Seleziona il repo `ManuelAvanzi/SpatialConverter32`.
3. Railway rileva Node (**Nixpacks**) ed esegue automaticamente `npm install` poi `npm start`
   (lo `start` è definito in `package.json` → `node server/index.js`).
4. Tab **Variables** → aggiungi tutte le variabili della sezione 3 (tranne `R2_PREFIX`/`PORT`).
5. Deploy. Railway assegna un dominio pubblico (es. `…-production.up.railway.app`).
   - Live attuale: `https://spatialconverter32-production.up.railway.app`

### 4.2 Deploy successivi (il flusso normale)
- **Ogni `git push` sul branch `master` fa partire un deploy automatico** (~30-60 s).
- Durante il riavvio il sito è brevemente non raggiungibile → se altri stanno testando,
  conviene **accorpare i commit** e pushare quando sono liberi.
- Stato/log del deploy: Railway → progetto → servizio → **Deployments**.

### 4.3 Verifica post-deploy
- Apri il dominio Railway: deve mostrare la **dashboard** (`/admin`).
- `GET /api/config` deve restituire `projectsEnabled: true` e l'`r2Base` giusto
  (se è `false`, mancano le `R2_*` nelle Variables).

---

## 5. Comandi / script (da `package.json`)

```bash
npm start            # avvia il server Express (uguale a Railway)
npm run serve        # solo statico: npx serve viewer  (no API, no progetti R2)

npm run manifest     # rigenera viewer/models/gltfModels/models.json (progetto 32)
npm run upload       # carica i modelli su R2 (vedi sotto)
npm run seed         # importa una scene-config.json come nuovo progetto
```

### Upload modelli su R2 da CLI (per lotti grandi)
```bash
# carica la cartella content/<progetto> sotto il prefisso indicato
MODELS_DIR=content/<slug> R2_PREFIX=<slug> npm run upload
```
- Richiede le `R2_*` nel `.env` locale.
- Per i singoli modelli, è più comodo il bottone **📂 Carica contenuti** nell'editor
  (che imposta anche l'`assetPrefix` del progetto da solo).

---

## 6. Procedura completa: nuovo progetto da zero

1. **Crea il progetto** in dashboard (`/admin` → *Nuovo progetto*). Nasce come bozza.
2. **Esporta l'ambiente da Unity** in **GLB unico** (mai .gltf multi-file).
3. **Carica il GLB**: editor → tab Modelli → **📂 Carica contenuti** (va su `<slug>/gltfModels/`,
   imposta `assetPrefix`). In alternativa, lotto da CLI (sezione 5).
4. **Costruisci la scena** nell'editor: entrance, collider, luci, oggetti del menu ＋, ecc.
5. **💾 Salva**: scrive `_projects/<slug>.json` su R2 (scene-config completa).
6. **Pubblica** dalla dashboard → il link play diventa accessibile a tutti.

> Asset pesanti: comprimi i GLB prima di caricarli (un GLB sopra i ~40 MB rallenta molto
> il caricamento per chi visita). L'editor avvisa già quando un file supera la soglia.

---

## 7. Troubleshooting rapido

| Sintomo | Causa probabile | Rimedio |
|---------|-----------------|---------|
| Dashboard dice "progetti non configurati" | mancano le `R2_*` su Railway | aggiungile nelle Variables |
| Modelli non si caricano (CORS error) | CORS del bucket | imposta la CORS policy (2.3) |
| Tutti sloggati a ogni deploy | `JWT_SECRET` non impostato | impostalo su Railway |
| Login non funziona | `EDITOR_PASSWORD` assente/diversa | controlla la variabile |
| Caricamento lentissimo | GLB/texture troppo pesanti | comprimi gli asset (gltf-transform) |
| 404 su un modello | file non presente su R2 / nome diverso | ri-carica o aggiorna `models.json` |
