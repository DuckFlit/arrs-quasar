(function(){
'use strict';

/* ============================================================
   API helper
============================================================ */
async function api(method, url, body){
  const res = await fetch(url, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined
  });
  let data = null;
  try{ data = await res.json(); }catch(e){}
  return { ok: res.ok, status: res.status, data };
}

const esc = (s) => String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

/* ============================================================
   AUTH GATE
============================================================ */
const loginScreen = document.getElementById('admin-login-screen');
const dashboard   = document.getElementById('admin-dashboard');
const loginForm   = document.getElementById('admin-login-form');
const loginMsg    = document.getElementById('admin-login-msg');

async function checkSession(){
  const { ok } = await api('GET', '/api/admin/auth/me');
  if(ok){ enterDashboard(); } else { loginScreen.classList.remove('hidden'); dashboard.classList.add('hidden'); }
}

loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('al-user').value.trim();
  const password = document.getElementById('al-pass').value;
  loginMsg.textContent = 'проверка...'; loginMsg.className = 'msg';
  const { ok, data } = await api('POST', '/api/admin/auth/login', { username, password });
  if(ok){
    loginMsg.textContent = 'доступ разрешён'; loginMsg.className = 'msg ok';
    setTimeout(enterDashboard, 300);
  } else {
    loginMsg.textContent = (data && data.error) || 'ошибка входа';
    loginMsg.className = 'msg';
  }
});

document.getElementById('admin-logout').addEventListener('click', async () => {
  await api('POST', '/api/admin/auth/logout');
  location.reload();
});

function enterDashboard(){
  loginScreen.classList.add('hidden');
  dashboard.classList.remove('hidden');
  activateTab('profiles');
}

checkSession();

