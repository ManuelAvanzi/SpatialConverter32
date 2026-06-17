# SDK Progetti Custom di MetaReality

> **Versione SDK:** `1.0.0-draft` · **Piattaforma runtime di riferimento:** SpatialConverter / MetaReality viewer (Three.js `0.165.0`)
> **Pubblico di questo documento:** un agente di coding (Claude Code) che, dato SOLO questo file, deve poter costruire da zero un progetto custom compatibile in una cartella locale.
> **Convenzione di etichettatura usata ovunque:**
> - **[ESISTE OGGI]** = già presente e funzionante nel codice della piattaforma (vedi report dei sottosistemi).
> - **[DA COSTRUIRE LATO PIATTAFORMA]** = parte del contratto che dovrà essere implementata nel runtime/editor della piattaforma. È un impegno dello SDK, non qualcosa che puoi già usare oggi.
>
> **Onestà totale.** Questo documento descrive DUE cose insieme: l'engine VR che gira **oggi** nel viewer, e il **contratto SDK** che ancora non esiste come API pubblica. Dove la VR, l'oggetto `ctx`, la UI spaziale "a menu unico", `ctx.env`, l'editor ridotto o l'harness **non esistono ancora**, lo dico e lo marco `[DA COSTRUIRE]`. Non fingo che siano usabili oggi: un progetto che chiama `ctx.ui`, `ctx.env` o anche solo riceve un `ctx` oggi **non gira**, perché il runtime che costruisce `ctx` e chiama `createScene` è esso stesso `[DA COSTRUIRE]`. Leggi prima la sezione **"Stato di maturità"** qui sotto: è la mappa di cosa puoi toccare oggi e cosa stai progettando contro un contratto futuro.

---

## 1. Scopo e filosofia

### 1.1 Cos'è un progetto custom

Un **progetto custom** è un bundle (una cartella di file) che contiene:
- un **manifest** (`project.json`) che descrive il progetto e guida l'editor ridotto;
- un **modulo entry JavaScript** (ES module) che esporta una funzione `createScene(ctx)`;
- gli **asset** del progetto (modelli `.glb`, texture, ecc.).

Il modulo entry costruisce un sotto-albero Three.js (un `THREE.Group`), dichiara le sue animazioni, i suoi oggetti interagibili e i contenuti UI, e li consegna alla piattaforma. La piattaforma lo **ospita** dentro il proprio runtime: stessa scena, stessa camera, stesso renderer, stessa sessione VR, stesso avatar, stessa locomozione, stesso multiutente.

### 1.2 Perché esiste

Oggi la piattaforma sa caricare progetti **nativi**: configurazioni dichiarative (`scene-config.json`) che posizionano modelli GLB e dichiarano interagibili/teleport/quest **senza codice**. È potente ma chiuso: non puoi scrivere logica arbitraria (uccellini che volano con una loro fisica, una macchina a stati custom, un mini-gioco).

Il progetto custom apre quella porta in modo **controllato**: porti il tuo codice, ma dentro un contratto preciso che ti vieta di toccare le parti pericolose (camera, sessione XR, multiutente). Così un creatore fidato può costruire esperienze ricche, e la piattaforma resta sicura in VR **per costruzione**.

### 1.3 Nativo vs custom

| | **Nativo** [ESISTE OGGI] | **Custom** [questo SDK] |
|---|---|---|
| Cosa dichiari | Solo dati (`scene-config.json`): posizioni, interactables, teleport, quest | Dati **+ codice** (`createScene` con `update`, logica, animazioni procedurali) |
| Modelli | GLB caricati e auto-animati (clip[0] in autoplay) | GLB caricati **da te** via `ctx.loader`, animazioni guidate **da te** in `update()` |
| Logica | Macchina a stati dichiarativa (azioni show/hide) | Qualsiasi logica JS nel tuo `update(dt)` |
| Editor | Editor completo (gizmo, posizionamento, ecc.) | **Editor ridotto** guidato dal manifest (entrata, UI visore, qualità) |
| Camera / VR / avatar | Della piattaforma | Della piattaforma (identico — **non lo tocchi mai**) |

I due modelli **coesistono**: un progetto custom è semplicemente un progetto con `type: "custom"` nel record lato server (vedi §13).

---

## Stato di maturità — cosa esiste oggi vs cosa è da costruire

> Questa è la sezione più importante del documento. Leggila prima di tutto il resto. Distingue ciò che il viewer **fa già girare** da ciò che è **il contratto SDK ancora da implementare**. Se confondi i due, scrivi codice che "sembra giusto" ma che oggi non parte.

### [ESISTE OGGI nel viewer]

Tutto questo è codice reale, già funzionante nel viewer MetaReality. È il motore su cui il tuo progetto custom andrà a girare:

- **Three.js `0.165.0`** caricato via importmap (versione esatta, §3.1).
- **Renderer condiviso**: `WebGLRenderer` con `renderer.xr.enabled = true`, tone mapping ACES (`exposure 1.2`), shadow map PCF soft. Un solo render loop (`renderer.setAnimationLoop(animate)`), della piattaforma.
- **VR funzionante**: `VRButton` per l'ingresso, `XRControllerModelFactory` per i modelli dei controller, la `camera` **figlia del `playerRig`** (`playerRig.add(camera)`), controller XR letti e gestiti.
- **Avatar e movimento**: avatar in 1ª e 3ª persona, locomozione (stick + WASD), salto, gravità/grounding (raycast verso il basso), teleport ad arco in VR (grip), snap-turn.
- **Sistema collider**: `toggleCollider(root)` traversa un `Object3D` e lo rende camminabile (popola `collidableMeshes`, raycast pavimento/muri). I nativi lo dichiarano via `colliders: [...]` nello `scene-config`.
- **Interagibili NATIVI**: `addInteractable(...)`, sistema di prossimità, prompt come Sprite 3D `CanvasTexture` in VR, attivazione via grilletto / tasto F.
- **GLTFLoader BASE**: `new GLTFLoader()` **senza** MeshoptDecoder, DRACOLoader, KTX2Loader (§3.5 — implica: SOLO GLB non compressi).
- **AnimationMixer**: per i modelli nativi, autoplay clip[0] in `LoopRepeat`, `mixer.update(delta)` ogni frame.
- **Preset ambiente**: "Mare" (`Water` animata), luci (`ambientLight` + `dirLight`), fog, tone mapping.
- **Backend / lifecycle**: storage progetti (R2/S3 sotto `<assetPrefix>/`), upload modelli (fino a 200 MB/file), `scene-config`, presigned URL, `status: draft/published`, download ZIP, record progetto.

### [DA COSTRUIRE LATO PIATTAFORMA come parte di questo SDK]

Niente di quanto segue esiste oggi come API pubblica. È il **contratto** di questo SDK: lo stai progettando, non usando. Un progetto che dipende da queste cose **non gira finché la piattaforma non le implementa**:

- **Il RUNTIME (host/loader)** che carica un bundle custom dallo ZIP, ne importa l'entry come ES module, costruisce `ctx`, chiama `createScene(ctx)`, instrada `update`/`dispose`/VR lifecycle. Senza questo, **nessun** progetto custom parte: è il pezzo zero (§4, §13).
- **L'oggetto `ctx` e tutte le sue sotto-API**: `ctx.THREE`, `ctx.loader`, `ctx.assets`, `ctx.avatar`, `ctx.input`, `ctx.settings`, `ctx.ui`, `ctx.env`, `ctx.time`, `ctx.events`, `ctx.log`. Alcune **avvolgono** capacità che esistono già (es. `ctx.THREE` riusa l'istanza esistente, `ctx.env` riusa i preset Mare/luci); altre sono interamente nuove (`ctx.ui`, `ctx.settings`, `ctx.events`). L'oggetto unificato in sé non esiste (§6).
- **Il sistema UI spaziale dichiarativo**: `ctx.ui`, `UISpec`, e in particolare il "menu unico di default chiuso, aperto da un pulsante del controller". Oggi esistono pannelli specifici (quest tablet, quiz, livelli), ma **nessun menu generico dichiarativo** (§7).
- **`ctx.env`** come API on-demand per i progetti custom (acqua/luci accese su richiesta del progetto), costruita sopra i preset esistenti (§6.10).
- **L'editor RIDOTTO** guidato dal manifest: invece dell'editor completo (gizmo, posizionamento), per i custom mostra solo i `settings[]` del manifest + UI da visore + qualità (§13).
- **L'harness di sviluppo locale**: il runtime locale che implementa `ctx` per testare prima di caricare (§12) — è il deliverable principale dell'SDK v1.0.
- **Il caricamento/parse del manifest e il ciclo dei settings**: parse di `project.json` dallo ZIP, popolamento di `ctx.settings`, propagazione dei cambi dall'editor a runtime (§4, §10, §13).

### In una frase

> Tutto ciò che è **[DA COSTRUIRE]** è il contratto verso cui costruisci: il tuo progetto lo userà, e girerà davvero quando il runtime sarà implementato e testabile tramite l'harness locale. Scrivi il progetto seguendo questo contratto: quando la piattaforma costruisce `ctx`, l'harness e il menu spaziale, il tuo bundle funzionerà senza modifiche.

---

## 2. Principio cardine (VR-safe per costruzione)

> **La piattaforma possiede: renderer, camera, rig del giocatore, sessione XR/VR, avatar, locomozione, gravità, multiutente.
> Il progetto custom NON tocca MAI nessuna di queste cose. Porta solo: la sua scena (un `THREE.Group`), le sue animazioni, la sua logica, i suoi interagibili e i suoi pannelli UI dichiarati.**

Questo è il cuore dello SDK. Non è uno slogan: è la ragione per cui un progetto custom è sicuro da eseguire in VR.

**[ESISTE OGGI]** dal report `render-xr-vr`:
- Il `WebGLRenderer` è creato e posseduto dalla piattaforma (`renderer.xr.enabled = true`, tone mapping ACES, shadow map PCF soft).
- La `camera` è **figlia del `playerRig`** (`playerRig.add(camera)`, riga ~4989 del viewer). In FPS si muove la camera; in VR si muove il rig; in entrambi i casi è fisica interna della piattaforma.
- Il render loop è `renderer.setAnimationLoop(animate)` — uno solo, della piattaforma.
- La regola "i progetti custom NON toccano direttamente la camera" è già scritta come regola critica nel codice.

### 2.1 Come è protetta davvero la camera nella v1 (niente over-promise)

Onestà: **nella v1 la protezione della camera/renderer NON è un sandbox tecnico forte.** Non c'è un Web Worker che isola il codice, non c'è una CSP che neutralizza ogni `eval`, non c'è un capability-system che blocca a runtime l'accesso a `camera`/`renderer`. Costruire quel livello non è l'obiettivo di questa fase. La protezione, in v1, poggia su **due pilastri concreti e onesti**:

1. **Il `ctx` semplicemente NON ti consegna camera/renderer/loop.** Il contratto (§6) ti dà `ctx.THREE`, `ctx.loader`, `ctx.assets`, `ctx.avatar` (sola lettura), ecc. — ma **non** un riferimento a `camera`, **non** a `renderer`, **non** a `setAnimationLoop`, **non** alla sessione XR. Non hai un appiglio *legittimo e documentato* per toccarli. Non è un muro inviolabile (il viewer è un monolite e un ES module determinato potrebbe cercare globali), ma è l'assenza deliberata di una superficie d'attacco nel contratto.
2. **La REVISIONE manuale prima del publish** (§11). Ogni bundle è **letto da un umano** prima di passare a `published`. Il revisore verifica con la checklist (§11.3) che il codice non nomini `camera`, `renderer`, `playerRig`, `setAnimationLoop`, `requestSession`, `OrbitControls`. Questa è la barriera di enforcement reale della v1.

