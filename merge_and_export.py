"""
merge_and_export.py
Importa tutti gli FBX nella cartella models/ (versione 7.x da Unity FBX Exporter)
e li unisce in un singolo environment.glb.
I file v6100 vengono saltati automaticamente.
"""
import bpy
import os
import struct
from mathutils import Vector

MODELS_DIR = r"C:\Users\manue\Downloads\EX-SPATIAL\32 sicurezza nel cantiere e percezione del rischio\claudeSpatConverter\viewer\models"
OUTPUT_GLB = os.path.join(MODELS_DIR, "environment.glb")

# ── Patch 1: percorsi texture con ".." ───────────────────────────────────────
import bpy.path as bpath
_orig = bpath.resolve_ncase
def _patched(path):
    try:
        return _orig(os.path.normpath(path))
    except Exception:
        return path
bpath.resolve_ncase = _patched

# ── Patch 2: Biped rig KeyError (Bip01_Pelvis) ───────────────────────────────
try:
    from io_scene_fbx import import_fbx
    _OrigNode = import_fbx.FbxImportHelperNode
    _orig_link = _OrigNode.link_hierarchy

    def _patched_link(self, fbx_tmpl, settings, scene):
        # Wrap armature_setup lookup per gestire rig Biped di 3ds Max
        if self.meshes:
            safe_meshes = []
            for mesh in self.meshes:
                if self in mesh.armature_setup:
                    safe_meshes.append(mesh)
                # else: mesh senza armature_setup → skip silenzioso
            self.meshes = safe_meshes
        return _orig_link(self, fbx_tmpl, settings, scene)

    _OrigNode.link_hierarchy = _patched_link
    print("Patch Biped applicata su FbxImportHelperNode.link_hierarchy")
except Exception as e:
    print(f"Patch Biped non applicata: {e}")

# ── Funzione per leggere versione FBX ────────────────────────────────────────
def fbx_version(filepath):
    try:
        with open(filepath, 'rb') as f:
            header = f.read(27)
            if header[:20] == b'Kaydara FBX Binary  ':
                return struct.unpack('<I', header[23:27])[0]
    except Exception:
        pass
    return 0

# ── Carica transforms.json (posizioni Unity world space per ogni modello) ─────
import json, math
TRANSFORMS_PATH = os.path.join(MODELS_DIR, "transforms.json")
transforms = {}
if os.path.exists(TRANSFORMS_PATH):
    with open(TRANSFORMS_PATH, 'r', encoding='utf-8') as f:
        raw = json.load(f)
    transforms = {k: v for k, v in raw.items() if not k.startswith('_')}
    print(f"Transforms caricati per: {list(transforms.keys())}")
else:
    print("transforms.json non trovato — tutti i modelli all'origine")

# ── Pulisci scena ────────────────────────────────────────────────────────────
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete()

