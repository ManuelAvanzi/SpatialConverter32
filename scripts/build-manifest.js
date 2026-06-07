#!/usr/bin/env node
// Genera viewer/models/gltfModels/models.json = elenco dei file .gltf/.glb personaggi.
// Necessario perché il directory-listing non funziona fuori da `npx serve` (Express/R2).
// Uso:  node scripts/build-manifest.js
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, '..', 'viewer', 'models', 'gltfModels');
if (!fs.existsSync(dir)) {
  console.error('Cartella non trovata:', dir);
  process.exit(1);
}

const files = fs.readdirSync(dir)
  .filter(f => /\.(gltf|glb)$/i.test(f))
  .sort();

const out = path.join(dir, 'models.json');
fs.writeFileSync(out, JSON.stringify(files, null, 2));
console.log(`✅ models.json generato (${files.length} file):`);
files.forEach(f => console.log('  •', f));