Questo è coerente col **trust model INTERNO / creatori fidati** (§11): i progetti sono scritti dal team, non dal pubblico ostile. Non fingere che ci sia un enforcement tecnico forte: **non c'è**, e va bene così per un sistema interno. La sicurezza è "contratto che non espone + occhi umani in revisione". Per il dettaglio completo del modello di fiducia e di cosa è vietato, vedi **§11**.

**Conseguenza pratica per te (agente di coding):** nel tuo codice **non esiste** `camera`, non esiste `renderer`, non esiste `new THREE.WebGLRenderer`, non esiste `setAnimationLoop`, non esiste `requestSession`, non esiste `OrbitControls`. Se senti il bisogno di scriverli, stai sbagliando contratto e la revisione ti respinge. Tu ricevi un **frame di tempo** (`dt`) e muovi i **tuoi** oggetti. Punto.

---

## 3. Stack e vincoli tecnici

### 3.1 Versione Three.js — ESATTA

**[ESISTE OGGI]** dal report `stack-build`:

```
Three.js  0.165.0
importmap:
  "three":         "https://cdn.jsdelivr.net/npm/three@0.165.0/build/three.module.js"
  "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.165.0/examples/jsm/"
```

**Regola assoluta:** il tuo progetto **NON importa Three.js da sé**. Non scrivi `import * as THREE from 'three'` con un tuo URL, non includi un tuo `three.module.js`. Usi l'istanza che la piattaforma ti passa in `ctx.THREE` (§6). Importare un secondo Three.js causa:
- doppio namespace (bloat),
- incompatibilità di tipi (`instanceof THREE.Mesh` fallisce tra istanze diverse),
- potenziali context leak.

> **Perché via `ctx` e non via importmap?** Il viewer di oggi è un monolite con un suo `<script type="module">` e una sua importmap. Un bundle custom caricato a runtime non condivide automaticamente quell'importmap. Il modo affidabile e a prova di futuro per darti Three.js è **iniezione via `ctx`**. Vedi §4 e §6. (L'iniezione di `ctx.THREE` è essa stessa parte del runtime **[DA COSTRUIRE]**.)

### 3.2 Addon ammessi

**[ESISTE OGGI]** la piattaforma ha già importato questi 14 addon (puoi assumerli disponibili tramite `ctx` quando il runtime sarà costruito, vedi §6 per quali sono esposti):

`GLTFLoader`, `GLTFExporter`, `FBXLoader`, `OrbitControls`, `TransformControls`, `VRButton`, `XRControllerModelFactory`, `RoomEnvironment`, `EffectComposer`+`RenderPass`+`OutlinePass`+`OutputPass`, `CSS3DRenderer`+`CSS3DObject`, `SkeletonUtils`, `Water`.

Di questi, lo SDK ti **esporrà** solo ciò che ha senso per un progetto custom: il **loader GLTF** (via `ctx.loader`) e `SkeletonUtils` (per clonare modelli animati). `OrbitControls`/`TransformControls`/`VRButton`/`EffectComposer` sono strumenti della piattaforma e **non** ti vengono dati: gestiscono camera, gizmo, ingresso VR, post-processing — tutta roba vietata (§2).

**Non puoi caricare addon extra da CDN.** Se ti serve un helper Three (es. `MeshBVH`), includilo **bundlato** nel tuo progetto come modulo locale che riceve `THREE` da `ctx` (passaglielo come argomento), non come secondo import di three.

### 3.3 Niente DOM overlay per la UI VR

**[ESISTE OGGI]** dal report `interactables-ui`: in VR il DOM `#interact-panel` **non è visibile** (niente overlay 2D nel visore). I prompt in VR sono Sprite 3D `CanvasTexture` nel mondo.

**Regola:** la tua UI **non** è HTML/DOM. Tu **dichiari** contenuti UI (testi, voci, pagine) in forma dati (§7); la piattaforma li **spazializza** in 3D. Non creare `document.createElement`, non iniettare `<div>` flottanti: in VR non si vedrebbero e sono un escape vector (§11). Finché `ctx.ui` non esiste, l'UI 3D la costruisci **tu** con `CanvasTexture` + `Mesh`/`Sprite` nel tuo gruppo (workaround in §7.5).

### 3.4 Path relativi e namespacing

**[ESISTE OGGI]** dal report `stack-build`: gli asset del progetto vivono sotto un `assetPrefix` e l'URL base è calcolato a runtime in `ASSET_BASE`. Non puoi hardcodare URL assoluti.

**Regola:** carica i tuoi modelli **solo** via `ctx.assets.url('models/uccello.glb')` (§6), che risolve relativamente alla cartella del tuo progetto. Mai `https://...` hardcoded, mai `/api/asset/...` scritto a mano.

**Namespacing:** non scrivere su `window.*`. Tutto il tuo stato vive **dentro la closure** di `createScene`. Se proprio devi esporre qualcosa globalmente (sconsigliato), usa `window['__mr_<slug>__']`. Non registrare listener globali (`window.addEventListener('resize'|'keydown'|...)`): la piattaforma li ha già e collidereste. Per l'input usa `ctx.input` (§6).

### 3.5 Budget prestazioni / VR

Il **peso non è un problema**: la piattaforma regge bundle ben oltre 44 MB (upload modelli fino a 200 MB per file, vedi `project-lifecycle`). Ma in VR conta il **frame budget** (90 fps ≈ 11 ms/frame), non il peso su disco. Linee guida:

| Aspetto | Budget consigliato (VR) | Note |
|---|---|---|
| Draw call aggiunte dal progetto | < ~150 | usa instancing (`InstancedMesh`) per sciami (uccellini!) |
| Triangoli aggiunti | < ~500k visibili | LOD manuale se sfori |
| Materiali unici | pochi, condivisi | non un materiale per mesh |
| Lavoro in `update(dt)` | < ~2 ms | niente allocazioni per-frame (no `new THREE.Vector3()` nel loop) |
| Texture | ≤ 2048², comprimi se puoi | **niente Draco/Meshopt/KTX2** (vedi sotto) |
| Luci aggiunte | **0** preferibilmente | usa le luci della piattaforma (§8) |
| Ombre | non aggiungere shadow-casting pesante | la piattaforma ha già 1 directional shadow |

**Compressione GLB — REGOLA ASSOLUTA [ESISTE OGGI]:** dal report `assets-anim-env`, il `GLTFLoader` della piattaforma è `new GLTFLoader()` **base**: **NON ha** `MeshoptDecoder`, **NON ha** `DRACOLoader`, **NON ha** `KTX2Loader` configurati. Quindi: **SOLO GLB NON COMPRESSI** (glTF 2.0 standard, geometria non-Draco, niente Meshopt, niente texture KTX2).

> **Perché è una regola assoluta e pericolosa:** un GLB compresso **non lancia un errore chiaro**. Il `GLTFLoader` base **ignora silenziosamente** l'estensione di compressione e carica **geometria rotta** (mesh vuote, vertici a zero, niente texture) **senza fallire**. È il peggior tipo di bug: tutto "carica", ma vedi il vuoto o un modello deformato, senza messaggio. Se hai modelli compressi, **decomprimili prima** di metterli nel bundle (es. `gltf-transform` senza passare opzioni di compressione, oppure ri-esporta da Blender senza Draco). Verifica come da checklist §11.3.

---

## 4. Architettura runtime e ciclo di vita

> **Tutta questa sequenza è il runtime [DA COSTRUIRE LATO PIATTAFORMA].** L'host/loader che orchestra questi passi non esiste ancora: è il "pezzo zero" dell'SDK (vedi "Stato di maturità"). Il report `project-lifecycle` (§6 di quel report) ne descrive il punto d'innesto reale previsto (`loadCustomProjectBundle`). Finché questo non è implementato, nessun `createScene` viene mai chiamato.

```
            PIATTAFORMA                                  PROGETTO CUSTOM
            ───────────                                  ───────────────
1. load     fetch del bundle (ZIP)
2. loadMan  parse di project.json: legge name, entry,
            sdkVersion, capabilities, settings[]
            valida sdkVersion (§16); popola i valori
            iniziali in ctx.settings dai default + record
            importa l'entry come ES module  ───────────▶ (modulo valutato)
3. ctx      costruisce l'oggetto ctx (§6)
            (inietta ctx.THREE, loader, assets,
             settings già popolati, ecc.)
4. create   chiama createScene(ctx)  ───────────────────▶ export createScene(ctx)
                                                          legge ctx.settings (parametri)
                                                          crea root = new ctx.THREE.Group()
                                                          carica modelli (await ctx.loader…)
                                                          dichiara interactables, ui
            ◀─────────────────────────────────────────── ritorna { root, update,
            scene.add(api.root)                              interactables, ui,
            registra interactables/colliders/entrances       colliders, entrances, dispose }
5. loop     ogni frame (dentro setAnimationLoop):
            calcola dt, aggiorna avatar/locomozione
            chiama api.update(dt, elapsed) ─────────────▶ update(dt, elapsed): muove i tuoi oggetti
            renderer.render(scene, viewCam())
6. VR       all'ingresso/uscita sessione XR:
            chiama api.onEnterVR()/onExitVR() ──────────▶ (opzionali) adatti la UI/scala
                                                          (oppure: leggi ctx.avatar.isPresentingVR
                                                           dentro update — vedi §4.2)
7. settings se un setting cambia nell'editor ridotto:
            default → dispose() + createScene(ctx) ─────▶ ricostruzione con nuovi ctx.settings
            (opzionale: evento settings:changed)
8. dispose  alla chiusura del progetto:
            chiama api.dispose() ───────────────────────▶ dispose(): liberi geometrie/texture
            scene.remove(api.root)
```

### 4.1 Passo "loadManifest" (chi parsa cosa)

**[DA COSTRUIRE]** Al passo 2 la piattaforma:
1. estrae e parsa `project.json` da dentro lo ZIP (la dipendenza JSZip **[ESISTE OGGI]**);
2. **valida `sdkVersion`** contro la versione di SDK del runtime (§16.0): major del progetto > major del runtime ⇒ **rifiuto a load-time** (il progetto non viene caricato);
3. legge `settings[]` e **popola i valori iniziali in `ctx.settings`**: per ogni `key`, il valore è quello salvato nel record del progetto (`sceneConfig.customSettings`, §13) se presente, altrimenti il `default` dichiarato nel manifest;
4. solo dopo importa l'entry e costruisce `ctx` con `ctx.settings` già pieno, così che `createScene` lo legga subito.

### 4.2 Ciclo di vita VR (come il progetto sa di essere in VR)

**[DA COSTRUIRE]** Il progetto **non** ha accesso raw alla sessione XR (niente `requestSession`, niente `session.inputSources`, §2). Sa di essere in VR in due modi, entrambi forniti dal runtime:

