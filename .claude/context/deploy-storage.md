# Context — deploy-storage
> Script locali + flusso asset/progetti su R2 + deploy Railway.
> Updated: 2026-06-12
> Loaded via: /ctx 3 deploy-storage

---

## Files involved
| File | Role |
|------|------|
| `scripts/build-manifest.js` | Genera `gltfModels/models.json` (lista .glb/.gltf, ordinata). Multi-progetto via `MODELS_DIR` |
| `scripts/upload-to-r2.js` | Carica `environment.glb` + `gltfModels/*` su R2 sotto `<R2_PREFIX>/` (default `spatial32`). Sorgente via `MODELS_DIR` |
| `scripts/seed-project.js` | Crea/aggiorna idempotente il progetto "32" su R2 da `scene-config.json` (published) |
| `.env.example` | Template env: PORT, ASSET_BASE, R2_* (endpoint/bucket/prefix/public_url/keys) |
| `INFRASTRUTTURA.md` | **Fonte autorevole** infra multi-progetto (Railway + R2). `DEPLOY.md` = solo primo flusso "32" |
| `content/` | Sorgente locale modelli per progetti ≠32 (gitignored). `MODELS_DIR=content/<prefisso>` |

---

## How it works
> Max 10 lines. Only what's not obvious.
- **Separazione engine/contenuto**: engine (codice) → Railway via GitHub; modelli pesanti → R2; `scene-config.json` → repo.
- **Manifest**: directory-listing non funziona fuori da `npx serve`, quindi `models.json` è generato a mano (`npm run manifest`) e il viewer lo legge.
- **Upload**: `npm run upload` legge `.env`, fa `PutObject` per ogni file con ContentType corretto, poi stampa l'`ASSET_BASE` da incollare su Railway (`R2_PUBLIC_URL/PREFIX`).
- **Seed**: `seed-project.js` usa `server/store` per registrare il "32" come progetto pubblicato (slug canonico `32-sicurezza-nel-cantiere`, prefix `spatial32`). Idempotente.
- **Env split critico**: credenziali R2 servono SOLO agli script locali; su Railway basta `ASSET_BASE` (il server legge da URL pubblico R2, non con le chiavi).
- **CORS**: il bucket R2 deve permettere GET cross-origin; i domini `*.r2.dev` di norma già lo fanno.

---

## Mandatory sequences
- Aggiornare modelli "32": 1) export in `viewer/models/` 2) `npm run manifest` 3) `npm run upload` 4) commit `models.json` 5) (se cambia base) aggiorna `ASSET_BASE` su Railway.
- Aggiornare modelli altro progetto: stessi step ma con `MODELS_DIR=content/<prefisso>` e `R2_PREFIX=<prefisso>` (la cartella deve contenere `gltfModels/`).
- Pubblicare il "32": editor → esporta `scene-config.json` in `viewer/` → commit/push → (eventuale) `node scripts/seed-project.js`.

---

## Decisions made
- 2026-06: niente CI per gli asset — upload manuale via script (asset cambiano di rado).
- 2026-06: deploy Railway con Nixpacks (`npm install` + `npm start`), `PORT` gestita da Railway.
- 2026-06: `R2_PREFIX` default `spatial32`; bucket condiviso `immersivelab-assets`.

---

## Errors already made in this area
- Mettere le credenziali R2 su Railway → inutile e rischioso: il server non le usa. Solo `ASSET_BASE`.
- Dimenticare `npm run manifest` prima di upload → `models.json` non riflette i nuovi file → personaggi mancanti nel viewer.

---

## TODO / Tech debt
- [ ] Upload non incrementale: ricarica tutti i file ogni volta (no diff/etag check).
- [ ] Nessuna verifica CORS automatica; va controllata a mano sul bucket.

---