# ── Consolida Skinned Mesh Renderer multipli (BODY, FACE, HAND → unica mesh) ─
def consolidate_skinned_meshes(before_snapshot):
    """
    Dopo import FBX: raggruppa le mesh che condividono lo stesso armature
    e le unifica con join. Risolve i pezzi staccati (testa/mani) in Three.js.
    Restituisce il set di nomi oggetti aggiornato dopo il join.
    """
    from collections import defaultdict

    def current_new():
        return set(o.name for o in bpy.data.objects) - before_snapshot

    # ── Passo 0: se esiste una mesh combinata da Unity (*_CombinedMesh), ─────
    # butta via le mesh skinnate originali (BODY/FACE/HAND, e per i mixamo anche
    # eye/helmet skinnati): sono doppioni con bind rotto. La combinata contiene
    # già tutta la geometria skinnata con bind coerente. Restano gli accessori
    # NON skinnati (casco/occhi bone-parented, attrezzi).
    has_combined = any('combinedmesh' in bpy.data.objects.get(n).name.lower()
                       for n in current_new() if bpy.data.objects.get(n))
    if has_combined:
        for name in list(current_new()):
            obj = bpy.data.objects.get(name)
            if not obj or obj.type != 'MESH':
                continue
            if 'combinedmesh' in obj.name.lower():
                continue  # la mesh buona: tienila
            is_skinned = len(obj.vertex_groups) > 0 or \
                any(m.type == 'ARMATURE' for m in obj.modifiers)
            if is_skinned:
                print(f"    [combined] rimuovo originale skinnato '{obj.name}'")
                bpy.data.objects.remove(obj, do_unlink=True)

    # ── Pre-passo: ripristina Armature modifier mancante ──────────────────
    # Il FBX importer di Blender non crea il modifier per alcune mesh Biped
    # (FACE_mesh, HAND_mesh) anche se hanno vertex groups validi.
    # Le identifichiamo per vertex groups > 0 + nessun modifier armature.
    for name in current_new():
        obj = bpy.data.objects.get(name)
        if not obj or obj.type != 'MESH' or len(obj.vertex_groups) == 0:
            continue
        if any(m.type == 'ARMATURE' for m in obj.modifiers):
            continue
        # Cerca armature nella gerarchia parent
        arm = None
        p = obj.parent
        while p:
            if p.type == 'ARMATURE':
                arm = p
                break
            p = p.parent
        if arm:
            mod = obj.modifiers.new(name='Armature', type='ARMATURE')
            mod.object = arm
            print(f"    [SMR fix-mod] '{obj.name}' ({len(obj.vertex_groups)} vg) → '{arm.name}'")

    # ── Passo 1: dedup armature con bones identici ─────────────────────────
    # Unity FBX Exporter genera una copia dell'armature per ogni SMR.
    # Troviamo i duplicati (stesso set di bones) e li unifichiamo.
    bone_sig_to_arms = defaultdict(list)
    for name in current_new():
        obj = bpy.data.objects.get(name)
        if obj and obj.type == 'ARMATURE':
            sig = tuple(sorted(b.name for b in obj.data.bones))
            if sig:
                bone_sig_to_arms[sig].append(obj)

    arm_remap = {}  # vecchio_nome → arm_principale
    for sig, arms in bone_sig_to_arms.items():
        if len(arms) <= 1:
            continue
        # scegli il principale come quello con più mesh collegate
        arm_mesh_count = defaultdict(int)
        for name in current_new():
            obj = bpy.data.objects.get(name)
            if not obj or obj.type != 'MESH':
                continue
            for mod in obj.modifiers:
                if mod.type == 'ARMATURE' and mod.object:
                    arm_mesh_count[mod.object.name] += 1
                    break
        main_arm = max(arms, key=lambda a: arm_mesh_count.get(a.name, 0))
        for arm in arms:
            if arm != main_arm:
                arm_remap[arm.name] = main_arm

    if arm_remap:
        for name in current_new():
            obj = bpy.data.objects.get(name)
            if not obj or obj.type != 'MESH':
                continue
            for mod in obj.modifiers:
                if mod.type == 'ARMATURE' and mod.object \
                        and mod.object.name in arm_remap:
                    mod.object = arm_remap[mod.object.name]
        for old_name in arm_remap:
            dup = bpy.data.objects.get(old_name)
            if dup:
                bpy.data.objects.remove(dup, do_unlink=True)
        print(f"    [SMR dedup] rimossi {len(arm_remap)} armature duplicati")

    # ── Passo 2: join delle mesh che condividono lo stesso armature ─────────
    arm_to_meshes = defaultdict(list)
    for name in current_new():
        obj = bpy.data.objects.get(name)
        if not obj or obj.type != 'MESH':
            continue
        for mod in obj.modifiers:
            if mod.type == 'ARMATURE' and mod.object:
                arm_to_meshes[mod.object.name].append(obj)
                break

    for arm_name, meshes in arm_to_meshes.items():
        if len(meshes) <= 1:
            continue
        print(f"    [SMR join] {len(meshes)} mesh → '{arm_name}': "
              f"{[m.name for m in meshes]}")

        # ── Allinea le matrici oggetto ──────────────────────────────────────
        # L'import del Biped dà a BODY_mesh una traslazione oggetto spuria,
        # mentre FACE/HAND restano all'origine (posizionate dallo skin).
        # Riferimento = mesh con traslazione minima (quella corretta).
        # Allineare tutte a quella matrice ricongiunge i pezzi (testato).
        ref = min(meshes, key=lambda m: m.matrix_world.translation.length)
        ref_mw = ref.matrix_world.copy()
        for mesh in meshes:
            if mesh is ref:
                continue
            if (mesh.matrix_world.translation - ref_mw.translation).length > 0.01:
                mesh.matrix_world = ref_mw.copy()
                print(f"    [SMR align] '{mesh.name}' → matrice di '{ref.name}'")
        bpy.context.view_layer.update()

        # Usa BODY_mesh come base (ha sempre avuto il modifier corretto)
        body = next((m for m in meshes if 'BODY' in m.name.upper()), meshes[0])
        bpy.ops.object.select_all(action='DESELECT')
        for mesh in meshes:
            mesh.select_set(True)
        bpy.context.view_layer.objects.active = body
        try:
            bpy.ops.object.join()
            print(f"    [SMR join] ✓ → '{body.name}'")
        except Exception as e:
            print(f"    [SMR join] SKIP — {e}")

    # ── Passo 3: correggi SOLO accessori bone-parented (casco, occhi, twist) ─
    # Sono attaccati rigidamente a un osso e NON compensano l'offset orizzontale
    # spurio del rig (mentre gli skinnati sì), quindi galleggiano davanti al corpo.
    # L'offset spurio è ~0.5 indipendente dalla posizione in scena: lo ricavo come
    # (posizione armature − centro orizzontale del corpo skinnato di quell'armature).
    # NON tocco le mesh object-parented (attrezzi, escavatore, props): restano dove sono.
    # Va fatto in REST pose (la posa di export) per bakeare il basis corretto.
    arms_now = [bpy.data.objects.get(n) for n in current_new()
                if bpy.data.objects.get(n) and bpy.data.objects.get(n).type == 'ARMATURE']
    for a in arms_now:
        a.data.pose_position = 'REST'
    bpy.context.view_layer.update()

    def world_center_xy(obj):
        cs = [obj.matrix_world @ Vector(c) for c in obj.bound_box]
        xs = [c.x for c in cs]; ys = [c.y for c in cs]
        return Vector(((min(xs)+max(xs))/2, (min(ys)+max(ys))/2, 0.0))

    # centro orizzontale del corpo skinnato per ogni armature
    spurious = {}
    for arm in arms_now:
        skinned = [bpy.data.objects.get(n) for n in current_new()
                   if bpy.data.objects.get(n) and bpy.data.objects.get(n).type == 'MESH'
                   and any(m.type == 'ARMATURE' and m.object == arm
                           for m in bpy.data.objects.get(n).modifiers)]
        if not skinned:
            continue
        cs = [world_center_xy(s) for s in skinned]
        body_xy = Vector((sum(c.x for c in cs)/len(cs),
                          sum(c.y for c in cs)/len(cs), 0.0))
        spur = arm.matrix_world.translation.copy(); spur.z = 0.0
        spur = spur - body_xy
        spurious[arm.name] = spur

    for name in current_new():
        obj = bpy.data.objects.get(name)
        if not obj or obj.type != 'MESH' or len(obj.vertex_groups) > 0:
            continue
        # SOLO bone-parented (casco/occhi/twist): hanno parent armature + parent_bone
        if not (obj.parent and obj.parent.type == 'ARMATURE' and obj.parent_bone):
            continue
        spur = spurious.get(obj.parent.name)
        if not spur or spur.length < 0.01:
            continue
        # Clamp di sicurezza: l'offset spurio reale è ~0.5. Se è grande (>1.5)
        # significa che il matching armature↔corpo è ambiguo (file multi-personaggio
        # con armature dedotti): meglio non toccare che rompere.
        if spur.length > 1.5:
            print(f"    [ACC skip] '{obj.name}' offset sospetto ({spur.x:.2f},{spur.y:.2f}) — non corretto")
            continue
        mw = obj.matrix_world.copy()
        mw.translation = mw.translation - spur
        obj.matrix_world = mw
        print(f"    [ACC fix] '{obj.name}' -spurious ({spur.x:.3f},{spur.y:.3f})")
    bpy.context.view_layer.update()

    return current_new()


