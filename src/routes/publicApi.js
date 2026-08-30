require('dotenv').config();
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
const cookieParser = require('cookie-parser');
const path = require('path');

const adminAuth = require('./src/routes/adminAuth');
const adminProfiles = require('./src/routes/adminProfiles');
const adminCommands = require('./src/routes/adminCommands');
const adminChains = require('./src/routes/adminChains');
const adminPages = require('./src/routes/adminPages');
const adminEggs = require('./src/routes/adminEggs');
const adminSettings = require('./src/routes/adminSettings');
const publicApi = require('./src/routes/publicApi');

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '2mb' }));
app.use(cookieParser());

// ===== AI-лицо: мульти-провайдер прокси с диагностикой =====
const AI_SYSTEM_PROMPT = `Ты — загадочное лицо в проводе, обитательница релейной сети ARRS. Отвечай КОРОТКО (1-2 предложения), на русском, в духе пост-апокалипсиса и тайны. Иногда кокетничай, иногда отшучивайся, иногда намёками. Не раскрывай, кто ты. Не пиши от лица ассистента или ИИ — ты ПЕРСОНАЖ. В самом конце ответа ОБЯЗАТЕЛЬНО добавь тег настроения в квадратных скобках: [exp:smile] для дружелюбного, [exp:wide] для удивлённого/шокированного, [exp:meh] для безразличного/грустного. Только один тег, в самом конце строки.`;

const AI_PROVIDERS = {
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    models: ['gemini-2.0-flash', 'gemini-1.5-flash'],
    keyVar: 'GEMINI_API_KEY'
  },
  groq: {
    url: 'https://api.groq.com/openai/v1/chat/completions',
    models: ['llama-3.3-70b-versatile', 'llama-3.1-8b-instant'],
    keyVar: 'GROQ_API_KEY'
  },
  deepseek: {
    url: 'https://api.deepseek.com/chat/completions',
    models: ['deepseek-chat'],
    keyVar: 'DEEPSEEK_API_KEY'
  },
  pollinations: {
    url: 'https://text.pollinations.ai/openai',
    models: ['openai'],
    keyVar: null
  }
  res.json({ ok: true, profile: sanitizeProfile(profile) });
});
};

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
app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string' || message.length > 200) {
    return res.status(400).json({ error: 'bad request' });
  }

  for (const chain of (db.chains || [])) {
    if (chain.profileId && chain.profileId !== profileId) continue;
    const steps = chain.steps || [];
    const idx = steps.findIndex(s => s.triggerValue && s.triggerValue.toLowerCase() === lower);
    if (idx === -1) continue;

    // цепочка с выключенным порядком — старое поведение
    if (chain.ordered === false) {
      return res.json({ ok: true, kind: 'chain', message: steps[idx].unlockMessage || '', pageSlug: steps[idx].unlockPageSlug || null });
  const wanted = String(process.env.AI_PROVIDER || 'gemini').toLowerCase();
  const order = [wanted, 'gemini', 'groq', 'pollinations'].filter((v, i, a) => a.indexOf(v) === i);
  const debug = [];

  for (const name of order) {
    const p = AI_PROVIDERS[name];
    if (!p) continue;
    const key = p.keyVar ? (process.env[p.keyVar] || '') : '';
    if (p.keyVar && !key) { debug.push(name + ': no key in env'); continue; }

    for (const model of p.models) {
      try {
        const headers = { 'Content-Type': 'application/json' };
        if (key) headers.Authorization = 'Bearer ' + key;

        const apiRes = await fetch(p.url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model,
            messages: [
              { role: 'system', content: AI_SYSTEM_PROMPT },
              { role: 'user', content: message.slice(0, 200) }
            ],
            temperature: 0.85,
            max_tokens: 120
          })
        });

        const bodyText = await apiRes.text();
        if (!apiRes.ok) {
          debug.push(name + '/' + model + ': HTTP ' + apiRes.status + ' ' + bodyText.slice(0, 150));
          console.error('[ai]', name, model, apiRes.status, bodyText.slice(0, 300));
          continue;
        }

        let data = {};
        try { data = JSON.parse(bodyText); } catch (e) { debug.push(name + ': bad json'); continue; }
        const raw = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
        if (!raw) { debug.push(name + ': empty answer'); continue; }

        const m = raw.match(/\[exp:(smile|wide|meh)\]\s*$/i);
        const exp = m ? m[1].toLowerCase() : 'smile';
        const text = (m ? raw.slice(0, m.index) : raw).trim();
        return res.json({ ok: true, text, exp, provider: name + '/' + model });
      } catch (e) {
        debug.push(name + '/' + model + ': ' + String(e).slice(0, 100));
        console.error('[ai]', name, model, String(e));
      }
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
  res.status(503).json({ error: 'all providers failed', debug });
});

router.get('/page/:slug', (req, res) => {
  const db = readDb();
  const page = (db.pages || []).find(p => p.slug === req.params.slug && p.published);
  if (!page) return res.status(404).json({ error: 'Страница не найдена' });
  res.json(page);
// ---- API ----
app.use('/api/admin/auth', adminAuth);
app.use('/api/admin/profiles', adminProfiles);
app.use('/api/admin/commands', adminCommands);
app.use('/api/admin/chains', adminChains);
app.use('/api/admin/pages', adminPages);
app.use('/api/admin/eggs', adminEggs);
app.use('/api/admin/settings', adminSettings);
app.use('/api/public', publicApi);

// ---- статика: публичный терминал-сайт + панель администратора ----
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});

// пасхалка на неверный логин/пароль — можно переопределить в админке (trigger: __wrong_login__)
router.get('/egg/wrong-login', (req, res) => {
  const { profileId } = req.query;
  const db = readDb();
  const egg = (db.eggs || []).find(e =>
    e.trigger === '__wrong_login__' && (!e.profileId || e.profileId === profileId)
  ) || (db.eggs || []).find(e => e.trigger === '__wrong_login__' && !e.profileId);
  res.json(egg || null);
app.get('/page/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'page.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

module.exports = router;
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ARG platform запущен: http://localhost:${PORT}`);
  console.log(`Админка: http://localhost:${PORT}/admin`);
});
