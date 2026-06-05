import bpy
import os
import bpy.path as bpath

fbx = r"C:\Users\manue\Downloads\EX-SPATIAL\32 sicurezza nel cantiere e percezione del rischio\claudeSpatConverter\viewer\models\TERRITORIO.fbx"
glb = r"C:\Users\manue\Downloads\EX-SPATIAL\32 sicurezza nel cantiere e percezione del rischio\claudeSpatConverter\viewer\models\environment.glb"

# ── Patch bpy.path.resolve_ncase per gestire percorsi con ".." ───────────────
_orig_resolve_ncase = bpath.resolve_ncase

def _patched_resolve_ncase(path):
    # Normalizza prima (risolve i ..) poi chiama l'originale
    try:
        normalized = os.path.normpath(path)
        return _orig_resolve_ncase(normalized)
    except Exception:
        return path  # se fallisce ancora, ritorna il path com'è

bpath.resolve_ncase = _patched_resolve_ncase
print("Patch bpy.path.resolve_ncase applicata")

# ── Pulisci scena ────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# ── Importa FBX ─────────────────────────────────────────────────────────────
print("Importo TERRITORIO.fbx...")
bpy.ops.import_scene.fbx(
    filepath=fbx,
    axis_forward='-Z',
    axis_up='Y',
    use_image_search=True
)

mesh_count = sum(1 for o in bpy.data.objects if o.type == 'MESH')
anim_count = len(bpy.data.actions)
print(f"Mesh: {mesh_count}  |  Animazioni: {anim_count}")

# ── Esporta GLB ──────────────────────────────────────────────────────────────
print("Esporto environment.glb...")
bpy.ops.export_scene.gltf(
    filepath=glb,
    export_format='GLB',
    export_materials='EXPORT',
    export_image_format='AUTO',
    export_animations=True,
    export_skins=True,
    export_yup=True,
    export_apply=False
)

size_mb = os.path.getsize(glb) / 1024 / 1024
print(f"FATTO — environment.glb: {size_mb:.1f} MB")
