require('dotenv').config();
const express = require('express');
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

        // вытаскиваем тег откуда угодно в тексте
        const tagM = raw.match(/\[exp:(smile|wide|meh)\]/i);
        let text = raw.replace(/\s*\[exp:(smile|wide|meh)\]\s*/gi, ' ').replace(/\s+/g, ' ').trim();

        // защита от эхо-инструкции
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

// ===== MELTDOWN: триггер из админки (без отдельного файла) =====
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
