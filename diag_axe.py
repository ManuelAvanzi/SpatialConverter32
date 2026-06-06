"""
Diagnostico: importa solo Axe_Wield_01_FINAL2.fbx e stampa
tutti gli oggetti con tipo, parent e, per le mesh, il loro armature modifier.
"""
import bpy, os
import bpy.path as bpath

_orig = bpath.resolve_ncase
def _patched(path):
    try:
        return _orig(os.path.normpath(path))
    except Exception:
        return path
bpath.resolve_ncase = _patched

MODELS_DIR = r"C:\Users\manue\Downloads\EX-SPATIAL\32 sicurezza nel cantiere e percezione del rischio\claudeSpatConverter\viewer\models"
FBX = os.path.join(MODELS_DIR, "Axe_Wield_01_FINAL2.fbx")

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

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

bpy.ops.import_scene.fbx(filepath=FBX, axis_forward='-Z', axis_up='Y', use_image_search=False)

print("\n=== OGGETTI IMPORTATI ===")
for obj in sorted(bpy.data.objects, key=lambda o: o.name):
    parent_name = obj.parent.name if obj.parent else "—"
    if obj.type == 'ARMATURE':
        bones = [b.name for b in obj.data.bones]
        print(f"  [ARMATURE] {obj.name}  parent={parent_name}  bones={len(bones)}")
        for b in bones[:5]:
            print(f"      bone: {b}")
        if len(bones) > 5:
            print(f"      ... (+{len(bones)-5} altri)")
    elif obj.type == 'MESH':
        arms = [m.object.name if m.object else 'None'
                for m in obj.modifiers if m.type == 'ARMATURE']
        vg = list(obj.vertex_groups.keys())[:5]
        print(f"  [MESH]     {obj.name}  parent={parent_name}  armature_mods={arms}  vgroups={len(obj.vertex_groups)} ({vg})")
    else:
        print(f"  [{obj.type:8}] {obj.name}  parent={parent_name}")

print(f"\nTotale: {len(bpy.data.objects)} oggetti")
print(f"Mesh: {sum(1 for o in bpy.data.objects if o.type=='MESH')}")
print(f"Armature: {sum(1 for o in bpy.data.objects if o.type=='ARMATURE')}")
