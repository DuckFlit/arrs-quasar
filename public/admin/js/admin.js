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
   TOAST SYSTEM
============================================================ */
const toastContainer = document.createElement('div');
toastContainer.id = 'toast-container';
document.body.appendChild(toastContainer);

function toast(msg, type='success'){
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  toastContainer.appendChild(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2500);
}

/* ============================================================
   MODAL CONFIRMATION
============================================================ */
function confirmDialog(message, onConfirm){
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-box">
      <div class="modal-msg">${esc(message)}</div>
      <div class="modal-actions">
        <button class="btn-cancel" id="modal-cancel">Отмена</button>
        <button class="btn-danger" id="modal-confirm">Подтвердить</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  
  document.getElementById('modal-cancel').onclick = () => overlay.remove();
  document.getElementById('modal-confirm').onclick = () => {
    overlay.remove();
    onConfirm();
  };
  overlay.onclick = (e) => { if(e.target === overlay) overlay.remove(); };
}

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
   DSL encode/decode
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
   Entity schemas
============================================================ */
let profilesCache = [];

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
      { key:'published', label:'Статус', render: v => `<span class="pill ${v?'on':''}">${v?'опубликован':'черновик'}</span>`, toggle:true }
    ],
    fields: [
      { key:'displayName', label:'Имя / заголовок досье', type:'text', required:true },
      { key:'callsign', label:'Позывной', type:'text' },
      { key:'login', label:'Логин для входа на сайте', type:'text', required:true },
      { key:'password', label:'Пароль', type:'password-gen' },
      { key:'stampText', label:'Текст штампа сверху', type:'text', placeholder:'RESTRICTED // PERSONNEL FILE' },
      { key:'portrait', label:'Портрет', type:'image' },
      { key:'audioUrl', label:'Ссылка на аудиотрек (необязательно)', type:'text', placeholder:'https://...' },
      { key:'meta', label:'Мета-поля', type:'dsl:pairs' },
      { key:'stats', label:'Статистика (числа сверху)', type:'dsl:pairs' },
      { key:'sections', label:'Разделы биографии', type:'dsl:sections', big:true },
      { key:'tags', label:'Теги', type:'dsl:tags' },
      { key:'bars', label:'Прогресс-бары', type:'dsl:bars' },
      { key:'published', label:'Опубликован', type:'checkbox' }
    ]
  },
  commands: {
    title: 'Команды', apiBase: '/api/admin/commands',
    columns: [
      { key:'trigger', label:'Команда' },
      { key:'profileId', label:'Профиль', render: v => v ? (profilesCache.find(p=>p.id===v)?.displayName || '—') : 'глобальная' },
      { key:'redirectUrl', label:'Редирект', render: v => v ? '🔗' : '—' },
      { key:'published', label:'Статус', render: v => `<span class="pill ${v!==false?'on':''}">${v!==false?'активна':'выключена'}</span>`, toggle:true }
    ],
    fields: [
      { key:'trigger', label:'Команда (что вводит игрок в терминале)', type:'text', required:true, placeholder:'whoami2 / codeword / whatever' },
      { key:'profileId', label:'Привязка к профилю', type:'profileSelect' },
      { key:'responseText', label:'Текст ответа терминала', type:'textarea', big:true },
      { key:'redirectUrl', label:'Переход на URL после ответа (необязательно)', type:'text', 
        placeholder:'https://... или /page/coordinates',
        hint:'если заполнено — через 2 секунды после вывода ответа терминал откроет эту ссылку' },
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
      { key:'steps', label:'Шаги / коды', type:'dsl:steps', big:true }
    ]
  },
  pages: {
    title: 'Страницы', apiBase: '/api/admin/pages',
    columns: [
      { key:'slug', label:'Slug', render: v => `/page/${esc(v)}` },
      { key:'title', label:'Заголовок' },
      { key:'published', label:'Статус', render: v => `<span class="pill ${v?'on':''}">${v?'опубликована':'черновик'}</span>`, toggle:true }
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
      { key:'published', label:'Статус', render: v => `<span class="pill ${v!==false?'on':''}">${v!==false?'активна':'выключена'}</span>`, toggle:true }
    ],
    fields: [
      { key:'trigger', label:'Триггер', type:'text', required:true },
      { key:'profileId', label:'Привязка к профилю', type:'profileSelect' },
      { key:'caption', label:'Подпись под анимацией', type:'text', placeholder:'HA HA HA' },
      { key:'soundStyle', label:'Звук', type:'select', options:[['laugh','смех (пиксельный)'],['beep','короткий сигнал'],['none','без звука']] },
      { key:'asciiFrames', label:'ASCII-кадры анимации', type:'dsl:frames', big:true },
      { key:'published', label:'Активна', type:'checkbox', default:true }
    ]
  }
};

