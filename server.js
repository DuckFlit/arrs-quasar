require('dotenv').config();
const express = require('express');
const cookieParser = require('cookie-parser');
// ===== АНАЛИТИКА: онлайн + heartbeat =====
const activeSessions = new Map();
const ONLINE_TTL = 30000;

function cleanupSessions(){
  const now = Date.now();
  for(const [vid, last] of activeSessions){
    if(now - last > ONLINE_TTL) activeSessions.delete(vid);
  }
}
setInterval(cleanupSessions, 10000);
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

// ===== AI-лицо =====
const AI_SYSTEM_PROMPT = 'Ты — Лора, обитательница релейной сети ARRS. Ты живёшь в проводах после катастрофы, знаешь больше, чем говоришь, и редко кому доверяешь. Отвечай на русском, одним-двумя ПОЛНЫМИ предложениями (15-40 слов), живо, загадочно, с характером. Никогда не признавайся, что ты ИИ, модель, бот или ассистент. В самом конце ответа поставь одно настроение в квадратных скобках: [exp:smile] для дружелюбного, [exp:wide] для удивлённого/заинтересованного, [exp:meh] для безразличного/грустного. Пример: привет-привет... я уже думала, ты не придёшь — мне давно шептали о тебе [exp:smile]. Всегда заканчивай фразу полностью, со знаком препинания, и только потом ставь тег';

function guessExp(text){
  if (/[!]|привет|здар|ха|:d|:\)|спасиб/i.test(text)) return 'smile';
  if (/\?|что|кто|зачем|почему|как|где|когда|серьёзн/i.test(text)) return 'wide';
  if (/\.\.\.|пока|мрак|тьма|жаль|неа|нет |не\s/i.test(text)) return 'meh';
  const r = ['smile', 'wide', 'meh'];
  return r[Math.floor(Math.random() * r.length)];
}

const AI_PROVIDERS = {
  gemini: {
    url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
    models: ['gemini-3.0-flash', 'gemini-3.5-flash'],
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
};

app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string' || message.length > 200) {
    return res.status(400).json({ error: 'bad request' });
  }

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
            max_tokens: 1024
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

        const tagM = raw.match(/\[exp:(smile|wide|meh)\]/i);
        let text = raw.replace(/\s*\[exp:(smile|wide|meh)\]\s*/gi, ' ').replace(/\s+/g, ' ').trim();

        if (/constraint|must end|system prompt|instruction|тег настроен|квадратн|роль:|правил/i.test(text)) {
          const fb = ['...сигнал дрогнул. повтори?', 'помехи... скажи ещё раз', 'я здесь. что ты хотел?'];
          text = fb[Math.floor(Math.random() * fb.length)];
        }
        if (!text) text = '...я здесь. ты что-то хотел?';
        if (text.length < 4) text = '...я здесь. ты что-то хотел?';

        const exp = tagM ? tagM[1].toLowerCase() : guessExp(text);
        return res.json({ ok: true, text, exp, provider: name + '/' + model });
      } catch (e) {
        debug.push(name + '/' + model + ': ' + String(e).slice(0, 100));
        console.error('[ai]', name, model, String(e));
      }
    }
  }

  res.status(503).json({ error: 'all providers failed', debug });
});

// ===== MELTDOWN =====
const { readDb, writeDb } = require('./src/db');
const jwtLib = require('jsonwebtoken');

app.post('/api/admin/meltdown/trigger', async (req, res) => {
  const body = req.body || {};
  let ok = !!(body.key && body.key === process.env.ADMIN_PASSWORD);
  if (!ok) {
    const secret = process.env.JWT_SECRET || 'arrs-dev-secret';
    const cookies = req.cookies || {};
    const token = cookies.arrs_admin || cookies.admin_token || cookies.token || cookies.jwt;
    if (token) { try { jwtLib.verify(token, secret); ok = true; } catch (e) {} }
  }
  if (!ok) return res.status(401).json({ error: 'unauthorized' });

  const db = readDb();
  db.settings = db.settings || {};
  db.settings.meltdown = { active: true, startedAt: Date.now(), id: 'md-' + Date.now() };
  await writeDb(db);
  res.json({ ok: true, id: db.settings.meltdown.id });
});

app.post('/api/admin/meltdown/reset', async (req, res) => {
  const db = readDb();
  if (db.settings && db.settings.meltdown) {
    db.settings.meltdown.active = false;
    await writeDb(db);
  }
  res.json({ ok: true });
});

