using System.Collections.Generic;
using UnityEngine;
#if UNITY_EDITOR
using UnityEditor;
#endif

/// <summary>
/// Fonde i SkinnedMeshRenderer multipli di un personaggio (BODY, FACE, HAND, ...)
/// in UN solo SkinnedMeshRenderer, PRESERVANDO le bind pose originali.
///
/// PERCHÉ le bind pose originali e non quelle ricalcolate dalla posa corrente:
/// ricalcolarle dalla posa in cui si trova il personaggio in Unity (spesso una
/// posa d'azione dell'Animator) dà un riferimento di skinning sbagliato → la mesh
/// si accascia a riposo e l'animazione non la raddrizza. Usando le bindposes vere
/// di ogni mesh la fusione è corretta E animabile.
///
/// È RI-ESEGUIBILE: se un personaggio è già stato combinato, lo resetta
/// (riattiva gli SMR originali, elimina la vecchia *_CombinedMesh) e rifà.
///
/// USO:
///   Tools ▸ Combina Skinned Mesh (TUTTI i personaggi)   → uno clic, tutti
///   Tools ▸ Combina Skinned Mesh (selezionati)          → solo i selezionati
/// </summary>
public static class SkinnedMeshCombiner
{
#if UNITY_EDITOR
    [MenuItem("Tools/Combina Skinned Mesh (selezionati)")]
    static void CombineSelected()
    {
        var sel = Selection.gameObjects;
        if (sel == null || sel.Length == 0)
        {
            Debug.LogWarning("[Combiner] Seleziona almeno un personaggio nella Hierarchy.");
            return;
        }
        foreach (var go in sel) Combine(go);
    }

    [MenuItem("Tools/Combina Skinned Mesh (TUTTI i personaggi)")]
    static void CombineAll()
    {
        var animators = Object.FindObjectsOfType<Animator>(true);
        int done = 0, skipped = 0;
        foreach (var anim in animators)
        {
            int total = anim.GetComponentsInChildren<SkinnedMeshRenderer>(true).Length;
            if (total >= 2) { Combine(anim.gameObject); done++; }
            else skipped++;
        }
        Debug.Log($"[Combiner] CombineAll: {done} personaggi combinati, {skipped} saltati.");
    }
#endif