/* ============================================================
   Generic renderer
============================================================ */
let activeTab = null;
let currentItems = [];

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
  currentItems = items || [];

  main.innerHTML = `
    <div class="section-title">${esc(schema.title)}</div>
    <div class="section-hint">Управляй записями ниже. Все изменения применяются сразу и видны на публичном сайте.</div>
    <div class="toolbar">
      <input type="text" id="search-input" placeholder="Поиск..." class="search-input">
      <button class="btn-add" id="btn-add-new">+ Новая запись</button>
    </div>
    <div id="list-holder"></div>
    <div id="form-holder"></div>
  `;

  const searchInput = document.getElementById('search-input');
  searchInput.addEventListener('input', () => renderTable(tab, searchInput.value.toLowerCase()));
  
  renderTable(tab, '');
  
  document.getElementById('btn-add-new').addEventListener('click', () => renderForm(tab, null));
}

function renderTable(tab, filter){
  const schema = SCHEMAS[tab];
  const listHolder = document.getElementById('list-holder');
  
  const filtered = currentItems.filter(item => {
    if(!filter) return true;
    return schema.columns.some(c => {
      const val = item[c.key];
      return val && String(val).toLowerCase().includes(filter);
    });
  });

  if(!filtered.length){
    listHolder.innerHTML = `<div class="empty-note">Пока пусто. Нажми «+ Новая запись», чтобы добавить первую.</div>`;
    return;
  }

  const cols = schema.columns;
  listHolder.innerHTML = `
    <table class="list">
      <thead><tr>${cols.map(c=>`<th>${esc(c.label)}</th>`).join('')}<th></th></tr></thead>
      <tbody>
        ${filtered.map(item => {
          const cells = cols.map(c => {
            if(c.toggle){
              const checked = item[c.key] !== false;
              return `<td><label class="toggle-switch"><input type="checkbox" ${checked?'checked':''} data-toggle="${esc(item.id)}" data-key="${c.key}"><span class="toggle-slider"></span></label></td>`;
            }
            return `<td>${c.render ? c.render(item[c.key], item) : esc(item[c.key])}</td>`;
          }).join('');
          return `
            <tr>
              ${cells}
              <td class="row-actions">
                <button data-edit="${esc(item.id)}" class="btn-icon" title="Изменить">✏️</button>
                <button data-dup="${esc(item.id)}" class="btn-icon" title="Дублировать">📋</button>
                <button data-del="${esc(item.id)}" class="btn-icon danger" title="Удалить">🗑️</button>
              </td>
            </tr>
          `;
        }).join('')}
      </tbody>
    </table>
  `;
  
  listHolder.querySelectorAll('[data-toggle]').forEach(el => {
    el.addEventListener('change', async (e) => {
      const id = e.target.dataset.toggle;
      const key = e.target.dataset.key;
      const value = e.target.checked;
      const { ok } = await api('PUT', `${schema.apiBase}/${id}`, { [key]: value });
      if(ok){
        toast('Статус обновлён');
        const item = currentItems.find(i => i.id === id);
        if(item) item[key] = value;
      } else {
        toast('Ошибка обновления', 'error');
        e.target.checked = !e.target.checked;
      }
    });
  });
  
  listHolder.querySelectorAll('[data-edit]').forEach(btn => {
    btn.addEventListener('click', () => renderForm(tab, currentItems.find(i => i.id === btn.dataset.edit)));
  });
  
  listHolder.querySelectorAll('[data-dup]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const original = currentItems.find(i => i.id === btn.dataset.dup);
      const clone = { ...original };
      delete clone.id;
      clone.name = (clone.name || '') + ' (копия)';
      clone.displayName = (clone.displayName || '') + ' (копия)';
      clone.login = (clone.login || '') + '_copy';
      const { ok, data } = await api('POST', schema.apiBase, clone);
      if(ok){
        toast('Запись дублирована');
        currentItems.push(data);
        renderTable(tab, document.getElementById('search-input').value.toLowerCase());
      } else {
        toast('Ошибка дублирования', 'error');
      }
    });
  });
  
  listHolder.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      confirmDialog('Удалить запись без возможности восстановить?', async () => {
        const { ok } = await api('DELETE', `${schema.apiBase}/${btn.dataset.del}`);
        if(ok){
          toast('Запись удалена');
          currentItems = currentItems.filter(i => i.id !== btn.dataset.del);
          renderTable(tab, document.getElementById('search-input').value.toLowerCase());
        } else {
          toast('Ошибка удаления', 'error');
        }
      });
    });
  });
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
  
  if(f.type === 'image'){
    const preview = v ? `<img src="${esc(v)}" class="image-preview">` : '';
    return `
      <div class="field image-field">
        <label for="f-${f.key}">${esc(f.label)}</label>
        <div class="image-upload-zone" id="zone-${f.key}">
          ${preview}
          <div class="upload-hint">Перетащи картинку сюда или кликни для выбора</div>
        </div>
        <input type="hidden" id="f-${f.key}" value="${esc(v)}">
        ${hint}
      </div>`;
  }
  
  if(f.type === 'password-gen'){
    return `
      <div class="field password-field">
        <label for="f-${f.key}">${esc(f.label)}</label>
        <div class="password-row">
          <input type="password" id="f-${f.key}" value="" placeholder="Оставь пустым, чтобы не менять">
          <button type="button" class="btn-icon" id="toggle-pass-${f.key}" title="Показать/скрыть">👁️</button>
          <button type="button" class="btn-icon" id="gen-pass-${f.key}" title="Сгенерировать">🎲</button>
        </div>
        ${hint}
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
  
  return `
    <div class="field">
      <label for="f-${f.key}">${esc(f.label)}</label>
      <input type="${f.type}" id="f-${f.key}" value="${esc(v)}" placeholder="${esc(f.placeholder||'')}">
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

let currentFormTab = null;
let currentFormExisting = null;

function renderForm(tab, existing){
  currentFormTab = tab;
  currentFormExisting = existing;
  
  const schema = SCHEMAS[tab];
  const holder = document.getElementById('form-holder');
  holder.innerHTML = `
    <div class="form-panel">
      <h3>${existing ? 'Редактирование' : 'Новая запись'} — ${esc(schema.title)}</h3>
      <div class="form-msg" id="form-msg"></div>
      <div id="fields"></div>
      <div class="form-actions">
        <button class="btn-save" id="btn-save">💾 Сохранить</button>
        <button class="btn-preview" id="btn-preview">👁️ Превью</button>
        <button class="btn-cancel" id="btn-cancel">Отмена</button>
      </div>
    </div>
  `;
  
  const fieldsEl = document.getElementById('fields');
  schema.fields.forEach(f => {
    fieldsEl.insertAdjacentHTML('beforeend', fieldToHtml(f, existing ? existing[f.key] : undefined));
  });
  
  holder.scrollIntoView({ behavior:'smooth', block:'center' });
  
  // Image upload handlers
  schema.fields.filter(f => f.type === 'image').forEach(f => {
    const zone = document.getElementById(`zone-${f.key}`);
    const input = document.getElementById(`f-${f.key}`);
    
    zone.addEventListener('click', () => {
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.onchange = (e) => handleImageFile(e.target.files[0], zone, input);
      fileInput.click();
    });
    
    zone.addEventListener('dragover', (e) => {
      e.preventDefault();
      zone.classList.add('drag-over');
    });
    
    zone.addEventListener('dragleave', () => {
      zone.classList.remove('drag-over');
    });
    
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const file = e.dataTransfer.files[0];
      if(file && file.type.startsWith('image/')){
        handleImageFile(file, zone, input);
      }
    });
  });
  
  // Password field handlers
  schema.fields.filter(f => f.type === 'password-gen').forEach(f => {
    const input = document.getElementById(`f-${f.key}`);
    const toggleBtn = document.getElementById(`toggle-pass-${f.key}`);
    const genBtn = document.getElementById(`gen-pass-${f.key}`);
    
    toggleBtn.addEventListener('click', () => {
      input.type = input.type === 'password' ? 'text' : 'password';
    });
    
    genBtn.addEventListener('click', () => {
      const pass = Array.from(crypto.getRandomValues(new Uint8Array(12)))
        .map(b => 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'[b % 62])
        .join('');
      input.value = pass;
      input.type = 'text';
      navigator.clipboard.writeText(pass);
      toast('Пароль скопирован');
    });
  });
  
  document.getElementById('btn-cancel').addEventListener('click', () => { holder.innerHTML = ''; });
  
  document.getElementById('btn-preview').addEventListener('click', () => {
    const existing = currentFormExisting;
    const tab = currentFormTab;
    
    if(tab === 'pages' && existing && existing.slug){
      window.open(`/page/${existing.slug}`, '_blank');
    } else if(tab === 'profiles' && existing){
      window.open('/', '_blank');
      toast('Войди в терминале под логином профиля для проверки', 'success');
    } else if(tab === 'commands' && existing){
      window.open('/', '_blank');
      toast(`Введи команду «${existing.trigger}» в терминале`, 'success');
    } else if(tab === 'chains' && existing){
      window.open('/', '_blank');
      toast('Введи код цепочки в терминале', 'success');
    } else if(tab === 'eggs' && existing){
      window.open('/', '_blank');
      if(existing.trigger === '__wrong_login__'){
        toast('Попробуй войти с неверным паролем', 'success');
      } else {
        toast(`Введи триггер «${existing.trigger}» в терминале`, 'success');
      }
    } else {
      toast('Сначала сохрани запись, потом превью', 'error');
    }
  });
  
  document.getElementById('btn-save').addEventListener('click', saveForm);
  
  // Ctrl+S shortcut
  document.addEventListener('keydown', handleCtrlS);
}