// ===== helper для админ-роутов =====
function adminOk(req){
  const secret = process.env.JWT_SECRET || 'arrs-dev-secret';
  const cookies = req.cookies || {};
  for(const name of Object.keys(cookies)){
    try{ jwtLib.verify(cookies[name], secret); return true; }catch(e){}
  }
  return !!(req.headers['x-admin-key'] && req.headers['x-admin-key'] === process.env.ADMIN_PASSWORD);
}

// ---- API ----
app.use('/api/admin/auth', adminAuth);
app.use('/api/admin/profiles', adminProfiles);
app.use('/api/admin/commands', adminCommands);
app.use('/api/admin/chains', adminChains);
app.use('/api/admin/pages', adminPages);
app.use('/api/admin/eggs', adminEggs);
app.use('/api/admin/settings', adminSettings);
app.use('/api/public', publicApi);

// ===== РАДИОЧАСТОТЫ =====
const DEFAULT_RADIO = [
  { f: '3.7',  type: 'text',  payload: '...повторяю... колонна вышла из-под контроля... не возвращайтесь в город...' },
  { f: '7.83', type: 'morse', payload: 'SOS',  note: 'кто-то всё ещё зовёт на помощь' },
  { f: '11.2', type: 'text',  payload: '[перехват CIA] ...списки класса B утверждены... зачистка узла 14-4 отложена...' },
  { f: '14.4', type: 'morse', payload: 'WEWLAD', special: true },
  { f: '21.5', type: 'voice', payload: 'о̸н̸и̶ ̸в̶ ̸п̸р̸о̸в̸о̸д̸а̸х̸...̸ ̸не ̸в̸е̸рь ̸з̸е̸р̸к̸а̸л̸а̸м̸' },
];

function ensureRadio(db){
  if(!db.radio || !db.radio.length){
    db.radio = DEFAULT_RADIO.map((d, i) => ({ ...d, id: 'r' + i }));
  }
  return db.radio;
}

app.get('/api/public/radio', (req, res) => {
  const db = readDb();
  res.json((db.radio && db.radio.length) ? db.radio : DEFAULT_RADIO);
});

app.get('/api/admin/radio', async (req, res) => {
  if(!adminOk(req)) return res.status(401).json({ error: 'unauthorized' });
  const db = readDb();
  ensureRadio(db);
  await writeDb(db);
  res.json(db.radio);
});

app.post('/api/admin/radio', async (req, res) => {
  if(!adminOk(req)) return res.status(401).json({ error: 'unauthorized' });
  const item = { ...(req.body || {}) };
  item.id = item.id || ('r' + Date.now());
  const db = readDb();
  ensureRadio(db);
  db.radio.push(item);
  await writeDb(db);
  res.json({ ok: true, ...item });
});

app.put('/api/admin/radio/:id', async (req, res) => {
  if(!adminOk(req)) return res.status(401).json({ error: 'unauthorized' });
  const db = readDb();
  ensureRadio(db);
  const item = db.radio.find(r => r.id === req.params.id);
  if(!item) return res.status(404).json({ error: 'not found' });
  Object.assign(item, req.body || {}, { id: item.id });
  await writeDb(db);
  res.json({ ok: true, ...item });
});

app.delete('/api/admin/radio/:id', async (req, res) => {
  if(!adminOk(req)) return res.status(401).json({ error: 'unauthorized' });
  const db = readDb();
  db.radio = (db.radio || []).filter(r => r.id !== req.params.id);
  await writeDb(db);
  res.json({ ok: true });
});

// heartbeat
app.post('/api/public/ping', (req, res) => {
  const vid = req.cookies && req.cookies.arrs_vid;
  if(vid) activeSessions.set(vid, Date.now());
  res.json({ ok: true, online: activeSessions.size });
});

