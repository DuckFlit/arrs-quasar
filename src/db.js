// Простое файловое хранилище (JSON) — без внешней БД.
// Для реального прод-хостинга с постоянным диском (Railway/Fly/VPS) этого достаточно.
// На хостингах с эфемерной ФС (часть бесплатных тиров) файл может сбрасываться при редеплое —
// см. README, там есть варианты с постоянным диском.

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', 'data', 'db.json');

const EMPTY_DB = {
  settings: { siteTitle: 'ARRS', nodeTag: 'NODE 14-4 KORD', subtitle: 'Automated Radio Relay Service' },
  profiles: [],   // персонажи/команды АРГ — со своим логином и паролем для входа
  commands: [],   // кастомные команды терминала (глобальные или привязанные к profileId)
  chains: [],     // цепочки — упорядоченные шаги-загадки
  pages: [],      // отдельные редактируемые страницы (лендинги, пасхалки, доп. контент)
  eggs: []        // пасхалки — триггер (слово/код) + анимация/сообщение
};

function ensureDb() {
  if (!fs.existsSync(DB_PATH)) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY_DB, null, 2));
  }
}

function readDb() {
  ensureDb();
  const raw = fs.readFileSync(DB_PATH, 'utf-8');
  try {
    const parsed = JSON.parse(raw);
    // на случай если в файле не хватает какого-то раздела (ручное редактирование и т.п.)
    return { ...EMPTY_DB, ...parsed };
  } catch (e) {
    console.error('db.json повреждён, создаю новый пустой файл. Ошибка:', e.message);
    fs.writeFileSync(DB_PATH, JSON.stringify(EMPTY_DB, null, 2));
    return { ...EMPTY_DB };
  }
}

// простая очередь записи, чтобы параллельные запросы не затирали друг друга
let writeChain = Promise.resolve();
function writeDb(data) {
  writeChain = writeChain.then(() => new Promise((resolve, reject) => {
    fs.writeFile(DB_PATH, JSON.stringify(data, null, 2), (err) => {
      if (err) return reject(err);
      resolve();
    });
  }));
  return writeChain;
}

module.exports = { readDb, writeDb, DB_PATH };
