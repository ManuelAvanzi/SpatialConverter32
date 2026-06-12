# Context — server
> API Express piattaforma redazione + viewer statico. Persistenza su Cloudflare R2 (no DB).
> Updated: 2026-06-12
> Loaded via: /ctx 3 server

---

## Files involved
| File | Role |
|------|------|
| `server/index.js` | App Express: rotte API + serve viewer statico + download ZIP bundle (~200 righe) |
| `server/store.js` | Persistenza progetti+asset su R2 (S3 client), CRUD JSON (~147 righe) |
| `server/auth.js` | Login password redazione → cookie JWT `sct` (~41 righe) |
| `.env.example` | Env: R2_* credentials, ASSET_BASE, EDITOR_PASSWORD, JWT_SECRET |

---

## How it works
> Max 10 lines. Only what's not obvious.
- **Auth**: una sola password (`EDITOR_PASSWORD`) → `makeToken()` JWT 7d → cookie httpOnly `sct`. Senza `EDITOR_PASSWORD` il login è DISABILITATO (default sicuro). `requireAuth` protegge le mutazioni.
- **No DB**: ogni progetto = `_projects/<slug>.json` nel bucket R2 `immersivelab-assets`. Asset (modelli/cover) sotto `<prefix>/`.
- **R2 lazy**: client S3 creato solo se le 3 env R2 ci sono; `store.available()` ne riflette lo stato. Senza R2 le rotte progetti rispondono vuoto/errore ma il viewer statico funziona.
- **Routing home**: `GET /` → `admin.html` (redazione); `GET /?project=` → `viewer/index.html`. Static con `index:false`. Fallback `*` (no estensione) → `admin.html`.
- **Visibilità**: `GET /api/projects/:slug` pubblica solo se `status==='published'`, altrimenti richiede auth (bozza riservata).
- **Upload modello**: salva su R2 `<prefix>/gltfModels/`, poi rigenera `models.json` (lista file) come manifest. Accetta **solo `.glb`** (il `.gltf` multi-file da solo dà scena rotta → bloccato).
- **Upload asset oggetto menu+**: `/asset` salva su R2 `<prefix>/objects/<timestamp>_<file>` (img/PDF/MP4/360/GLB), ritorna l'URL pubblico. Usato dagli oggetti utente caricabili in scena.
- **Download**: `archiver` ZIP = engine `index.html` + `scene-config.json` + asset R2 in `models/`; ramo speciale `spatial32` aggiunge manifest/scene.json/Audio/copertina.

---

## API surface (server/index.js)
| Metodo | Rotta | Auth | Scopo |
|--------|-------|------|-------|
| GET | `/api/config` | — | assetBase, r2Base, projectsEnabled |
| POST | `/api/login` `/api/logout` | — | cookie JWT |
| GET | `/api/me` | — | `{authed}` |
| GET | `/api/projects` | ✓ | lista (summary) |
| POST | `/api/projects` | ✓ | crea (draft) |
| GET | `/api/projects/:slug` | pubblico se published | dettaglio |
| PUT/DELETE | `/api/projects/:slug` | ✓ | update / delete |
| POST | `/api/projects/:slug/duplicate` | ✓ | copia record+config |
| GET | `/api/projects/:slug/download` | ✓ | ZIP bundle |
| POST | `/api/projects/:slug/upload` | ✓ | carica .glb (solo) → R2 `gltfModels/` |
| POST | `/api/projects/:slug/asset` | ✓ | carica oggetto menu+ (img/pdf/mp4/glb) → R2 `objects/` |
| POST | `/api/projects/:slug/cover` | ✓ | copertina img |

Record progetto: `{slug, name, status(draft|published), assetPrefix, tags[], cover, sceneConfig, createdAt, updatedAt}`.

---

## Migrazione S3 (2026-06-12, STEP 4A fatto)
- `store.js`: client ora **S3** (region `eu-south-1`, **endpoint opzionale** — vuoto su AWS, valorizzato per R2). Env `AWS_*`/`S3_*` con fallback `R2_*`. `r2()`→`s3()`.
- Nuova `store.getSignedAssetUrl(key, ttl)` (presigner, TTL default 12h via `SIGNED_URL_TTL`).
- Nuova rotta `GET /api/asset/*` → **redirect 302 a presigned URL** (bucket privato, EC2 non fa da proxy dei byte; qui aggancerà il JWT in fase 2).
- `/asset` e `/cover` ora ritornano `/api/asset/<key>` invece dell'URL R2 pubblico.
- `package.json`: + `@aws-sdk/s3-request-presigner`. Verificato: sintassi OK, export OK.
- ⚠️ STEP 4B mancante: il **viewer** deve chiedere URL firmati per i GLB (env `ASSET_BASE` vuoto su S3 privato). STEP 5: migrazione dati R2→S3.

## Decisions made
- 2026-06: niente DB — progetti come JSON su R2 (zero provisioning, persistente). Listing = N GET su R2 (ok per pochi progetti).
- 2026-06: auth a password unica redazione (non multi-utente). `JWT_SECRET` stabile se impostato, altrimenti random per-avvio (logout a ogni redeploy).
- 2026-06: credenziali R2 servono SOLO allo script di upload locale, NON al server Railway (il server legge da URL pubblico R2).
- 2026-06: `assetPrefix` reale usato per upload/download → non rompe il "32" (prefisso `spatial32`).

---

## Errors already made in this area
- Cambiare lo schema del record progetto → invalida i JSON già su R2. Passare sempre da `saveProject` (patch selettiva).
- Toccare il ramo `spatial32` in download/upload → rompe il laboratorio "32" (file statici extra).

---

## TODO / Tech debt
- [ ] `listProjects` fa una GET per progetto (N+1 su R2): ok ora, non scala a centinaia.
- [ ] Nessun rate-limit sul login password.
- [ ] Upload limite 200MB in memoria (multer memoryStorage) — niente streaming.

---

## Investigations done
- 2026-06-08: letti integralmente index.js/store.js/auth.js (tutti <300 righe). Mappa API e schema record qui sopra; non serve ri-leggere.