function handleCtrlS(e){
  if((e.ctrlKey || e.metaKey) && e.key === 's'){
    e.preventDefault();
    if(currentFormTab) saveForm();
  }
}

async function saveForm(){
  const msg = document.getElementById('form-msg');
  const schema = SCHEMAS[currentFormTab];
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
    if(f.type === 'password-gen' && !val) continue;
    payload[f.key] = val;
  }
  
  const method = currentFormExisting ? 'PUT' : 'POST';
  const url = currentFormExisting ? `${schema.apiBase}/${currentFormExisting.id}` : schema.apiBase;
  const { ok, data } = await api(method, url, payload);
  
  if(ok){
    toast(currentFormExisting ? 'Изменения сохранены' : 'Запись создана');
    const holder = document.getElementById('form-holder');
    holder.innerHTML = '';
    document.removeEventListener('keydown', handleCtrlS);
    
    const { data: fresh } = await api('GET', schema.apiBase);
    currentItems = fresh || [];
    renderTable(currentFormTab, document.getElementById('search-input').value.toLowerCase());
  } else {
    toast((data && data.error) || 'ошибка сохранения', 'error');
  }
}

function handleImageFile(file, zone, input){
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const maxSize = 800;
      let { width, height } = img;
      
      if(width > maxSize || height > maxSize){
        if(width > height){
          height = (height / width) * maxSize;
          width = maxSize;
        } else {
          width = (width / height) * maxSize;
          height = maxSize;
        }
      }
      
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0, width, height);
      
      const base64 = canvas.toDataURL('image/jpeg', 0.85);
      input.value = base64;
      zone.innerHTML = `<img src="${base64}" class="image-preview"><div class="upload-hint">Кликни, чтобы заменить</div>`;
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