- **Lettura di stato (CONSIGLIATO):** leggi `ctx.avatar.isPresentingVR` (specchio di `renderer.xr.isPresenting`, **[ESISTE OGGI]** come valore, **[DA COSTRUIRE]** la sua esposizione). Leggilo **dentro `update()`**: è il modo robusto e senza sorprese di adattare scala/posizione/comportamento ogni frame.
- **Callback di transizione (OPZIONALI):** se esporti `onEnterVR()` / `onExitVR()` nella `SceneAPI`, la piattaforma li chiama all'**avvio** e alla **fine** della sessione XR (monitorando gli eventi di sessione WebXR `session.start`/`session.end`, **[ESISTE OGGI]** gli eventi, **[DA COSTRUIRE]** l'inoltro al tuo modulo). Sono comodi per azioni one-shot (es. riposizionare il menu una volta all'ingresso). **Non ricevono la sessione XR né i controller raw**: nessun argomento sensibile.

> **Quale uso?** Per logica continua (scala, distanze) → leggi `isPresentingVR` in `update`. Per azioni one-shot all'ingresso/uscita → usa i callback. Non sono in conflitto: i callback ti dicono *quando* cambia, `isPresentingVR` ti dice *qual è* lo stato in ogni frame. Mai accedere alla sessione XR direttamente.

### 4.3 Chi chiama cosa (riassunto)

- `createScene(ctx)` → chiamato **una volta**, dalla piattaforma, dopo `loadManifest` + costruzione di `ctx`. Può essere `async`.
- `update(dt, elapsed)` → chiamato **ogni frame** dalla piattaforma, dentro il suo `animate()`. **[ESISTE OGGI]**: il loop `renderer.setAnimationLoop(animate)` e l'aggiornamento dei mixer (`mixer.update(delta)`) esistono già; **[DA COSTRUIRE]** lo SDK aggiunge la chiamata al tuo `update`. **`update` è l'UNICA fonte di verità per il tempo** (§4.4).
- `onEnterVR()` / `onExitVR()` → chiamati quando la sessione XR inizia/finisce (§4.2). **[DA COSTRUIRE]** l'inoltro.
- `dispose()` → chiamato alla chiusura/cambio progetto **e** quando un setting cambia e si rilancia `createScene` (§4.5).

### 4.4 Tempo: una sola sorgente di verità

**La sorgente di verità del tempo è `update(dt, elapsed)`.** `dt` = secondi dall'ultimo frame (già clampato dalla piattaforma); `elapsed` = secondi totali dall'avvio. Sono gli argomenti che ricevi ogni frame ed è da lì che leggi il tempo.

`ctx.time` (§6.4), **se presente**, è solo un **mirror di comodo** degli stessi valori, accessibile fuori dal loop (per logiche differite che non hanno `dt` sottomano). Non è una seconda fonte: rispecchia ciò che `update` riceve. Nel dubbio, usa gli argomenti di `update`.

### 4.5 Settings che cambiano a runtime

**[DA COSTRUIRE]** Quando il creatore cambia un setting nell'editor ridotto **mentre il progetto gira**, il comportamento di **default** è:
1. la piattaforma chiama `dispose()` sul progetto corrente (liberi le risorse);
2. **rilancia `createScene(ctx)`** con `ctx.settings` aggiornato.

In altre parole: **ricostruzione pulita**. Scrivi `createScene` in modo che possa essere richiamato più volte (stato tutto nella closure, nessun side-effect globale). Opzionalmente, la piattaforma può anche emettere un evento `settings:changed` (§6.9) per progetti che preferiscono adattarsi *senza* ricostruire (es. cambiare solo un parametro live): gestisci difensivamente entrambi i casi. I valori dei settings **persistono nel record del progetto** (`sceneConfig.customSettings`, §13): l'editor li legge da lì e li ripropone al caricamento successivo.

### 4.6 Garanzie di ordine

`createScene` completa (anche le sue `await`) **prima** del primo `update`. `dispose` è l'ultimo a essere chiamato; dopo non riceverai più `update`. In caso di rilancio per settings (§4.5), l'ordine è `dispose()` del vecchio → `createScene()` del nuovo → nuovo primo `update`.

---

## 5. Il contratto del modulo-progetto

### 5.1 Firma esatta dell'entry

Il tuo file entry (default `entry.js`, dichiarato nel manifest) è un **ES module** che esporta una funzione `createScene`:

```js
// entry.js
export function createScene(ctx) {
  // ... vedi sotto ...
  return {
    root,          // OBBLIGATORIO: THREE.Group
    update,        // opzionale ma quasi sempre presente
    interactables, // opzionale
    ui,            // opzionale (UISpec — solo Fase 2; oggi non ha effetto)
    colliders,     // opzionale (ma serve un pavimento, §9)
    entrances,     // opzionale
    onEnterVR,     // opzionale
    onExitVR,      // opzionale
    dispose,       // consigliato
  };
}
```

`createScene` **può essere `async`** (può `await` i caricamenti GLB). Ritorna (o risolve in) un oggetto **`SceneAPI`**.

### 5.2 `SceneAPI` — definizione campo per campo

| Campo | Tipo | Obbl. | Semantica |
|---|---|:---:|---|
| `root` | `THREE.Group` | **Sì** | Il sotto-albero della tua scena. La piattaforma fa `scene.add(root)`. **Tutto** ciò che vuoi mostrare deve essere figlio di `root` (o discendente). Non aggiungere nulla direttamente a `scene`. |
| `update` | `(dt:number, elapsed:number) => void` | No | Chiamata ogni frame. `dt` = secondi dall'ultimo frame (già clampato). `elapsed` = secondi totali. **Fonte di verità del tempo** (§4.4). Qui muovi/animi i tuoi oggetti. **Non** allocare oggetti nuovi per frame. |
| `interactables` | `Interactable[]` | No | Lista dichiarativa di oggetti interagibili (§5.3). La piattaforma li registra nel suo sistema di prossimità + grilletto VR ([ESISTE OGGI], `addInteractable`; **[DA COSTRUIRE]** il binding al tuo `onActivate`). |
| `ui` | `UISpec` | No | Dichiarazione del menu spaziale (§7). **[DA COSTRUIRE — Fase 2]**: oggi NON ha effetto; usa il fallback §7.5. |
| `colliders` | `THREE.Object3D[]` | No (di fatto necessario) | Geometria camminabile (§9). Senza almeno un pavimento collider, il giocatore cade. |
| `entrances` | `Array<{position,yaw?,radius?}>` | No | Punti di spawn (§9). Se assenti, fallback `defaultSceneSpawn()`. |
| `onEnterVR` | `() => void` | No | Chiamata all'ingresso in sessione VR (§4.2). Per azioni one-shot. **[DA COSTRUIRE]** l'inoltro. |
| `onExitVR` | `() => void` | No | Chiamata all'uscita dalla VR (§4.2). **[DA COSTRUIRE]** l'inoltro. |
| `dispose` | `() => void` | No (consigliato) | Libera risorse: `geometry.dispose()`, `material.dispose()`, `texture.dispose()`, ferma audio, annulla timer. La piattaforma rimuove `root` dalla scena dopo. Chiamata anche al rilancio per settings (§4.5). |

### 5.3 `Interactable` — definizione

Un interagibile dichiarato dal progetto. Mappa 1:1 sul sistema reale `addInteractable(posArr, text, radius, anim, showRing, id, save, uid, taskLink, vis)` **[ESISTE OGGI]** (report `interactables-ui`).

```ts
interface Interactable {
  id:       string;           // univoco nel progetto (es. "bird-feeder")
  position: [number,number,number]; // posizione mondo (relativa a root.position se la sposti)
  text:     string;           // prompt mostrato (es. "Apri il menu")
  radius?:  number;           // raggio di attivazione in metri (default 3)
  visibility?: number;        // distanza max a cui l'icona è visibile (default 14)
  showRing?: boolean;         // anello attorno all'interagibile (default true)
  object3d?: THREE.Object3D;  // opz: un tuo mesh da agganciare (deve essere sotto root)
  onActivate: (ev) => void;   // chiamato quando il giocatore preme F (desktop) o grilletto (VR) puntando l'interagibile
}
```

`onActivate(ev)` riceve un piccolo evento `{ source: 'desktop'|'vr', controller? }`. È **il** punto dove apri un pannello, fai partire un'animazione, cambi fase, ecc. **È anche il principale "gancio" su cui costruire UI funzionante OGGI** (§7.5): la piattaforma chiama il tuo `onActivate`, e lì dentro mostri/nascondi un pannello costruito da te.

> **Nota di mapping [ESISTE OGGI] vs [DA COSTRUIRE]:** il sistema nativo attiva interagibili facendo partire **animazioni di modello per nome** (`anim`) e azioni dichiarative show/hide. Il contratto custom invece ti dà un **callback JS** (`onActivate`). **[DA COSTRUIRE LATO PIATTAFORMA]:** il binding tra l'interagibile registrato e il tuo callback (oggi `onVRInteract`/prossimità chiamano logica interna; lo SDK deve instradare l'attivazione al tuo `onActivate`).

### 5.4 Esempio scheletro completo

```js
// entry.js — SCHELETRO COPIA-INCOLLABILE
export function createScene(ctx) {
  const THREE = ctx.THREE;
  const root = new THREE.Group();
  root.name = 'mioProgetto';

  // (1) costruisci la tua scena qui (mesh, modelli caricati, ecc.)
  // const gltf = await ctx.loader.load(ctx.assets.url('models/x.glb'));
  // root.add(gltf.scene);

  // (2) stato interno del progetto (vive nella closure)
  const state = { t: 0 };

  // (3) loop — dt/elapsed sono la fonte di verità del tempo (§4.4)
  function update(dt, elapsed) {
    state.t += dt;
    // muovi i tuoi oggetti usando dt...
  }

  // (4) interagibili — onActivate è dove apri un pannello (vedi §7.5 per la UI "oggi")
  const interactables = [
    {
      id: 'menu-opener',
      position: [0, 1.2, -3],
      text: 'Apri il menu',
      radius: 2.5,
      onActivate: () => { /* §7.5: togglePanel() costruito da te */ },
    },
  ];

  // (5) pulizia
  function dispose() {
    root.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.dispose());
    });
  }

  return { root, update, interactables, dispose };
}
```

---

## 6. L'API `ctx` (cosa fornisce la piattaforma)

> **L'intero oggetto `ctx` è [DA COSTRUIRE LATO PIATTAFORMA].** Oggi nessun `ctx` viene costruito né passato, perché il runtime che lo crea (§4) non esiste ancora. Alcuni campi **avvolgono** capacità già presenti nel viewer (marcate "[ESISTE OGGI: ...]" come capacità sottostante); altri sono interamente nuovi. Quando leggi "[ESISTE OGGI]" qui sotto, significa: *la capacità sotto esiste, ma l'esposizione via `ctx` è da costruire.*

`ctx` è l'unico canale tra il tuo progetto e la piattaforma. Tutto ciò che ti serve passa da qui; tutto ciò che NON è qui, **non ti è concesso** (incluso camera/renderer/sessione XR, §2).

```ts
interface Ctx {
  THREE:    typeof THREE;        // wrapper su istanza 0.165.0 esistente [DA COSTRUIRE l'iniezione]
  loader:   ProjectLoader;       // wrapper su GLTFLoader esistente [DA COSTRUIRE]
  assets:   AssetResolver;       // su ASSET_BASE esistente [DA COSTRUIRE]
  time:     TimeInfo;            // mirror di dt/elapsed (§4.4) [DA COSTRUIRE]
  avatar:   AvatarInfo;          // sola lettura su playerWorld() [DA COSTRUIRE]
  input:    InputInfo;           // input filtrato (no eventi raw) [DA COSTRUIRE]
  settings: Record<string,any>;  // valori dal manifest/editor [DA COSTRUIRE]
  ui:       UIController;        // menu spaziale unico [DA COSTRUIRE — Fase 2]
  env:      EnvController;       // Mare/luci on-demand [DA COSTRUIRE — Fase 2]
  events:   EventBus;            // [DA COSTRUIRE]
  log:      (...args)=>void;     // wrapper su console [DA COSTRUIRE]
}
```

