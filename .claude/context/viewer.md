# Context — viewer
> Engine 3D Three.js + WebXR + editor scena (monolite ~7100 righe)
> Updated: 2026-06-12
> Loaded via: /ctx 3 viewer

---

## Files involved
| File | Role |
|------|------|
| `viewer/index.html` | Engine monolitico (~7100 righe): rendering, modelli, VR, editor, teleport/entrance/interactable, quest, azioni, avatar 3a persona, portal, oggetti utente, simulazioni/quiz |
| `viewer/admin.html` | Redazione: lista/gestione laboratori (~440 righe, dark mode + icone SVG) |
| `viewer/avatar/Xbot.glb` | Avatar neutro 3a persona (X Bot, ~2.9MB) |
| `viewer/scene-config.json` | Contenuto scena pubblicato: positions, audio, teleports, entrances, interactables, oggetti menu+ |
| `viewer/scene.json` | Dati scena legacy "32" (interactable+quest, mappatura anim) |
| `viewer/manifest.json` | Lista modelli caricati |
| `viewer/models/gltfModels/models.json` | Manifest personaggi (lista file .glb) |
> Rimossi: `viewer/fbx-converter.html`, `viewer/test_character.html` (commit cleanup).

---

## How it works
> Max 10 lines. Only what's not obvious.
- Un solo `<script type="module">` (riga 655) con importmap Three.js da CDN — niente build.
- **Modalità**: `?edit` → editor (gizmo TransformControls, scrittura localStorage); default → play (read-only, niente localStorage). `document.body.classList('play-mode')`.
- **Progetto**: `?project=<slug>` → fetch `/api/config` setta `ASSET_BASE` (R2 `r2Base/prefix`); senza progetto usa `models/` locale o `spatial32`.
- **Caricamento**: `loadModel()` carica `environment.glb` (ambiente, riga ~2301) + `loadCharacters` itera `models.json` (un `AnimationMixer` per file glTF per binding corretto).
- **Scena**: priorità positions = `positions.json` (legacy) → `scene-config.json` → localStorage (solo editor).
- **Loop**: `renderer.setAnimationLoop(animate)`; `renderer.xr.enabled=true`. In VR: `vrLocomotion`, `updateVrTeleportArc`, jump fisica.
- **Feature Spatial** (teleport/entrance/interactable): ognuna ha visual + add/remove/save/load + row UI + check di prossimità nel loop.
- **Quest** (`loadQuests` 2209): trigger ⚡ cliccabili (desktop+VR), checklist agganciata in basso a dx, svaniscono al completamento. Creabili/editabili in editor.
- **Azioni** (macchina a stati SetActive da Unity): zone-azione (trigger walk-in) che mostrano/nascondono nodi GLB; i nodi nascosti escono anche dal collider.
- **Simulazioni/Quiz** (`uiQuizzes` 3331, `openQuiz` 3366): pannello a livelli con lucchetti/progresso, quiz multi-risposta, jolly fra i livelli. Anche in VR.
- **Avatar 3a persona** (`loadAvatar` 3029, `toggleThirdPerson` 3075): X Bot neutro + follow-cam (toggle 🎥/V); damping bacino per camminata neutra.
- **Oggetti utente menu+** (`initUserObjects` 3709, `addUserObject` 3741): caricabili da redazione E visitatori (img/PDF/MP4/360/YouTube/GLB) via `/api/projects/:slug/asset`; gizmo in play, bolle shader, blocca/elimina.
- **Portal** (anello in orbita): click VR vero → portale / YouTube / PDF.
- **Caduta nel vuoto/respawn** (`_fallStartT` 1124, `VOID_FALL_RESPAWN_MS` 7000): off-bordo → respawn a tempo (7s) con fallback all'origine.
- **Click-to-teleport** (`clickTeleportAt` 5066): teleport sul pavimento vero, attivabile da Opzioni; anche in editor.
- **Loader**: mostra MB scaricati + avviso file pesanti.

---

## Decisions made
- 2026-06: editor → localStorage (copia di lavoro), pubblicazione → export `scene-config.json` nel repo. Visitatore play non scrive nulla.
- 2026-06: un `AnimationMixer` per file glTF (binding corretto), una clip per personaggio per indice.
- 2026-06: chiavi localStorage suffissate per progetto (`_KP`) per isolare gli edit tra laboratori.
- 2026-06: prompt interactable visibile in VR come etichetta 3D + joystick mobile (commit c8dd933).
- 2026-06: VR salto (tasto A) + teleport ad arco parabolico (grip) (commit f292a72).
- 2026-06: un GLB = un oggetto unico ovunque; `.gltf` multi-file bloccato con avviso (no scena spezzata).
- 2026-06: avatar 3a persona neutro (X Bot) con follow-cam invece di personaggio specifico.
- 2026-06: caduta off-bordo → respawn a tempo (7s) invece di blocco/freeze.
- 2026-06: oggetti utente caricabili anche dai visitatori (non solo redazione), salvati come asset R2 `objects/`.

---

## Errors already made in this area
- localStorage scritto anche in play → ✅ gate su `EDIT_MODE` ovunque si salva.
- Posizioni perse al deploy (solo in localStorage) → ✅ esportare in `scene-config.json` e committare.

---

## TODO / Tech debt
- [ ] Monolite ~7100 righe: difficile da navigare, nessuna modularizzazione — modifiche chirurgiche obbligate.
- [ ] Texture originali non collegate (mesh con texture embedded).
- [ ] Test WebXR su visore reale ancora parziale.

---

## Investigations done
- 2026-06-12: ri-mappato `index.html` via ripgrep dopo +3546 righe (no Read del monolite ~7100). Sezioni/funzioni chiave:
  - Caduta/respawn: `_fallStartT` 1124, `VOID_FALL_RESPAWN_MS` 7000
  - Quest: `loadQuests()` 2209, `animateTriggerDone()` 2348
  - Avatar 3a persona: `loadAvatar()` 3029, `toggleThirdPerson()` 3075, `updateThirdPerson()` 3096
  - Simulazioni/Quiz: `uiQuizzes` 3331, `applyQuizImport()` 3347, `openQuiz()` 3366, `answerUiQuiz()` 3383
  - Oggetti utente: `initUserObjects()` 3709, `addUserObject()` 3741, `animateUserObjects()` 4241
  - Init/render: `init()` 4455, `loadModel()` 5235, `animate()` 6684
  - VR: `setupVR()` 4854, teleport visuals 4959, `clickTeleportAt()` 5066
- 2026-06-08 (storico): Teleport 884-1208 | Entrance 1210-1385 | Interactable 1387-1612 (offset cambiati col monolite cresciuto — ri-grep per i numeri attuali).
