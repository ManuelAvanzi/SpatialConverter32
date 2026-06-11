// SpatialConverter — server (Railway): viewer statico + API piattaforma
// (login redazione, progetti su R2, config asset).
require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const archiver = require('archiver');
const { makeToken, checkPassword, isAuthed, requireAuth, COOKIE } = require('./auth');
const store = require('./store');

const app = express();
const VIEWER_DIR = path.join(__dirname, '..', 'viewer');
app.use(express.json({ limit: '8mb' }));
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

// ─── Config viewer: base-URL asset (R2 in prod, vuoto in locale) ─────────────
app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({
    assetBase: process.env.ASSET_BASE || '',
    r2Base: (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, ''),
    projectsEnabled: store.available(),
  });
});

// ─── Auth redazione ──────────────────────────────────────────────────────────
app.post('/api/login', (req, res) => {
  if (!checkPassword(req.body && req.body.password)) return res.status(401).json({ error: 'Password errata' });
  res.cookie(COOKIE, makeToken(), { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 3600 * 1000 });
  res.json({ ok: true });
});
app.post('/api/logout', (req, res) => { res.clearCookie(COOKIE); res.json({ ok: true }); });
app.get('/api/me', (req, res) => res.json({ authed: isAuthed(req) }));

// ─── Progetti ────────────────────────────────────────────────────────────────
app.get('/api/projects', requireAuth, async (req, res) => {
  try { res.json(await store.listProjects()); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/projects', requireAuth, async (req, res) => {
  const name = (req.body && req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Nome richiesto' });
  try { res.status(201).json(await store.createProject(name, { assetPrefix: req.body.assetPrefix, tags: req.body.tags })); }
  catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/projects/:slug', async (req, res) => {
  try {
    const p = await store.getProject(req.params.slug);
    if (!p) return res.status(404).json({ error: 'Progetto non trovato' });
    if (p.status !== 'published' && !isAuthed(req)) return res.status(403).json({ error: 'Bozza riservata' });
    res.json(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/projects/:slug', requireAuth, async (req, res) => {
  try {
    const p = await store.saveProject(req.params.slug, req.body || {});
    if (!p) return res.status(404).json({ error: 'Progetto non trovato' });
    res.json(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/projects/:slug', requireAuth, async (req, res) => {
  try { await store.deleteProject(req.params.slug); res.json({ ok: true }); }
  catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Duplica progetto ────────────────────────────────────────────────────────
app.post('/api/projects/:slug/duplicate', requireAuth, async (req, res) => {
  try {
    const copy = await store.duplicateProject(req.params.slug);
    if (!copy) return res.status(404).json({ error: 'Progetto non trovato' });
    res.status(201).json(copy);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ─── Download: bundle ZIP giocabile in locale ────────────────────────────────
app.get('/api/projects/:slug/download', requireAuth, async (req, res) => {
  try {
    const slug = req.params.slug;
    const proj = await store.getProject(slug);
    if (!proj) return res.status(404).send('Progetto non trovato');

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${slug}.zip"`);
    const zip = archiver('zip', { zlib: { level: 6 } });
    zip.on('error', err => { console.error('zip error', err); try { res.status(500).end(); } catch {} });
    zip.pipe(res);

    // Engine + config del progetto + README
    zip.file(path.join(VIEWER_DIR, 'index.html'), { name: 'index.html' });
    zip.append(JSON.stringify(proj.sceneConfig || { version: 1 }, null, 2), { name: 'scene-config.json' });
    zip.append(README(slug, proj.name), { name: 'LEGGIMI.txt' });

    // Asset del progetto da R2 → cartella models/
    const prefix = proj.assetPrefix || slug;
    const keys = (await store.listAssetFiles(`${prefix}/`)).filter(k => !k.endsWith('/'));
    for (const key of keys) {
      const rel = key.slice(prefix.length + 1);     // es. environment.glb, gltfModels/x.glb
      const buf = await store.getAssetBuffer(key);
      if (buf) zip.append(buf, { name: 'models/' + rel });
    }

    // File statici del 32 (manifest, scene.json, Audio, copertina)
    if (proj.assetPrefix === 'spatial32') {
      for (const f of ['manifest.json', 'scene.json']) {
        const p = path.join(VIEWER_DIR, f);
        if (fs.existsSync(p)) zip.file(p, { name: f });
      }
      for (const d of ['Audio', 'copertina']) {
        const p = path.join(VIEWER_DIR, d);
        if (fs.existsSync(p)) zip.directory(p, d);
      }
    }
    zip.finalize();
  } catch (e) { console.error(e); try { res.status(500).send(e.message); } catch {} }
});

function README(slug, name) {
  return [
    `${name} — esperienza SpatialConverter (bundle locale)`,
    ``,
    `Contenuto: index.html (engine) + scene-config.json + models/ (+ Audio/copertina per il 32).`,
    ``,
    `COME APRIRLO:`,
    `Serve un piccolo server web statico (aprire index.html da doppio click NON basta).`,
    `Esempi dalla cartella del progetto:`,
    `  - Node:   npx serve .`,
    `  - Python: python -m http.server 8000`,
    `Poi apri l'indirizzo mostrato (es. http://localhost:8000).`,
    ``,
    `VR: funziona se servito da https:// (o http://localhost). Da file:// la VR non parte.`,
    `Nota: three.js è caricato da CDN → per l'uso serve connessione internet.`,
  ].join('\n');
}

// ─── Upload contenuti (modelli .glb) e copertina ─────────────────────────────
app.post('/api/projects/:slug/upload', requireAuth, upload.single('model'), async (req, res) => {
  try {
    const slug = req.params.slug;
    const proj = await store.getProject(slug);
    if (!proj) return res.status(404).json({ error: 'Progetto non trovato' });
    if (!req.file) return res.status(400).json({ error: 'Nessun file' });
    const safe = req.file.originalname.replace(/[^a-zA-Z0-9._ -]/g, '_');
    if (!/\.glb$/i.test(safe)) return res.status(400).json({ error: 'Solo .GLB unico: il .gltf multi-file caricato da solo dà una scena rotta' });
    const prefix = proj.assetPrefix || slug;   // usa il prefisso reale (non rompe il 32)
    const ct = /\.glb$/i.test(safe) ? 'model/gltf-binary' : 'model/gltf+json';
    await store.putAsset(`${prefix}/gltfModels/${safe}`, req.file.buffer, ct);
    // rigenera il manifest models.json del progetto
    const files = (await store.listAssetFiles(`${prefix}/gltfModels/`))
      .map(k => k.split('/').pop()).filter(n => /\.(glb|gltf)$/i.test(n)).sort();
    await store.putAsset(`${prefix}/gltfModels/models.json`, Buffer.from(JSON.stringify(files)), 'application/json');
    if (!proj.assetPrefix) await store.saveProject(slug, { assetPrefix: prefix });
    res.json({ ok: true, file: safe, count: files.length });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Asset degli oggetti utente del menu + (immagini, PDF, MP4, 360°, GLB) — solo redazione
const ASSET_EXT = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.glb': 'model/gltf-binary' };
app.post('/api/projects/:slug/asset', requireAuth, upload.single('file'), async (req, res) => {
  try {
    const slug = req.params.slug;
    const proj = await store.getProject(slug);
    if (!proj) return res.status(404).json({ error: 'Progetto non trovato' });
    if (!req.file) return res.status(400).json({ error: 'Nessun file' });
    const safe = req.file.originalname.replace(/[^a-zA-Z0-9._-]/g, '_');
    const ext = (safe.match(/\.[a-z0-9]+$/i) || [''])[0].toLowerCase();
    const ct = ASSET_EXT[ext];
    if (!ct) return res.status(400).json({ error: 'Formato non supportato' });
    const prefix = proj.assetPrefix || slug;
    const key = `${prefix}/objects/${Date.now()}_${safe}`;
    await store.putAsset(key, req.file.buffer, ct);
    const base = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
    res.json({ ok: true, url: `${base}/${key}` });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/projects/:slug/cover', requireAuth, upload.single('cover'), async (req, res) => {
  try {
    const slug = req.params.slug;
    const proj = await store.getProject(slug);
    if (!proj) return res.status(404).json({ error: 'Progetto non trovato' });
    if (!req.file) return res.status(400).json({ error: 'Nessun file' });
    const m = req.file.originalname.match(/\.(png|jpe?g|webp)$/i);
    const ext = (m ? m[0] : '.png').toLowerCase().replace('.jpeg', '.jpg');
    const key = `${slug}/cover${ext}`;
    await store.putAsset(key, req.file.buffer, req.file.mimetype || 'image/png');
    const base = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');
    const url = `${base}/${key}?v=${Date.now()}`;
    await store.saveProject(slug, { cover: url });
    res.json({ ok: true, cover: url });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Home = redazione (lista laboratori). Con ?project apre il viewer (play/editor).
app.get('/', (req, res) => {
  if (req.query.project) return res.sendFile(path.join(VIEWER_DIR, 'index.html'));
  res.sendFile(path.join(VIEWER_DIR, 'admin.html'));
});
app.get('/admin', (req, res) => res.sendFile(path.join(VIEWER_DIR, 'admin.html')));

// ─── Static + fallback ───────────────────────────────────────────────────────
app.use(express.static(VIEWER_DIR, {
  index: false,   // niente index.html automatico su "/" (la home è la redazione)
  setHeaders(res, filePath) {
    if (filePath.endsWith('manifest.json') || filePath.endsWith('scene-config.json')) {
      res.set('Cache-Control', 'no-store');
    }
  },
}));
app.get('*', (req, res) => {
  if (path.extname(req.path)) return res.status(404).send('Not found');
  res.sendFile(path.join(VIEWER_DIR, 'admin.html'));   // rotte sconosciute → home redazione
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`SpatialConverter in ascolto su http://localhost:${PORT}`);
  console.log(`ASSET_BASE = ${process.env.ASSET_BASE || '(vuoto → viewer/models locale)'}`);
  console.log(`Progetti (R2) = ${store.available() ? 'attivi' : 'NON configurati (mancano le env R2)'}`);
});
