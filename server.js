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
