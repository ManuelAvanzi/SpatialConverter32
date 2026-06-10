// SpatialInteractableExporter.cs
// Esporta tutti gli Spatial Interactable della scena aperta in un JSON
// importabile dal viewer web (claudeSpatConverter) tramite "🎮 Importa da Unity…".
//
// Uso: Tools ▸ Esporta Interactable per il Web
//
// Mappa: posizione world (conversione assi Unity→Three: X=-X, Y=Y, Z=+Z),
// interactText → text, interactiveRadius → radius, visibilityRadius, iconType.
// L'animazione (anim) resta vuota: nel viewer viene auto-assegnata per nome
// oppure la scegli a mano nel menu. Il merge in import avviene per "uid"
// (path gerarchico stabile), così riesportare aggiorna invece di duplicare.

using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using SpatialSys.UnitySDK;

public static class SpatialInteractableExporter
{
    private const string MenuPath = "Tools/Esporta Interactable per il Web";

    [MenuItem(MenuPath)]
    public static void Export()
    {
        // include anche i GameObject disattivati
        var items = Object.FindObjectsOfType<SpatialInteractable>(true);
        if (items == null || items.Length == 0)
        {
            EditorUtility.DisplayDialog("Esporta Interactable",
                "Nessun componente Spatial Interactable trovato nella scena aperta.", "OK");
            return;
        }

        var ci = CultureInfo.InvariantCulture;
        var sb = new StringBuilder();
        sb.Append("{\n");
        sb.Append("  \"exportedFrom\": \"Unity\",\n");
        sb.Append("  \"scene\": \"").Append(Escape(EditorSceneManager.GetActiveScene().name)).Append("\",\n");
        sb.Append("  \"exportedAt\": \"").Append(System.DateTime.UtcNow.ToString("o")).Append("\",\n");
        sb.Append("  \"interactables\": [\n");

        for (int i = 0; i < items.Length; i++)
        {
            var it = items[i];
            var t = it.transform;
            Vector3 p = t.position;

            // Conversione assi Unity → Three.js (verificata empiricamente sugli
            // interactable già piazzati a mano: solo la X va invertita, la Z NO).
            float tx = -p.x, ty = p.y, tz = p.z;

            string uid = HierarchyPath(t);   // stabile e unico nella scena
            string name = it.gameObject.name;

            sb.Append("    {");
            sb.Append("\"uid\": \"").Append(Escape(uid)).Append("\", ");
            sb.Append("\"name\": \"").Append(Escape(name)).Append("\", ");
            sb.Append("\"pos\": [")
              .Append(F(tx, ci)).Append(", ").Append(F(ty, ci)).Append(", ").Append(F(tz, ci))
              .Append("], ");
            sb.Append("\"text\": \"").Append(Escape(it.interactText)).Append("\", ");
            sb.Append("\"radius\": ").Append(F(it.interactiveRadius, ci)).Append(", ");
            sb.Append("\"visibilityRadius\": ").Append(F(it.visibilityRadius, ci)).Append(", ");
            sb.Append("\"icon\": \"").Append(Escape(it.iconType.ToString())).Append("\", ");
            sb.Append("\"anim\": \"\"");
            sb.Append("}");
            if (i < items.Length - 1) sb.Append(",");
            sb.Append("\n");
        }

        sb.Append("  ]\n");
        sb.Append("}\n");

        string defaultName = "unity-interactables.json";
        string path = EditorUtility.SaveFilePanel(
            "Esporta Interactable per il Web", GuessDefaultDir(), defaultName, "json");
        if (string.IsNullOrEmpty(path)) return;

        File.WriteAllText(path, sb.ToString(), new UTF8Encoding(false));
        Debug.Log($"[SpatialInteractableExporter] Esportati {items.Length} interactable → {path}");
        EditorUtility.DisplayDialog("Esporta Interactable",
            $"Esportati {items.Length} interactable in:\n{path}\n\n" +
            "Nel viewer web (in ?edit): tab Spatial ▸ 🎮 Importa da Unity… e scegli questo file.",
            "OK");
    }

    // Path gerarchico tipo "Environment/Interactable-scivolamento"
    private static string HierarchyPath(Transform t)
    {
        var stack = new List<string>();
        var cur = t;
        while (cur != null) { stack.Add(cur.name); cur = cur.parent; }
        stack.Reverse();
        return string.Join("/", stack);
    }

    // Prova a indovinare la cartella viewer del progetto web accanto a EX-SPATIAL
    private static string GuessDefaultDir()
    {
        string[] candidates =
        {
            @"C:\Users\manue\Desktop\ProgettiClaude\SpatialConverter\platform\content",
            @"C:\Users\manue\Desktop\ProgettiClaude\SpatialConverter\platform\viewer",
            @"C:\Users\manue\Desktop\ProgettiClaude\SpatialConverter\platform",
        };
        foreach (var c in candidates) if (Directory.Exists(c)) return c;
        return Application.dataPath;
    }

    private static string F(float v, CultureInfo ci)
    {
        return System.Math.Round(v, 3).ToString(ci);
    }

    private static string Escape(string s)
    {
        if (string.IsNullOrEmpty(s)) return "";
        return s.Replace("\\", "\\\\").Replace("\"", "\\\"")
                .Replace("\n", "\\n").Replace("\r", "").Replace("\t", "\\t");
    }
}
