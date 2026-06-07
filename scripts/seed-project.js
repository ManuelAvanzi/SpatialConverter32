#!/usr/bin/env node
// Crea/aggiorna il progetto "cantiere-32" su R2 partendo da viewer/scene-config.json.
// Uso (con .env configurato): node scripts/seed-project.js
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const store = require('../server/store');

async function main() {
  if (!store.available()) {
    console.error('❌ R2 non configurato (.env). Servono R2_ENDPOINT/ACCESS/SECRET.');
    process.exit(1);
  }
  const cfgPath = path.join(__dirname, '..', 'viewer', 'scene-config.json');
  const sceneConfig = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

  const slug = 'cantiere-32';
  let p = await store.getProject(slug);
  if (!p) {
    p = await store.createProject('32 — Sicurezza nel cantiere', { assetPrefix: 'spatial32', sceneConfig });
    // forza lo slug atteso non garantito da createProject; risalvo i campi
  }
  // Aggiorna in ogni caso contenuto + stato pubblicato
  const saved = await store.saveProject(p.slug, {
    name: '32 — Sicurezza nel cantiere',
    status: 'published',
    assetPrefix: 'spatial32',
    sceneConfig,
  });
  console.log(`✅ Progetto salvato: ${saved.slug} (${saved.status})`);
  console.log(`   asset: ${saved.assetPrefix}  •  aggiornato: ${saved.updatedAt}`);
  const list = await store.listProjects();
  console.log(`\nProgetti su R2 (${list.length}):`);
  list.forEach(x => console.log(`  • ${x.slug}  [${x.status}]  ${x.name}`));
}

main().catch(e => { console.error('❌ Errore seed:', e.message); process.exit(1); });
