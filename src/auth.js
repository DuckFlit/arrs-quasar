const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('\n[FATAL] Не задан JWT_SECRET в .env — сгенерируй случайную строку и пропиши её. Сервер остановлен.\n');
  process.exit(1);
}

const ADMIN_USERNAME = process.env.ADMIN_USERNAME;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
if (!ADMIN_USERNAME || !ADMIN_PASSWORD) {
  console.error('\n[FATAL] Не заданы ADMIN_USERNAME / ADMIN_PASSWORD в .env — админка не сможет запуститься. Сервер остановлен.\n');
  process.exit(1);
}

// Хешируем пароль администратора один раз при старте, храним ТОЛЬКО в памяти процесса.
// На диске (в db.json/репозитории) логин и пароль администратора не появляются никогда.
const ADMIN_HASH = bcrypt.hashSync(ADMIN_PASSWORD, 10);

function checkAdminCredentials(username, password) {
  if (username !== ADMIN_USERNAME) return false;
  return bcrypt.compareSync(password || '', ADMIN_HASH);
}

function signAdminToken() {
  return jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '12h' });
}

function requireAdmin(req, res, next) {
  const token = req.cookies && req.cookies.arg_admin_session;
  if (!token) return res.status(401).json({ error: 'Не авторизован' });
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (payload.role !== 'admin') throw new Error('bad role');
    next();
  } catch (e) {
    return res.status(401).json({ error: 'Сессия недействительна, войдите заново' });
  }
}

module.exports = { checkAdminCredentials, signAdminToken, requireAdmin, bcrypt };
