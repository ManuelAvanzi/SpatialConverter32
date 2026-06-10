// Estrae dallo scene YAML di Unity la "macchina a stati" degli interactable:
// stato iniziale (m_IsActive) + azioni degli onInteractEvent (SetActive/Play…).
// Output: unity-actions.json importabile dal viewer (🎮 Importa da Unity…).
//
// Uso: node parse_actions.js <scena.unity> <output.json>
const fs = require('fs');
const SCENE = process.argv[2];
const OUT = process.argv[3] || 'unity-actions.json';
const IA_GUID = '7a1c437d99c9a4616adbe21f3ffa0e18';   // SpatialInteractable
const TR_GUID = '24533cd6da2394ed2bea6783b0af62c8';   // SpatialTriggerEvent

const text = fs.readFileSync(SCENE, 'utf8');
const re = /^--- !u!(\d+) &(\d+).*$/gm;
let m, idxs = [];
while ((m = re.exec(text))) idxs.push({ cls: +m[1], fid: m[2], start: m.index });
const docs = idxs.map((d, i) => ({ ...d, body: text.slice(d.start, i + 1 < idxs.length ? idxs[i + 1].start : text.length) }));
const byFid = {}; docs.forEach(d => byFid[d.fid] = d);

// GameObject: nome, attivo, componenti
const goName = {}, goActive = {}, goComponents = {};
for (const d of docs) if (d.cls === 1) {
  goName[d.fid] = ((d.body.match(/^\s{2}m_Name:\s*(.*)$/m) || [])[1] || '').trim();
  goActive[d.fid] = ((d.body.match(/^\s{2}m_IsActive:\s*(\d)/m) || [])[1] || '1') === '1';
  goComponents[d.fid] = [...d.body.matchAll(/component:\s*\{fileID:\s*(\d+)\}/g)].map(x => x[1]);
}
// Component → GameObject
const compGo = {};
for (const d of docs) {
  const go = (d.body.match(/m_GameObject:\s*\{fileID:\s*(\d+)\}/) || [])[1];
  if (go) compGo[d.fid] = go;
}
// Path gerarchico (per uid identici all'exporter interactable)
const trFather = {}, goTr = {};
for (const d of docs) if (d.cls === 4) {
  const go = compGo[d.fid];
  if (go) goTr[go] = d.fid;
  trFather[d.fid] = (d.body.match(/m_Father:\s*\{fileID:\s*(\d+)\}/) || [])[1];
}
function goWorldPos(go) {
  let tr = goTr[go]; let x = 0, y = 0, z = 0, guard = 0;
  while (tr && tr !== '0' && guard++ < 50) {
    const d = byFid[tr];
    const p = d && d.body.match(/m_LocalPosition:\s*\{x:\s*([-\d.eE]+),\s*y:\s*([-\d.eE]+),\s*z:\s*([-\d.eE]+)\}/);
    if (p) { x += +p[1]; y += +p[2]; z += +p[3]; }
    tr = trFather[tr];
  }
  return [x, y, z];
}
function goPath(go) {
  const parts = []; let tr = goTr[go]; let guard = 0;
  while (tr && tr !== '0' && guard++ < 50) {
    const g = compGo[tr];
    if (g && goName[g] != null) parts.unshift(goName[g]);
    tr = trFather[tr];
  }
  return parts.join('/');
}

// Risolve il target di una call: GameObject diretto o componente → suo GameObject
function resolveTarget(fid) {
  if (goName[fid] != null) return { go: fid };
  const go = compGo[fid];
  if (go && goName[go] != null) return { go, viaComponent: byFid[fid] ? byFid[fid].cls : 0 };
  return null;   // probabilmente dentro un prefab (non risolvibile dallo YAML della scena)
}

// Estrae le persistent call da un blocco evento (testo fra l'inizio dell'evento e il successivo)
function parseCalls(block) {
  const calls = [];
  const callRe = /- m_Target:\s*\{fileID:\s*(\d+)\}[\s\S]*?m_MethodName:\s*([^\n]*)[\s\S]*?m_BoolArgument:\s*(\d)/g;
  let c;
  while ((c = callRe.exec(block))) {
    calls.push({ targetFid: c[1], method: c[2].trim(), boolArg: c[3] === '1' });
  }
  return calls;
}

// Per ogni SpatialInteractable / SpatialTriggerEvent: stato iniziale + azioni
function extract(guid, eventKey, nextKeys) {
  const out = [];
  for (const d of docs) {
    if (d.cls !== 114 || !d.body.includes('guid: ' + guid)) continue;
    const go = compGo[d.fid];
    if (!go) continue;
    const start = d.body.indexOf(eventKey);
    if (start < 0) continue;
    let end = d.body.length;
    for (const k of nextKeys) { const i = d.body.indexOf(k, start + 1); if (i > 0 && i < end) end = i; }
    const block = d.body.slice(start, end);
    const actions = [];
    let unresolved = 0;
    for (const call of parseCalls(block)) {
      const t = resolveTarget(call.targetFid);
      if (!t) { unresolved++; continue; }
      if (call.method === 'SetActive') {
        actions.push({ op: call.boolArg ? 'show' : 'hide', target: goPath(t.go), leaf: goName[t.go] });
      } else if (call.method === 'Play') {
        actions.push({ op: 'audio', target: goPath(t.go), leaf: goName[t.go] });
      } else {
        actions.push({ op: 'call', method: call.method, target: goPath(t.go), leaf: goName[t.go] });
      }
    }
    out.push({
      uid: goPath(go),
      name: goName[go],
      active: goActive[go],          // stato iniziale (activeSelf)
      pos_unity: goWorldPos(go).map(v => +v.toFixed(3)),
      actions,
      ...(unresolved ? { unresolved } : {}),
    });
  }
  return out;
}

const interactables = extract(IA_GUID, 'onInteractEvent:', ['onEnterEvent:', 'onExitEvent:']);
const triggers = extract(TR_GUID, 'onEnterEvent:', ['onExitEvent:']);

const result = { exportedFrom: 'parse_actions.js', scene: SCENE.split(/[\\/]/).pop(), interactableStates: interactables, triggerActions: triggers };
fs.writeFileSync(OUT, JSON.stringify(result, null, 2));
console.log('Scritto', OUT);
console.log('Interactable:', interactables.length, '| di cui spenti all\'avvio:', interactables.filter(i => !i.active).length);
let tot = 0, unres = 0;
for (const i of interactables) { tot += i.actions.length; unres += i.unresolved || 0; }
console.log('Azioni totali:', tot, '| non risolvibili (prefab):', unres);
console.log('\n--- Catena (chi accende cosa) ---');
for (const i of interactables) {
  if (!i.actions.length) continue;
  console.log((i.active ? '🟢' : '⚫'), i.name);
  for (const a of i.actions) console.log('    ', a.op.padEnd(6), '→', a.leaf || a.target);
}
