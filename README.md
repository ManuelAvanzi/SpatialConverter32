# SpatialConverter32 — Sicurezza nel Cantiere

Strumento per convertire ambienti **Spatial.io + Unity** in viewer web **Three.js + WebXR**.

## Struttura progetto

```
claudeSpatConverter/
├── extract.js              Parser .unitypackage → scene.json
├── merge_and_export.py     Blender: merge FBX → environment.glb
├── build.js                Orchestratore completo
├── blender-convert.py      Conversione singolo FBX
├── convert_territorio.py   Script one-shot per TERRITORIO.fbx
├── SceneExporter.cs        Unity Editor script OBJ exporter
├── viewer/
│   ├── index.html          Viewer Three.js + WebXR
│   ├── fbx-converter.html  Converter browser-side
│   ├── scene.json          Dati scena (interactable, quest, teleport)
│   └── manifest.json       Lista modelli caricati
└── .gitignore
```

## Workflow per aggiungere pezzi di scena

1. In Unity (con FBX Exporter installato): seleziona oggetti → `Assets → Export to FBX`
   - Format: **Binary**, Include: **Model(s) + Animation**, Animated Skinned Mesh: ✓
   - Export path: `claudeSpatConverter/viewer/models/`

2. Da terminale (o chiedi a Claude):
   ```bash
   cd claudeSpatConverter
   node merge_and_export.py   # oppure eseguito da Claude
   ```
   Blender converte tutti gli FBX in `viewer/models/` → `environment.glb`

3. Ricarica `localhost:3003`

## Avviare il viewer

```bash
npx serve viewer/   # porta 3003
```

## Stato attuale (Giugno 2026)

### FBX importati con successo
| File | Oggetti | Note |
|------|---------|------|
| TERRITORIO.fbx | 730 | Terreno + edifici principali |
| Untitled.fbx | 319 | Pezzo scena aggiuntivo |
| construction_scene.fbx | 129 | Scena cantiere |
| rischio da macchinari in movimento.fbx | 116 | NPC + animazioni |
| Sawing_03_FINAL2.fbx | 53 | NPC Biped |
| Spade_01_FINAL2.fbx | 50 | NPC Biped |
| Spade_02_FINAL2.fbx | 50 | NPC Biped |

**Totale:** 668 mesh · 613 animazioni · ~100 MB GLB

### Interactable (da scene.json)
15 oggetti interattivi con clip animate:
- `fallingObj` → Rischio caduta materiali
- `slipping` → Rischio scivolamento
- `Anim02` → Rischio caduta dall'alto
- `Crollo`, `falling` → Rischio crollo
- `Electric` → Scarica elettrica
- `macchinariInMov` → Rischio macchinari
- `scala` → Lavori in quota
- `DoorOpen` → Personale autorizzato

### Cosa manca
- [ ] Restanti NPC animati (Sawing, Roll_paint, Hand_Drill, Hammer, ecc.)
- [ ] Texture originali collegate (ora le mesh le hanno embedded)
- [ ] Posizionamento camera iniziale ottimale
- [ ] Test WebXR su visore

## Note tecniche

### Bug Blender risolti
- **FBX v6100** (vecchi file originali Unity): non supportato da Blender/Three.js → soluzione: esportare da Unity con FBX Exporter (genera v7400)
- **Biped rig KeyError** (Bip01_Pelvis): patch runtime su `FbxImportHelperNode.link_hierarchy` in `merge_and_export.py`
- **Texture path con ".."**: patch su `bpy.path.resolve_ncase`

### Navigazione viewer
- **Drag sinistro**: ruota vista
- **WASD**: movimento FPS
- **Click**: interagisce con hotspot
- **Vista aerea**: OrbitControls stile Blender (drag=ruota, scroll=zoom, drag destro=pan)

### Unity setup
- Unity 2021.3.21f1
- Spatial Unity SDK 1.71.0
- FBX Exporter (Unity Registry)
- UnityGLTF 2.19.5 (installato ma con errori Visual Scripting — non usare)

## Repo modelli
I file FBX e GLB NON sono nel repo (troppo grandi).
Path locale: `C:\Users\manue\Downloads\EX-SPATIAL\32 sicurezza nel cantiere e percezione del rischio\claudeSpatConverter\viewer\models\`
