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
- **Mobile**: joystick touch + bottone salto; due dita indipendenti
  (muoversi e ruotare la visuale insieme).
- **Resa**: slider "Riflessi (IBL)" nel pannello Luce (environment map regolabile,
  salvata col progetto) per dare profondità ai materiali esportati da Unity.
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
- Editor coordinate con drag-scrub e undo (Ctrl+Z), mesh collider per i modelli statici,
  upload modelli nel progetto (entrano in scena senza ricaricare la pagina).
- Sidebar a sezioni richiudibili con contatori; salvataggio sul server con 💾.

### Sidebar (4 colonne)
- **📦 Modelli** — lista dei modelli del progetto: goto, gizmo, collider, salva posizione,
  play/pausa animazioni; pallino blu = animato, verde = statico.
- **🌀 Spatial** — palette delle feature (teleport, entrance, interactable, quest…) +
  oggetti del menu ＋, colori avatar.
- **☀️ Luce** — illuminazione: preset cielo, sfondo, ambiente, sole (intensità/elevazione/
  azimut), esposizione ACES, **riflessi IBL**, nebbia.
- **⚙️ Opzioni** — griglia a terra (on/off + metratura 1/2/5/10 m, salvata col progetto),
  wireframe diagnostico dei modelli, toggle del pannello Scene Vitals.

### Scene Vitals (editor)
Pannello diagnostico in basso a destra (solo editor): FPS, draw call, triangoli per frame,
vertici totali della scena, geometrie/texture in GPU, memoria JS — con soglie colorate.
Utile per capire quanto pesa un progetto prima di pubblicarlo.

### Import da Unity (Unity = fonte di verità)
Script editor C# (in `Assets/Editor/` del progetto Unity, copie versionate in `unity/`):
- `SpatialInteractableExporter.cs` → **Tools ▸ Esporta Interactable per il Web**
- `SpatialQuestExporter.cs` → **Tools ▸ Esporta Quest per il Web** (quest + task + zone trigger)

Il JSON esportato si importa dall'editor web (**🎮 Importa da Unity…**) con merge per `uid`:
ri-esportare aggiorna le posizioni senza duplicare e senza perdere le modifiche manuali.
Conversione assi Unity→Three: **X=-X, Y=Y, Z=+Z**.

### Menu ＋ (oggetti in scena, stile Spatial)
Pulsante **＋** in alto a destra, attivo in editor **e** in play. Tipi:
**Modello 3D** (.glb unico — il .gltf multi-file è bloccato con avviso) ·
**Immagine** · **Sfondo 360°** · **Video YouTube** (player nella scena via CSS3D,
barra comandi 3D) · **Video MP4** (schermo 3D vero, funziona in VR) ·
**PDF sfogliabile** (pdf.js, frecce pagina) · **Portal** (bolla fluida shader,
click → conferma → apre il link; in VR conferma su pannello 3D).
- **Redazione (editor)**: i file vanno su R2 (`<prefix>/objects/`), gli oggetti
  entrano nella scene-config col 💾 → li vedono tutti.
- **Visitatori (play)**: oggetti **locali al browser** (localStorage + IndexedDB),
  sopravvivono al reload, invisibili agli altri. Gizmo Sposta/Ruota/Scala sui propri.
- **Lista** (bottone ≡ accanto al ＋, appare con ≥1 oggetto): elimina e **blocca**
  (un oggetto bloccato non è più spostabile finché non lo sblocchi dalla lista).
- PDF, video e portal sono **puntabili col grilletto** anche nel visore.

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