### 6.1 `ctx.THREE`

L'istanza di Three.js `0.165.0` della piattaforma. **Usa sempre questa** per creare oggetti (`new ctx.THREE.Group()`, `new ctx.THREE.Mesh(...)`). Non importarne un'altra (§3.1). **[DA COSTRUIRE]** l'iniezione (la capacità — l'istanza Three — **[ESISTE OGGI]**).

### 6.2 `ctx.loader` — caricamento GLB

**[ESISTE OGGI]** la capacità: la piattaforma usa `GLTFLoader` base (report `assets-anim-env`). **[DA COSTRUIRE]** il wrapper a promessa.

```ts
interface ProjectLoader {
  // carica un GLB dal tuo bundle; ritorna il gltf { scene, animations, ... }
  load(url: string): Promise<GLTF>;
}
```

**Verità dal codice:** **niente Meshopt, niente Draco, niente KTX2** (§3.5). I GLB devono essere standard non compressi, altrimenti caricano rotti **in silenzio**. Le ombre (`castShadow/receiveShadow`) e il fix-trasparenza vengono applicati automaticamente dalla piattaforma ai modelli caricati con i suoi loader nativi; per i tuoi modelli custom **applicali tu** se li vuoi (vedi §8).

Esempio:
```js
const gltf = await ctx.loader.load(ctx.assets.url('models/uccello.glb'));
root.add(gltf.scene);
```

### 6.3 `ctx.assets` — risoluzione path

**[DA COSTRUIRE]**, costruito sopra `ASSET_BASE` che **[ESISTE OGGI]** (report `stack-build`).

```ts
interface AssetResolver {
  url(relPath: string): string;  // risolve relativamente ad ASSET_BASE
  base: string;                  // l'ASSET_BASE calcolato (sola lettura)
}
```

`ctx.assets.url('models/x.glb')` → `<ASSET_BASE>/models/x.glb`.

> **Come risolve, senza ambiguità:** `ctx.assets.url(rel)` fa una **semplice concatenazione relativa a `ASSET_BASE`**. **Non** genera un presigned URL per-file. In produzione `ASSET_BASE` è (o include) un **presigned a livello di CARTELLA del progetto**: un singolo URL firmato per il prefisso del progetto. Tutti i file sotto quella cartella risolvono **dentro lo stesso bucket/prefisso firmato**, senza una nuova autenticazione per ogni file. In locale (harness, §12) `ASSET_BASE` è un path del server statico. In entrambi i casi: **mai costruire URL a mano**, mai `https://...` hardcoded, mai `/api/asset/...` scritto a mano. Passa sempre per `ctx.assets.url()`.

### 6.4 `ctx.time` — tempo (mirror, non fonte)

**[ESISTE OGGI]** la capacità (il `delta` del loop: `mixer.update(delta)`, animazione mare `time += delta * speed`). **[DA COSTRUIRE]** l'oggetto wrapper.

```ts
interface TimeInfo { dt: number; elapsed: number; frame: number; }
```

> **Una sola fonte di verità (§4.4):** `dt` ed `elapsed` ti arrivano come **argomenti di `update(dt, elapsed)`** — quella è la fonte. `ctx.time` è solo un **mirror di comodo** degli stessi valori per logiche fuori dal loop. Non è una seconda sorgente da tenere sincronizzata: rispecchia `update`.

### 6.5 `ctx.avatar` — posizione/stato del giocatore (SOLA LETTURA)

**[ESISTE OGGI]** la capacità: la piattaforma calcola `playerWorld()` (posizione mondo corretta anche in VR), gestisce gravità/salto/locomozione su `playerRig`. **[DA COSTRUIRE]** l'esposizione **in sola lettura** al progetto.

```ts
interface AvatarInfo {
  getWorldPosition(target: THREE.Vector3): THREE.Vector3; // [su playerWorld()]
  isPresentingVR: boolean;   // mirror di renderer.xr.isPresenting — leggilo in update() (§4.2)
  thirdPerson: boolean;      // true se in terza persona
}
```

> **SOLA LETTURA.** Puoi *leggere* dove si trova il giocatore (utile: gli uccellini fuggono se ti avvicini) e se è in VR (`isPresentingVR`, §4.2). **Non puoi** spostarlo, ruotarlo, teletrasportarlo da codice arbitrario: spawn e teleport sono dichiarativi (§9). Muovere il giocatore = toccare la camera = vietato (§2).

### 6.6 `ctx.input` — input e routing (cosa passa e cosa NO)

**[ESISTE OGGI]** la capacità: controller XR letti via `renderer.xr.getController(i)`, eventi `selectstart` (grilletto), `squeezestart/end` (grip/teleport), pulsanti via `session.inputSources[].gamepad.buttons[...]`. **[DA COSTRUIRE]** un'API pulita che **filtra** ciò che è già consumato dalla piattaforma.

**Routing dell'input — la regola chiave:** il progetto **NON riceve eventi controller grezzi** (`selectstart`, `squeezestart`, ecc.). Grip = teleport e il tasto salto sono **RISERVATI alla piattaforma** e non ti arrivano mai. Il modello di interazione è **dichiarativo**:

- Il progetto **DICHIARA** gli oggetti interagibili in `SceneAPI.interactables[]` (§5.3).
- La piattaforma gestisce prossimità + raycast + grilletto, e **chiama la `onActivate`** dell'interagibile quando il giocatore preme il grilletto **puntandolo**.
- Tu **non** ascolti `selectstart` per i tuoi interagibili: lo fa la piattaforma e ti consegna l'attivazione già risolta.

```ts
interface InputInfo {
  // segnali "alti" che NON collidono con locomozione/teleport (es. il "menu button")
  onButton(button: 'menu'|'primary'|'secondary', cb: (ev)=>void): () => void; // ritorna unsubscribe
  // raycast comodo dai controller verso i tuoi oggetti (sola lettura) — opzionale
  raycastFromController?(hand:'left'|'right'): THREE.Intersection[]; // [DA COSTRUIRE, opzionale]
}
```

**Riservati alla piattaforma (NON li ricevi):** grip/squeeze (teleport), stick sinistro (locomozione), stick destro (snap-turn), tasto salto. Il **pulsante "menu"** è quello che apre/chiude la UI (§7): di default lo gestisce la piattaforma. Se ti serve un raycast custom **oltre** gli interagibili dichiarati, usa `ctx.input.raycastFromController()` — **[DA COSTRUIRE, opzionale]**. Non c'è alcun accesso ai raw WebXR controller events.

### 6.7 `ctx.settings` — valori dell'editor ridotto

**[DA COSTRUIRE]**. Contiene i valori dei `settings[]` dichiarati nel manifest (§10), popolati al passo `loadManifest` (§4.1) dai default + dal record del progetto, e modificabili dal creatore nell'editor ridotto.

```js
// se nel manifest hai settings: [{ key: "birdCount", type:"int", default: 12 }]
const n = ctx.settings.birdCount ?? 12;   // leggi SEMPRE con fallback
```

Leggili in `createScene` per parametrizzare la costruzione. Se cambiano a runtime, il comportamento di default è `dispose()` + rilancio di `createScene()` con i nuovi valori (§4.5); opzionalmente un evento `settings:changed` (§6.9). Gestisci entrambi difensivamente.

### 6.8 `ctx.ui` — controller del menu spaziale — **[DA COSTRUIRE — Fase 2]**

**[DA COSTRUIRE — Fase 2]** (vedi §7). **Oggi NON esiste**: un progetto che chiama `ctx.ui.open()` **fallisce** (`ctx.ui` è `undefined`). Per la UI che funziona oggi usa il fallback §7.5. Contratto target (Fase 2):

```ts
interface UIController {
  open(pageId?: string): void;   // apre il menu (su una pagina specifica)
  close(): void;
  toggle(): void;
  setPage(spec: UIPage): void;   // aggiorna i contenuti di una pagina a runtime
  on(event:'open'|'close'|'select', cb:(ev)=>void): ()=>void;
}
```

### 6.9 `ctx.events` — eventi

**[DA COSTRUIRE]**. Bus per eventi di ciclo di vita / piattaforma.

```ts
interface EventBus {
  on(name: 'entervr'|'exitvr'|'settings:changed'|'dispose', cb:(payload)=>void): ()=>void;
  emit(name: string, payload?: any): void; // solo eventi nel namespace del tuo progetto
}
```

### 6.10 `ctx.env` — ambiente (Mare / luci) — **[DA COSTRUIRE — Fase 2]**

**[ESISTE OGGI]** la capacità: preset "Sea" (mesh `Water` animata), luci `ambientLight`+`dirLight`, tone mapping, fog. **[DA COSTRUIRE — Fase 2]** l'esposizione controllata ai progetti custom (l'API on-demand per accendere acqua/luci dal progetto). **Oggi `ctx.env` NON esiste**: un progetto che lo chiama fallisce se non lo protegge con `if (ctx.env)`. Contratto target:

```ts
interface EnvController {
  enableSea(params?: SeaParams): void;  // [capacità ESISTE: setSeaEnvironment(true)]
  setLighting(preset: 'sunny'|'overcast'|'dusk' | LightingObj): void; // [capacità ESISTE: applyLighting]
  // NON puoi aggiungere luci arbitrarie pesanti; usa i preset.
}
```

> **Quando ci sarà, preferisci l'ambiente della piattaforma.** Se ti basta un mare e una luce diurna, chiamali da `ctx.env` invece di costruirli: saranno già ottimizzati e coerenti col tone mapping ACES. Finché `ctx.env` è Fase 2, costruisci tu un cielo/luce minimi nel tuo `root` (o non aggiungerne, sfruttando le luci che la piattaforma già illumina la scena con).

### 6.11 Tabella riassuntiva `ctx`

| Campo | Stato esposizione | Capacità sottostante nel codice |
|---|---|---|
| `THREE` | [DA COSTRUIRE] iniezione | importmap `three@0.165.0` [ESISTE] |
| `loader` | [DA COSTRUIRE] wrapper | `new GLTFLoader()` no Meshopt/Draco/KTX2 [ESISTE] |
| `assets` | [DA COSTRUIRE] resolver | `ASSET_BASE` in `loadAppConfig()` [ESISTE] |
| `time` | [DA COSTRUIRE] (mirror di `update`) | `delta` nel loop `animate()` [ESISTE] |
| `avatar` | [DA COSTRUIRE] espos. sola lettura | `playerWorld()`, `renderer.xr.isPresenting` [ESISTE] |
| `input` | [DA COSTRUIRE] API filtrata | `getController`, `selectstart`, gamepad buttons [ESISTE] |
| `settings` | **[DA COSTRUIRE]** | nuovo (guidato dal manifest) |
| `ui` | **[DA COSTRUIRE — Fase 2]** | menu unico spaziale non esiste oggi |
| `env` | **[DA COSTRUIRE — Fase 2]** | `setSeaEnvironment`, `applyLighting` [ESISTE] |
| `events` | **[DA COSTRUIRE]** | nuovo |
| `log` | [DA COSTRUIRE] | wrapper su `console` |

