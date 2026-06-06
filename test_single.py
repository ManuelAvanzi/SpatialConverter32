"""
test_single.py — importa UN solo FBX e lo esporta come test.glb
"""
import bpy, os, struct

# Patch percorsi texture con ".." (stessa patch di merge_and_export.py)
import bpy.path as bpath
_orig_ncase = bpath.resolve_ncase
def _patched_ncase(path):
    try:
        return _orig_ncase(os.path.normpath(path))
    except Exception:
        return path
bpath.resolve_ncase = _patched_ncase

MODELS_DIR = r"C:\Users\manue\Downloads\EX-SPATIAL\32 sicurezza nel cantiere e percezione del rischio\claudeSpatConverter\viewer\models"
FBX_FILE   = "contenitore di hammer_drill_03_FINAL2.fbx"
OUTPUT_GLB = os.path.join(MODELS_DIR, "test_npc.glb")

# Patch Biped
try:
    from io_scene_fbx import import_fbx
    _OrigNode = import_fbx.FbxImportHelperNode
    _orig_link = _OrigNode.link_hierarchy
    def _patched_link(self, fbx_tmpl, settings, scene):
        if self.meshes:
            self.meshes = [m for m in self.meshes if self in m.armature_setup]
        return _orig_link(self, fbx_tmpl, settings, scene)
    _OrigNode.link_hierarchy = _patched_link
except Exception as e:
    print(f"Patch non applicata: {e}")

# Pulisci scena
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

fpath = os.path.join(MODELS_DIR, FBX_FILE)
print(f"Importo: {fpath}")

for attempt, kwargs in enumerate([
    dict(axis_forward='-Z', axis_up='Y', use_image_search=True),
    dict(axis_forward='-Z', axis_up='Y', use_image_search=True,
         ignore_leaf_bones=True, force_connect_children=False,
         automatic_bone_orientation=True),
    dict(axis_forward='-Z', axis_up='Y', use_image_search=True,
         ignore_leaf_bones=True, force_connect_children=True, use_anim=False),
]):
    try:
        bpy.ops.import_scene.fbx(filepath=fpath, **kwargs)
        objs = list(bpy.data.objects)
        print(f"  Tentativo {attempt+1}: {len(objs)} oggetti")
        for o in objs:
            print(f"    {o.name}  type={o.type}  loc={tuple(round(v,3) for v in o.location)}  scale={tuple(round(v,4) for v in o.scale)}")
        break
    except Exception as e:
        print(f"  Tentativo {attempt+1} fallito: {e}")

print(f"\nAnimazioni: {len(bpy.data.actions)}")
for a in bpy.data.actions:
    print(f"  {a.name}")

print(f"\nEsporto → {OUTPUT_GLB}")
bpy.ops.export_scene.gltf(
    filepath=OUTPUT_GLB,
    export_format='GLB',
    export_materials='EXPORT',
    export_animations=True,
    export_skins=True,
    export_yup=True,
    export_apply=False
)

size_mb = os.path.getsize(OUTPUT_GLB) / 1024 / 1024
print(f"FATTO — {size_mb:.1f} MB")
