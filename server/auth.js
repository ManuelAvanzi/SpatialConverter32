// Auth minimale: una password "redazione" (env EDITOR_PASSWORD) → cookie JWT.
const jwt = require('jsonwebtoken');

const SECRET   = process.env.JWT_SECRET || 'dev-insecure-secret-change-me';
const PASSWORD = process.env.EDITOR_PASSWORD || 'admin';   // default solo per dev locale
const COOKIE   = 'sct';

function makeToken() { return jwt.sign({ role: 'redazione' }, SECRET, { expiresIn: '7d' }); }
function checkPassword(pw) { return typeof pw === 'string' && pw.length > 0 && pw === PASSWORD; }

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
