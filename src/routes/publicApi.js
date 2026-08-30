const express = require('express');
const bcrypt = require('bcryptjs');
const { nanoid } = require('nanoid');
const { readDb, writeDb } = require('../db');

const router = express.Router();

function sanitizeProfile(p) {
  const { passwordHash, login, ...rest } = p;
  return rest;
}

router.get('/site', (req, res) => {
  const db = readDb();
  res.json(db.settings || {});
});

// ---- вход по логину/паролю профиля (не путать с админкой) ----
router.post('/login', (req, res) => {
  const { login, password } = req.body || {};
  if (!login || !password) return res.status(400).json({ error: 'Нужны логин и пароль' });
  const db = readDb();
  const profile = (db.profiles || []).find(
    p => p.published && p.login && p.login.toLowerCase() === String(login).trim().toLowerCase()
  );
  if (!profile || !profile.passwordHash || !bcrypt.compareSync(password, profile.passwordHash)) {
    return res.status(401).json({ ok: false, error: 'ACCESS DENIED' });
  }
  res.json({ ok: true, profile: sanitizeProfile(profile) });
});

function visitorId(req, res){
  let vid = req.cookies && req.cookies.arrs_vid;
  if(!vid){
    vid = nanoid(12);
    res.cookie('arrs_vid', vid, { maxAge: 365*24*60*60*1000, httpOnly: true, sameSite: 'lax' });
  }
  return vid;
}

// ---- выполнение команды терминала (после входа или в гостевом режиме) ----
router.post('/command', async (req, res) => {
  const { profileId, input } = req.body || {};
  const value = String(input || '').trim();
  if (!value) return res.json({ ok: false });
  const lower = value.toLowerCase();
  const db = readDb();
  const vid = visitorId(req, res);

  const cmd = (db.commands || []).find(c =>
    c.published !== false &&
    c.trigger && c.trigger.toLowerCase() === lower &&
    (!c.profileId || c.profileId === profileId)
  );
  if (cmd) {
    return res.json({ ok: true, kind: 'command', responseType: cmd.responseType || 'text', text: cmd.responseText || '', redirectUrl: cmd.redirectUrl || null });
  }

  for (const chain of (db.chains || [])) {
    if (chain.profileId && chain.profileId !== profileId) continue;
    const steps = chain.steps || [];
    const idx = steps.findIndex(s => s.triggerValue && s.triggerValue.toLowerCase() === lower);
    if (idx === -1) continue;

    // цепочка с выключенным порядком — старое поведение
    if (chain.ordered === false) {
      return res.json({ ok: true, kind: 'chain', message: steps[idx].unlockMessage || '', pageSlug: steps[idx].unlockPageSlug || null });
    }

    const solved = ((db.progress || {})[vid] || {})[chain.id] || 0;

    if (idx < solved) {
      // уже решено — даём перечитать
      return res.json({ ok: true, kind: 'chain', repeat: true, message: steps[idx].unlockMessage || '', pageSlug: steps[idx].unlockPageSlug || null });
    }

    if (idx > solved) {
      // код из будущего
      return res.json({ ok: true, kind: 'chain', locked: true,
        message: `INTERCEPT: code recognized, but the sequence is incomplete. [${solved}/${steps.length}] keys accepted.` });
    }

    // верный следующий шаг
    db.progress = db.progress || {};
    db.progress[vid] = db.progress[vid] || {};
    db.progress[vid][chain.id] = solved + 1;
    await writeDb(db);

    return res.json({
      ok: true, kind: 'chain',
      message: steps[idx].unlockMessage || '',
      pageSlug: steps[idx].unlockPageSlug || null,
      chainDone: solved + 1 >= steps.length
    });
  }

  const egg = (db.eggs || []).find(e =>
    e.published !== false && e.trigger && e.trigger.toLowerCase() === lower &&
    (!e.profileId || e.profileId === profileId)
  );
  if (egg) {
    return res.json({ ok: true, kind: 'egg', egg });
  }

  res.json({ ok: false });
});

router.get('/page/:slug', (req, res) => {
  const db = readDb();
  const page = (db.pages || []).find(p => p.slug === req.params.slug && p.published);
  if (!page) return res.status(404).json({ error: 'Страница не найдена' });
  res.json(page);
});

// пасхалка на неверный логин/пароль — можно переопределить в админке (trigger: __wrong_login__)
router.get('/egg/wrong-login', (req, res) => {
  const { profileId } = req.query;
  const db = readDb();
  const egg = (db.eggs || []).find(e =>
    e.trigger === '__wrong_login__' && (!e.profileId || e.profileId === profileId)
  ) || (db.eggs || []).find(e => e.trigger === '__wrong_login__' && !e.profileId);
  res.json(egg || null);
});

module.exports = router;
