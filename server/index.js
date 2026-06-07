// SpatialConverter — server (Railway): viewer statico + API piattaforma
// (login redazione, progetti su R2, config asset).
require('dotenv').config();
const express = require('express');
const path = require('path');
const { makeToken, checkPassword, isAuthed, requireAuth, COOKIE } = require('./auth');
const store = require('./store');

const app = express();
const VIEWER_DIR = path.join(__dirname, '..', 'viewer');
app.use(express.json({ limit: '6mb' }));

// ─── Config viewer: base-URL asset (R2 in prod, vuoto in locale) ─────────────
app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ assetBase: process.env.ASSET_BASE || '', projectsEnabled: store.available() });
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
  try { res.status(201).json(await store.createProject(name, { assetPrefix: req.body.assetPrefix })); }
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

// ─── Static + fallback ───────────────────────────────────────────────────────
app.use(express.static(VIEWER_DIR, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('manifest.json') || filePath.endsWith('scene-config.json')) {
      res.set('Cache-Control', 'no-store');
    }
  },
}));
app.get('*', (req, res) => {
  if (path.extname(req.path)) return res.status(404).send('Not found');
  res.sendFile(path.join(VIEWER_DIR, 'index.html'));
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`SpatialConverter in ascolto su http://localhost:${PORT}`);
  console.log(`ASSET_BASE = ${process.env.ASSET_BASE || '(vuoto → viewer/models locale)'}`);
  console.log(`Progetti (R2) = ${store.available() ? 'attivi' : 'NON configurati (mancano le env R2)'}`);
});
