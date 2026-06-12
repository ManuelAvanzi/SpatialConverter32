#!/usr/bin/env node
// Carica i modelli 3D pesanti su Cloudflare R2 sotto il prefisso del progetto (spatial32/).
// Carica: viewer/models/environment.glb + tutta viewer/models/gltfModels/ (incluso models.json)
//
// Prerequisiti: crea un file .env (vedi .env.example) con le credenziali R2.
// Uso:  npm run upload     (oppure: node scripts/upload-to-r2.js)
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');

// Credenziali: AWS_* (S3) con fallback R2_* per retro-compatibilità.
const ACCESS_KEY = process.env.AWS_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID;
const SECRET_KEY = process.env.AWS_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY;
const REGION = process.env.AWS_REGION || process.env.S3_REGION || 'eu-south-1';
const ENDPOINT = process.env.S3_ENDPOINT || process.env.R2_ENDPOINT || '';   // vuoto su AWS
const BUCKET = process.env.S3_BUCKET || process.env.R2_BUCKET || 'immersivelab-assets';
const PREFIX = (process.env.R2_PREFIX || 'spatial32').replace(/\/+$/, '');

if (!ACCESS_KEY || !SECRET_KEY) {
  console.error('❌ Mancano le credenziali S3 nelle env (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY).');
  console.error('   Copia .env.example in .env e compila i valori, poi riprova.');
  process.exit(1);
}

const r2 = new S3Client({
  region: REGION,
  ...(ENDPOINT ? { endpoint: ENDPOINT } : {}),   // solo per R2/S3-like; su AWS si omette
  credentials: { accessKeyId: ACCESS_KEY, secretAccessKey: SECRET_KEY },
});

const VIEWER = path.join(__dirname, '..', 'viewer');
const CT = {
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.json': 'application/json',
};

// Cartella sorgente dei modelli: default viewer/models (progetto 32);
// per altri progetti: MODELS_DIR=content/<prefisso> (deve contenere gltfModels/)
const MODELS_DIR = process.env.MODELS_DIR
  ? path.resolve(process.env.MODELS_DIR)
  : path.join(VIEWER, 'models');

function collect() {
  const items = [];
  const glb = path.join(MODELS_DIR, 'environment.glb');
  if (fs.existsSync(glb)) items.push({ abs: glb, key: `${PREFIX}/environment.glb` });
  const gdir = path.join(MODELS_DIR, 'gltfModels');
  if (fs.existsSync(gdir)) {
    for (const f of fs.readdirSync(gdir)) {
      const abs = path.join(gdir, f);
      if (fs.statSync(abs).isFile()) items.push({ abs, key: `${PREFIX}/gltfModels/${f}` });
    }
  }
  return items;
}

async function main() {
  const items = collect();
  if (!items.length) {
    console.error(`Nessun file trovato in ${MODELS_DIR}. Hai i modelli in locale?`);
    process.exit(1);
  }
  console.log(`Carico ${items.length} file su R2: ${BUCKET}/${PREFIX}/\n`);
  let bytes = 0;
  for (const it of items) {
    const body = fs.readFileSync(it.abs);
    const ext = path.extname(it.abs).toLowerCase();
    const ContentType = CT[ext] || 'application/octet-stream';
    await r2.send(new PutObjectCommand({ Bucket: BUCKET, Key: it.key, Body: body, ContentType }));
    bytes += body.length;
    console.log(`  ✓ ${it.key}  (${(body.length / 1024 / 1024).toFixed(2)} MB)`);
  }
  console.log(`\n✅ Fatto: ${items.length} file, ${(bytes / 1024 / 1024).toFixed(1)} MB totali.`);
  console.log(`\n👉 Bucket S3 privato: gli asset sono serviti dal server via /api/asset/<key>.`);
  console.log(`   Non serve impostare ASSET_BASE (lascialo vuoto).`);
}

main().catch(e => { console.error('❌ Errore upload:', e.message); process.exit(1); });