/* ============================================================
   DSL encode/decode for compact text-based field editors
============================================================ */
const DSL = {
  pairs: {
    encode: (arr) => (arr||[]).map(o => `${o.label}:${o.value}`).join('\n'),
    decode: (text) => (text||'').split('\n').map(l=>l.trim()).filter(Boolean).map(line => {
      const idx = line.indexOf(':');
      return idx === -1 ? { label: line, value: '' } : { label: line.slice(0,idx).trim(), value: line.slice(idx+1).trim() };
    })
  },
  bars: {
    encode: (arr) => (arr||[]).map(o => `${o.label}:${o.value}:${o.pct}`).join('\n'),
    decode: (text) => (text||'').split('\n').map(l=>l.trim()).filter(Boolean).map(line => {
      const [label, value, pct] = line.split(':');
      return { label: (label||'').trim(), value: (value||'').trim(), pct: parseInt(pct,10) || 0 };
    })
  },
  tags: {
    encode: (arr) => (arr||[]).join(', '),
    decode: (text) => (text||'').split(',').map(s=>s.trim()).filter(Boolean)
  },
  sections: {
    encode: (arr) => (arr||[]).map(s => `### ${s.title}\n${s.body}`).join('\n===\n'),
    decode: (text) => (text||'').split('\n===\n').map(block => {
      const nl = block.indexOf('\n');
      if(nl === -1) return null;
      const title = block.slice(0, nl).replace(/^###\s*/, '').trim();
      const body = block.slice(nl+1).trim();
      return title ? { title, body } : null;
    }).filter(Boolean)
  },
  steps: {
    encode: (arr) => (arr||[]).map(s => `${s.triggerValue}::${s.unlockMessage}::${s.unlockPageSlug||''}`).join('\n'),
    decode: (text) => (text||'').split('\n').map(l=>l.trim()).filter(Boolean).map((line, i) => {
      const [tv, msg, slug] = line.split('::');
      return { id: 's'+i, order: i, triggerValue: (tv||'').trim(), unlockMessage: (msg||'').trim(), unlockPageSlug: (slug||'').trim() || null };
    })
  },
  frames: {
    encode: (arr) => (arr||[]).join('\n---FRAME---\n'),
    decode: (text) => (text||'').split('\n---FRAME---\n').map(f => f.replace(/\r/g,'')).filter(f => f.trim().length)
  }
};

/* ============================================================
   Entity schemas (drive both the list table and the form)
============================================================ */
let profilesCache = []; // used to populate profileId <select> across other tabs

async function loadProfilesCache(){
  const { data } = await api('GET', '/api/admin/profiles');
  profilesCache = data || [];
}

function profileSelectOptions(selected){
  let html = `<option value="">— глобально (для всех) —</option>`;
  profilesCache.forEach(p => {
    html += `<option value="${esc(p.id)}" ${selected===p.id?'selected':''}>${esc(p.displayName || p.login)}</option>`;
  });
  return html;
}

const SCHEMAS = {
  profiles: {
    title: 'Профили', apiBase: '/api/admin/profiles',
    columns: [
      { key:'displayName', label:'Имя' },
      { key:'login', label:'Логин' },
      { key:'callsign', label:'Позывной' },
      { key:'published', label:'Статус', render: v => `<span class="pill ${v?'on':''}">${v?'опубликован':'черновик'}</span>` }
    ],
    fields: [
      { key:'displayName', label:'Имя / заголовок досье', type:'text', required:true },
      { key:'callsign', label:'Позывной', type:'text' },
      { key:'login', label:'Логин для входа на сайте', type:'text', required:true },
      { key:'password', label:'Пароль (оставь пустым при редактировании, чтобы не менять)', type:'password' },
      { key:'stampText', label:'Текст штампа сверху', type:'text', placeholder:'RESTRICTED // PERSONNEL FILE' },
      { key:'portrait', label:'Портрет', type:'text', placeholder:'https://... или data:image/jpeg;base64,...' },
      { key:'audioUrl', label:'Ссылка на аудиотрек (необязательно)', type:'text', placeholder:'https://...' },
      { key:'meta', label:'Мета-поля', type:'dsl:pairs', hint:'по одному на строку: label:value — например «Born:Houston, Texas»' },
      { key:'stats', label:'Статистика (числа сверху)', type:'dsl:pairs', hint:'по одному на строку: label:число — например «Combat Hours:53»' },
      { key:'sections', label:'Разделы биографии', type:'dsl:sections', big:true,
        hint:'каждый раздел: первая строка "### Заголовок", дальше текст (можно с <b>HTML</b>). Между разделами — строка "==="' },
      { key:'tags', label:'Теги', type:'dsl:tags', hint:'через запятую' },
      { key:'bars', label:'Прогресс-бары (напр. лётный налёт)', type:'dsl:bars', hint:'по одному на строку: label:value:pct — «Combat Sorties:53 hrs:17»' },
      { key:'published', label:'Опубликован', type:'checkbox' }
    ]
  },
  commands: {
    title: 'Команды', apiBase: '/api/admin/commands',
    columns: [
      { key:'trigger', label:'Команда' },
      { key:'profileId', label:'Профиль', render: v => v ? (profilesCache.find(p=>p.id===v)?.displayName || '—') : 'глобальная' },
      { key:'published', label:'Статус', render: v => `<span class="pill ${v!==false?'on':''}">${v!==false?'активна':'выключена'}</span>` }
    ],
    fields: [
      { key:'trigger', label:'Команда (что вводит игрок в терминале)', type:'text', required:true, placeholder:'whoami2 / codeword / whatever' },
      { key:'profileId', label:'Привязка к профилю', type:'profileSelect' },
      { key:'responseText', label:'Текст ответа терминала', type:'textarea', big:true, hint:'каждая строка выведется отдельной строкой в терминале' },
      { key:'published', label:'Активна', type:'checkbox', default:true }
    ]
  },
  chains: {
    title: 'Цепочки', apiBase: '/api/admin/chains',
    columns: [
      { key:'name', label:'Название' },
      { key:'profileId', label:'Профиль', render: v => v ? (profilesCache.find(p=>p.id===v)?.displayName || '—') : 'глобальная' },
      { key:'steps', label:'Шагов', render: v => (v||[]).length }
    ],
    fields: [
      { key:'name', label:'Название цепочки', type:'text', required:true },
      { key:'profileId', label:'Привязка к профилю', type:'profileSelect' },
      { key:'steps', label:'Шаги / коды', type:'dsl:steps', big:true,
        hint:'по одному на строку: код::сообщение при разгадке::slug открываемой страницы (необязательно) — например «10-4-KORD::Сигнал расшифрован. Координаты приняты.::coordinates»' }
    ]
  },
  pages: {
    title: 'Страницы', apiBase: '/api/admin/pages',
    columns: [
      { key:'slug', label:'Slug', render: v => `/page/${esc(v)}` },
      { key:'title', label:'Заголовок' },
      { key:'published', label:'Статус', render: v => `<span class="pill ${v?'on':''}">${v?'опубликована':'черновик'}</span>` }
    ],
    fields: [
      { key:'slug', label:'Slug (адрес страницы)', type:'text', required:true, placeholder:'coordinates' },
      { key:'title', label:'Заголовок', type:'text' },
      { key:'bodyHtml', label:'Содержимое (HTML)', type:'textarea', big:true },
      { key:'published', label:'Опубликована', type:'checkbox' }
    ]
  },
  eggs: {
    title: 'Пасхалки', apiBase: '/api/admin/eggs',
    columns: [
      { key:'trigger', label:'Триггер' },
      { key:'profileId', label:'Профиль', render: v => v ? (profilesCache.find(p=>p.id===v)?.displayName || '—') : 'глобальная' },
      { key:'soundStyle', label:'Звук' },
      { key:'published', label:'Статус', render: v => `<span class="pill ${v!==false?'on':''}">${v!==false?'активна':'выключена'}</span>` }
    ],
    fields: [
      { key:'trigger', label:'Триггер', type:'text', required:true,
        hint:'слово-команда для случайной пасхалки, или зарезервированное __wrong_login__ — сработает при неверном логине/пароле' },
      { key:'profileId', label:'Привязка к профилю', type:'profileSelect' },
      { key:'caption', label:'Подпись под анимацией', type:'text', placeholder:'HA HA HA' },
      { key:'soundStyle', label:'Звук', type:'select', options:[['laugh','смех (пиксельный)'],['beep','короткий сигнал'],['none','без звука']] },
      { key:'asciiFrames', label:'ASCII-кадры анимации', type:'dsl:frames', big:true,
        hint:'нарисуй свою ASCII-картинку; для анимации добавь ещё один кадр после строки "---FRAME---". Если оставить пустым — используется дефолтный смеющийся скелетик' },
      { key:'published', label:'Активна', type:'checkbox', default:true }
    ]
  }
};

/* ============================================================
   Generic renderer
============================================================ */
let activeTab = null;

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => activateTab(btn.dataset.tab));
});

