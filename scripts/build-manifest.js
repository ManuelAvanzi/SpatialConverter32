#!/usr/bin/env node
// Genera gltfModels/models.json = elenco dei file .gltf/.glb personaggi.
// Necessario perché il directory-listing non funziona fuori da `npx serve` (Express/R2).
// Uso:  node scripts/build-manifest.js
//       MODELS_DIR=content/<prefisso> node scripts/build-manifest.js   (altri progetti)
const fs = require('fs');
const path = require('path');

const dir = process.env.MODELS_DIR
  ? path.resolve(process.env.MODELS_DIR, 'gltfModels')
  : path.join(__dirname, '..', 'viewer', 'models', 'gltfModels');
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
