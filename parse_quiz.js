// Estrae i QUIZ dallo scene YAML: pannelli "Domanda N", bottoni A/B/C con
// deduzione della risposta corretta dal cablaggio (sbagliato → pannello
// Riprova; corretto → domanda successiva / complimenti), azioni del
// "Prosegui" finale (che accende i prompt Complettato).
// Uso: node parse_quiz.js <scena.unity> <out.json>
const fs = require('fs');
const SCENE = process.argv[2];
const OUT = process.argv[3] || 'unity-quiz.json';
const BTN_GUID = '4e29b1a8efbd4b44bb3f3716e73f07ff'; // UnityEngine.UI.Button

const text = fs.readFileSync(SCENE, 'utf8');
const re = /^--- !u!(\d+) &(\d+).*$/gm;
let m, idxs = [];
while ((m = re.exec(text))) idxs.push({ cls: +m[1], fid: m[2], start: m.index });
const docs = idxs.map((d, i) => ({ ...d, body: text.slice(d.start, i + 1 < idxs.length ? idxs[i + 1].start : text.length) }));
const byFid = {}; docs.forEach(d => byFid[d.fid] = d);

function unquote(s) {
  s = s.trim();
  if (s.length > 1 && s[0] === "'" && s[s.length - 1] === "'") return s.slice(1, -1).replace(/''/g, "'");
  return s;
}
// Decodifica scalare YAML (anche multilinea, double-quoted con escape \n \xHH \uHHHH)
function yamlString(raw) {
  let s = raw.replace(/\r/g, '');
  const quoted = s.trim().startsWith('"');
  s = s.replace(/\n\s+/g, ' ').trim();                      // folding delle continuazioni
  if (quoted) {
    s = s.replace(/^"|"$/g, '');
    s = s.replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    s = s.replace(/\\u([0-9A-Fa-f]{4})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    s = s.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\');
  }
  return s;
}

// GameObject / Transform graph
const goName = {}, goActive = {}, compGo = {}, goTr = {}, trFather = {}, trChildren = {}, trPos = {};
for (const d of docs) if (d.cls === 1) {
  goName[d.fid] = unquote(((d.body.match(/^\s{2}m_Name:\s*(.*)$/m) || [])[1] || ''));
  goActive[d.fid] = ((d.body.match(/^\s{2}m_IsActive:\s*(\d)/m) || [])[1] || '1') === '1';
}
for (const d of docs) {
  const go = (d.body.match(/m_GameObject:\s*\{fileID:\s*(\d+)\}/) || [])[1];
  if (go) compGo[d.fid] = go;
}
for (const d of docs) if (d.cls === 4 || d.cls === 224) {   // Transform e RectTransform
  const go = compGo[d.fid];
  if (go) goTr[go] = d.fid;
  const f = (d.body.match(/m_Father:\s*\{fileID:\s*(\d+)\}/) || [])[1];
  trFather[d.fid] = f;
  if (f && f !== '0') (trChildren[f] = trChildren[f] || []).push(d.fid);
  const p = d.body.match(/m_LocalPosition:\s*\{x:\s*([-\d.eE]+),\s*y:\s*([-\d.eE]+),\s*z:\s*([-\d.eE]+)\}/);
  trPos[d.fid] = p ? [+p[1], +p[2], +p[3]] : [0, 0, 0];
}
function goWorldPos(go) {
  let tr = goTr[go], x = 0, y = 0, z = 0, g = 0;
  while (tr && tr !== '0' && g++ < 60) { const p = trPos[tr] || [0,0,0]; x += p[0]; y += p[1]; z += p[2]; tr = trFather[tr]; }
  return [x, y, z];
}
function goPath(go) {
  const parts = []; let tr = goTr[go], g = 0;
  while (tr && tr !== '0' && g++ < 60) { const gg = compGo[tr]; if (gg && goName[gg] != null) parts.unshift(goName[gg]); tr = trFather[tr]; }
  return parts.join('/');
}
function descendants(go, out) {
  out = out || [];
  for (const c of (trChildren[goTr[go]] || [])) { const g = compGo[c]; if (g) { out.push(g); descendants(g, out); } }
  return out;
}
function ancestors(go) {
  const out = []; let tr = trFather[goTr[go]], g = 0;
  while (tr && tr !== '0' && g++ < 60) { const gg = compGo[tr]; if (gg) out.push(gg); tr = trFather[tr]; }
  return out;
}

// TMP texts: doc 114 con m_text
const tmpByGo = {};
for (const d of docs) {
  if (d.cls !== 114) continue;
  const mt = d.body.match(/\n\s{2}m_text:([\s\S]*?)\n\s{2}m_isRightToLeft:/);
  if (!mt) continue;
  const go = compGo[d.fid];
  if (go) tmpByGo[go] = yamlString(mt[1]);
}
// Bottoni con onClick actions
function parseCalls(block) {
  const calls = [];
  const callRe = /- m_Target:\s*\{fileID:\s*(\d+)\}[\s\S]*?m_MethodName:\s*([^\n]*)[\s\S]*?m_BoolArgument:\s*(\d)/g;
  let c;
  while ((c = callRe.exec(block))) calls.push({ targetFid: c[1], method: c[2].trim(), boolArg: c[3] === '1' });
  return calls;
}
const buttons = [];
for (const d of docs) {
  if (d.cls !== 114 || !d.body.includes('guid: ' + BTN_GUID)) continue;
  const go = compGo[d.fid];
  if (!go) continue;
  const oc = d.body.indexOf('m_OnClick:');
  const calls = oc < 0 ? [] : parseCalls(d.body.slice(oc));
  // label = TMP del GO stesso o di un discendente
  let label = tmpByGo[go] || '';
  if (!label) for (const c of descendants(go)) if (tmpByGo[c]) { label = tmpByGo[c]; break; }
  buttons.push({ go, name: goName[go], label: label.trim(), calls });
}

// Helpers correttezza: il target acceso contiene testi "Riprova/Sbagliato"? o un'altra Domanda?
function subtreeTexts(go) {
  const out = [];
  if (tmpByGo[go]) out.push(tmpByGo[go]);
  for (const c of descendants(go)) if (tmpByGo[c]) out.push(tmpByGo[c]);
  return out.join(' | ');
}
function classifyButton(btn) {
  let wrong = false, right = false;
  const shows = [];
  for (const c of btn.calls) {
    if (c.method !== 'SetActive') continue;
    const tgo = goName[c.targetFid] != null ? c.targetFid : compGo[c.targetFid];
    if (!tgo) continue;
    if (c.boolArg) shows.push(tgo);
  }
  for (const s of shows) {
    const txt = subtreeTexts(s);
    if (/riprova|sbagliat|errat|riprovare/i.test(txt)) wrong = true;
    if (/domanda\s*\d|compliment|corrett|bravo|complettato|prosegui/i.test(txt)) right = true;
    if (/^Inter-/i.test(goName[s] || '')) right = true;   // accende un interactable della catena
  }
  if (wrong && !right) return 'wrong';
  if (right && !wrong) return 'right';
  return 'unknown';
}

// Trova le Domande: TMP con "Domanda N:" e contenuto a)/b)
const questions = [];
for (const [go, txt] of Object.entries(tmpByGo)) {
  const mm = txt.match(/^\s*Domanda\s*(\d+)\s*[:.]?/i);
  if (!mm || txt.length < 40) continue;
  questions.push({ go, num: +mm[1], text: txt });
}
// Per ogni domanda: risali finché il sottoalbero non contiene >=2 bottoni
function buttonsFor(qGo) {
  let cur = qGo;
  for (let up = 0; up < 4; up++) {
    const anc = up === 0 ? qGo : (ancestors(qGo)[up - 1]);
    if (!anc) break;
    const subs = new Set([anc, ...descendants(anc)]);
    const bs = buttons.filter(b => subs.has(b.go));
    if (bs.length >= 2) return { panel: anc, btns: bs };
  }
  return { panel: qGo, btns: [] };
}

// gruppo = figlio diretto del canvas root che contiene la domanda
function rootOf(go) { const a = ancestors(go); return a.length ? a[a.length - 1] : go; }
function groupOf(go) { const a = ancestors(go); return a.length >= 2 ? a[a.length - 2] : (a[0] || go); }

const quizMap = new Map();
for (const q of questions.sort((a, b) => a.num - b.num)) {
  const { panel, btns } = buttonsFor(q.go);
  const grp = groupOf(q.go);
  const key = grp;
  if (!quizMap.has(key)) quizMap.set(key, { rootGo: grp, rootName: goName[grp], pos_unity: goWorldPos(grp), questions: [] });
  // risposte: bottoni con label corta (A/B/C) o classificabili
  const answers = [];
  for (const b of btns) {
    const cls = classifyButton(b);
    const lbl = (b.label || b.name || '').trim();
    if (lbl.length > 30) continue;                       // scarta bottoni non-risposta
    if (/prosegui|riprova|avvia|chiudi|menu|indietro/i.test(lbl)) continue;
    if (/^[x✕×✖]$/i.test(lbl)) continue;   // bottone di chiusura
    answers.push({ label: lbl || '?', correct: cls === 'right', cls });
  }
  quizMap.get(key).questions.push({ num: q.num, text: q.text, panel: goName[panel], answers });
}

// Prosegui finale per quiz root: bottone 'Prosegui' nel sottoalbero del root che accende un Inter-*
const finals = {};
for (const [key, qz] of quizMap) {
  const subs = new Set([qz.rootGo, ...descendants(qz.rootGo)]);
  for (const b of buttons) {
    if (!subs.has(b.go)) continue;
    if (!/prosegui/i.test((b.label || b.name || ''))) continue;
    const acts = [];
    for (const c of b.calls) {
      if (c.method !== 'SetActive') continue;
      const tgo = goName[c.targetFid] != null ? c.targetFid : compGo[c.targetFid];
      if (!tgo) continue;
      const nm = goName[tgo];
      if (/^Inter-/i.test(nm || '')) acts.push({ op: c.boolArg ? 'show' : 'hide', target: nm, leaf: nm });
    }
    if (acts.length) finals[key] = (finals[key] || []).concat(acts);
  }
}

const out = [];
let qi = 1;
for (const [key, qz] of quizMap) {
  out.push({
    id: 'quiz' + (qi++),
    rootName: qz.rootName,
    pos_unity: qz.pos_unity.map(v => +v.toFixed(2)),
    nQuestions: qz.questions.length,
    onComplete: finals[key] || [],
    questions: qz.questions,
  });
}
fs.writeFileSync(OUT, JSON.stringify({ quizzes: out }, null, 2));
console.log('Quiz trovati:', out.length);
for (const q of out) {
  console.log('\n■', q.id, 'root:', q.rootName, '@', q.pos_unity, '—', q.nQuestions, 'domande, onComplete:', JSON.stringify(q.onComplete));
  for (const d of q.questions) {
    const marks = d.answers.map(a => a.label + (a.correct ? '✓' : (a.cls === 'unknown' ? '?' : '✗'))).join(' ');
    console.log('   D' + d.num, (d.text.slice(0, 60).replace(/\n/g, ' ')) + '…', '[' + marks + ']');
  }
}
