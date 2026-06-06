"""
merge_and_export.py
Importa tutti gli FBX nella cartella models/ (versione 7.x da Unity FBX Exporter)
e li unisce in un singolo environment.glb.
I file v6100 vengono saltati automaticamente.
"""
import bpy
import os
import struct

MODELS_DIR = r"C:\Users\manue\Downloads\EX-SPATIAL\32 sicurezza nel cantiere e percezione del rischio\claudeSpatConverter\viewer\models"
OUTPUT_GLB = os.path.join(MODELS_DIR, "environment.glb")

# ── Patch 1: percorsi texture con ".." ───────────────────────────────────────
import bpy.path as bpath
_orig = bpath.resolve_ncase
def _patched(path):
    try:
        return _orig(os.path.normpath(path))
    except Exception:
        return path
bpath.resolve_ncase = _patched

# ── Patch 2: Biped rig KeyError (Bip01_Pelvis) ───────────────────────────────
try:
    from io_scene_fbx import import_fbx
    _OrigNode = import_fbx.FbxImportHelperNode
    _orig_link = _OrigNode.link_hierarchy

    def _patched_link(self, fbx_tmpl, settings, scene):
        # Wrap armature_setup lookup per gestire rig Biped di 3ds Max
        if self.meshes:
            safe_meshes = []
            for mesh in self.meshes:
                if self in mesh.armature_setup:
                    safe_meshes.append(mesh)
                # else: mesh senza armature_setup → skip silenzioso
            self.meshes = safe_meshes
        return _orig_link(self, fbx_tmpl, settings, scene)

    _OrigNode.link_hierarchy = _patched_link
    print("Patch Biped applicata su FbxImportHelperNode.link_hierarchy")
except Exception as e:
    print(f"Patch Biped non applicata: {e}")

# ── Funzione per leggere versione FBX ────────────────────────────────────────
def fbx_version(filepath):
    try:
        with open(filepath, 'rb') as f:
            header = f.read(27)
            if header[:20] == b'Kaydara FBX Binary  ':
                return struct.unpack('<I', header[23:27])[0]
    except Exception:
        pass
    return 0

# ── Carica transforms.json (posizioni Unity world space per ogni modello) ─────
import json, math
TRANSFORMS_PATH = os.path.join(MODELS_DIR, "transforms.json")
transforms = {}
if os.path.exists(TRANSFORMS_PATH):
    with open(TRANSFORMS_PATH, 'r', encoding='utf-8') as f:
        raw = json.load(f)
    transforms = {k: v for k, v in raw.items() if not k.startswith('_')}
    print(f"Transforms caricati per: {list(transforms.keys())}")
else:
    print("transforms.json non trovato — tutti i modelli all'origine")

# ── Pulisci scena ────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# ── Importa tutti gli FBX validi ─────────────────────────────────────────────
fbx_files = [f for f in os.listdir(MODELS_DIR) if f.lower().endswith('.fbx')]
imported = []