---

## 7. UI in VR (requisito del committente)

### 7.1 Stato reale, senza finzioni

**[ESISTE OGGI]** dal report `interactables-ui`: esistono pannelli 3D specifici (quest tablet sul controller sinistro, pannello livelli, pannello quiz) realizzati con `CanvasTexture`/`CSS3D`. **MANCA** un **menu principale unico in VR**: il report lo dice esplicitamente ("Menu principale in VR — niente UI 3D di avvio. Deve essere un pannello 3D davanti alla camera, creato al primo selectstart").

Quindi il "menu spaziale unico, di default chiuso, aperto da un pulsante" richiesto dal committente è **[DA COSTRUIRE LATO PIATTAFORMA — Fase 2]**. **`ctx.ui`, `UISpec` e tutto il modello dichiarativo della UI NON esistono oggi: un progetto che li usa fallisce.** Questo SDK ne definisce il **contratto target** così che, quando la piattaforma lo costruirà, i progetti custom funzionino senza modifiche. Per costruire UI **che funziona oggi**, vedi §7.5.

### 7.2 Comportamento prescritto (OBIETTIVO — Fase 2)

- **Default CHIUSO.** All'avvio del progetto la UI non è visibile.
- **Apertura con UN pulsante del controller** (il "menu button"). Apre **UN UNICO** menu spaziale. Nessun proliferare di finestre.
- **Il progetto DICHIARA i contenuti** (titolo, pagine, voci, testi). **La piattaforma li spazializza**: crea il pannello 3D, lo posiziona, gestisce raycast del puntatore, apertura/chiusura, navigazione tra pagine.
- **L'editor ridotto regola la UI da visore**: posizione (es. ancorata al polso / flottante davanti), scala, e **quale pulsante** la apre. Questi sono `settings` del manifest con `capability: "vrUi"` (§10).

Questo resta l'**obiettivo** verso cui scrivi la `UISpec`. Non è attivo finché la Fase 2 non è implementata.

### 7.3 Come il progetto dichiarerà la UI — `UISpec` (Fase 2)

```ts
interface UISpec {
  title: string;
  pages: UIPage[];          // 1..N pagine
  openButton?: 'menu'|'primary'|'secondary'; // default 'menu' (sovrascrivibile dall'editor)
}

interface UIPage {
  id: string;
  title: string;
  body?: string;            // testo (multilinea ok)
  items?: UIItem[];         // voci interattive (bottoni)
}

interface UIItem {
  id: string;
  label: string;
  onSelect: () => void;     // callback quando il giocatore seleziona la voce (raycast+grilletto)
}
```

Esempio (Fase 2, dichiarativo — **oggi non si renderizza**):
```js
const ui = {
  title: 'Voliera',
  openButton: 'menu',
  pages: [
    { id: 'home', title: 'Benvenuto',
      body: 'Premi il pulsante menu per aprire/chiudere.\nGuarda gli uccellini volare.',
      items: [
        { id: 'more',  label: 'Più uccellini', onSelect: () => spawnBirds(4) },
        { id: 'about', label: 'Info',          onSelect: () => ctx.ui.open('info') },
      ] },
    { id: 'info', title: 'Info',
      body: 'Progetto demo dello SDK MetaReality.' },
  ],
};
```

### 7.4 Cosa farà il progetto vs cosa farà la piattaforma (Fase 2)

