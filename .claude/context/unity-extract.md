# Context — unity-extract
> Parsing .unitypackage → scene.json + tool Unity Editor (export/combine mesh) + exporter Spatial (interactable/quest). Sotto-area di conversion.
> Updated: 2026-06-12
> Loaded via: /ctx 3 unity-extract

---

## Files involved
> **Riorganizzazione 2026-06**: gli script Node sono in `tools/` (legacy in `tools/legacy/`), i `.cs` Unity in `unity/`.

| File | Role |
|------|------|
| `tools/legacy/extract.js` | Parser .unitypackage (~15KB): estrae tar.gz, parsa YAML Unity, mappa componenti Spatial SDK → `scene.json` + copia asset |
| `tools/inspect_glb.js` | Debug: legge il chunk JSON di `environment.glb`, lista nodi/mesh/skin (cerca BODY/FACE/HAND/Pelvis) |
| `tools/parse_actions.js` | Estrae da Unity la macchina a stati azioni (SetActive) → zone-azione/trigger walk-in |
| `tools/parse_quests.js` | Estrae le quest Spatial da Unity → checklist web |
| `tools/parse_quiz.js` | Estrae i quiz da Unity → pannello Simulazioni (livelli/lucchetti) |
| `unity/SceneExporter.cs` | Unity Editor: `Tools → Export Scene to OBJ`, esporta tutte le MeshRenderer in OBJ |
| `unity/SkinnedMeshCombiner.cs` | Unity Editor: `Tools → Combina Skinned Mesh`, fonde N SMR di un personaggio in uno preservando le bind pose |
| `unity/SpatialInteractableExporter.cs` | Unity Editor: esporta gli interactable Spatial (assi corretti: Z non invertita) |
| `unity/SpatialQuestExporter.cs` | Unity Editor: esporta le quest Spatial (con helper `F()`) |

---

## How it works
> Max 10 lines. Only what's not obvious.
- **extract.js** (Node, no Blender): `tar -xzf` del .unitypackage in temp → `parseUnityScene(yaml)` divide in blocchi `--- !u!<classID>` → dispatch per classID: `1`=GameObject, `4`=Transform, `114`=MonoBehaviour, MeshFilter, Animator.
- Costruisce mappa `guid → asset` (dai `.meta`), `goFileID → Transform` per le posizioni world, poi estrae Spatial SDK: interactables, quests, teleports, models (FBX), animations.
- Output: `scene.json` + copia degli asset referenziati. Step 1 del flusso `build.js` → vedi `[[fbx-blender]]`.
- **C# = lato Unity Editor** (non parte della build Node/Python): preparano la scena *prima* dell'export FBX, oppure esportano feature Spatial (interactable/quest) come dati per il viewer.
- **parse_actions/quests/quiz.js**: pipeline dati Spatial → JSON consumato dal viewer (azioni SetActive, checklist quest, pannello Simulazioni/quiz). `parse_actions` fa unquote dei nomi YAML con apici.
- **SkinnedMeshCombiner**: usa le **bindposes originali** di ogni mesh (non ricalcolate dalla posa corrente) — altrimenti la mesh si accascia a riposo. È ri-eseguibile (resetta `*_CombinedMesh` e rifà).

---

## Decisions made
- 2026-06: parsing YAML Unity fatto a mano con regex (no libreria yaml) — basta per i campi Spatial SDK noti.
- 2026-06: classID Unity gestiti: 1/4/114 + MeshFilter/Animator; il resto ignorato.
- 2026-06: combine skinned mesh con bindposes vere (non posa Animator) per skinning corretto e animabile.
- 2026-06: `extract.js` usa temp dir vicino al package (stesso drive) per evitare problemi spazio su C:.

---

## Errors already made in this area
- Combinare SMR ricalcolando le bind pose dalla posa corrente → mesh accasciata, animazione non la raddrizza → ✅ usare le bindposes originali (`SkinnedMeshCombiner`).
- `SpatialQuestExporter`: CS0103 per helper `F()` mancante → ✅ aggiunto.
- Interactable: invertire l'asse Z all'export → posizioni sbagliate → ✅ Z non va invertita.

---

## TODO / Tech debt
- [ ] Parsing YAML a regex: fragile se Unity cambia formato o per componenti non previsti.
- [ ] `tools/inspect_glb.js` ha path hardcoded `viewer/models/environment.glb`.
- [ ] I file `.cs` vanno copiati a mano in `Assets/Editor/` di Unity (non versionati col progetto Unity).

---

## Investigations done
- 2026-06-08: extract.js mappato via ripgrep (firme + classID dispatch), inspect_glb.js letto intero, header dei 2 .cs via ripgrep. Flusso e razionale bind pose qui sopra. Pipeline Blender a valle → `[[fbx-blender]]`.
