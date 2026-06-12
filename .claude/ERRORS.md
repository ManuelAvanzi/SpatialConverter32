# Recurring errors — SpatialConverter32
> ALWAYS read before starting a task.
> Updated: 2026-06-12

---

## Architectural errors
> Wrong decisions already made and corrected
- ❌ FBX v6100 (file Unity originali) non supportato da Blender/Three.js → ✅ esportare da Unity con FBX Exporter (genera v7400)
- ❌ UnityGLTF 2.19.5 (errori Visual Scripting) → ✅ non usare; pipeline via Blender

---

## Pattern errors
> Wrong uses of frameworks or libraries
- ❌ Biped rig KeyError (`Bip01_Pelvis`) all'import → ✅ patch runtime su `FbxImportHelperNode.link_hierarchy` in `tools/legacy/blender/merge_and_export.py`
- ❌ Texture path con `..` → ✅ patch su `bpy.path.resolve_ncase`
- ❌ Upload `.gltf` multi-file da solo → scena rotta (manca il binario) → ✅ accettare solo `.glb` unico
- ❌ Salvataggio scena con sfondo 360 attivo: background texture non ha `getHexString` → ✅ guard sul tipo
- ❌ SMR combiner: bind pose dalla posa corrente → mesh accasciata → ✅ usare bindposes originali
- ❌ `SpatialQuestExporter` CS0103: helper `F()` mancante → ✅ aggiunto
- ❌ Interactable export con asse Z invertito → posizioni sbagliate → ✅ Z non va invertita
- ❌ Azioni: nodi nascosti restano nel collider (muri invisibili) → ✅ escludere i nodi nascosti dal collider

---

## Dangerous files
> Files that look simple but hide critical dependencies
| File | Why dangerous | How to touch it |
|------|---------------|-----------------|
| `viewer/index.html` | engine monolitico ~7100 righe (Three.js+WebXR+editor+quest/azioni/quiz/avatar) | modifiche chirurgiche, testare viewer + VR |
| `viewer/scene-config.json` | contenuto scena live | non rigenerare a mano, esportare dall'editor |
| `server/store.js` | schema record progetto su R2 | cambi di schema rompono i JSON esistenti |

---

## Mandatory sequences
> Some operations must be done in precise order
- Aggiungere personaggio glTF: 1) export in `viewer/models/gltfModels/` 2) `npm run manifest` 3) `npm run upload` 4) commit `models.json`
- Pubblicare scena: 1) editor → esporta `scene-config.json` 2) salva in `viewer/` 3) commit + push

---

## Never do
- Never modificare i JSON progetto su R2 a mano cambiando schema — passa da `store.js`
- Never rompere il ramo speciale `spatial32` in upload/download
- Never committare GLB/FBX pesanti nel repo (solo su R2)
- Never aprire il viewer da `file://` aspettandosi VR (serve https/localhost)
