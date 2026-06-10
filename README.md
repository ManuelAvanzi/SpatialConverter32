# SpatialConverter — piattaforma web per laboratori 3D immersivi

Mini-piattaforma per convertire ambienti **Spatial.io + Unity** in laboratori web
**Three.js + WebXR**, con redazione, editor visuale nel browser e modalità play.

**Primo progetto**: *32 — Sicurezza nel cantiere e percezione del rischio*.

🌐 **Live**: https://spatialconverter32-production.up.railway.app

## Com'è fatta

- **Redazione** (`/admin`): login, lista laboratori, nuovo/duplica/elimina progetto,
  pubblica/bozza, download bundle ZIP giocabile, apri in Editor o Play.
- **Editor** (`?project=<slug>&edit`): si costruisce la scena direttamente nel browser.
- **Play** (`?project=<slug>`): l'utente naviga il laboratorio (desktop, mobile, visore VR).
- **Backend** Express minimale: progetti salvati su **Cloudflare R2** (`_projects/<slug>.json`),
  asset 3D su R2, nessun database.

## Funzioni del viewer

### Navigazione
- **Prima persona** (default): WASD + sprint (Shift) + salto/doppio salto (Space), drag-to-look.
- **Terza persona** (🎥 / tasto **V**): avatar umanoide neutro (X Bot) con idle/walk/run,
  posa di salto procedurale, follow-cam anti-muro. Colori avatar scelti in editor.
- **VR (WebXR)**: locomozione con stick, teleport ad arco (grip), salto (A), snap-turn,
  prompt 3D e checklist quest agganciata al controller sinistro.
- **Mobile**: joystick touch.
- **Vista aerea**: OrbitControls per l'editing dall'alto.

### Spatial features (editor, drag & drop o ＋)
- **🌀 Teleport** — pad luminoso + destinazione (click-to-place).
- **📍 Entrance Point** — spawn con direzione e raggio (random fra più entrance).
- **👆 Interactable** — hotspot di prossimità: testo + tasto F / click sull'icona /
  trigger VR → parte un'animazione.
- **⚡ Trigger Quest** — zona walk-in (o click sull'icona) che completa una task.
- **🧭 Quest** — missione con task editabili (nome, descrizione, aggiungi/rinomina/elimina);
  checklist in stile Spatial con progresso salvato, coriandoli al completamento.
- Click-to-select stile Unity: clicchi una feature nella scena → gizmo + coordinate + card.
- Editor coordinate con drag-scrub e undo (Ctrl+Z), pannello luci con preset,
  audio di sottofondo, mesh collider per i modelli statici, upload modelli nel progetto.
- Sidebar a sezioni richiudibili con contatori; salvataggio sul server con 💾.

### Import da Unity (Unity = fonte di verità)
Script editor C# (in `Assets/Editor/` del progetto Unity, copie versionate in `unity/`):
- `SpatialInteractableExporter.cs` → **Tools ▸ Esporta Interactable per il Web**
- `SpatialQuestExporter.cs` → **Tools ▸ Esporta Quest per il Web** (quest + task + zone trigger)

Il JSON esportato si importa dall'editor web (**🎮 Importa da Unity…**) con merge per `uid`:
ri-esportare aggiorna le posizioni senza duplicare e senza perdere le modifiche manuali.
Conversione assi Unity→Three: **X=-X, Y=Y, Z=+Z**.

## Struttura del repo

```
platform/
├── viewer/      ← l'app web (index.html = viewer/editor, admin.html = redazione)
├── server/      ← backend Express (auth, store su R2, API progetti)
├── scripts/     ← script npm (manifest, upload su R2, seed progetto)
├── tools/       ← parser Unity→Web: parse_actions / parse_quests / parse_quiz
│   │              (estraggono azioni, quest e quiz dallo scene YAML di Unity)
│   ├── blender/ ← merge_and_export.py (scena statica FBX → environment.glb)
│   └── legacy/  ← vecchia pipeline .unitypackage (extract/build/blender-convert)
├── unity/       ← copie versionate degli script C# per l'editor Unity
│                  (exporter Interactable/Quest/Scene + SkinnedMeshCombiner)
└── content/     ← asset e file di lavoro locali (gitignored, vanno su R2)
```

## Avvio in locale

```bash
npm install
npm start            # server Express completo → http://localhost:3003
# oppure solo statico:
npx serve viewer -l 3003
```

## Deploy

Architettura **engine + contenuto** (vedi `DEPLOY.md`):
- **Engine** = questo repo (viewer + server) → **Railway**, auto-deploy su push.
- **Contenuto** = modelli su **R2** (bucket `immersivelab-assets`, prefisso per progetto)
  + scene-config per progetto su R2.
- Env var principali: `R2_*`, `EDITOR_PASSWORD`, `JWT_SECRET`, `ASSET_BASE`.
- Script: `npm run manifest` (rigenera models.json), `npm run upload` (asset → R2),
  `npm run seed` (importa scene-config.json come progetto).

## Pipeline contenuti 3D

- **Scena statica**: FBX da Unity (FBX Exporter) → Blender `tools/blender/merge_and_export.py` →
  `environment.glb`.
- **Quest / azioni / quiz**: `node tools/parse_quests.js` · `parse_actions.js` · `parse_quiz.js`
  leggono lo scene YAML di Unity e generano i JSON da importare nell'editor web (🎮).
- **Personaggi animati**: export **direttamente da Unity in glTF** con UnityGLTF
  (la pipeline Blender corrompe i rig Biped — vedi note in `CLAUDE`/memoria).
  Prima dell'export, fondere i multi-SkinnedMeshRenderer con `SkinnedMeshCombiner.cs`
  (**Tools ▸ Combina Skinned Mesh**).
- I file pesanti **non stanno nel repo** (`.gitignore`): vanno su R2 (`npm run upload`).
- Avatar terza persona: `viewer/avatar/Xbot.glb` (~3 MB, nel repo, lazy load).

## Note tecniche

- Unity 2021.3.21f1 · Spatial SDK 1.71.0 · UnityGLTF · Blender 4.2 (con patch Biped).
- Three.js via CDN (import map), WebXR per la VR.
- Modalità play: localStorage ignorato → l'utente vede sempre la scena pubblicata;
  in editor localStorage è la copia di lavoro, 💾 salva sul server.
