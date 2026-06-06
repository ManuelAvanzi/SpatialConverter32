"""
Diagnostico accessori: elenca tutte le mesh NON skinnate (0 vertex groups)
di Axe_Wield con la loro posizione world in REST pose, il parent (osso),
e confronta con il bbox della testa (FACE) e delle mani (HAND) skinnate.
"""
import bpy, os
from mathutils import Vector
import bpy.path as bpath

_orig = bpath.resolve_ncase
def _patched(path):
    try:    return _orig(os.path.normpath(path))
    except Exception: return path
bpath.resolve_ncase = _patched
try:
    from io_scene_fbx import import_fbx as _ifbx
    _Orig = _ifbx.FbxImportHelperNode
    _ol = _Orig.link_hierarchy
    def _pl(self, t, s, sc):
        if self.meshes:
            self.meshes = [m for m in self.meshes if self in m.armature_setup]
        return _ol(self, t, s, sc)
    _Orig.link_hierarchy = _pl
except Exception as e: print(e)

MODELS_DIR = r"C:\Users\manue\Downloads\EX-SPATIAL\32 sicurezza nel cantiere e percezione del rischio\claudeSpatConverter\viewer\models"
FBX = os.path.join(MODELS_DIR, "Axe_Wield_01_FINAL2.fbx")

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
bpy.ops.import_scene.fbx(filepath=FBX, axis_forward='-Z', axis_up='Y', use_image_search=False)

# fix-mod
for obj in bpy.data.objects:
    if obj.type != 'MESH' or len(obj.vertex_groups) == 0: continue
    if any(m.type == 'ARMATURE' for m in obj.modifiers): continue
    p = obj.parent
    while p:
        if p.type == 'ARMATURE':
            mod = obj.modifiers.new(name='Armature', type='ARMATURE'); mod.object = p; break
        p = p.parent
for a in [o for o in bpy.data.objects if o.type=='ARMATURE']:
    a.data.pose_position = 'REST'
bpy.context.view_layer.update()

def wbbox(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg); me = ev.to_mesh()
    mat = obj.matrix_world
    cos = [mat @ v.co for v in me.vertices]; ev.to_mesh_clear()
    if not cos: return None, None
    mn = Vector((min(c.x for c in cos), min(c.y for c in cos), min(c.z for c in cos)))
    mx = Vector((max(c.x for c in cos), max(c.y for c in cos), max(c.z for c in cos)))
    return (mn+mx)/2, (mx-mn)

# Riferimenti skinnati
print("\n===== RIFERIMENTI SKINNATI (REST) =====")
for n in ['FACE_mesh','HAND_mesh','BODY_mesh']:
    o = bpy.data.objects.get(n)
    if o:
        c,d = wbbox(o)
        print(f"  {n:12} centro=({c.x:6.2f},{c.y:6.2f},{c.z:6.2f}) dim=({d.x:5.2f},{d.y:5.2f},{d.z:5.2f})")

print("\n===== MESH NON SKINNATE (accessori) =====")
for obj in sorted(bpy.data.objects, key=lambda o:o.name):
    if obj.type != 'MESH': continue
    if len(obj.vertex_groups) > 0: continue   # skinnate, gia' gestite
    c,d = wbbox(obj)
    if c is None: continue
    par = obj.parent.name if obj.parent else '—'
    ptype = obj.parent_type if obj.parent else '—'
    pbone = obj.parent_bone if obj.parent_bone else '—'
    print(f"  {obj.name:20} parent={par}/{ptype}/bone={pbone}")
    print(f"      centro=({c.x:6.2f},{c.y:6.2f},{c.z:6.2f}) dim=({d.x:5.2f},{d.y:5.2f},{d.z:5.2f})")