async function activateTab(tab){
  activeTab = tab;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  await loadProfilesCache();
  if(tab === 'settings') return renderSettingsTab();
  renderListTab(tab);
}

async function renderListTab(tab){
  const schema = SCHEMAS[tab];
  const main = document.getElementById('admin-main');
  const { data: items } = await api('GET', schema.apiBase);

  main.innerHTML = `
    <div class="section-title">${esc(schema.title)}</div>
    <div class="section-hint">Управляй записями ниже. Все изменения применяются сразу и видны на публичном сайте.</div>
    <div class="toolbar">
      <div></div>
      <button class="btn-add" id="btn-add-new">+ Новая запись</button>
    </div>
    <div id="list-holder"></div>
    <div id="form-holder"></div>
  `;

  const listHolder = document.getElementById('list-holder');
  if(!items || !items.length){
    listHolder.innerHTML = `<div class="empty-note">Пока пусто. Нажми «+ Новая запись», чтобы добавить первую.</div>`;
  } else {
    const cols = schema.columns;
    listHolder.innerHTML = `
      <table class="list">
        <thead><tr>${cols.map(c=>`<th>${esc(c.label)}</th>`).join('')}<th></th></tr></thead>
        <tbody>
          ${items.map(item => `
            <tr>
              ${cols.map(c => `<td>${c.render ? c.render(item[c.key], item) : esc(item[c.key])}</td>`).join('')}
              <td class="row-actions">
                <button data-edit="${esc(item.id)}">изменить</button>
                <button data-del="${esc(item.id)}" class="danger">удалить</button>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
    listHolder.querySelectorAll('[data-edit]').forEach(btn => {
      btn.addEventListener('click', () => renderForm(tab, items.find(i => i.id === btn.dataset.edit)));
    });
    listHolder.querySelectorAll('[data-del]').forEach(btn => {
      btn.addEventListener('click', async () => {
        if(!confirm('Удалить запись без возможности восстановить?')) return;
        await api('DELETE', `${schema.apiBase}/${btn.dataset.del}`);
        renderListTab(tab);
      });
    });
  }

  document.getElementById('btn-add-new').addEventListener('click', () => renderForm(tab, null));
}

function fieldToHtml(f, value){
  const v = value == null ? (f.default !== undefined ? f.default : '') : value;
  const hint = f.hint ? `<span class="fhint">${esc(f.hint)}</span>` : '';
  if(f.type === 'checkbox'){
    return `
      <div class="field checkbox">
        <input type="checkbox" id="f-${f.key}" ${v ? 'checked' : ''}>
        <label for="f-${f.key}">${esc(f.label)}</label>
      </div>`;
  }
  if(f.type === 'textarea' || f.type.startsWith('dsl:')){
    let text = v;
    if(f.type.startsWith('dsl:')){
      const dslKind = f.type.split(':')[1];
      text = DSL[dslKind].encode(v || []);
    }
    return `
      <div class="field">
        <label for="f-${f.key}">${esc(f.label)}</label>
        <textarea id="f-${f.key}" ${f.big ? 'style="min-height:150px"' : ''} placeholder="${esc(f.placeholder||'')}">${esc(text)}</textarea>
        ${hint}
      </div>`;
  }
  if(f.type === 'profileSelect'){
    return `
      <div class="field">
        <label for="f-${f.key}">${esc(f.label)}</label>
        <select id="f-${f.key}">${profileSelectOptions(v)}</select>
        ${hint}
      </div>`;
  }
  if(f.type === 'select'){
    const opts = f.options.map(([val,lab]) => `<option value="${esc(val)}" ${v===val?'selected':''}>${esc(lab)}</option>`).join('');
    return `
      <div class="field">
        <label for="f-${f.key}">${esc(f.label)}</label>
        <select id="f-${f.key}">${opts}</select>
        ${hint}
      </div>`;
  }
  // text / password
  return `
    <div class="field">
      <label for="f-${f.key}">${esc(f.label)}</label>
      <input type="${f.type}" id="f-${f.key}" value="${f.type==='password' ? '' : esc(v)}" placeholder="${esc(f.placeholder||'')}">
      ${hint}
    </div>`;
}