    public static void Combine(GameObject root)
    {
        // 0) RESET (idempotente): riattiva eventuali SMR disattivati da un combine
        //    precedente ed elimina la vecchia *_CombinedMesh, così ripartiamo puliti.
        var existing = root.GetComponentsInChildren<SkinnedMeshRenderer>(true);
        var toDelete = new List<GameObject>();
        foreach (var s in existing)
        {
            if (s.gameObject.name.EndsWith("_CombinedMesh"))
                toDelete.Add(s.gameObject);
            else
                s.gameObject.SetActive(true);
        }
        foreach (var g in toDelete)
        {
#if UNITY_EDITOR
            Object.DestroyImmediate(g);
#else
            Object.Destroy(g);
#endif
        }

        var smrs = new List<SkinnedMeshRenderer>();
        foreach (var s in root.GetComponentsInChildren<SkinnedMeshRenderer>(true))
            if (s.sharedMesh != null && !s.gameObject.name.EndsWith("_CombinedMesh"))
                smrs.Add(s);

        if (smrs.Count < 2)
        {
            Debug.Log($"[Combiner] '{root.name}': meno di 2 SMR, salto.");
            return;
        }

        // 1) Lista ossa unificata
        var bones = new List<Transform>();
        var boneIdx = new Dictionary<Transform, int>();
        foreach (var smr in smrs)
            foreach (var b in smr.bones)
                if (b != null && !boneIdx.ContainsKey(b)) { boneIdx[b] = bones.Count; bones.Add(b); }

        // 2) Bind-world di ogni osso RICAVATO dalle bindposes ORIGINALI (non dalla
        //    posa corrente). boneBindWorld = smr.localToWorld * bindpose.inverse.
        var boneBindWorld = new Dictionary<int, Matrix4x4>();
        foreach (var smr in smrs)
        {
            var bp = smr.sharedMesh.bindposes;
            var sb = smr.bones;
            var l2w = smr.transform.localToWorldMatrix;
            int n = Mathf.Min(sb.Length, bp.Length);
            for (int j = 0; j < n; j++)
            {
                if (sb[j] == null) continue;
                int mi = boneIdx[sb[j]];
                if (!boneBindWorld.ContainsKey(mi))
                    boneBindWorld[mi] = l2w * bp[j].inverse;
            }
        }

        var refT = root.transform;
        var bindposes = new Matrix4x4[bones.Count];
        for (int i = 0; i < bones.Count; i++)
        {
            if (boneBindWorld.TryGetValue(i, out var bw))
                bindposes[i] = bw.inverse * refT.localToWorldMatrix;
            else
                bindposes[i] = bones[i].worldToLocalMatrix * refT.localToWorldMatrix;
        }

        // 3) Geometria: i vertici (spazio bind locale del mesh) portati nello spazio
        //    bind della radice: v' = root.worldToLocal * smr.localToWorld * v.
        var verts = new List<Vector3>();
        var norms = new List<Vector3>();
        var uvs = new List<Vector2>();
        var weights = new List<BoneWeight>();
        var subTris = new List<List<int>>();
        var mats = new List<Material>();
        var w2lRoot = refT.worldToLocalMatrix;

        foreach (var smr in smrs)
        {
            var mesh = smr.sharedMesh;
            int vOff = verts.Count;
            Matrix4x4 delta = w2lRoot * smr.transform.localToWorldMatrix;
            var mv = mesh.vertices; var mn = mesh.normals; var mu = mesh.uv;
            var mw = mesh.boneWeights; var mb = smr.bones;
            for (int i = 0; i < mv.Length; i++)
            {
                verts.Add(delta.MultiplyPoint3x4(mv[i]));
                norms.Add(i < mn.Length ? delta.MultiplyVector(mn[i]).normalized : Vector3.up);
                uvs.Add(i < mu.Length ? mu[i] : Vector2.zero);
                var bw2 = mw[i];
                bw2.boneIndex0 = Remap(mb, bw2.boneIndex0, boneIdx);
                bw2.boneIndex1 = Remap(mb, bw2.boneIndex1, boneIdx);
                bw2.boneIndex2 = Remap(mb, bw2.boneIndex2, boneIdx);
                bw2.boneIndex3 = Remap(mb, bw2.boneIndex3, boneIdx);
                weights.Add(bw2);
            }
            for (int s = 0; s < mesh.subMeshCount; s++)
            {
                var tris = mesh.GetTriangles(s);
                var list = new List<int>(tris.Length);
                foreach (var t in tris) list.Add(t + vOff);
                subTris.Add(list);
                var sm = smr.sharedMaterials;
                mats.Add(s < sm.Length ? sm[s] : (sm.Length > 0 ? sm[0] : null));
            }
        }

        var combined = new Mesh { name = root.name + "_combined" };
        combined.indexFormat = verts.Count > 65000
            ? UnityEngine.Rendering.IndexFormat.UInt32
            : UnityEngine.Rendering.IndexFormat.UInt16;
        combined.SetVertices(verts);
        combined.SetNormals(norms);
        combined.SetUVs(0, uvs);
        combined.boneWeights = weights.ToArray();
        combined.bindposes = bindposes;
        combined.subMeshCount = subTris.Count;
        for (int s = 0; s < subTris.Count; s++) combined.SetTriangles(subTris[s], s);
        combined.RecalculateBounds();

        var go = new GameObject(root.name + "_CombinedMesh");
        go.transform.SetParent(root.transform, false);
        var ns = go.AddComponent<SkinnedMeshRenderer>();
        ns.sharedMesh = combined;
        ns.bones = bones.ToArray();
        ns.rootBone = smrs[0].rootBone;
        ns.sharedMaterials = mats.ToArray();
        ns.updateWhenOffscreen = true;

        foreach (var smr in smrs) smr.gameObject.SetActive(false);

        Debug.Log($"[Combiner] '{root.name}': uniti {smrs.Count} SMR → 1 " +
                  $"({verts.Count} verti, {bones.Count} ossa) [bind originale preservato]");
    }

    static int Remap(Transform[] src, int idx, Dictionary<Transform, int> master)
    {
        if (idx < 0 || idx >= src.Length) return 0;
        var b = src[idx];
        return (b != null && master.TryGetValue(b, out int m)) ? m : 0;
    }
}
