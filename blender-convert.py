"""
blender-convert.py
Converte tutti i file FBX in una cartella in GLB usando Blender in background.

Uso (dalla riga di comando):
  blender --background --python blender-convert.py -- <cartella-models> [--merge]

Con --merge: unisce tutti gli FBX in un unico GLB (utile per scene composte da piu' mesh).
"""

import bpy
import sys
import os
import argparse

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    # Rimuovi mesh, materiali, ecc. orfani
    for block in bpy.data.meshes:
        bpy.data.meshes.remove(block)
    for block in bpy.data.materials:
        bpy.data.materials.remove(block)
    for block in bpy.data.textures:
        bpy.data.textures.remove(block)
    for block in bpy.data.images:
        bpy.data.images.remove(block)

def import_fbx(fbx_path):
    print(f"  Importo: {fbx_path}")
    bpy.ops.import_scene.fbx(
        filepath=fbx_path,
        use_custom_normals=True,
        use_image_search=True,
        use_alpha_decals=False,
        decal_offset=0.0,
        use_anim=True,
        anim_offset=1.0,
        use_subsurf=False,
        use_custom_props=True,
        ignore_leaf_bones=False,
        force_connect_children=False,
        automatic_bone_orientation=False,
        primary_bone_axis='Y',
        secondary_bone_axis='X',
        use_prepost_rot=True,
        axis_forward='-Z',
        axis_up='Y'
    )

def export_glb(output_path, export_animations=True):
    print(f"  Esporto GLB: {output_path}")
    bpy.ops.export_scene.gltf(
        filepath=output_path,
        export_format='GLB',
        export_texcoords=True,
        export_normals=True,
        export_draco_mesh_compression_enable=False,
        export_materials='EXPORT',
        export_colors=True,
        use_mesh_edges=False,
        use_mesh_vertices=False,
        export_cameras=False,
        export_lights=False,
        export_extras=False,
        export_yup=True,
        export_apply=False,
        export_animations=export_animations,
        export_frame_range=True,
        export_frame_step=1,
        export_force_sampling=True,
        export_nla_strips=True,
        export_def_bones=False,
        export_optimize_animation_size=False,
        export_anim_single_armature=True,
        export_reset_pose_bones=True,
        export_current_frame=False,
        export_skins=True,
        export_morph=True,
        export_morph_normal=True,
        export_morph_tangent=False,
        export_image_format='AUTO',
        export_jpeg_quality=85
    )

def convert_single(fbx_path, output_path):
    clear_scene()
    import_fbx(fbx_path)
    export_glb(output_path)
    print(f"  ✅ OK: {os.path.basename(output_path)}")

def convert_merged(fbx_files, output_path):
    """Importa tutti gli FBX e li esporta in un unico GLB."""
    clear_scene()
    for fbx_path in fbx_files:
        import_fbx(fbx_path)
    export_glb(output_path)
    print(f"  ✅ Merged GLB: {os.path.basename(output_path)}")

def main():
    # Separa gli argomenti di Blender dai nostri
    argv = sys.argv
    if '--' in argv:
        argv = argv[argv.index('--') + 1:]
    else:
        argv = []

    parser = argparse.ArgumentParser(description='FBX to GLB converter via Blender')
    parser.add_argument('models_dir', help='Cartella contenente i file FBX')
    parser.add_argument('--merge', action='store_true', help='Unisci tutti gli FBX in un unico GLB')
    parser.add_argument('--output', help='Percorso output (solo con --merge)')
    args = parser.parse_args(argv)

    models_dir = args.models_dir
    if not os.path.isdir(models_dir):
        print(f"❌ Cartella non trovata: {models_dir}")
        sys.exit(1)

    fbx_files = [
        os.path.join(models_dir, f)
        for f in os.listdir(models_dir)
        if f.lower().endswith('.fbx')
    ]

    if not fbx_files:
        print(f"⚠️  Nessun FBX in: {models_dir}")
        sys.exit(0)

    print(f"\n🔄 Conversione FBX → GLB")
    print(f"   Directory: {models_dir}")
    print(f"   FBX trovati: {len(fbx_files)}")

    if args.merge:
        # Filtra solo FBX di ambienti (escludi animation-only FBX)
        env_fbx = [f for f in fbx_files if 'Animation_FBX' not in f]
        anim_fbx = [f for f in fbx_files if 'Animation_FBX' in f]

        out_env = args.output or os.path.join(models_dir, 'environment.glb')
        if env_fbx:
            print(f"\n  🏗️  Ambiente ({len(env_fbx)} FBX):")
            convert_merged(env_fbx, out_env)

        if anim_fbx:
            out_anim = os.path.join(os.path.dirname(out_env), 'animations.glb')
            print(f"\n  🎬 Animazioni ({len(anim_fbx)} FBX):")
            convert_merged(anim_fbx, out_anim)
    else:
        # Converti ogni FBX separatamente
        for fbx_path in fbx_files:
            name = os.path.splitext(os.path.basename(fbx_path))[0]
            out_path = os.path.join(models_dir, name + '.glb')
            convert_single(fbx_path, out_path)

    print(f"\n✅ Conversione completata.")

main()
