// Archivio progetti su Cloudflare R2 (niente DB da provisionare, persistente).
// Ogni progetto = un JSON in _projects/<slug>.json nello stesso bucket degli asset.
const {
  S3Client, ListObjectsV2Command, GetObjectCommand, PutObjectCommand, DeleteObjectCommand,
} = require('@aws-sdk/client-s3');
const { Readable } = require('stream');

const BUCKET = process.env.R2_BUCKET || 'immersivelab-assets';
const PREFIX = '_projects/';

let _client = null;
function r2() {
  if (_client) return _client;
  if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) return null;
  _client = new S3Client({
    region: 'auto',
    endpoint: process.env.R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
  return _client;
}
function available() { return !!r2(); }

function streamToString(stream) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    stream.on('data', c => chunks.push(c));
    stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    stream.on('error', reject);
  });
}

function slugify(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'progetto';
}

function keyOf(slug) { return `${PREFIX}${slug}.json`; }
function summary(p) {
  return {
    slug: p.slug, name: p.name, status: p.status,
    assetPrefix: p.assetPrefix || '', tags: Array.isArray(p.tags) ? p.tags : [],
    cover: p.cover || '', updatedAt: p.updatedAt,
  };
}

// Asset (modelli/copertine) su R2 sotto il prefisso del progetto
async function putAsset(key, body, contentType) {
  const cl = r2(); if (!cl) throw new Error('R2 non configurato');
  await cl.send(new PutObjectCommand({ Bucket: BUCKET, Key: key, Body: body, ContentType: contentType }));
}
async function listAssetFiles(prefix) {
  const cl = r2(); if (!cl) return [];
  const out = await cl.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix }));
  return (out.Contents || []).map(o => o.Key);
}
async function getAssetBuffer(key) {
  const cl = r2(); if (!cl) return null;
  try {
    const out = await cl.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    const chunks = [];
    for await (const c of out.Body) chunks.push(c);
    return Buffer.concat(chunks);
  } catch { return null; }
}

// Duplica un progetto (record + scene-config + tag + cover; stessi asset/prefix)
async function duplicateProject(slug) {
  const src = await getProject(slug);
  if (!src) return null;
  return createProject((src.name || 'Progetto') + ' (copia)', {
    assetPrefix: src.assetPrefix, tags: src.tags, sceneConfig: src.sceneConfig, cover: src.cover,
  });
}

async function getProject(slug) {
  const cl = r2(); if (!cl) return null;
  try {
    const out = await cl.send(new GetObjectCommand({ Bucket: BUCKET, Key: keyOf(slug) }));
    return JSON.parse(await streamToString(out.Body));
  } catch { return null; }
}

async function putProject(p) {
  const cl = r2(); if (!cl) throw new Error('R2 non configurato');
  await cl.send(new PutObjectCommand({
    Bucket: BUCKET, Key: keyOf(p.slug),
    Body: JSON.stringify(p), ContentType: 'application/json',
  }));
  return p;
}

async function listProjects() {
  const cl = r2(); if (!cl) return [];
  const out = await cl.send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: PREFIX }));
  const keys = (out.Contents || []).map(o => o.Key).filter(k => k.endsWith('.json'));
  const projects = [];
  for (const k of keys) {
    const slug = k.slice(PREFIX.length, -'.json'.length);
    const p = await getProject(slug);
    if (p) projects.push(summary(p));
  }
  return projects.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
}

async function createProject(name, opts = {}) {
  const base = slugify(name);
  let slug = base, i = 1;
  while (await getProject(slug)) slug = `${base}-${++i}`;
  const now = new Date().toISOString();
  const p = {
    slug, name,
    status: 'draft',
    assetPrefix: opts.assetPrefix || '',
    tags: Array.isArray(opts.tags) ? opts.tags : [],
    cover: opts.cover || '',
    sceneConfig: opts.sceneConfig || { version: 1 },
    createdAt: now, updatedAt: now,
  };
  return putProject(p);
}

async function saveProject(slug, patch) {
  const p = await getProject(slug);
  if (!p) return null;
  if (patch.name != null) p.name = patch.name;
  if (patch.status != null) p.status = patch.status;
  if (patch.assetPrefix != null) p.assetPrefix = patch.assetPrefix;
  if (patch.tags != null) p.tags = Array.isArray(patch.tags) ? patch.tags : p.tags;
  if (patch.cover != null) p.cover = patch.cover;
  if (patch.sceneConfig != null) p.sceneConfig = patch.sceneConfig;
  p.updatedAt = new Date().toISOString();
  return putProject(p);
}

async function deleteProject(slug) {
  const cl = r2(); if (!cl) return;
  await cl.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: keyOf(slug) }));
}

module.exports = {
  available, listProjects, getProject, createProject, saveProject, deleteProject, slugify,
  putAsset, listAssetFiles, getAssetBuffer, duplicateProject,
};
