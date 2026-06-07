// Server per Railway: serve il viewer statico + espone /api/config (base-URL asset).
// In locale puoi ancora usare `npx serve viewer/`; questo serve per la produzione.
require('dotenv').config();
const express = require('express');
const path = require('path');

const app = express();
const VIEWER_DIR = path.join(__dirname, '..', 'viewer');

// Config per il viewer: dove stanno i modelli 3D pesanti.
// In produzione (Railway) ASSET_BASE = URL pubblico R2 (es. https://pub-xxx.r2.dev/spatial32).
// In locale ASSET_BASE vuoto → il viewer usa la cartella viewer/models.
app.get('/api/config', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ assetBase: process.env.ASSET_BASE || '' });
});

// File statici del viewer (index.html, models locali, Audio, copertina, scene-config.json…)
app.use(express.static(VIEWER_DIR, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('manifest.json') || filePath.endsWith('scene-config.json')) {
      res.set('Cache-Control', 'no-store');
    }
  },
}));

// Fallback: solo rotte SENZA estensione → index.html.
// I file con estensione mancanti (es. scene-config.json) danno 404 pulito.
app.get('*', (req, res) => {
  if (path.extname(req.path)) return res.status(404).send('Not found');
  res.sendFile(path.join(VIEWER_DIR, 'index.html'));
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`SpatialConverter32 in ascolto su http://localhost:${PORT}`);
  console.log(`ASSET_BASE = ${process.env.ASSET_BASE || '(vuoto → viewer/models locale)'}`);
});