/* ============================================================
   Settings tab
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
        <button class="btn-save" id="btn-save-settings">💾 Сохранить</button>
      </div>
    </div>
    <div class="form-panel">
      <h3>Резервное копирование</h3>
      <div class="field">
        <label>Экспорт всей базы данных</label>
        <button class="btn-secondary" id="btn-export">📥 Скачать бэкап (JSON)</button>
      </div>
      <div class="field">
        <label>Импорт базы данных</label>
        <input type="file" id="import-file" accept=".json" class="file-input">
        <button class="btn-secondary" id="btn-import">📤 Загрузить бэкап</button>
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
    if(ok) toast('Настройки сохранены');
  });
  
  document.getElementById('btn-export').addEventListener('click', async () => {
    const endpoints = ['profiles', 'commands', 'chains', 'pages', 'eggs'];
    const backup = {};
    for(const ep of endpoints){
      const { data } = await api('GET', `/api/admin/${ep}`);
      backup[ep] = data;
    }
    const { data: settings } = await api('GET', '/api/admin/settings');
    backup.settings = settings;
    
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `arrs-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast('Бэкап скачан');
  });
  
  document.getElementById('btn-import').addEventListener('click', async () => {
    const fileInput = document.getElementById('import-file');
    const file = fileInput.files[0];
    if(!file){
      toast('Выбери файл для импорта', 'error');
      return;
    }
    
    confirmDialog('Это перезапишет все данные. Продолжить?', async () => {
      const text = await file.text();
      try {
        const backup = JSON.parse(text);
        const endpoints = ['profiles', 'commands', 'chains', 'pages', 'eggs'];
        
        for(const ep of endpoints){
          if(backup[ep]){
            for(const item of backup[ep]){
              delete item.id;
              await api('POST', `/api/admin/${ep}`, item);
            }
          }
        }
        
        if(backup.settings){
          await api('PUT', '/api/admin/settings', backup.settings);
        }
        
        toast('Данные импортированы');
        renderSettingsTab();
      } catch(e){
        toast('Ошибка импорта: ' + e.message, 'error');
      }
    });
  });
}
})();
