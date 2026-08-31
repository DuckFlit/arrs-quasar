const express = require('express');
const jwt = require('jsonwebtoken');
const { readDb, writeDb } = require('../db');

const router = express.Router();

router.post('/trigger', async (req, res) => {
  const secret = process.env.JWT_SECRET || 'arrs-dev-secret';
  const cookies = req.cookies || {};
  const token = cookies.arrs_admin || cookies.admin_token || cookies.token || cookies.jwt;
  let ok = false;
  if (token) { try { jwt.verify(token, secret); ok = true; } catch (e) {} }
  if (!ok && req.headers['x-admin-key'] && req.headers['x-admin-key'] === process.env.ADMIN_PASSWORD) ok = true;
  if (!ok) return res.status(401).json({ error: 'unauthorized' });

  const db = readDb();
  db.settings = db.settings || {};
  db.settings.meltdown = { active: true, startedAt: Date.now(), id: 'md-' + Date.now() };
  await writeDb(db);
  res.json({ ok: true, id: db.settings.meltdown.id });
});

module.exports = router;