| Responsabilità | Chi |
|---|---|
| Definire titolo/pagine/voci/testi | **Progetto** (dato dichiarativo) |
| Reagire alla selezione di una voce (`onSelect`) | **Progetto** (callback) |
| Disegnare il pannello 3D (CanvasTexture/mesh) | **Piattaforma** [DA COSTRUIRE — Fase 2] |
| Posizionare/scalare il pannello | **Piattaforma** (guidata dai settings dell'editor) [DA COSTRUIRE — Fase 2] |
| Aprire/chiudere col pulsante | **Piattaforma** [DA COSTRUIRE — Fase 2] |
| Raycast del puntatore + hit test sulle voci | **Piattaforma** [DA COSTRUIRE — Fase 2] (riusa raycast controller [ESISTE]) |

> **In Fase 2 tu non disegni pixel.** Dai struttura e testo. Per la v1.0, attieniti al fallback §7.5.

### 7.5 UI che FUNZIONA OGGI — pannello `CanvasTexture` costruito dal progetto (workaround)

Finché `ctx.ui` non esiste, **costruisci tu** il pannello dentro il **tuo** `root`. Il gancio è la `onActivate` di un interagibile (§5.3): la piattaforma la chiama, e lì dentro mostri/nascondi un pannello che hai creato con `THREE.CanvasTexture` + una `Mesh` (o `Sprite`). È più verboso del modello dichiarativo, ma è **reale e testabile oggi** (nell'harness e, una volta che il runtime carica il bundle, ospitato).

Snippet minimo — un pannello toggle:

```js
// Costruisce un pannello di testo come Mesh con CanvasTexture, dentro root.
function makePanel(THREE, text) {
  const canvas = document.createElement('canvas');  // canvas OFFSCREEN per texture, NON nel DOM
  canvas.width = 512; canvas.height = 256;
  const g = canvas.getContext('2d');
  g.fillStyle = '#10141c'; g.fillRect(0, 0, canvas.width, canvas.height);
  g.fillStyle = '#e8edf2'; g.font = '28px sans-serif';
  text.split('\n').forEach((line, i) => g.fillText(line, 24, 56 + i * 40));

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), mat);
  mesh.position.set(0, 1.6, -2.2);   // davanti al punto d'ingresso
  mesh.visible = false;              // DEFAULT CHIUSO (come da requisito)
  mesh._tex = tex; mesh._mat = mat;  // riferimenti per dispose
  return mesh;
}

const panel = makePanel(THREE, 'Voliera\nBenvenuto!\nRiavvicinati al totem per chiudere.');
root.add(panel);   // vive nel TUO gruppo, non in scene

const interactables = [{
  id: 'totem', position: [0, 1.4, -4], text: 'Apri/chiudi il pannello', radius: 3,
  onActivate: () => { panel.visible = !panel.visible; }   // toggle: è il "menu" di oggi
}];

// in dispose():
function dispose() { panel._tex.dispose(); panel._mat.dispose(); panel.geometry.dispose(); }
```

> Nota: il `canvas` è **offscreen** (usato solo come sorgente per la texture), **non** viene appeso al DOM (§3.3 vieta overlay DOM, non l'uso di un canvas come texture). Quando arriverà `ctx.ui` (Fase 2), potrai migrare a `UISpec` e cancellare questo workaround. Se vuoi voci cliccabili in VR oggi, usa `ctx.input.raycastFromController()` (quando disponibile) o più semplicemente più interagibili dichiarati, uno per "voce".

---

## 8. Animazioni e aspetto

### 8.1 Clip GLB e mixer

**[ESISTE OGGI]:** la piattaforma crea un `AnimationMixer` per ogni GLB caricato **con i suoi loader nativi**, e ne fa autoplay della clip[0] in `LoopRepeat`, aggiornando `mixer.update(delta)` ogni frame (report `assets-anim-env`).

Per i **tuoi** modelli custom (caricati via `ctx.loader`) hai due strade:

**A) Mixer gestito da te** (consigliato per controllo pieno):
```js
const gltf = await ctx.loader.load(ctx.assets.url('models/uccello.glb'));
root.add(gltf.scene);
const mixer = new THREE.AnimationMixer(gltf.scene);
const action = mixer.clipAction(gltf.animations[0]);
action.play();
// nel loop:
function update(dt) { mixer.update(dt); }   // dt è la fonte di verità (§4.4)
```

**B) Animazione procedurale** (per sciami/uccellini): nessuna clip, muovi i transform in `update(dt)` (vedi §14 — gli uccellini volano con seno/coseno e instancing).

> **Regola:** se crei un mixer, **devi** chiamarne `mixer.update(dt)` nel tuo `update`. La piattaforma aggiorna automaticamente solo i mixer dei modelli nativi, non i tuoi.

### 8.2 Guidare animazioni dagli interagibili

```js
const interactables = [{
  id: 'play', position: [0,1,-2], text: 'Fai volare',
  onActivate: () => { action.reset(); action.play(); }
}];
```

### 8.3 Materiali e aspetto

**[ESISTE OGGI]:** tone mapping ACES `exposure 1.2`, shadow map PCF soft, `fixTransparentMaterials` (vetro→trasparente) sui modelli **nativi**. Per i tuoi modelli:
- Imposta `castShadow/receiveShadow` tu stesso se vuoi ombre:
  ```js
  gltf.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  ```
- Usa materiali standard (`MeshStandardMaterial`) coerenti con ACES; evita emissive accecanti.
- Condividi materiali tra istanze (budget §3.5).

### 8.4 Cosa porta il progetto vs cosa fornisce la piattaforma

| Aspetto | Progetto custom | Piattaforma [ESISTE OGGI] |
|---|---|---|
| Modelli/geometrie | li porti e li carichi | engine di rendering, shadow map |
| Animazioni clip | nel GLB; mixer **tuo** in `update` | mixer **automatico** solo per modelli nativi |
| Animazioni procedurali | tutta tua in `update(dt)` | il `dt` del loop |
| Acqua "Mare" | parametri opzionali via `ctx.env.enableSea` [Fase 2] | mesh `Water` animata, normals da CDN |
| Luci/cielo | preferisci `ctx.env.setLighting` [Fase 2] | `ambientLight`+`dirLight`, tone mapping, fog |
| Trasparenza vetro | applicala tu se serve | `fixTransparentMaterials` (solo modelli nativi) |
| Bloom/post-processing | **niente** | nessun bloom; OutlinePass solo in editor |

---

## 9. Camminabilità e spawn

Riusi **interamente** avatar, locomozione, gravità, teleport, wall-collision della piattaforma (report `avatar-locomotion`). Tu **dichiari** solo due cose: cosa è solido e dove si entra.

### 9.1 Geometria solida/camminabile

**[ESISTE OGGI]:** la piattaforma trasforma un `Object3D` in collider con `toggleCollider(root)`, che traversa e popola `collidableMeshes`; su quelle mesh fa raycast verso il basso (pavimento) e in avanti (muri). Il `scene-config` nativo lo dichiara come `colliders: ["NomeModello", ...]`.

Per un progetto custom, dichiari i collider nella tua `SceneAPI`:

```ts
interface SceneAPI {
  // ...campi visti in §5...
  colliders?: THREE.Object3D[]; // [DA COSTRUIRE: la piattaforma chiama toggleCollider su ciascuno]
}
```

```js
const ground = gltf.scene.getObjectByName('Terreno');
return { root, update, interactables, colliders: [ground] };
```

> Senza almeno un collider, il giocatore **cade** (niente pavimento). Per il test minimo, marca come collider il tuo piano/terreno.

### 9.2 Punto d'ingresso (spawn)

**[ESISTE OGGI]:** entrance `{ pos:[x,y,z], yaw, radius, id }`; `applySpawn()` mette il giocatore lì. Dichiarale così:

```ts
interface SceneAPI {
  // ...
  entrances?: Array<{ position:[number,number,number]; yaw?:number; radius?:number }>;
}
```

```js
return { root, /* ... */, colliders:[ground],
         entrances: [{ position: [0, 0, 0], yaw: 0, radius: 1.5 }] };
```

**[DA COSTRUIRE]:** la piattaforma, dopo `createScene`, registra questi collider/entrances chiamando le sue funzioni esistenti (`toggleCollider`, `addEntrance` + `applySpawn`). Se non dichiari entrance, usa il fallback `defaultSceneSpawn()` (centro scena, raycast pavimento) [ESISTE OGGI].

> Spawn e teleport restano **dichiarativi**: è così che muovi il giocatore senza toccare la camera (§2).

---

## 10. Struttura della cartella/bundle e formato del MANIFEST

### 10.1 Albero file del progetto

```
mio-progetto/
├── project.json          # MANIFEST (obbligatorio) — vedi §10.2
├── entry.js              # modulo entry con export createScene(ctx)
├── models/               # i tuoi GLB (standard, NON compressi — §3.5)
│   └── uccello.glb
├── textures/             # opzionale
├── lib/                  # opzionale: tuoi moduli JS (NON un secondo three!)
└── cover.png             # opzionale: copertina mostrata in piattaforma
```

Quando lo carichi in piattaforma, zippi questa cartella (vedi §13). Il loader server salva lo zip sotto `<assetPrefix>/custom-bundle.zip` e segna `type:"custom"` (report `project-lifecycle` §6) — **[DA COSTRUIRE]** la rotta di upload.

### 10.2 Formato del MANIFEST `project.json`

```jsonc
{
  "name": "Voliera Demo",          // nome mostrato in piattaforma
  "version": "1.0.0",              // versione del TUO progetto (semver)
  "sdkVersion": "1.0.0",           // versione SDK richiesta (vedi §16)
  "entry": "entry.js",             // path relativo del modulo entry
  "type": "custom",                // sempre "custom"

  "assets": {                      // dichiarazione asset (per validazione/preload)
    "models": ["models/uccello.glb"]
  },

  "capabilities": [                // white-list per la REVISIONE (vedi §10.3) — NON un gate runtime
    "scene", "update", "interactables", "ui", "colliders", "entrances"
    // valori ammessi: scene|update|interactables|ui|colliders|entrances|env|input|avatarRead
  ],

  "settings": [                    // GUIDANO l'editor ridotto (§13). Ogni voce genera un controllo.
    {
      "key": "birdCount",
      "type": "int",               // int | float | bool | color | string | select
      "label": "Numero di uccellini",
      "default": 12,
      "min": 1, "max": 60          // per int/float
    },
    {
      "key": "speed",
      "type": "float",
      "label": "Velocità di volo",
      "default": 1.0,
      "min": 0.1, "max": 3.0
    },
    {
      "key": "vrUiButton",
      "type": "select",
      "label": "Pulsante apertura menu (VR)",
      "default": "menu",
      "options": ["menu", "primary", "secondary"],
      "capability": "vrUi"         // marca i setting che pilotano la UI da visore
    }
  ]
}
```

**Semantica dei campi `settings[]`** (ognuno produce un controllo nell'editor ridotto e finisce in `ctx.settings[key]`):

| Campo | Obbl. | Significato |
|---|:---:|---|
| `key` | Sì | chiave letta da `ctx.settings[key]` |
| `type` | Sì | `int`/`float`/`bool`/`color`/`string`/`select` |
| `label` | Sì | etichetta nell'editor |
| `default` | Sì | valore iniziale (e fallback se assente) |
| `min`/`max` | per numerici | range dello slider |
| `options` | per `select` | valori ammessi |
| `capability` | No | se `"vrUi"`, l'editor lo raggruppa sotto "UI da visore" |

### 10.3 `capabilities[]` — white-list per la REVISIONE, non un gate runtime

**`capabilities[]` dichiara cosa il progetto usa, e serve alla REVISIONE umana (§11), NON come gate a runtime.** Onestà sul suo ruolo reale:

- **Non è una security boundary a runtime.** Il runtime **non** disabilita parti di `ctx` in base alle capability dichiarate: se il progetto chiede `ctx.avatar`, lo riceve, abbia o no dichiarato `avatarRead`. Non c'è grant/denial dinamico.
- **È una white-list per il revisore.** In revisione (§11.3) il revisore controlla la **coerenza**: il progetto **non deve dichiarare capability che non usa** (es. dichiara `colliders` ma non ritorna mai `colliders`, o dichiara `env` ma non tocca `ctx.env`) e **non deve usare** capacità non dichiarate. Serve a spottare refactoring incompiuti e a documentare l'intento. Un progetto che dichiara solo `["scene","update","ui"]` e poi ritorna `colliders` è considerato **malformato** (incoerente) e va corretto, ma non è il runtime a bloccarlo: è il revisore.

---

## 11. Sicurezza / trust model

### 11.1 Modello di fiducia: INTERNO / creatori fidati

**Questo è un sistema interno, pragmatico, urgente.** Il trust model è **interno**: i progetti custom sono scritti da **creatori fidati** (il team, non il pubblico ostile). Di conseguenza:

- **NON è una sandbox a prova di avversario.** Non c'è isolamento da web-worker, né CSP che neutralizza ogni `eval`, né capability-system rinforzato a runtime. Costruirlo non è l'obiettivo di questa fase. (Questo è coerente con §2.1: la camera è protetta da "contratto che non la espone + revisione umana", non da un sandbox tecnico.)
- **La superficie è limitata per design.** Gli script dei progetti fanno **cose semplici**: pulsanti che gestiscono fasi e animazioni, sciami che si muovono, menu che si aprono. Niente operazioni complicate, niente accesso a dati di altri utenti, niente persistenza arbitraria.
- **Revisione prima del publish.** Ogni bundle viene **letto da un umano** prima di passare a `status: "published"`. La review verifica che il codice rispetti il contratto (vedi checklist §11.3). Finché è `draft`, è visibile solo agli autenticati ([ESISTE OGGI]: `if (p.status !== 'published' && !isAuthed) → 403`).

> In sintesi: ci si fida del creatore, ma si **legge** quello che ha scritto prima di pubblicarlo. È la barriera di sicurezza principale, ed è sufficiente per un sistema interno.

### 11.2 Cosa è VIETATO al progetto

Anche tra creatori fidati, queste cose sono **vietate** (la review le respinge; dove possibile, il `ctx` non le espone nemmeno):

1. **Toccare la camera / il rig.** Niente `camera.*`, niente `playerRig.*`, niente `OrbitControls`, niente spostare/ruotare il giocatore da codice. Spawn/teleport solo dichiarativi (§9). — *La sicurezza VR dipende da questo (§2).*
2. **Toccare renderer / sessione XR.** Niente `renderer.*`, `setAnimationLoop`, `requestSession`, `xr.setSession`.
3. **Importare un secondo Three.js** o addon da CDN (§3.1–3.2).
4. **DOM escape / overlay.** Niente `document.body.appendChild`, niente `<iframe>`, niente UI HTML flottante. La UI è dichiarativa (§7) o costruita come 3D nel tuo gruppo (§7.5). *(Un `canvas` offscreen usato solo come sorgente di `CanvasTexture` è ammesso: non viene appeso al DOM.)*
5. **Network arbitrario.** Niente `fetch`/`XMLHttpRequest`/`WebSocket` verso domini esterni. Gli asset si caricano **solo** via `ctx.loader`/`ctx.assets` (che restano nel dominio della piattaforma). Niente telemetria, niente chiamate a terze parti.
6. **Listener globali.** Niente `window.addEventListener(...)` (collisione con la piattaforma). Usa `ctx.input`/`ctx.events`.
7. **Globali / `window.*`.** Niente inquinamento del global scope; stato nella closure (§3.4).
8. **API pericolose del browser.** Niente `eval`/`new Function` su input esterni, niente `localStorage` fuori dal namespace del progetto, niente accesso a fotocamera/microfono/geolocalizzazione/clipboard.
9. **Loop bloccanti / risorse infinite.** Niente while infiniti, niente allocazioni illimitate; rispetta il frame budget (§3.5).

### 11.3 Checklist di revisione (per chi pubblica)

Prima del publish, il revisore verifica che il bundle:
- [ ] esporti `createScene(ctx)` e ritorni un `SceneAPI` valido;
- [ ] non contenga `camera`, `renderer`, `playerRig`, `setAnimationLoop`, `requestSession`, `OrbitControls`;
- [ ] non importi `three` (usa solo `ctx.THREE`);
- [ ] non contenga `fetch`/`WebSocket`/`window.addEventListener`/`eval`/`new Function` (un `canvas` offscreen per `CanvasTexture` è ok; vietato `appendChild` di overlay nel DOM);
- [ ] **ogni `.glb` è non compresso** (verifica caricandolo su un glTF viewer online — es. gltf-viewer.donmccurdy.com — **senza** decoder Draco/Meshopt/KTX2: se carica correttamente lì, è non compresso; se serve un decoder, va decompresso prima — §3.5);
- [ ] dichiari coerentemente `capabilities` e `settings` nel manifest (nessuna capability dichiarata-ma-non-usata o usata-ma-non-dichiarata, §10.3);
- [ ] `sdkVersion` compatibile col runtime (major ≤ runtime, §16);
- [ ] carichi asset solo via `ctx.assets`/`ctx.loader`;
- [ ] abbia un `dispose()` che libera le risorse (geometrie/materiali/texture/timer).

---

## 12. Harness di sviluppo locale

### 12.1 Scopo — **[DA COSTRUIRE — è il deliverable principale dello SDK v1.0]**

> **Niente di questa sezione esiste ancora.** L'harness è **il deliverable principale dello SDK v1.0**: il runtime locale che implementa `ctx` **esattamente** come lo implementerà la piattaforma ospitante, così che il progetto giri in locale **identico** a come girerà ospitato. È il modo in cui sviluppi e testi senza dover caricare ogni volta in piattaforma. **Non è scaricabile oggi**: questa sezione descrive *cosa fornirà*, non qualcosa che puoi usare adesso. (Senza l'harness — e senza il runtime ospitato, anch'esso da costruire — non hai ancora alcun modo di *eseguire* un progetto custom: lo scrivi contro il contratto e lo verifichi quando l'harness sarà pronto.)

### 12.2 Cosa fornirà

L'harness fornirà un `ctx` reale con:
- `ctx.THREE` = Three.js `0.165.0` (stessa versione [ESISTE OGGI]);
- un `WebGLRenderer` + camera + `setAnimationLoop` **propri dell'harness** (che tu **non** vedi: sono dietro il contratto, esattamente come in piattaforma — §2.1);
- locomozione desktop minima (WASD + mouse look) per camminare nella scena;
- una **emulazione VR**: ingresso WebXR se hai un visore/emulatore, altrimenti tasti per simulare `onEnterVR/onExitVR`, `isPresentingVR` e il "menu button";
- `ctx.loader`/`ctx.assets` che risolvono i path **relativi alla tua cartella** (server statico locale);
- l'applicazione dei `settings` del manifest con un pannellino locale per modificarli live (emula l'editor ridotto, incluso il rilancio `dispose()`+`createScene()` di §4.5);
- **(Fase 2, quando esisterà `ctx.ui`)** un render minimale del menu spaziale (§7) per vedere la tua `UISpec` come pannello 3D. Finché non c'è, sviluppi la UI col fallback §7.5;
- **tipi TypeScript opzionali (`.d.ts`)** per `ctx` e `SceneAPI`, così l'IDE suggerisce l'API corretta e segnala i typo (es. `ctx.ui.oepen()`) prima del runtime. I tipi sono **informativi, non coercitivi**: il bundle resta JavaScript ES module (se scrivi in TypeScript, compila a `.js` prima di caricare — il loader attende `.js`, non `.ts`).

