const bcrypt = require('bcryptjs');
const crudFactory = require('./crudFactory');

function sanitizeOut(profile) {
  const { passwordHash, ...rest } = profile;
  return { ...rest, hasPassword: !!passwordHash };
}

async function beforeSave(next, prev) {
  // если в форме прислали новый пароль — хешируем и заменяем; если поле пустое — оставляем старый хеш
  if (next.password) {
    next.passwordHash = bcrypt.hashSync(next.password, 10);
  } else if (prev && prev.passwordHash) {
    next.passwordHash = prev.passwordHash;
  }
  delete next.password;
  if (next.login) next.login = String(next.login).trim();
  return next;
}

module.exports = crudFactory('profiles', { beforeSave, sanitizeOut });