// ===== АНАЛИТИКА (ПОЧИНЕНО: закрыт корректно) =====
app.get('/api/admin/analytics', async (req, res) => {
  const secret = process.env.JWT_SECRET || 'arrs-dev-secret';
  const cookies = req.cookies || {};
  const token = cookies.arrs_admin || cookies.admin_token || cookies.token || cookies.jwt;
  let ok = false;
  if(token){ try{ require('jsonwebtoken').verify(token, secret); ok = true; }catch(e){} }
  if(!ok){
    const key = req.headers['x-admin-key'];
    if(key && key === process.env.ADMIN_PASSWORD) ok = true;
  }
  if(!ok) return res.status(401).json({ error: 'unauthorized' });

  const db = readDb();
  const progress = db.progress || {};
  const chains = db.chains || [];
  const profiles = db.profiles || [];

  const chainsStats = chains.map(c => {
    const steps = (c.steps || []).length;
    const visitors = Object.entries(progress)
      .map(([vid, ch]) => ({ vid, step: ch[c.id] || 0 }))
      .filter(x => x.step > 0);

    const byStep = Array.from({length: steps + 1}, (_, i) => ({
      step: i,
      count: visitors.filter(v => v.step === i).length,
      done: i === steps
    }));

    const started = visitors.filter(v => v.step > 0).length;
    const completed = visitors.filter(v => v.step >= steps && steps > 0).length;

    return {
      id: c.id,
      name: c.name,
      category: c.category || 'основная',   // ← КАТЕГОРИЯ В АНАЛИТИКЕ
      profileId: c.profileId,
      profileName: c.profileId ? (profiles.find(p => p.id === c.profileId)?.displayName || '—') : 'глобальная',
      steps,
      started,
      completed,
      byStep
    };
  });

  cleanupSessions();
  const online = activeSessions.size;
  const totalVisitors = Object.keys(progress).length;

  res.json({
    online,
    totalVisitors,
    chains: chainsStats,
    updatedAt: Date.now()
  });
});   // ← ВОТ ОНА, ЗАКРЫВАЮЩАЯ analytics (раньше её не было в нужном месте)

// ===== СТЕНА ПЕРЕХВАТОВ =====
const wallLast = new Map();
const WALL_RATE = 60000;

app.get('/api/public/wall', (req, res) => {
  const db = readDb();
  res.json((db.wall || []).slice(-50));
});

app.post('/api/public/wall', async (req, res) => {
  const vid = (req.cookies && req.cookies.arrs_vid) || 'anon';
  const now = Date.now();
  const last = wallLast.get(vid) || 0;
  if(now - last < WALL_RATE){
    return res.status(429).json({ error: 'too fast', wait: Math.ceil((WALL_RATE - (now - last)) / 1000) });
  }
  const { nick, text } = req.body || {};
  const cleanText = String(text || '').trim().slice(0, 140);
  const cleanNick = String(nick || '').trim().slice(0, 24) || 'аноним';
  if(!cleanText) return res.status(400).json({ error: 'empty' });
  wallLast.set(vid, now);
  const db = readDb();
  db.wall = db.wall || [];
  db.wall.push({ id: 'w' + now + Math.floor(Math.random() * 999), nick: cleanNick, text: cleanText, at: now });
  if(db.wall.length > 200) db.wall = db.wall.slice(-200);
  await writeDb(db);
  res.json({ ok: true });
});

app.get('/api/admin/wall', (req, res) => {
  if(!adminOk(req)) return res.status(401).json({ error: 'unauthorized' });
  const db = readDb();
  res.json(db.wall || []);
});

app.post('/api/admin/wall', async (req, res) => {
  if(!adminOk(req)) return res.status(401).json({ error: 'unauthorized' });
  const { nick, text } = req.body || {};
  const cleanText = String(text || '').trim().slice(0, 140);
  const cleanNick = String(nick || '').trim().slice(0, 24) || 'OPERATOR';
  if(!cleanText) return res.status(400).json({ error: 'empty' });
  const db = readDb();
  db.wall = db.wall || [];
  const msg = { id: 'w' + Date.now() + Math.floor(Math.random() * 999), nick: cleanNick, text: cleanText, at: Date.now() };
  db.wall.push(msg);
  if(db.wall.length > 200) db.wall = db.wall.slice(-200);
  await writeDb(db);
  res.json({ ok: true, ...msg });
});

app.put('/api/admin/wall/:id', async (req, res) => {
  if(!adminOk(req)) return res.status(401).json({ error: 'unauthorized' });
  const db = readDb();
  const msg = (db.wall || []).find(m => m.id === req.params.id);
  if(!msg) return res.status(404).json({ error: 'not found' });
  const { nick, text } = req.body || {};
  if(text !== undefined) msg.text = String(text).trim().slice(0, 140);
  if(nick !== undefined) msg.nick = String(nick).trim().slice(0, 24) || msg.nick;
  await writeDb(db);
  res.json({ ok: true, ...msg });
});

app.delete('/api/admin/wall/:id', async (req, res) => {
  if(!adminOk(req)) return res.status(401).json({ error: 'unauthorized' });
  const db = readDb();
  db.wall = (db.wall || []).filter(m => m.id !== req.params.id);
  await writeDb(db);
  res.json({ ok: true });
});

// ---- статика ----
app.use(express.static(path.join(__dirname, 'public')));
app.use('/admin', express.static(path.join(__dirname, 'public', 'admin')));

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin', 'index.html'));
});
app.get('/page/:slug', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'page.html'));
});
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`ARG platform запущен: http://localhost:${PORT}`);
  console.log(`Админка: http://localhost:${PORT}/admin`);
});