### 12.3 Struttura e comando (target)

```
mr-sdk/
├── harness/
│   ├── index.html        # carica il tuo entry.js e costruisce ctx
│   ├── harness.mjs       # implementazione di ctx (THREE, loader, ui, input, ...)
│   └── types/            # opzionale: ctx.d.ts, scene-api.d.ts per autocompletamento
└── projects/
    └── mio-progetto/     # il TUO progetto (project.json, entry.js, models/)
```

Comando di avvio previsto (server statico + apertura harness puntato al tuo progetto):

```bash
# dalla cartella mr-sdk/ (QUANDO l'harness sarà disponibile)
npx serve .          # serve i file statici (niente build step: tutto ES module)
# poi apri:  http://localhost:3000/harness/?project=mio-progetto
```

> Nessun bundler richiesto: tutto è ES module nativo, come la piattaforma. Se importi un tuo helper da `lib/`, usa import relativi (`./lib/util.js`).

### 12.4 Parità con la piattaforma

L'harness e la piattaforma condivideranno **lo stesso contratto `ctx`** e la stessa versione di Three.js. Regola d'oro: **se gira nell'harness, gira ospitato.** Le differenze ammesse sono solo cosmetiche (qualità del rendering del menu, fedeltà dell'emulazione VR). Se qualcosa funziona nell'harness ma non in piattaforma (o viceversa), è un bug dell'SDK da segnalare, non un comportamento da assecondare con hack.

---

## 13. Caricamento in piattaforma

### 13.1 Flusso end-to-end

Tutti i punti d'innesto qui sotto poggiano su infrastruttura **[ESISTE OGGI]** (report `project-lifecycle`); le parti nuove sono marcate **[DA COSTRUIRE]**.

1. **Crea il progetto** dall'admin → `POST /api/projects` con `{ name }` **[ESISTE OGGI]**. Nasce `status:"draft"`.
2. **Zippa** la tua cartella (`project.json` in root dello zip, `entry.js`, `models/`, ...).
3. **"Carica progetto"** → `POST /api/projects/:slug/upload-custom` (multipart, campo `bundle`, `.zip`) **[DA COSTRUIRE]**. Il server salva lo zip in `<assetPrefix>/custom-bundle.zip` e marca `type:"custom"`, `customBundle:"/api/asset/<key>"`. (Il limite multer è 200 MB/file [ESISTE OGGI]; per bundle più grandi servirà chunking — vedi §15.)
4. **Compare tra i progetti** in admin, con badge "Custom" **[DA COSTRUIRE]** (`type` nel summary del record **[DA COSTRUIRE]**), accanto ai nativi.
5. **Apri nel viewer** `/?project=<slug>&edit` → `loadAppConfig()` riconosce `type:"custom"` e chiama `loadCustomProjectBundle(...)` **[DA COSTRUIRE]**: scarica lo zip (JSZip [ESISTE OGGI come dipendenza]), esegue **loadManifest** (parse `project.json`, valida `sdkVersion`, popola `ctx.settings` — §4.1), importa l'entry come ES module, costruisce `ctx`, chiama `createScene(ctx)`.
6. **Editor RIDOTTO** (guidato dal manifest) **[DA COSTRUIRE]**: invece dell'editor completo (gizmo, posizionamento modelli), per i progetti custom mostra solo:
   - **Punto d'entrata / qualità**: niente da posizionare; eventualmente preset qualità.
   - **UI da visore**: i `settings` con `capability:"vrUi"` (posizione/scala/quale pulsante).
   - **Settings del progetto**: tutti gli altri `settings[]` del manifest, come controlli (slider/checkbox/select).
   I valori vengono salvati nel `sceneConfig` del record (`PUT /api/projects/:slug` [ESISTE OGGI]) sotto una chiave dedicata, es. `sceneConfig.customSettings`, e riletti in `ctx.settings` (§6.7). Cambiare un valore live → `dispose()`+`createScene()` (§4.5). Per i custom, `saveSceneToServer()` **non** chiama `buildSceneConfigObject()` (logica nativa) **[DA COSTRUIRE]**.
7. **Publish**: bottone admin che fa `PUT` con `status:"published"` **[ESISTE OGGI]**, **dopo la revisione manuale** (§11). Da quel momento il progetto è pubblico.
8. **Download**: lo `/api/projects/:slug/download` include `custom-bundle.zip` per i progetti custom **[DA COSTRUIRE]** (estensione del download ZIP [ESISTE OGGI]).

### 13.2 Punti d'innesto reali (riepilogo dai report)

| Punto | File reale | Stato |
|---|---|---|
| Record progetto + `type` | `server/store.js` `createProject/saveProject/summary` | estendere [DA COSTRUIRE] |
| Upload bundle custom | `server/index.js` nuova rotta `/upload-custom` | [DA COSTRUIRE] su pattern multer [ESISTE] |
| loadManifest + caricamento runtime | `viewer/index.html` `loadAppConfig()` → `loadCustomProjectBundle()` | [DA COSTRUIRE] |
| Asset base | `viewer/index.html` `ASSET_BASE` | [ESISTE OGGI] |
| Persistenza settings editor | `PUT /api/projects/:slug` `sceneConfig.customSettings` | [ESISTE OGGI] (nuova chiave) |
| Publish | `admin.html` bottone "pub" + `status` | [ESISTE OGGI] |
| Storage | R2/S3 `<assetPrefix>/...` | [ESISTE OGGI] |

---

## 14. ESEMPIO MINIMO COMPLETO E COPIA-INCOLLABILE — "Voliera"

Progetto minimo **che funziona oggi** (niente `ctx.ui`, niente `ctx.env`): un terreno camminabile, **uccellini che volano** (instanced, animazione procedurale), **un interagibile** che apre/chiude un **pannello `CanvasTexture` costruito dal progetto stesso** (§7.5), **2 settings** nel manifest. Pensato per essere il tuo **primo test reale** in una nuova sessione: copia, adatta, carica. Sotto, una variante **Fase 2** che mostra la stessa cosa in forma dichiarativa con `ctx.ui` (quando esisterà).

### 14.1 `project.json`

```json
{
  "name": "Voliera Demo",
  "version": "1.0.0",
  "sdkVersion": "1.0.0",
  "entry": "entry.js",
  "type": "custom",
  "assets": { "models": [] },
  "capabilities": ["scene", "update", "interactables", "colliders", "entrances", "avatarRead"],
  "settings": [
    { "key": "birdCount", "type": "int",   "label": "Numero di uccellini", "default": 16, "min": 1, "max": 80 },
    { "key": "speed",     "type": "float", "label": "Velocità di volo",    "default": 1.0, "min": 0.2, "max": 3.0 }
  ]
}
```

> Nota: niente `"ui"` né `"env"` tra le `capabilities`, perché questo esempio **non** li usa (coerenza §10.3). Aggiungili solo nella variante Fase 2.

### 14.2 `entry.js` (FUNZIONA OGGI)

```js
// entry.js — Voliera Demo (SDK MetaReality 1.0) — versione FUNZIONA-OGGI
// Contratto: export createScene(ctx) -> { root, update, interactables, colliders, entrances, dispose }
// Nessun import di three (usiamo ctx.THREE). Nessun ctx.ui / ctx.env (non esistono ancora).
// Il "menu" è un pannello CanvasTexture costruito dal progetto e aperto da un interagibile (§7.5).

export function createScene(ctx) {
  const THREE = ctx.THREE;
  const settings = ctx.settings || {};
  const BIRD_COUNT = Math.max(1, Math.min(80, settings.birdCount ?? 16));
  const SPEED      = settings.speed ?? 1.0;

  const root = new THREE.Group();
  root.name = 'voliera';

  // ---------- (A) Terreno camminabile (collider + spawn) ----------
  // Un disco semplice: serve come pavimento per non cadere. È il nostro collider.
  const groundGeo = new THREE.CircleGeometry(30, 48);
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x355e3b, roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.name = 'Terreno';
  ground.rotation.x = -Math.PI / 2;     // orizzontale
  ground.position.y = 0.01;
  ground.receiveShadow = true;
  root.add(ground);

  // ---------- (B) Uccellini: InstancedMesh, animazione procedurale ----------
  const birdGeo = new THREE.ConeGeometry(0.12, 0.5, 6);
  birdGeo.rotateX(Math.PI / 2);          // punta in avanti
  const birdMat = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 });
  const birds = new THREE.InstancedMesh(birdGeo, birdMat, BIRD_COUNT);
  birds.name = 'uccellini';
  birds.castShadow = true;
  birds.frustumCulled = false;   // istanze sparse: la bounding-sphere base è all'origine → senza questo spariscono guardando altrove
  root.add(birds);

  // Parametri di volo per ogni uccellino (orbite a quote diverse).
  const flock = [];
  for (let i = 0; i < BIRD_COUNT; i++) {
    flock.push({
      radius: 4 + Math.random() * 14,
      height: 3 + Math.random() * 6,
      phase:  Math.random() * Math.PI * 2,
      omega:  (0.3 + Math.random() * 0.5),
      bob:    0.4 + Math.random() * 0.6,
      bobOmega: 1.5 + Math.random() * 1.5,
    });
  }

  // Oggetti riusati nel loop (NIENTE allocazioni per-frame).
  const _pos = new THREE.Vector3();
  const _next = new THREE.Vector3();
  const _up = new THREE.Vector3(0, 1, 0);
  const _m = new THREE.Matrix4();
  const _q = new THREE.Quaternion();
  const _scale = new THREE.Vector3(1, 1, 1);
  const _avatar = new THREE.Vector3();
  let t = 0;

  function placeBird(i, time, scatter) {
    const b = flock[i];
    const a = b.phase + time * b.omega * SPEED;
    const r = b.radius + scatter;
    _pos.set(Math.cos(a) * r, b.height + Math.sin(time * b.bobOmega + b.phase) * b.bob, Math.sin(a) * r);
    const a2 = a + 0.05;
    _next.set(Math.cos(a2) * r, _pos.y, Math.sin(a2) * r);
    _q.setFromRotationMatrix(_m.lookAt(_pos, _next, _up));
    _m.compose(_pos, _q, _scale);
    birds.setMatrixAt(i, _m);
  }

  // ---------- (C) Pannello "menu" costruito dal progetto (§7.5) ----------
  function makePanel(text) {
    const canvas = document.createElement('canvas'); // OFFSCREEN: solo sorgente texture, non nel DOM
    canvas.width = 512; canvas.height = 256;
    const g = canvas.getContext('2d');
    g.fillStyle = '#10141c'; g.fillRect(0, 0, canvas.width, canvas.height);
    g.fillStyle = '#e8edf2'; g.font = '26px sans-serif';
    text.split('\n').forEach((line, i) => g.fillText(line, 22, 52 + i * 38));
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true });
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.7), mat);
    mesh.position.set(0, 1.7, -3.4);
    mesh.visible = false;            // DEFAULT CHIUSO
    mesh._tex = tex; mesh._mat = mat;
    return mesh;
  }
  const panel = makePanel(
    'Voliera Demo\n' +
    'Avvicinati al centro: gli uccellini si allargano.\n' +
    'Tocca di nuovo il totem per chiudere.'
  );
  root.add(panel);

  // ---------- (D) update: muovi gli uccellini ogni frame ----------
  function update(dt /*, elapsed */) {
    t += dt;
    let scatter = 0;
    if (ctx.avatar) {                          // sola lettura (§6.5)
      ctx.avatar.getWorldPosition(_avatar);
      const distToCenter = Math.hypot(_avatar.x, _avatar.z);
      if (distToCenter < 6) scatter = (6 - distToCenter) * 0.6;
    }
    for (let i = 0; i < BIRD_COUNT; i++) placeBird(i, t, scatter);
    birds.instanceMatrix.needsUpdate = true;
  }

  // ---------- (E) Un interagibile che apre/chiude il pannello ----------
  const interactables = [
    {
      id: 'totem',
      position: [0, 1.4, -4],
      text: 'Apri/chiudi il pannello della voliera',
      radius: 3,
      visibility: 18,
      onActivate: () => { panel.visible = !panel.visible; },   // il "menu" di oggi
    },
  ];

  // ---------- (F) Spawn + collider ----------
  const entrances = [{ position: [0, 0, 10], yaw: 0, radius: 1.5 }]; // yaw 0 = guarda verso -Z (totem/uccellini)
  const colliders = [ground];

  // ---------- (G) Pulizia ----------
  function dispose() {
    birdGeo.dispose(); birdMat.dispose();
    groundGeo.dispose(); groundMat.dispose();
    panel._tex.dispose(); panel._mat.dispose(); panel.geometry.dispose();
  }

  return { root, update, interactables, entrances, colliders, dispose };
}
```