# ── Importa tutti gli FBX validi ─────────────────────────────────────────────
fbx_files = [f for f in os.listdir(MODELS_DIR) if f.lower().endswith('.fbx')]
imported = []

# Solo scena STATICA da Blender. I personaggi animati ora vengono da Unity
# (UnityGLTF), quindi qui saltiamo tutti gli FBX dei personaggi.
STATIC_KEEP = ['TERRITORIO', 'construction_scene']

for fname in sorted(fbx_files):
    fpath = os.path.join(MODELS_DIR, fname)
    if not any(k.lower() in fname.lower() for k in STATIC_KEEP):
        print(f"  SKIP (personaggio → da Unity glTF): {fname}")
        continue
    ver = fbx_version(fpath)
    if ver < 7000:
        print(f"  SKIP (v{ver}): {fname}")
        continue

    print(f"  Importo (v{ver}): {fname}")
    before = set(o.name for o in bpy.data.objects)
    before_actions = set(a.name for a in bpy.data.actions)
    model_prefix = os.path.splitext(fname)[0]

    # Prova 1: import standard
    ok = False
    for attempt, kwargs in enumerate([
        # Tentativo 1: standard
        dict(axis_forward='-Z', axis_up='Y', use_image_search=True),
        # Tentativo 2: Biped fix (ignore leaf bones + auto orientation)
        dict(axis_forward='-Z', axis_up='Y', use_image_search=True,
             ignore_leaf_bones=True, force_connect_children=False,
             automatic_bone_orientation=True),
        # Tentativo 3: solo mesh, niente armature
        dict(axis_forward='-Z', axis_up='Y', use_image_search=True,
             ignore_leaf_bones=True, force_connect_children=True,
             use_anim=False),
    ]):
        try:
            bpy.ops.import_scene.fbx(filepath=fpath, **kwargs)
            after = set(o.name for o in bpy.data.objects)
            new_objs = after - before
            if new_objs:
                # Rinomina le nuove action con prefisso modello per identificarle nel GLB
                after_actions = set(a.name for a in bpy.data.actions)
                new_clips_raw = list(after_actions - before_actions)
                new_clips = []
                for aname in new_clips_raw:
                    action = bpy.data.actions.get(aname)
                    if action:
                        new_name = f"{model_prefix}|{aname}"
                        action.name = new_name
                        new_clips.append(new_name)
                # Consolida SMR multipli (BODY+FACE+HAND → mesh unica)
                new_objs = consolidate_skinned_meshes(before)

                imported.append({'file': fname, 'objects': list(new_objs), 'clips': new_clips})

                # Rinomina i root objects con il prefisso modello
                # Il posizionamento avviene in Three.js, non in Blender
                roots = [bpy.data.objects[n] for n in new_objs
                         if bpy.data.objects.get(n) and
                         (bpy.data.objects[n].parent is None or
                          bpy.data.objects[n].parent.name not in new_objs)]
                root_names = []
                for i, obj in enumerate(roots):
                    suffix = f'_{i}' if i > 0 else ''
                    obj.name = f"{model_prefix}_root{suffix}"
                    root_names.append(obj.name)
                if root_names:
                    print(f"    Root rinominati: {root_names}")

                suffix = '' if attempt == 0 else f' (tentativo {attempt+1})'
                print(f"    → {len(new_objs)} oggetti, {len(new_clips)} clip{suffix}")
                ok = True
                break
        except Exception as e:
            if attempt == 2:
                print(f"    SKIP dopo 3 tentativi: {str(e)[:80]}")
            # Pulisci oggetti parziali prima del prossimo tentativo
            partial = set(o.name for o in bpy.data.objects) - before
            for n in partial:
                o = bpy.data.objects.get(n)
                if o: bpy.data.objects.remove(o, do_unlink=True)

