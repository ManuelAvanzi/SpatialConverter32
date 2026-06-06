"""Ispeziona il nuovo Axe_Wield FBX: elenca mesh, vertex groups, skin."""
import bpy, os
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

F = r"C:\Users\manue\Downloads\EX-SPATIAL\32 sicurezza nel cantiere e percezione del rischio\claudeSpatConverter\viewer\models\Axe_Wield_01_FINAL2.fbx"
bpy.ops.object.select_all(action='SELECT'); bpy.ops.object.delete()
bpy.ops.import_scene.fbx(filepath=F, axis_forward='-Z', axis_up='Y', use_image_search=False)

meshes = [o for o in bpy.data.objects if o.type == 'MESH']
arms   = [o for o in bpy.data.objects if o.type == 'ARMATURE']
print(f"\n=== MESH ({len(meshes)}) ===")
for o in sorted(meshes, key=lambda x:x.name):
    nverts = len(o.data.vertices)
    nvg = len(o.vertex_groups)
    has_arm = any(m.type=='ARMATURE' for m in o.modifiers)
    par = o.parent.name if o.parent else '—'
    ptype = o.parent_type if o.parent else '—'
    print(f"  {o.name:28} verts={nverts:6} vgroups={nvg:3} armmod={has_arm} parent={par}/{ptype}")
print(f"\nArmature: {[a.name for a in arms]}")
print(f"Totale mesh: {len(meshes)}")
