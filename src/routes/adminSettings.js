const express = require('express');
const { readDb, writeDb } = require('../db');
const { requireAdmin } = require('../auth');

const router = express.Router();
router.use(requireAdmin);

router.get('/', (req, res) => {
  const db = readDb();
  res.json(db.settings || {});
});

router.put('/', async (req, res) => {
  const db = readDb();
  db.settings = { ...db.settings, ...req.body };
  await writeDb(db);
  res.json(db.settings);
});

module.exports = router;
