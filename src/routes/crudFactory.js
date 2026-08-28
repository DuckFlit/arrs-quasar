const express = require('express');
const { nanoid } = require('nanoid');
const { readDb, writeDb } = require('../db');
const { requireAdmin } = require('../auth');

// Создаёт стандартный REST CRUD-роутер над разделом db.json (collectionKey),
// с опциональными хуками beforeSave/sanitizeOut для кастомной логики (например, хеш пароля).
function crudFactory(collectionKey, { beforeSave, sanitizeOut } = {}) {
  const router = express.Router();
  router.use(requireAdmin);

  router.get('/', (req, res) => {
    const db = readDb();
    const items = db[collectionKey] || [];
    res.json(sanitizeOut ? items.map(sanitizeOut) : items);
  });

  router.get('/:id', (req, res) => {
    const db = readDb();
    const item = (db[collectionKey] || []).find(i => i.id === req.params.id);
    if (!item) return res.status(404).json({ error: 'Не найдено' });
    res.json(sanitizeOut ? sanitizeOut(item) : item);
  });

  router.post('/', async (req, res) => {
    const db = readDb();
    let item = { id: nanoid(10), createdAt: Date.now(), ...req.body };
    if (beforeSave) item = await beforeSave(item, null);
    db[collectionKey] = db[collectionKey] || [];
    db[collectionKey].push(item);
    await writeDb(db);
    res.status(201).json(sanitizeOut ? sanitizeOut(item) : item);
  });

  router.put('/:id', async (req, res) => {
    const db = readDb();
    const list = db[collectionKey] || [];
    const idx = list.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
    let updated = { ...list[idx], ...req.body, id: list[idx].id, updatedAt: Date.now() };
    if (beforeSave) updated = await beforeSave(updated, list[idx]);
    list[idx] = updated;
    await writeDb(db);
    res.json(sanitizeOut ? sanitizeOut(updated) : updated);
  });

  router.delete('/:id', async (req, res) => {
    const db = readDb();
    const list = db[collectionKey] || [];
    const idx = list.findIndex(i => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Не найдено' });
    list.splice(idx, 1);
    await writeDb(db);
    res.json({ ok: true });
  });

  return router;
}

module.exports = crudFactory;
