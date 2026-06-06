"""
Test fix: azzera la matrice oggetto di BODY_mesh (per allinearla a FACE/HAND
che sono all'origine) e rimisura se i pezzi si allineano in REST pose.
Prova 3 strategie e stampa il bbox risultante.
"""
import bpy, os
from mathutils import Vector, Matrix
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

def reimport():
    bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
    bpy.ops.import_scene.fbx(filepath=FBX, axis_forward='-Z', axis_up='Y', use_image_search=False)
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

def eval_center(name):
    o = bpy.data.objects.get(name)
    if not o: return None
    dg = bpy.context.evaluated_depsgraph_get()
    ev = o.evaluated_get(dg); me = ev.to_mesh()
    mat = o.matrix_world
    cos = [mat @ v.co for v in me.vertices]; ev.to_mesh_clear()
    if not cos: return None
    mn = Vector((min(c.x for c in cos), min(c.y for c in cos), min(c.z for c in cos)))
    mx = Vector((max(c.x for c in cos), max(c.y for c in cos), max(c.z for c in cos)))
    return (mn+mx)/2

def report(tag):
    print(f"\n--- {tag} ---")
    for n in ['BODY_mesh','FACE_mesh','HAND_mesh']:
        c = eval_center(n)
        if c: print(f"  {n:11} centro=({c.x:7.3f},{c.y:7.3f},{c.z:7.3f})")

# STRATEGIA A: BODY.matrix_world = Identity
reimport()
report("PRIMA (BODY offset)")
body = bpy.data.objects.get('BODY_mesh')
body.matrix_world = Matrix.Identity(4)
bpy.context.view_layer.update()
report("A: BODY.matrix_world = Identity")

# STRATEGIA B: BODY.matrix_world = FACE.matrix_world
reimport()
body = bpy.data.objects.get('BODY_mesh'); face = bpy.data.objects.get('FACE_mesh')
body.matrix_world = face.matrix_world.copy()
bpy.context.view_layer.update()
report("B: BODY.matrix_world = FACE.matrix_world")

# STRATEGIA C: azzera solo la traslazione, tieni rotazione/scala
reimport()
body = bpy.data.objects.get('BODY_mesh')
mw = body.matrix_world.copy(); mw.translation = Vector((0,0,0))
body.matrix_world = mw
bpy.context.view_layer.update()
report("C: BODY translation azzerata")
