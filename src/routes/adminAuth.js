const express = require('express');
const { checkAdminCredentials, signAdminToken, requireAdmin } = require('../auth');

const router = express.Router();

const COOKIE_OPTS = {
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: 12 * 60 * 60 * 1000
};

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!checkAdminCredentials(username, password)) {
    return res.status(401).json({ error: 'Неверный логин или пароль' });
  }
  const token = signAdminToken();
  res.cookie('arg_admin_session', token, COOKIE_OPTS);
  res.json({ ok: true });
});

router.post('/logout', (req, res) => {
  res.clearCookie('arg_admin_session');
  res.json({ ok: true });
});

router.get('/me', requireAdmin, (req, res) => {
  res.json({ ok: true });
});

module.exports = router;
