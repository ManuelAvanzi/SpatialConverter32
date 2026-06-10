// Metti questo file in: Assets/Editor/SceneExporter.cs
// Menu Unity: Tools → Export Scene to OBJ

using UnityEngine;
using UnityEditor;
using System.IO;
using System.Text;
using System.Collections.Generic;

public class SceneExporter
{
    [MenuItem("Tools/Export Scene to OBJ")]
    static void ExportScene()
    {
        string path = EditorUtility.SaveFilePanel(
            "Esporta scena come OBJ",
            System.Environment.GetFolderPath(System.Environment.SpecialFolder.Desktop),
            "environment", "obj");

        if (string.IsNullOrEmpty(path)) return;

        MeshRenderer[] renderers = Object.FindObjectsOfType<MeshRenderer>();
        Debug.Log($"Trovati {renderers.Length} MeshRenderer da esportare");

        var objSb  = new StringBuilder();
        var mtlSb  = new StringBuilder();
        var matNames = new HashSet<string>();

        string mtlPath = Path.ChangeExtension(path, "mtl");
        string mtlName = Path.GetFileNameWithoutExtension(mtlPath);

        objSb.AppendLine($"# Esportato da Unity - {System.DateTime.Now}");
        objSb.AppendLine($"mtllib {mtlName}.mtl");
        objSb.AppendLine();

        int vertexOffset = 1; // OBJ è 1-based

        int exported = 0;
        foreach (var renderer in renderers)
        {
            MeshFilter mf = renderer.GetComponent<MeshFilter>();
            if (mf == null || mf.sharedMesh == null) continue;

            Mesh mesh = mf.sharedMesh;
            Transform t = renderer.transform;
            Matrix4x4 worldMatrix = t.localToWorldMatrix;

            // Converti da Unity (Y-up, sinistra) a OBJ (Y-up, destra)
            // Unity usa Z+ forward, OBJ usa Z- forward — flip Z
            Matrix4x4 conversion = Matrix4x4.Scale(new Vector3(1, 1, -1));
            Matrix4x4 m = conversion * worldMatrix;

            string objName = renderer.gameObject.name.Replace(" ", "_");
            objSb.AppendLine($"o {objName}");

            // Vertici
            foreach (var v in mesh.vertices)
            {
                Vector3 wv = m.MultiplyPoint3x4(v);
                objSb.AppendLine($"v {wv.x:F6} {wv.y:F6} {wv.z:F6}");
            }

            // Normali
            foreach (var n in mesh.normals)
            {
                Vector3 wn = m.MultiplyVector(n).normalized;
                objSb.AppendLine($"vn {wn.x:F6} {wn.y:F6} {wn.z:F6}");
            }

            // UV
            var uvs = mesh.uv;
            if (uvs.Length == 0) uvs = new Vector2[mesh.vertexCount];
            foreach (var uv in uvs)
            {
                objSb.AppendLine($"vt {uv.x:F6} {uv.y:F6}");
            }

            // Materiali e triangoli per submesh
            Material[] mats = renderer.sharedMaterials;
            for (int s = 0; s < mesh.subMeshCount; s++)
            {
                Material mat = (s < mats.Length && mats[s] != null) ? mats[s] : null;
                string matName = mat != null ? mat.name.Replace(" ", "_") : "DefaultMat";

                // Aggiungi materiale al .mtl
                if (!matNames.Contains(matName))
                {
                    matNames.Add(matName);
                    mtlSb.AppendLine($"newmtl {matName}");
                    if (mat != null && mat.HasProperty("_Color"))
                    {
                        Color c = mat.color;
                        mtlSb.AppendLine($"Kd {c.r:F4} {c.g:F4} {c.b:F4}");
                        mtlSb.AppendLine($"d  {c.a:F4}");
                    }
                    else
                    {
                        mtlSb.AppendLine("Kd 0.8 0.8 0.8");
                    }

                    // Texture principale
                    if (mat != null && mat.HasProperty("_MainTex") && mat.mainTexture != null)
                    {
                        string texPath = AssetDatabase.GetAssetPath(mat.mainTexture);
                        string texName = Path.GetFileName(texPath);
                        mtlSb.AppendLine($"map_Kd {texName}");
                    }

                    mtlSb.AppendLine("Ka 0.2 0.2 0.2");
                    mtlSb.AppendLine("Ks 0.1 0.1 0.1");
                    mtlSb.AppendLine("Ns 10");
                    mtlSb.AppendLine();
                }

                objSb.AppendLine($"usemtl {matName}");
                objSb.AppendLine("s off");

                int[] tris = mesh.GetTriangles(s);
                bool hasNormals = mesh.normals.Length > 0;
                bool hasUVs = mesh.uv.Length > 0;

                // OBJ: i triangoli in Unity sono CW, in OBJ CCW — invertiamo
                for (int i = 0; i < tris.Length; i += 3)
                {
                    int a = tris[i]     + vertexOffset;
                    int b = tris[i + 1] + vertexOffset;
                    int c = tris[i + 2] + vertexOffset;

                    string fa = hasNormals && hasUVs ? $"{a}/{a}/{a}" : hasNormals ? $"{a}//{a}" : $"{a}";
                    string fb = hasNormals && hasUVs ? $"{b}/{b}/{b}" : hasNormals ? $"{b}//{b}" : $"{b}";
                    string fc = hasNormals && hasUVs ? $"{c}/{c}/{c}" : hasNormals ? $"{c}//{c}" : $"{c}";

                    // Inverti ordine (b, a invece di a, b) per correggere CCW
                    objSb.AppendLine($"f {fc} {fb} {fa}");
                }
            }

            vertexOffset += mesh.vertexCount;
            objSb.AppendLine();
            exported++;

            if (exported % 50 == 0)
                EditorUtility.DisplayProgressBar("Esportazione OBJ", $"{exported}/{renderers.Length}", (float)exported / renderers.Length);
        }

        EditorUtility.ClearProgressBar();

        File.WriteAllText(path, objSb.ToString());
        File.WriteAllText(mtlPath, mtlSb.ToString());

        Debug.Log($"✅ Esportati {exported} oggetti in:\n{path}");
        EditorUtility.RevealInFinder(path);
    }
}
