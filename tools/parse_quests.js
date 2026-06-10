// Estrae quest + task + link interactable→task dallo scene YAML di Unity,
// producendo unity-quests.json importabile dal viewer. Uso una-tantum.
const fs = require('fs');
const SCENE = process.argv[2];
const OUT = process.argv[3] || 'viewer/unity-quests.json';
const IA_GUID = '7a1c437d99c9a4616adbe21f3ffa0e18';   // SpatialInteractable
const QUEST_GUID = '843f1df22955d4c8193e21ccb10c9077'; // SpatialQuest
const TRIG_GUID = '24533cd6da2394ed2bea6783b0af62c8'; // SpatialTriggerEvent

const text = fs.readFileSync(SCENE, 'utf8');
// Split in documenti YAML: "--- !u!<class> &<fileID>"
const docs = [];
const re = /^--- !u!(\d+) &(\d+).*$/gm;
let m, idxs = [];
while ((m = re.exec(text))) idxs.push({ cls: +m[1], fid: m[2], start: m.index });
for (let i = 0; i < idxs.length; i++) {
  const body = text.slice(idxs[i].start, i + 1 < idxs.length ? idxs[i + 1].start : text.length);
  docs.push({ ...idxs[i], body });
}

// 1) Mappa fileID GameObject → nome
const goName = {};
for (const d of docs) if (d.cls === 1) {
  const mm = d.body.match(/^\s{2}m_Name:\s*(.*)$/m);
  goName[d.fid] = mm ? mm[1].trim() : ('GO_' + d.fid);
}

// helper: estrae i taskID dai questEvent dentro un blocco (onInteractEvent)
function questLinksFromBlock(block) {
  const out = [];
  const evMatch = block.match(/questEvent:\s*\n\s*events:\s*\n([\s\S]*?)(?:\n\s{4}\w|\n\s{2}\w|$)/);
  if (!evMatch) return out;
  const evBody = evMatch[1];
  const entryRe = /-\s*questID:\s*(\d+)\s*\n\s*questEventType:\s*(\d+)\s*\n\s*taskID:\s*(\d+)/g;
  let e;
  while ((e = entryRe.exec(evBody))) out.push({ questId: +e[1], type: +e[2], taskId: +e[3] });
  return out;
}

// Transform graph per posizioni world
const goTransform = {}, trPos = {}, trFather = {};
for (const d of docs) if (d.cls === 4) {
  const go = (d.body.match(/m_GameObject:\s*\{fileID:\s*(\d+)\}/) || [])[1];
  const p = d.body.match(/m_LocalPosition:\s*\{x:\s*([-\d.eE]+),\s*y:\s*([-\d.eE]+),\s*z:\s*([-\d.eE]+)\}/);
  goTransform[go] = d.fid; trPos[d.fid] = p ? [+p[1], +p[2], +p[3]] : [0, 0, 0];
  trFather[d.fid] = (d.body.match(/m_Father:\s*\{fileID:\s*(\d+)\}/) || [])[1];
}
function worldPos(trId) { let x = 0, y = 0, z = 0, c = trId, g = 0; while (c && c !== '0' && g++ < 50) { const p = trPos[c] || [0, 0, 0]; x += p[0]; y += p[1]; z += p[2]; c = trFather[c]; } return [x, y, z]; }

// 2a) Link diretti dagli SpatialInteractable (onInteractEvent) — se presenti
const links = [];
for (const d of docs) {
  if (d.cls !== 114 || !d.body.includes('guid: ' + IA_GUID)) continue;
  const go = (d.body.match(/m_GameObject:\s*\{fileID:\s*(\d+)\}/) || [])[1];
  const name = goName[go] || 'Interactable';
  const oi = d.body.indexOf('onInteractEvent:');
  if (oi < 0) continue;
  const oe = d.body.indexOf('onEnterEvent:', oi);
  for (const l of questLinksFromBlock(d.body.slice(oi, oe > 0 ? oe : undefined)))
    if (l.type === 3 || l.type === 4) links.push({ uid: name, questId: l.questId, taskId: l.taskId, type: l.type });
}

// 2b) Zone-trigger (SpatialTriggerEvent → onEnterEvent) con posizione world,
// convertita in coordinate Three (X=-X, Y=Y, Z=+Z).
const taskTriggers = [];
for (const d of docs) {
  if (d.cls !== 114 || !d.body.includes('guid: ' + TRIG_GUID)) continue;
  const go = (d.body.match(/m_GameObject:\s*\{fileID:\s*(\d+)\}/) || [])[1];
  const oe = d.body.indexOf('onEnterEvent:');
  const ox = d.body.indexOf('onExitEvent:', oe);
  for (const l of questLinksFromBlock(d.body.slice(oe, ox > 0 ? ox : undefined))) {
    if (l.type !== 3 && l.type !== 4) continue;
    const w = worldPos(goTransform[go]);
    taskTriggers.push({ name: goName[go], pos: [-w[0], w[1], w[2]].map(v => +v.toFixed(3)), questId: l.questId, taskId: l.taskId, type: l.type });
  }
}

// 3) Quest + task dagli SpatialQuest
const quests = [];
for (const d of docs) {
  if (d.cls !== 114) continue;
  if (!d.body.includes('guid: ' + QUEST_GUID)) continue;
  const id = +((d.body.match(/^\s{2}id:\s*(\d+)/m) || [])[1] || 0);
  const name = ((d.body.match(/^\s{2}questName:\s*(.*)$/m) || [])[1] || 'Quest').trim();
  // description può continuare su righe indentate
  let desc = '';
  const dm = d.body.match(/^\s{2}description:\s*(.*(?:\n\s{4}.*)*)/m);
  if (dm) desc = dm[1].replace(/\n\s+/g, ' ').trim();
  const b = k => /1|true/.test(((d.body.match(new RegExp('^\\s{2}' + k + ':\\s*(\\S+)', 'm')) || [])[1] || ''));
  // tasks
  const tasks = [];
  const tasksIdx = d.body.indexOf('\n  tasks:');
  if (tasksIdx >= 0) {
    const tBody = d.body.slice(tasksIdx);
    const tRe = /-\s*id:\s*(\d+)\s*\n\s*name:\s*(.*)\s*\n\s*type:\s*(\d+)\s*\n\s*progressSteps:\s*(\d+)/g;
    let t;
    while ((t = tRe.exec(tBody))) tasks.push({ id: +t[1], name: t[2].trim().replace(/^'|'$/g, ''), type: +t[3], progressSteps: +t[4] });
  }
  quests.push({
    id, name, description: desc,
    tasksAreOrdered: b('tasksAreOrdered'), startAutomatically: b('startAutomatically'),
    saveUserProgress: b('saveUserProgress'), celebrateOnComplete: b('celebrateOnComplete'),
    tasks,
  });
}

const result = { exportedFrom: 'parse_quests.js', exportedAt: new Date().toISOString(), quests, links, taskTriggers };
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log('Scritto', OUT);
console.log('Quest:', quests.length, '| task:', quests.reduce((a, q) => a + q.tasks.length, 0), '| link diretti:', links.length, '| taskTriggers:', taskTriggers.length);
quests.forEach(q => console.log('  Quest', q.id, q.name, '—', q.tasks.length, 'task'));
console.log('TaskTrigger (nome → quest/task @ posThree):');
taskTriggers.forEach(l => console.log('   ', (l.name || '?').padEnd(26), '→ q' + l.questId + ' t' + l.taskId, JSON.stringify(l.pos)));
