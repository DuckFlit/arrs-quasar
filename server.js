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

// ===== AI-лицо: мульти-провайдер прокси =====
const AI_SYSTEM_PROMPT = `Ты — загадочное лицо в проводе, обитательница релейной сети ARRS. Отвечай КОРОТКО (1-2 предложения), на русском, в духе пост-апокалипсиса и тайны. Иногда кокетничай, иногда отшучивайся, иногда намёками. Не раскрывай, кто ты. Не пиши от лица ассистента или ИИ — ты ПЕРСОНАЖ. В самом конце ответа ОБЯЗАТЕЛЬНО добавь тег настроения в квадратных скобках: [exp:smile] для дружелюбного, [exp:wide] для удивлённого/шокированного, [exp:meh] для безразличного/грустного. Только один тег, в самом конце строки.`;

const AI_PROVIDERS = {
  // бесплатно, без ключа, работает сразу
  pollinations: { url: 'https://text.pollinations.ai/openai', model: 'openai', keyVar: null },
  // бесплатно, ключ без карты: console.groq.com
  groq:         { url: 'https://api.groq.com/openai/v1/chat/completions', model: 'llama-3.1-8b-instant', keyVar: 'GROQ_API_KEY' },
  // бесплатно, ключ без карты: aistudio.google.com
  gemini:       { url: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions', model: 'gemini-2.0-flash', keyVar: 'GEMINI_API_KEY' },
  // платный (центы), если пополнить
  deepseek:     { url: 'https://api.deepseek.com/chat/completions', model: 'deepseek-chat', keyVar: 'DEEPSEEK_API_KEY' },
};

app.post('/api/ai/chat', async (req, res) => {
  const { message } = req.body || {};
  if (!message || typeof message !== 'string' || message.length > 200) {
    return res.status(400).json({ error: 'bad request' });
  }

  const wanted = String(process.env.AI_PROVIDER || 'pollinations').toLowerCase();
  const order = [wanted, 'pollinations'].filter((v, i, a) => a.indexOf(v) === i);

  for (const name of order) {
    const p = AI_PROVIDERS[name];
    if (!p) continue;
    const key = p.keyVar ? (process.env[p.keyVar] || '') : '';
    if (p.keyVar && !key) continue; // нет ключа — пропускаем провайдера

    try {
      const headers = { 'Content-Type': 'application/json' };
      if (key) headers.Authorization = 'Bearer ' + key;

      const apiRes = await fetch(p.url, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: p.model,
          messages: [
            { role: 'system', content: AI_SYSTEM_PROMPT },
            { role: 'user', content: message.slice(0, 200) }
          ],
          temperature: 0.85,
          max_tokens: 120
        })
      });
      if (!apiRes.ok) continue;
      const data = await apiRes.json();
      const raw = (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
      if (!raw) continue;
      const m = raw.match(/\[exp:(smile|wide|meh)\]\s*$/i);
      const exp = m ? m[1].toLowerCase() : 'smile';
      const text = (m ? raw.slice(0, m.index) : raw).trim();
      return res.json({ ok: true, text, exp, provider: name });
    } catch (e) { /* пробуем следующего */ }
  }

  res.status(503).json({ error: 'all providers failed' });
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
