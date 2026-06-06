"""
Importa il glTF esportato da Unity (UnityGLTF) e renderizza:
  1. posa di default (come arriva)
  2-3. due frame d'animazione
per verificare che sia in piedi e che l'animazione non distorca.
"""
import bpy, os, math
from mathutils import Vector

BASE = r"C:\Users\manue\Downloads\EX-SPATIAL\32 sicurezza nel cantiere e percezione del rischio\claudeSpatConverter"
GLTF = os.path.join(BASE, "viewer", "models", "gltfModels", "Axe_Wield_01_FINAL2.gltf")
OUT = os.path.join(BASE, "diag_renders")
os.makedirs(OUT, exist_ok=True)

bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
# pulisci azioni residue
for a in list(bpy.data.actions): bpy.data.actions.remove(a)

bpy.ops.import_scene.gltf(filepath=GLTF)

meshes = [o for o in bpy.data.objects if o.type=='MESH']
arms = [o for o in bpy.data.objects if o.type=='ARMATURE']
comb = next((o for o in meshes if 'combinedmesh' in o.name.lower()), None)
print("MESH:", [o.name for o in meshes])
print("ARMATURE:", [a.name for a in arms])
print("COMBINED:", comb.name if comb else "NON TROVATA")
print("ACTIONS:", [a.name for a in bpy.data.actions])
# range animazione
fr_start, fr_end = 1, 30
for a in bpy.data.actions:
    fr = a.frame_range
    print(f"  action {a.name}: frame {fr[0]:.0f}-{fr[1]:.0f}")
    fr_start, fr_end = int(fr[0]), int(fr[1])

# ── Setup render ──────────────────────────────────────────────
scene = bpy.context.scene
scene.render.engine = 'BLENDER_WORKBENCH'
scene.render.resolution_x = 600
scene.render.resolution_y = 700
if not scene.world:
    scene.world = bpy.data.worlds.new("W")
scene.world.use_nodes = False
scene.world.color = (0.5,0.6,0.7)
light_data = bpy.data.lights.new("Sun",'SUN'); light_data.energy=3
light = bpy.data.objects.new("Sun",light_data); scene.collection.objects.link(light)
light.rotation_euler = (math.radians(50),0,math.radians(30))
cam_data = bpy.data.cameras.new("Cam"); cam = bpy.data.objects.new("Cam",cam_data)
scene.collection.objects.link(cam); scene.camera = cam

def bbox(obj):
    dg = bpy.context.evaluated_depsgraph_get()
    ev = obj.evaluated_get(dg); me = ev.to_mesh()
    mat = obj.matrix_world
    cos=[mat@v.co for v in me.vertices]; ev.to_mesh_clear()
    mn=Vector((min(c.x for c in cos),min(c.y for c in cos),min(c.z for c in cos)))
    mx=Vector((max(c.x for c in cos),max(c.y for c in cos),max(c.z for c in cos)))
    return mn,mx

def render(tag):
    bpy.context.view_layer.update()
    mn,mx=bbox(comb); c=(mn+mx)/2; s=mx-mn
    r=max(s.x,s.y,s.z,0.5)
    cam.location=Vector((c.x, c.y-r*2.6, c.z+r*0.25))
    d=(c-cam.location).normalized()
    cam.rotation_euler=d.to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=os.path.join(OUT,f"gltf_{tag}.png")
    bpy.ops.render.render(write_still=True)
    print(f"  render {tag}: dim=({s.x:.2f},{s.y:.2f},{s.z:.2f})")

scene.frame_set(fr_start); render("1_default")
mid=(fr_start+fr_end)//2
scene.frame_set(mid); render(f"2_frame{mid}")
scene.frame_set(fr_end); render(f"3_frame{fr_end}")
print("FATTO")
