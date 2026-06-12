# Deploy — SpatialConverter32 (Railway + Cloudflare R2)

> ⚠️ **Documento storico** (flusso del solo progetto "32", con scene-config nel repo).
> Per la procedura completa e aggiornata della piattaforma multi-progetto
> (progetti su R2, variabili Railway, storage) vedi **[INFRASTRUTTURA.md](INFRASTRUTTURA.md)**.

Architettura: **engine** (questo codice, su Railway) + **contenuto** del progetto
(modelli su R2 + `viewer/scene-config.json` nel repo).

## 0. Prerequisiti locali
```bash
npm install
```
Avvio locale (usa i modelli in `viewer/models`, ASSET_BASE vuoto):
```bash
npm start            # http://localhost:3003  (server Express)
# in alternativa, dev statico veloce:
npm run serve        # npx serve viewer/
```

## 1. Pubblicare la scena (scene-config.json)
Tutto ciò che piazzi nell'editor (teleport, entrance, interactable, posizioni,
audio) vive nel tuo browser. Per renderlo visibile a tutti:
1. Apri il viewer → tab **🌀 Spatial** → **⬇️ Esporta scene-config.json**
2. Salva il file in `viewer/scene-config.json`
3. Commit + push (è un file piccolo, va nel repo)

## 2. Caricare i modelli su R2 (una tantum, e a ogni aggiornamento modelli)
I modelli pesanti NON stanno nel repo: vanno su Cloudflare R2.
1. Copia `.env.example` in `.env` e compila le credenziali R2
   (riusa quelle del bucket `immersivelab-assets`).
2. Rigenera il manifest e carica:
   ```bash
   npm run manifest     # aggiorna viewer/models/gltfModels/models.json
   npm run upload       # carica environment.glb + gltfModels/ su R2 sotto spatial32/
   ```
3. Lo script stampa il valore di **ASSET_BASE** da usare su Railway, es:
   `https://pub-xxxxxxxx.r2.dev/spatial32`
4. Committa il `models.json` aggiornato.

> Nota CORS: il bucket R2 deve permettere GET cross-origin dal dominio del sito.
> I domini pubblici `*.r2.dev` di norma servono già con CORS permissivo per GET.

## 3. Deploy su Railway
1. Railway → **New Project → Deploy from GitHub repo** → seleziona questo repo.
2. Railway rileva Node (Nixpacks) ed esegue `npm install` + `npm start`.
3. **Variables** → aggiungi:
   - `ASSET_BASE = https://pub-xxxxxxxx.r2.dev/spatial32`  (dal passo 2)
   - (`PORT` la gestisce Railway da sola)
   > Le credenziali R2 **non** servono su Railway: il server non le usa,
   > servono solo allo script di upload in locale.
4. Deploy. Apri l'URL pubblico Railway: il viewer carica i modelli da R2 e la
   scena da `scene-config.json`.

## Riepilogo: cosa va dove
| Cosa | Dove |
|------|------|
| Codice engine (viewer + server) | Repo → Railway |
| `scene-config.json` (contenuto scena) | Repo → Railway |
| `models.json` (manifest personaggi) | Repo + R2 |
| `environment.glb`, `gltfModels/*` (pesanti) | Solo R2 |
| `Audio/`, `copertina/` (leggeri) | Repo → Railway |

## Aggiungere un personaggio glTF (workflow)
1. Esporta il glTF da Unity in `viewer/models/gltfModels/`
2. `npm run manifest` → `npm run upload`
3. Commit del `models.json`. Il viewer lo trova da solo.