### 14.3 Variante Fase 2 (quando ci sarà `ctx.ui`)

Quando il menu spaziale dichiarativo esisterà (§7.2–7.3), la stessa esperienza si scrive **senza** costruire il pannello a mano: dichiari la UI e apri col callback. Aggiungeresti `"ui"` (ed eventualmente `"env"`) alle `capabilities` del manifest.

```js
// ---- DELTA rispetto alla versione di sopra (Fase 2) ----
// (A-bis) ambiente della piattaforma, se disponibile:
if (ctx.env) { try { ctx.env.setLighting('sunny'); ctx.env.enableSea(); } catch (e) {} }

// (C-bis) niente makePanel/panel: si dichiara la UI
const ui = {
  title: 'Voliera',
  openButton: (ctx.settings && ctx.settings.vrUiButton) || 'menu',
  pages: [
    { id: 'home', title: 'Benvenuto nella voliera',
      body: 'Premi il pulsante menu per aprire e chiudere.\nAvvicinati al centro: gli uccellini si allargano.',
      items: [
        { id: 'faster', label: 'Vola piu veloce', onSelect: () => { for (const b of flock) b.omega = Math.min(1.4, b.omega + 0.05); } },
        { id: 'info',   label: 'Info progetto',   onSelect: () => ctx.ui.open('info') },
      ] },
    { id: 'info', title: 'Info',
      body: 'Voliera Demo — esempio dello SDK Progetti Custom di MetaReality.',
      items: [ { id: 'back', label: 'Indietro', onSelect: () => ctx.ui.open('home') } ] },
  ],
};

// (E-bis) l'interagibile apre il menu invece di togglare il pannello:
//   onActivate: () => ctx.ui.open('home')

// (return) aggiungi ui:  return { root, update, interactables, ui, entrances, colliders, dispose };
```

> Questa variante **non gira oggi** (`ctx.ui`/`ctx.env` sono `[DA COSTRUIRE]`): è il bersaglio della migrazione. Per ora usa la versione 14.2.

### 14.4 Come testarlo

> L'esecuzione richiede l'harness (§12, **[DA COSTRUIRE]**) o il runtime ospitato (§13, **[DA COSTRUIRE]**). I passi seguenti valgono **quando** uno dei due sarà disponibile.

1. Metti `project.json` ed `entry.js` in `mr-sdk/projects/voliera/` (niente `models/` necessari: tutto procedurale).
2. `npx serve .` dalla cartella `mr-sdk/`, apri `http://localhost:3000/harness/?project=voliera`.
3. Cammina (WASD), avvicinati al centro: gli uccellini si allargano. Attiva il totem: si apre/chiude il pannello.
4. Cambia `birdCount`/`speed` nel pannellino settings dell'harness: vedi l'effetto (emula l'editor ridotto, `dispose()`+`createScene()`).
5. Zippa `voliera/`, caricala con "Carica progetto", aprila in `/?project=voliera&edit`, regola i settings, fai revisionare e **Publish**.

> Questo esempio è realistico e pronto da adattare: sostituisci il cono con un GLB di uccello **non compresso** caricato via `ctx.loader`, aggiungi clip di battito d'ali con un mixer (§8.1), e — in Fase 2 — migra il pannello a `ctx.ui`.

---

## 15. Tabella "Esiste oggi vs Da costruire"

| Capability | Esiste oggi | Da costruire lato piattaforma |
|---|:---:|:---:|
| `WebGLRenderer` condiviso (ACES, shadow) | ✅ | — |
| Camera figlia di `playerRig`, render loop | ✅ | — |
| WebXR/VR: sessione, controller, trigger, grip, teleport ad arco, salto, locomozione, snap-turn | ✅ | — |
| Avatar terza persona + follow-cam | ✅ | — |
| Collider dichiarativi (`toggleCollider`) + raycast pavimento/muri | ✅ | binding `SceneAPI.colliders` → toggle |
| Entrance/spawn dichiarativi (`applySpawn`) | ✅ | binding `SceneAPI.entrances` |
| `GLTFLoader` (no Draco/Meshopt/KTX2) | ✅ | wrapper `ctx.loader` a promessa |
| AnimationMixer (autoplay) per modelli nativi | ✅ | mixer custom gestiti **da te** in `update` |
| Ambiente Mare (`Water`) + luci/tone mapping/fog | ✅ | `ctx.env` controllato **(Fase 2)** |
| Interagibili nativi (`addInteractable`, prossimità, sprite VR) | ✅ | binding al callback `onActivate` |
| UI 3D via `CanvasTexture`/`Mesh` costruita dal progetto (§7.5) | ✅ (primitive Three) | — (workaround, nessun supporto extra) |
| Storage R2/S3, record progetto, upload, presigned URL, publish, download ZIP | ✅ | rotta `/upload-custom`, campo `type`, download custom |
| `ASSET_BASE` per progetto (presigned a livello di cartella) | ✅ | resolver `ctx.assets` |
| **Runtime: contratto `createScene(ctx)` + ciclo di vita + loadManifest** | ❌ | **da costruire** (host/loader — il "pezzo zero") |
| **`ctx` completo** (THREE, time, avatar-read, input filtrato, settings, ui, env, events) | parziale (capacità sì, esposizione no) | **da costruire** l'oggetto unificato |
| **Menu spaziale UNICO in VR** (`ctx.ui`/`UISpec`, default chiuso, 1 pulsante) | ❌ (esistono pannelli specifici) | **da costruire (Fase 2)** |
| **Editor RIDOTTO** guidato dal manifest (settings/UI visore/qualità) | ❌ | **da costruire** |
| **Harness locale** che implementa `ctx` (+ `.d.ts` opzionali) | ❌ | **da costruire** (deliverable principale SDK v1.0) |
| Sandbox a prova di avversario | ❌ | **fuori scope** (trust interno, §2.1/§11) |

---

## 16. Versioning e compatibilità

### 16.0 Check a load-time (RIFIUTO o OK)

**[DA COSTRUIRE]** Al passo `loadManifest` (§4.1) la piattaforma confronta `project.json.sdkVersion` con la versione di SDK del runtime, **prima** di costruire `ctx` o chiamare `createScene`:

- **Major del progetto > major del runtime** → il progetto è **RIFIUTATO**: non viene caricato (`ctx` incompatibile garantito). Messaggio: "aggiorna la piattaforma". Il publish è bloccato finché non si abbassa `sdkVersion` o si aggiorna il runtime.
- **Major uguale e minor del progetto ≤ minor del runtime** → **OK**, caricato (retro-compatibile per costruzione, §16.2).
- **Major uguale e minor del progetto > minor del runtime** → il progetto richiede campi `ctx` che il runtime potrebbe non avere: marcato "da aggiornare la piattaforma" e **publish bloccato** finché il runtime non raggiunge quella minor (oppure il progetto si abbassa). Non lo si carica con un `ctx` potenzialmente mancante.
- **Major del runtime > major del progetto** → la piattaforma offre un **livello di compatibilità** per quel major precedente; se non disponibile, marca il progetto "da migrare" e **rifiuta il publish** finché non è aggiornato. Non lo carica con un `ctx` incompatibile.

In breve: **major > runtime ⇒ rifiuto; major uguale e minor ≤ runtime ⇒ ok.**

### 16.1 `sdkVersion` nel manifest

Ogni progetto dichiara la versione di SDK contro cui è scritto (`"sdkVersion": "1.0.0"`, semver). La piattaforma espone la versione di SDK che implementa. La regola di compatibilità è quella del §16.0.

### 16.2 Regole per non rompere i progetti caricati

La piattaforma, evolvendo, si impegna a:
1. **Mai rimuovere campi di `ctx`** entro lo stesso major. Le aggiunte sono permesse (nuovi campi opzionali).
2. **Mai cambiare la firma** di `createScene(ctx)` né i campi obbligatori di `SceneAPI` (`root`) entro lo stesso major.
3. **Mai cambiare la versione di Three.js** entro lo stesso major (oggi `0.165.0`). Un upgrade di Three è un cambio **major** dell'SDK, perché può rompere geometrie/materiali/animazioni dei progetti.
4. **Deprecare prima di rimuovere**: un campo destinato a sparire viene marcato deprecato in una minor, loggato con warning via `ctx.log`, e rimosso solo alla major successiva.
5. **Default conservativi**: nuovi `capabilities`/`settings` hanno default che non alterano il comportamento dei progetti esistenti.

### 16.3 Cosa fai tu (progetto)

- Fissa `sdkVersion` e **non** assumere campi `ctx` non documentati per il tuo major.
- Leggi i `settings` con fallback (`?? default`): se un setting manca, il progetto deve comunque partire.
- Avvolgi in `try/catch` (o `if (ctx.env) {...}`) le chiamate a parti opzionali/Fase 2 di `ctx` (`ctx.env`, `ctx.ui`, `ctx.input.raycastFromController`) così un campo assente non blocca tutto.
- Mantieni `dispose()` corretto: i cambi di progetto/versione **e i cambi di settings (§4.5)** richiamano dispose, e una pulizia incompleta causa leak che si notano solo dopo molti caricamenti.

### 16.4 Tipi TypeScript (`.d.ts`) — deliverable opzionale

Come parte dell'harness (§12.2), lo SDK fornirà file `.d.ts` **opzionali** per `ctx` e `SceneAPI`. Sono **informativi, non coercitivi**: aiutano l'autocompletamento e a spottare i typo nell'IDE, ma il bundle resta JavaScript ES module. Se sviluppi in TypeScript, compila a `.js` prima di caricare (il loader attende `.js`).

---

*Fine del documento. Questo file è il contratto: se segui le firme (§5), usi solo `ctx` (§6), non tocchi la camera (§2), dichiari collider/entrance/interagibili (§9, §5.3) e — finché `ctx.ui` non esiste — costruisci la UI col fallback `CanvasTexture` (§7.5), il tuo progetto girerà identico nell'harness locale e ospitato in piattaforma, desktop e VR, **non appena il runtime [DA COSTRUIRE] sarà implementato e testabile tramite l'harness**.*
