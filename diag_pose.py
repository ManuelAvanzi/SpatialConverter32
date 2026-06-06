"""
Diagnostico posa: importa Axe_Wield e misura dove finiscono BODY/FACE/HAND
in 3 configurazioni:
  1. RAW    = vertici memorizzati (bind pose) in object space
  2. REST   = mesh deformata con armature in pose_position='REST'
  3. POSE   = mesh deformata con armature in pose_position='POSE' (frame 1)
Per ognuna stampa centro e dimensione bounding box → capiamo quale posa
rende i pezzi coincidenti (una persona vera).
"""
import bpy, os
from mathutils import Vector
import bpy.path as bpath

_orig = bpath.resolve_ncase
def _patched(path):
    try:    return _orig(os.path.normpath(path))
    except Exception: return path
bpath.resolve_ncase = _patched

# Patch Biped
try:
    from io_scene_fbx import import_fbx as _ifbx
    _Orig = _ifbx.FbxImportHelperNode
    _orig_link = _Orig.link_hierarchy
    def _patched_link(self, fbx_tmpl, settings, scene):
        if self.meshes:
            self.meshes = [m for m in self.meshes if self in m.armature_setup]
        return _orig_link(self, fbx_tmpl, settings, scene)
    _Orig.link_hierarchy = _patched_link
except Exception as e:
    print(f"Patch Biped: {e}")

MODELS_DIR = r"C:\Users\manue\Downloads\EX-SPATIAL\32 sicurezza nel cantiere e percezione del rischio\claudeSpatConverter\viewer\models"
FBX = os.path.join(MODELS_DIR, "Axe_Wield_01_FINAL2.fbx")

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()
bpy.ops.import_scene.fbx(filepath=FBX, axis_forward='-Z', axis_up='Y', use_image_search=False)

TARGETS = ['BODY_mesh', 'FACE_mesh', 'HAND_mesh', 'SAFE_Helmet', 'eye01']

def bbox_world_raw(obj):
    """bbox dai vertici memorizzati (bind), in world space, senza modifier."""
    mat = obj.matrix_world
    cos = [mat @ v.co for v in obj.data.vertices]
    if not cos: return None
    mn = Vector((min(c.x for c in cos), min(c.y for c in cos), min(c.z for c in cos)))
    mx = Vector((max(c.x for c in cos), max(c.y for c in cos), max(c.z for c in cos)))
    return (mn+mx)/2, (mx-mn)

def bbox_world_eval(obj):
    """bbox dalla mesh valutata (con modifier armature applicato dal depsgraph)."""
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg)
    me = ev.to_mesh()
    mat = obj.matrix_world
    cos = [mat @ v.co for v in me.vertices]
    ev.to_mesh_clear()
    if not cos: return None
    mn = Vector((min(c.x for c in cos), min(c.y for c in cos), min(c.z for c in cos)))
    mx = Vector((max(c.x for c in cos), max(c.y for c in cos), max(c.z for c in cos)))
    return (mn+mx)/2, (mx-mn)

def fmt(r):
    if r is None: return "—"
    c, d = r
    return f"centro({c.x:7.2f},{c.y:7.2f},{c.z:7.2f}) dim({d.x:6.2f},{d.y:6.2f},{d.z:6.2f})"

# Assicura armature modifier su tutte (fix-mod come nello script principale)
for obj in bpy.data.objects:
    if obj.type != 'MESH' or len(obj.vertex_groups) == 0: continue
    if any(m.type == 'ARMATURE' for m in obj.modifiers): continue
    p = obj.parent
    while p:
        if p.type == 'ARMATURE':
            mod = obj.modifiers.new(name='Armature', type='ARMATURE'); mod.object = p
            break
        p = p.parent

arms = [o for o in bpy.data.objects if o.type == 'ARMATURE']

print("\n===== RAW (vertici bind in object space) =====")
for name in TARGETS:
    o = bpy.data.objects.get(name)
    if o: print(f"  {name:14} {fmt(bbox_world_raw(o))}")

for arm in arms: arm.data.pose_position = 'REST'
bpy.context.view_layer.update()
print("\n===== REST pose (deformata) =====")
for name in TARGETS:
    o = bpy.data.objects.get(name)
    if o: print(f"  {name:14} {fmt(bbox_world_eval(o))}")

for arm in arms: arm.data.pose_position = 'POSE'
bpy.context.scene.frame_set(1)
bpy.context.view_layer.update()
print("\n===== POSE pose frame 1 (deformata) =====")
for name in TARGETS:
    o = bpy.data.objects.get(name)
    if o: print(f"  {name:14} {fmt(bbox_world_eval(o))}")

print("\nArmature trovati:", [a.name for a in arms])

# ── Da dove viene l'offset: matrice oggetto vs vertici locali ──────────────
print("\n===== MATRICE OGGETTO vs VERTICI LOCALI =====")
def local_bbox(obj):
    cos = [v.co for v in obj.data.vertices]
    if not cos: return None
    mn = Vector((min(c.x for c in cos), min(c.y for c in cos), min(c.z for c in cos)))
    mx = Vector((max(c.x for c in cos), max(c.y for c in cos), max(c.z for c in cos)))
    return (mn+mx)/2
for name in TARGETS:
    o = bpy.data.objects.get(name)
    if not o: continue
    t = o.matrix_world.translation
    lt = o.matrix_local.translation
    lc = local_bbox(o)
    par = o.parent.name if o.parent else '—'
    ptype = o.parent_type if o.parent else '—'
    print(f"  {name:14} parent={par}({ptype})")
    print(f"      matrix_world.T = ({t.x:7.3f},{t.y:7.3f},{t.z:7.3f})")
    print(f"      matrix_local.T = ({lt.x:7.3f},{lt.y:7.3f},{lt.z:7.3f})")
    if lc: print(f"      vertici locali centro = ({lc.x:7.3f},{lc.y:7.3f},{lc.z:7.3f})")

# Pelvis bone world
arm = arms[0]
print(f"\nArmature '{arm.name}' matrix_world.T = {tuple(round(v,3) for v in arm.matrix_world.translation)}")
pel = arm.data.bones.get('Bip01_Pelvis') or arm.data.bones.get('Bip01')
if pel:
    print(f"Bone '{pel.name}' head_local = {tuple(round(v,3) for v in pel.head_local)}")