function readFieldValue(f){
  const el = document.getElementById('f-' + f.key);
  if(f.type === 'checkbox') return el.checked;
  if(f.type.startsWith('dsl:')){
    const dslKind = f.type.split(':')[1];
    return DSL[dslKind].decode(el.value);
  }
  return el.value;
}

function renderForm(tab, existing){
  const schema = SCHEMAS[tab];
  const holder = document.getElementById('form-holder');
  holder.innerHTML = `
    <div class="form-panel">
      <h3>${existing ? 'Редактирование' : 'Новая запись'} — ${esc(schema.title)}</h3>
      <div class="form-msg" id="form-msg"></div>
      <div id="fields"></div>
      <div class="form-actions">
        <button class="btn-save" id="btn-save">Сохранить</button>
        <button class="btn-cancel" id="btn-cancel">Отмена</button>
      </div>
    </div>
  `;
  const fieldsEl = document.getElementById('fields');
  schema.fields.forEach(f => {
    fieldsEl.insertAdjacentHTML('beforeend', fieldToHtml(f, existing ? existing[f.key] : undefined));
  });
  holder.scrollIntoView({ behavior:'smooth', block:'center' });

  document.getElementById('btn-cancel').addEventListener('click', () => { holder.innerHTML = ''; });

  document.getElementById('btn-save').addEventListener('click', async () => {
    const msg = document.getElementById('form-msg');
    const payload = {};
    for(const f of schema.fields){
      if(f.required){
        const el = document.getElementById('f-' + f.key);
        if(!el.value.trim()){
          msg.textContent = `поле «${f.label}» обязательно`; msg.className = 'form-msg';
          return;
        }
      }
      const val = readFieldValue(f);
      if(f.type === 'password' && !val) continue; // не перетираем пустым паролем
      payload[f.key] = val;
    }
    const method = existing ? 'PUT' : 'POST';
    const url = existing ? `${schema.apiBase}/${existing.id}` : schema.apiBase;
    const { ok, data } = await api(method, url, payload);
    if(ok){
      msg.textContent = 'сохранено'; msg.className = 'form-msg ok';
      setTimeout(() => { holder.innerHTML = ''; renderListTab(tab); }, 350);
    } else {
      msg.textContent = (data && data.error) || 'ошибка сохранения'; msg.className = 'form-msg';
    }
  });
}

/* ============================================================
   Settings tab (single object, not a list)
============================================================ */
async function renderSettingsTab(){
  const main = document.getElementById('admin-main');
  const { data: settings } = await api('GET', '/api/admin/settings');
  main.innerHTML = `
    <div class="section-title">Настройки сайта</div>
    <div class="section-hint">Название, подзаголовок и тег узла, которые видны на главном экране терминала до входа.</div>
    <div class="form-panel">
      <div class="form-msg" id="settings-msg"></div>
      <div class="field"><label>Название (лого)</label><input type="text" id="s-siteTitle" value="${esc(settings.siteTitle||'')}"></div>
      <div class="field"><label>Подзаголовок</label><input type="text" id="s-subtitle" value="${esc(settings.subtitle||'')}"></div>
      <div class="field"><label>Тег узла</label><input type="text" id="s-nodeTag" value="${esc(settings.nodeTag||'')}"></div>
      <div class="form-actions">
        <button class="btn-save" id="btn-save-settings">Сохранить</button>
      </div>
    </div>
    <div class="settings-note">
      Логин и пароль от этой админ-панели задаются в <code>.env</code> прямо на сервере
      (переменные <code>ADMIN_USERNAME</code> / <code>ADMIN_PASSWORD</code>) и нигде в базе или на фронтенде не хранятся —
      их знаешь только ты. Чтобы сменить пароль, поменяй значение в <code>.env</code> и перезапусти сервер.
    </div>
  `;
  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const msg = document.getElementById('settings-msg');
    const payload = {
      siteTitle: document.getElementById('s-siteTitle').value,
      subtitle: document.getElementById('s-subtitle').value,
      nodeTag: document.getElementById('s-nodeTag').value
    };
    const { ok } = await api('PUT', '/api/admin/settings', payload);
    msg.textContent = ok ? 'сохранено' : 'ошибка сохранения';
    msg.className = ok ? 'form-msg ok' : 'form-msg';
  });
}
})();
