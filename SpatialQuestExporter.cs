// SpatialQuestExporter.cs
// Esporta le SpatialQuest della scena (nome, descrizione, task) e i link
// interactable→task (letti dagli onInteractEvent.questEvent) in un JSON
// importabile dal viewer web tramite "🎮 Importa da Unity…".
//
// Uso: Tools ▸ Esporta Quest per il Web
//
// Output: { quests:[{ id, name, description, tasksAreOrdered, startAutomatically,
//                      saveUserProgress, celebrateOnComplete,
//                      tasks:[{ id, name, type, progressSteps }] }],
//           links:[{ uid, questId, taskId, type }] }
// type task: 0=Check (spunta una volta), 1=ProgressBar (N step).
// type link: 3=AddTaskProgress, 4=CompleteTask.
// uid = path gerarchico dell'interactable (stesso usato dall'export interactable),
// così il web aggancia il link all'interactable importato.

using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Text;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using SpatialSys.UnitySDK;
using SpatialSys.UnitySDK.Internal;

public static class SpatialQuestExporter
{
    [MenuItem("Tools/Esporta Quest per il Web")]
    public static void Export()
    {
        var quests = Object.FindObjectsOfType<SpatialQuest>(true);
        if (quests == null || quests.Length == 0)
        {
            EditorUtility.DisplayDialog("Esporta Quest",
                "Nessun componente Spatial Quest trovato nella scena aperta.", "OK");
            return;
        }

        var ci = CultureInfo.InvariantCulture;
        var sb = new StringBuilder();
        sb.Append("{\n");
        sb.Append("  \"exportedFrom\": \"Unity\",\n");
        sb.Append("  \"scene\": \"").Append(Escape(EditorSceneManager.GetActiveScene().name)).Append("\",\n");
        sb.Append("  \"exportedAt\": \"").Append(System.DateTime.UtcNow.ToString("o")).Append("\",\n");

        // ── Quest + task ────────────────────────────────────────────────────
        sb.Append("  \"quests\": [\n");
        for (int q = 0; q < quests.Length; q++)
        {
            var quest = quests[q];
            sb.Append("    {");
            sb.Append("\"id\": ").Append(quest.id).Append(", ");
            sb.Append("\"name\": \"").Append(Escape(quest.questName)).Append("\", ");
            sb.Append("\"description\": \"").Append(Escape(quest.description)).Append("\", ");
            sb.Append("\"tasksAreOrdered\": ").Append(quest.tasksAreOrdered ? "true" : "false").Append(", ");
            sb.Append("\"startAutomatically\": ").Append(quest.startAutomatically ? "true" : "false").Append(", ");
            sb.Append("\"saveUserProgress\": ").Append(quest.saveUserProgress ? "true" : "false").Append(", ");
            sb.Append("\"celebrateOnComplete\": ").Append(quest.celebrateOnComplete ? "true" : "false").Append(", ");
            sb.Append("\"tasks\": [");
            var tasks = quest.tasks ?? new SpatialQuest.Task[0];
            for (int t = 0; t < tasks.Length; t++)
            {
                var task = tasks[t];
                sb.Append("{");
                sb.Append("\"id\": ").Append(task.id).Append(", ");
                sb.Append("\"name\": \"").Append(Escape(task.name)).Append("\", ");
                sb.Append("\"type\": ").Append((int)task.type).Append(", ");
                sb.Append("\"progressSteps\": ").Append(task.progressSteps);
                sb.Append("}");
                if (t < tasks.Length - 1) sb.Append(", ");
            }
            sb.Append("]}");
            if (q < quests.Length - 1) sb.Append(",");
            sb.Append("\n");
        }
        sb.Append("  ],\n");

        // ── Link diretti interactable → task (dagli onInteractEvent) ────────
        var links = new List<string>();
        foreach (var it in Object.FindObjectsOfType<SpatialInteractable>(true))
            CollectLinks(it.onInteractEvent, HierarchyPath(it.transform), links);
        sb.Append("  \"links\": [\n");
        for (int i = 0; i < links.Count; i++)
        {
            sb.Append("    ").Append(links[i]);
            if (i < links.Count - 1) sb.Append(",");
            sb.Append("\n");
        }
        sb.Append("  ],\n");

        // ── Zone-trigger → task (dagli onEnterEvent dei SpatialTriggerEvent) ─
        // Posizione world convertita in coordinate Three (X=-X, Y=Y, Z=+Z),
        // come per gli interactable. Il web la aggancia all'interactable più vicino.
        var triggers = new List<string>();
        foreach (var tr in Object.FindObjectsOfType<SpatialTriggerEvent>(true))
            CollectTriggers(tr.onEnterEvent, tr.transform, triggers);
        sb.Append("  \"taskTriggers\": [\n");
        for (int i = 0; i < triggers.Count; i++)
        {
            sb.Append("    ").Append(triggers[i]);
            if (i < triggers.Count - 1) sb.Append(",");
            sb.Append("\n");
        }
        sb.Append("  ]\n");
        sb.Append("}\n");

        string path = EditorUtility.SaveFilePanel(
            "Esporta Quest per il Web", GuessDefaultDir(), "unity-quests.json", "json");
        if (string.IsNullOrEmpty(path)) return;

        File.WriteAllText(path, sb.ToString(), new UTF8Encoding(false));
        Debug.Log($"[SpatialQuestExporter] {quests.Length} quest, {links.Count} link → {path}");
        EditorUtility.DisplayDialog("Esporta Quest",
            $"Esportate {quests.Length} quest e {links.Count} link interactable→task in:\n{path}\n\n" +
            "Nel viewer web (?edit): tab Spatial ▸ 🎮 Importa da Unity… e scegli questo file.",
            "OK");
    }

    private static void CollectLinks(SpatialEvent ev, string uid, List<string> outList)
    {
        if (ev == null || ev.questEvent == null || ev.questEvent.events == null) return;
        foreach (var e in ev.questEvent.events)
        {
            if (!QuestEvent.QuestEventHasTaskParam(e.questEventType)) continue; // solo task-type
            outList.Add("{\"uid\": \"" + Escape(uid) + "\", \"questId\": " + e.questID
                + ", \"taskId\": " + e.taskID + ", \"type\": " + (int)e.questEventType + "}");
        }
    }

    private static void CollectTriggers(SpatialEvent ev, Transform t, List<string> outList)
    {
        if (ev == null || ev.questEvent == null || ev.questEvent.events == null) return;
        var ci = CultureInfo.InvariantCulture;
        Vector3 p = t.position;                 // world
        string pos = "[" + F(-p.x, ci) + ", " + F(p.y, ci) + ", " + F(p.z, ci) + "]";  // X=-X, Z=+Z
        foreach (var e in ev.questEvent.events)
        {
            if (!QuestEvent.QuestEventHasTaskParam(e.questEventType)) continue;
            outList.Add("{\"name\": \"" + Escape(t.gameObject.name) + "\", \"pos\": " + pos
                + ", \"questId\": " + e.questID + ", \"taskId\": " + e.taskID + ", \"type\": " + (int)e.questEventType + "}");
        }
    }

    private static string HierarchyPath(Transform t)
    {
        var stack = new List<string>();
        var cur = t;
        while (cur != null) { stack.Add(cur.name); cur = cur.parent; }
        stack.Reverse();
        return string.Join("/", stack);
    }

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
