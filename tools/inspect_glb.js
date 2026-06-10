// Ispeziona environment.glb: legge il chunk JSON e mostra nodi/mesh/posizioni
const fs = require('fs');
const path = require('path');

const GLB = path.join(__dirname, 'viewer', 'models', 'environment.glb');
const buf = fs.readFileSync(GLB);

// Header GLB: magic(4) version(4) length(4), poi chunk0: length(4) type(4) data
const jsonChunkLen = buf.readUInt32LE(12);
const jsonStr = buf.slice(20, 20 + jsonChunkLen).toString('utf8');
const gltf = JSON.parse(jsonStr);

const nodes = gltf.nodes || [];
const meshes = gltf.meshes || [];

console.log(`Nodi totali: ${nodes.length}`);
console.log(`Mesh totali: ${meshes.length}`);
console.log(`Skin totali: ${(gltf.skins||[]).length}`);

// Cerca i nodi che contengono BODY/FACE/HAND/eye/Helmet nel nome
const KEYS = ['BODY', 'FACE', 'HAND', 'eye', 'Helmet', 'Pelvis'];
console.log('\n=== NODI MESH PERSONAGGIO ===');
nodes.forEach((n, i) => {
  const name = n.name || `node_${i}`;
  if (!KEYS.some(k => name.toUpperCase().includes(k.toUpperCase()))) return;
  const meshName = (n.mesh != null && meshes[n.mesh]) ? meshes[n.mesh].name : '—';
  const t = n.translation ? `[${n.translation.map(v=>v.toFixed(3)).join(', ')}]` : 'origin';
  const hasMesh = n.mesh != null ? `mesh#${n.mesh}(${meshName})` : 'no-mesh';
  const hasSkin = n.skin != null ? ` skin#${n.skin}` : '';
  console.log(`  node[${i}] "${name}"  T=${t}  ${hasMesh}${hasSkin}`);
});

// Conta mesh per nome base (rimuove suffissi .NNN _N)
console.log('\n=== MESH PER NOME BASE ===');
const counts = {};
meshes.forEach(m => {
  const base = (m.name||'?').replace(/[._]\d+$/, '').replace(/\.\d+$/, '');
  counts[base] = (counts[base]||0) + 1;
});
Object.entries(counts).sort((a,b)=>b[1]-a[1]).slice(0, 30).forEach(([k,v]) => {
  console.log(`  ${v.toString().padStart(3)}  ${k}`);
});
