"""
Renderizza Axe_Wield combinato in 3 configurazioni per capire quale posa
mostra il personaggio IN PIEDI:
  1. REST pose (quella che esportiamo ora → sdraiato?)
  2. POSE frame 1
  3. POSE frame 15
Salva 3 PNG che poi guardo.
"""
import bpy, os, math
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

BASE = r"C:\Users\manue\Downloads\EX-SPATIAL\32 sicurezza nel cantiere e percezione del rischio\claudeSpatConverter"
F = os.path.join(BASE, "viewer", "models", "Axe_Wield_01_FINAL2.fbx")
OUT = os.path.join(BASE, "diag_renders")
os.makedirs(OUT, exist_ok=True)

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
bpy.ops.import_scene.fbx(filepath=F, axis_forward='-Z', axis_up='Y', use_image_search=False)

# Tieni solo la combinata, rimuovi le split originali skinnate
has_comb = any('combinedmesh' in o.name.lower() for o in bpy.data.objects)
if has_comb:
    for o in list(bpy.data.objects):
        if o.type=='MESH' and 'combinedmesh' not in o.name.lower():
            if len(o.vertex_groups)>0 or any(m.type=='ARMATURE' for m in o.modifiers):
                bpy.data.objects.remove(o, do_unlink=True)

arms = [o for o in bpy.data.objects if o.type=='ARMATURE']
comb = next((o for o in bpy.data.objects if 'combinedmesh' in o.name.lower()), None)
print("Armature:", [a.name for a in arms], "| combined:", comb.name if comb else None)

# Info clip/azioni disponibili
print("Actions:", [a.name for a in bpy.data.actions][:10], "... tot", len(bpy.data.actions))
for a in arms:
    if a.animation_data and a.animation_data.action:
        print(f"  {a.name} action attiva: {a.animation_data.action.name}")

# ── Setup scena render ────────────────────────────────────────────────────
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = 600
scene.render.resolution_y = 700
scene.render.film_transparent = False
scene.world = bpy.data.worlds.new("W") if not scene.world else scene.world
scene.world.use_nodes = False
scene.world.color = (0.5,0.6,0.7)

# luce
light_data = bpy.data.lights.new("Sun", 'SUN'); light_data.energy = 3
light = bpy.data.objects.new("Sun", light_data); scene.collection.objects.link(light)
light.rotation_euler = (math.radians(50), 0, math.radians(30))

# camera
cam_data = bpy.data.cameras.new("Cam"); cam = bpy.data.objects.new("Cam", cam_data)
scene.collection.objects.link(cam); scene.camera = cam

def mesh_bbox_world(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg); me = ev.to_mesh()
    mat = obj.matrix_world
    cos = [mat @ v.co for v in me.vertices]; ev.to_mesh_clear()
    mn = Vector((min(c.x for c in cos),min(c.y for c in cos),min(c.z for c in cos)))
    mx = Vector((max(c.x for c in cos),max(c.y for c in cos),max(c.z for c in cos)))
    return mn, mx

def aim_and_render(tag):
    bpy.context.view_layer.update()
    mn, mx = mesh_bbox_world(comb)
    c = (mn+mx)/2
    size = (mx-mn)
    radius = max(size.x, size.y, size.z, 1.0)
    # camera davanti (-Y) leggermente in alto
    cam.location = Vector((c.x, c.y - radius*2.6, c.z + radius*0.3))
    d = (c - cam.location).normalized()
    cam.rotation_euler = d.to_track_quat('-Z','Y').to_euler()
    path = os.path.join(OUT, f"axe_{tag}.png")
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    print(f"  render {tag}: bbox dim=({size.x:.2f},{size.y:.2f},{size.z:.2f}) -> {path}")

# 1) REST
for a in arms: a.data.pose_position = 'REST'
aim_and_render("1_REST")

# 2) POSE frame 1
for a in arms: a.data.pose_position = 'POSE'
scene.frame_set(1)
aim_and_render("2_POSE_f1")

# 3) POSE frame 15
scene.frame_set(15)
aim_and_render("3_POSE_f15")

print("FATTO render")