for fname in sorted(fbx_files):
    fpath = os.path.join(MODELS_DIR, fname)
    ver = fbx_version(fpath)
    if ver < 7000:
        print(f"  SKIP (v{ver}): {fname}")
        continue

    print(f"  Importo (v{ver}): {fname}")
    before = set(o.name for o in bpy.data.objects)
    before_actions = set(a.name for a in bpy.data.actions)
    model_prefix = os.path.splitext(fname)[0]

    # Prova 1: import standard
    ok = False
    for attempt, kwargs in enumerate([
        # Tentativo 1: standard
        dict(axis_forward='-Z', axis_up='Y', use_image_search=True),
        # Tentativo 2: Biped fix (ignore leaf bones + auto orientation)
        dict(axis_forward='-Z', axis_up='Y', use_image_search=True,
             ignore_leaf_bones=True, force_connect_children=False,
             automatic_bone_orientation=True),
        # Tentativo 3: solo mesh, niente armature
        dict(axis_forward='-Z', axis_up='Y', use_image_search=True,
             ignore_leaf_bones=True, force_connect_children=True,
             use_anim=False),
    ]):
        try:
            bpy.ops.import_scene.fbx(filepath=fpath, **kwargs)
            after = set(o.name for o in bpy.data.objects)
            new_objs = after - before
            if new_objs:
                # Rinomina le nuove action con prefisso modello per identificarle nel GLB
                after_actions = set(a.name for a in bpy.data.actions)
                new_clips_raw = list(after_actions - before_actions)
                new_clips = []
                for aname in new_clips_raw:
                    action = bpy.data.actions.get(aname)
                    if action:
                        new_name = f"{model_prefix}|{aname}"
                        action.name = new_name
                        new_clips.append(new_name)
                imported.append({'file': fname, 'objects': list(new_objs), 'clips': new_clips})

                # Rinomina i root objects con il prefisso modello
                # Il posizionamento avviene in Three.js, non in Blender
                roots = [bpy.data.objects[n] for n in new_objs
                         if bpy.data.objects.get(n) and
                         (bpy.data.objects[n].parent is None or
                          bpy.data.objects[n].parent.name not in new_objs)]
                root_names = []
                for i, obj in enumerate(roots):
                    suffix = f'_{i}' if i > 0 else ''
                    obj.name = f"{model_prefix}_root{suffix}"
                    root_names.append(obj.name)
                if root_names:
                    print(f"    Root rinominati: {root_names}")

                suffix = '' if attempt == 0 else f' (tentativo {attempt+1})'
                print(f"    → {len(new_objs)} oggetti, {len(new_clips)} clip{suffix}")
                ok = True
                break
        except Exception as e:
            if attempt == 2:
                print(f"    SKIP dopo 3 tentativi: {str(e)[:80]}")
            # Pulisci oggetti parziali prima del prossimo tentativo
            partial = set(o.name for o in bpy.data.objects) - before
            for n in partial:
                o = bpy.data.objects.get(n)
                if o: bpy.data.objects.remove(o, do_unlink=True)

# ── Statistiche ──────────────────────────────────────────────────────────────
total_mesh = sum(1 for o in bpy.data.objects if o.type == 'MESH')
total_anim = len(bpy.data.actions)
print(f"\nTotale: {total_mesh} mesh, {total_anim} animazioni da {len(imported)} file")

# ── Forza REST pose su tutti gli armature prima dell'export ──────────────────
# Senza questo i personaggi Mixamo/Biped vengono esportati nella posa animata corrente
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE':
        obj.data.pose_position = 'REST'
print(f"REST pose applicata a {sum(1 for o in bpy.data.objects if o.type=='ARMATURE')} armature")

# ── Esporta GLB unificato ────────────────────────────────────────────────────
print(f"\nEsporto → {OUTPUT_GLB}")
bpy.ops.export_scene.gltf(
    filepath=OUTPUT_GLB,
    export_format='GLB',
    export_materials='EXPORT',
    export_image_format='AUTO',
    export_animations=True,
    export_skins=True,
    export_yup=True,
    export_apply=False
)

size_mb = os.path.getsize(OUTPUT_GLB) / 1024 / 1024
print(f"FATTO — environment.glb: {size_mb:.1f} MB")
print(f"File importati: {[x['file'] for x in imported]}")

# Scrivi manifest.json per il viewer
import json, time

STATIC_KEYWORDS = ['TERRITORIO', 'Untitled', 'construction_scene']

def get_model_type(fname, has_clips):
    if any(k.lower() in fname.lower() for k in STATIC_KEYWORDS):
        return 'static'
    return 'animated' if has_clips else 'static'

manifest = {
    "glb": "models/environment.glb",
    "sizeMB": round(size_mb, 1),
    "buildId": str(int(time.time())),
    "pieces": [
        {
            "name": x['file'].replace('.fbx','').replace('.FBX',''),
            "file": x['file'],
            "objects": len(x['objects']),
            "type": get_model_type(x['file'], bool(x['clips'])),
            "clips": x['clips'],
            "position": transforms.get(x['file'], {}).get('position', None),
            "scale":    transforms.get(x['file'], {}).get('scale', None)
        }
        for x in imported
    ]
}
manifest_path = os.path.join(os.path.dirname(MODELS_DIR), "manifest.json")
with open(manifest_path, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
print(f"Manifest scritto: {manifest_path}")
print(f"BuildId: {manifest['buildId']}")