## Migrazione AWS (pianificata, non ancora implementata)
- Target: **EC2 ARM (Graviton) + S3** al posto di Railway + R2. Il codice usa già `@aws-sdk/client-s3` → su S3 cambiano solo le env (endpoint opzionale, `region`, chiavi).
- **S3 privato** (Block Public Access ON): i GLB NON sono pubblici. Serviti via **presigned URL** firmati dal server (TTL generoso 6-12h per i GLB pesanti), perché la fase 2 aggancerà l'auth JWT al rilascio degli URL.
- Scope presigned: **tutti** gli asset GLB (environment + personaggi + oggetti utente), non solo quelli utente.
- Auth EC2→S3: **access key in `.env`** (non IAM role). Env `AWS_REGION=eu-south-1` (Milano), `S3_BUCKET=immersivelab-assets`, `AWS_ACCESS_KEY_ID/SECRET`.
- AWS setup fatto: bucket privato `immersivelab-assets` (Block Public Access ON, versioning ON), policy IAM `immersivelab-assets-rw` (ListBucket + Get/Put/Delete object), utente `immersivelab-app` + access key.
- **CloudFront rimandato**: l'account mostra solo il nuovo flusso "a piani" ($0/$15/...), niente distribuzione classica da console → si farà via CLI/API in produzione. Per ora **presigned via redirect 302**.
- **LIVE su EC2 (2026-06-12)**: gira su `portale.metareality.it`. Container Docker su `127.0.0.1:3003`, Nginx (host) reverse-proxy + HTTPS (Let's Encrypt, scad. 2026-09-10). `Progetti (S3) = attivi`.
- ⚠️ Nginx: `certbot --nginx` ha creato il cert ma NON ha editato la config (rimasta `listen 80`) → blocco HTTPS scritto a mano (redirect 80→443 + ssl + proxy_pass). `client_max_body_size 250M` per upload GLB.
- ⚠️ **CORS S3 obbligatorio**: i presigned URL falliscono nel browser senza CORS sul bucket → aggiungere CORS (AllowedOrigins `https://portale.metareality.it`, GET/HEAD) in Permissions del bucket.
- **Deploy**: `deploy.sh` (git pull --ff-only + `docker compose up -d --build` + `docker image prune -f`) + `.github/workflows/deploy.yml` (SSH all'EC2 su push main/master, secrets EC2_HOST/USER/SSH_KEY). EC2→GitHub via **deploy key read-only**. GitHub→EC2 via chiave `gha_key` (privata nel secret `EC2_SSH_KEY`). Secret: `EC2_HOST`=16.22.70.48, `EC2_USER`=ec2-user.
- ⚠️ Action `appleboy/ssh-action`: `missing server host` = secret `EC2_HOST` vuoto/mancante.
- ⚠️ Workflow trigger `branches: [main]` ma il repo è su **master** → l'auto-deploy su push NON scatta; serve `[main, master]` o solo `workflow_dispatch` manuale.
- IP `16.22.70.48` è **Elastic** (fisso) → il secret `EC2_HOST` non cambia mai.
- `R2_PREFIX` è nome **legacy** = prefisso/cartella nel bucket per il lab "32" (`spatial32/`), NON ha a che fare con R2. Da rinominare `ASSET_PREFIX` in pulizia finale (insieme a `upload-to-r2.js`→`upload-to-s3.js`).
- Modifica più delicata: il viewer (monolite) deve chiedere l'URL firmato al server prima di `GLTFLoader.load()`, in più punti (environment, `models.json`, oggetti utente).
- HTTPS obbligatorio su EC2 (Nginx + Let's Encrypt): senza, WebXR/VR non parte.

## Docker (2026-06-12, per deploy EC2)
- Aggiunti `Dockerfile` (`node:20-alpine`, `npm ci --omit=dev`, `node server/index.js`, EXPOSE 3003), `docker-compose.yml`, `.dockerignore`.
- Server = JS puro (no build, no deps native) → un solo stage Docker basta. Pipeline Blender/Unity esclusa dall'immagine (gira offline).
- **Niente Nginx nel container**: Nginx sull'HOST EC2 davanti. Port legato a `127.0.0.1:3003` (container non esposto a internet): `internet → Nginx :443 → 127.0.0.1:3003 → container`.
- Env a runtime via `env_file: .env` (non nell'immagine). `mem_limit: 1g` perché multer bufferizza upload in RAM (fino a 200MB/file).
- `package-lock.json` presente → `npm ci`. Build + run container verificati: `/api/config` → 200, server in ascolto.
- Scelta Docker (non bare-metal): allinea con futuro ECS/Fargate; overhead performance ~0 su Linux.
- Hardening (2026-06-12): `USER node` (non root), `HEALTHCHECK` su `/api/config`, `init: true`, `NODE_ENV=production`, `npm ci --no-audit --no-fund`, limite RAM via `deploy.resources.limits`.
- ⚠️ `.dockerignore`: `*.glb` esclude TUTTO, ma `viewer/avatar/Xbot.glb` (avatar 3a persona) serve al viewer → eccezione `!viewer/avatar/Xbot.glb` obbligatoria.
- Verificato in container: utente=`node`, avatar presente, `viewer/models/` escluso, `/api/config`→200, healthcheck=`healthy`.

## Investigations done
- 2026-06-08: letti integralmente i 3 script (<80 righe) + .env.example + DEPLOY.md. Flusso e sequenze qui sopra; non serve ri-leggere. Vedi anche `[[server]]` per `store.js`.
- 2026-06-12: riletti `store.js`, `upload-to-r2.js`, `.env.example` per pianificare la migrazione AWS (vedi sezione sopra). Endpoint R2 hardcoded come obbligatorio in entrambi → va reso opzionale per S3.
