// Auth minimale: una password "redazione" (env EDITOR_PASSWORD) → cookie JWT.
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

// Secret stabile se impostato, altrimenti random per-avvio (logout a ogni redeploy)
const SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const COOKIE = 'sct';

function makeToken() { return jwt.sign({ role: 'redazione' }, SECRET, { expiresIn: '7d' }); }
// Senza EDITOR_PASSWORD impostata, il login è DISABILITATO (default sicuro)
function checkPassword(pw) {
  const expected = process.env.EDITOR_PASSWORD;
  return !!expected && typeof pw === 'string' && pw.length > 0 && pw === expected;
}

function parseCookies(req) {
  const h = req.headers.cookie || '';
  const out = {};
  for (const part of h.split(';')) {
    const s = part.trim(); if (!s) continue;
    const i = s.indexOf('=');
    out[s.slice(0, i)] = decodeURIComponent(s.slice(i + 1));
  }
  return out;
}

function isAuthed(req) {
  try {
    const t = parseCookies(req)[COOKIE];
    if (!t) return false;
    jwt.verify(t, SECRET);
    return true;
  } catch { return false; }
}

function requireAuth(req, res, next) {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: 'Non autorizzato' });
}

module.exports = { makeToken, checkPassword, isAuthed, requireAuth, COOKIE };
