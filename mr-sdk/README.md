# MetaReality — SDK Progetti Custom · Harness locale

Questo è il **banco di prova locale** per costruire e testare un *progetto custom* di MetaReality **sul tuo PC**, prima di caricarlo in piattaforma. L'harness finge di essere la piattaforma quanto basta per far girare il tuo progetto: costruisce l'oggetto `ctx`, chiama il tuo `createScene(ctx)`, manda avanti il loop `update(dt)`, gestisce camera/avatar/locomozione e interagibili — **esattamente** come da contratto.

> Garanzia dell'SDK: **se gira qui, girerà caricato in piattaforma.** L'harness implementa lo stesso contratto del documento [`docs/SDK-PROGETTI-CUSTOM.md`](../docs/SDK-PROGETTI-CUSTOM.md). Leggi quel file: è il riferimento normativo.

## Avvio

Dalla cartella `platform/mr-sdk/`:

```
npx serve .
```

poi apri nel browser:

```
http://localhost:3000/harness/?project=voliera
```

(oppure usa la config di avvio **"mr-sdk-harness"** in `.claude/launch.json`.)

## Comandi nell'harness

- **W A S D** — cammina · **Shift** corri
- trascina il **mouse** — guardati intorno
- **F** — interagisci con l'oggetto vicino (chiama la sua `onActivate`)
- **M** — pulsante "menu" (`ctx.input.onButton('menu', …)`)
- pannello a sinistra = **editor ridotto**: cambia i `settings` del manifest → il progetto viene ricostruito (`dispose()` + `createScene()`), come farà l'editor in piattaforma
- **Simula VR** — imposta `ctx.avatar.isPresentingVR = true` e chiama `onEnterVR/onExitVR`, per testare l'adattamento VR senza visore
- bottone **VR** (in basso a destra) — entra in VR **reale** se hai un visore collegato al browser

## Creare un tuo progetto

1. Crea una cartella `projects/<ilTuoProgetto>/` con dentro:
   - `project.json` — il manifest (vedi `projects/voliera/project.json` e §10 del documento SDK)
   - `entry.js` — `export function createScene(ctx) { … return { root, update, interactables, colliders, entrances, dispose } }`
   - eventuali `models/*.glb` (**non compressi** — niente Meshopt/Draco/KTX2)
2. Apri `http://localhost:3000/harness/?project=<ilTuoProgetto>`
3. Itera. Quando funziona qui, sarà pronto per "Carica progetto" in piattaforma.

## Regole d'oro (dal contratto)

- **Non importare three** da te: usa `ctx.THREE`.
- **Non toccare** camera/renderer/sessione VR/avatar: li possiede la piattaforma. Tu porti solo `root` (un `THREE.Group`) e muovi i tuoi oggetti in `update(dt)`.
- La UI **non è DOM**: oggi costruisci un pannello con `CanvasTexture`+`Mesh` aperto da un interagibile (§7.5). Il menu dichiarativo `ctx.ui` è **Fase 2**.
- `ctx.ui` e `ctx.env` **non esistono ancora** (Fase 2): un progetto che li usa fallisce. Proteggi con `if (ctx.env)` o evita.

## Cosa NON è ancora reale

L'harness implementa il **core** di `ctx` (THREE, loader, assets, time, avatar in sola lettura, input "menu", settings, events, log). Restano **[DA COSTRUIRE — Fase 2]**: il menu spaziale dichiarativo (`ctx.ui`), `ctx.env`, e — lato piattaforma — il runtime ospitato, "Carica progetto" e l'editor ridotto online. L'harness ti permette comunque di costruire e validare il progetto end-to-end in locale.
