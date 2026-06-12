# Context — fbx-blender
> Pipeline offline FBX → environment.glb via Blender headless. Sotto-area di conversion.
> Updated: 2026-06-08
> Loaded via: /ctx 3 fbx-blender

---

## Files involved
| File | Role |
|------|------|
| `merge_and_export.py` | Core (~19KB): importa N FBX, consolida skinned mesh, fa join armature, applica REST pose, esporta `environment.glb`. Run da Blender headless |
| `blender-convert.py` | CLI Blender riusabile: `--background --python ... -- <models-dir> [--merge]`. Converte/merge FBX → GLB |
| `convert_territorio.py` | Script one-shot per `TERRITORIO.fbx` (path Windows hardcoded) → GLB |
| `build.js` | Orchestratore Node: estrae .unitypackage (`extract.js`) → Blender (`blender-convert.py --merge`) → copia viewer. Vedi `[[unity-extract]]` |
| `diag_*.py` (8 file) | Script diagnostici one-shot (pose/axe/acc/render/check/fix/gltf) per debug import/animazioni |

---

## How it works
> Max 10 lines. Only what's not obvious.
- Eseguiti da **Blender headless**: `blender --background --python <script> -- <args>`. Non sono moduli Python normali (usano `bpy`).
- **build.js** è il flusso completo end-to-end: `node build.js <pkg.unitypackage>` → Step1 extract → Step2 Blender merge → Step3 copia `viewer/index.html`. Blender path default Windows (`--blender` per override).
- **merge_and_export.py**: importa ogni FBX tracciando oggetti/azioni nuovi (snapshot diff), consolida le skinned mesh per personaggio (un join per body), riapplica la REST pose, accumula tutte le `bpy.data.actions`, esporta un unico GLB.
- **Patch obbligatorie** all'import (causa file Unity): `resolve_ncase` per path con `..`; `FbxImportHelperNode.link_hierarchy` per Biped rig (`Bip01_Pelvis` KeyError).
- **Export gltf**: `GLB`, materials EXPORT, animations+skins True, `export_yup=True`.

---

## Decisions made
- 2026-06: pipeline via Blender (non UnityGLTF, che ha errori Visual Scripting).
- 2026-06: FBX devono essere v7400 (export da Unity FBX Exporter); v6100 originali non importabili → vedi `[[ERRORS]]`.
- 2026-06: un solo `environment.glb` mergiato per l'ambiente; personaggi animati gestiti a parte (gltfModels).

---

## Errors already made in this area
- Biped rig KeyError `Bip01_Pelvis` → ✅ monkey-patch `link_hierarchy` in `merge_and_export.py`.
- Texture path con `..` → ✅ patch `bpy.path.resolve_ncase`.
- FBX v6100 → ✅ ri-esportare da Unity (v7400).

---

## TODO / Tech debt
- [ ] Path Windows hardcoded in `convert_territorio.py` e `build.js` (BLENDER_DEFAULT) — non portabile.
- [ ] 8 script `diag_*.py` one-shot non documentati: probabilmente residui di debug, candidati a cleanup (NON eliminare senza conferma).
- [ ] `build.js` step "rimuovi FBX dopo conversione" commentato/disattivato.

---

## Investigations done
- 2026-06-08: mappati merge_and_export.py + blender-convert.py + convert_territorio.py via ripgrep (header/firme), build.js letto intero. Pipeline e patch qui sopra. I diag_*.py non analizzati nel dettaglio (one-shot). Lato Unity → `[[unity-extract]]`.