# ── Statistiche ──────────────────────────────────────────────────────────────
total_mesh = sum(1 for o in bpy.data.objects if o.type == 'MESH')
total_anim = len(bpy.data.actions)
print(f"\nTotale: {total_mesh} mesh, {total_anim} animazioni da {len(imported)} file")

# ── Forza REST pose su tutti gli armature prima dell'export ──────────────────
# Senza questo i personaggi Mixamo/Biped vengono esportati nella posa animata corrente
for obj in bpy.data.objects:
    if obj.type == 'ARMATURE':
        obj.data.pose_position = 'REST'
print(f"REST pose applicata a {sum(1 for o in bpy.data.objects if o.type=='ARMATURE')} armature")

# ── Esporta GLB unificato ────────────────────────────────────────────────────
print(f"\nEsporto → {OUTPUT_GLB}")
bpy.ops.export_scene.gltf(
    filepath=OUTPUT_GLB,
    export_format='GLB',
    export_materials='EXPORT',
    export_image_format='AUTO',
    export_animations=True,
    export_skins=True,
    export_yup=True,
    export_apply=False
)

size_mb = os.path.getsize(OUTPUT_GLB) / 1024 / 1024
print(f"FATTO — environment.glb: {size_mb:.1f} MB")
print(f"File importati: {[x['file'] for x in imported]}")

# Scrivi manifest.json per il viewer
import json, time

STATIC_KEYWORDS = ['TERRITORIO', 'Untitled', 'construction_scene']

def get_model_type(fname, has_clips):
    if any(k.lower() in fname.lower() for k in STATIC_KEYWORDS):
        return 'static'
    return 'animated' if has_clips else 'static'

manifest = {
    "glb": "models/environment.glb",
    "sizeMB": round(size_mb, 1),
    "buildId": str(int(time.time())),
    "pieces": [
        {
            "name": x['file'].replace('.fbx','').replace('.FBX',''),
            "file": x['file'],
            "objects": len(x['objects']),
            "type": get_model_type(x['file'], bool(x['clips'])),
            "clips": x['clips'],
            "position": transforms.get(x['file'], {}).get('position', None),
            "scale":    transforms.get(x['file'], {}).get('scale', None)
        }
        for x in imported
    ]
}
manifest_path = os.path.join(os.path.dirname(MODELS_DIR), "manifest.json")
with open(manifest_path, 'w', encoding='utf-8') as f:
    json.dump(manifest, f, indent=2, ensure_ascii=False)
print(f"Manifest scritto: {manifest_path}")
print(f"BuildId: {manifest['buildId']}")
