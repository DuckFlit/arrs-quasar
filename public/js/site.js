(function(){
'use strict';

const outEl    = document.getElementById('term-output');
const inputEl  = document.getElementById('term-input');
const prefixEl = document.getElementById('prompt-prefix');
const panelEl  = document.getElementById('term-panel');
const wrapEl   = document.getElementById('term-wrap');

let mode = 'boot';       // boot -> cmd -> user -> pass -> decrypt
let pendingUser = '';
let attempts = 0;
let locked = false;
let currentProfile = null;
let siteSettings = {};

/* ---------------- helpers ---------------- */
function printLine(html, cls){
  const div = document.createElement('div');
  if(cls) div.className = cls;
  div.innerHTML = html;
  outEl.appendChild(div);
  panelEl.scrollTop = panelEl.scrollHeight;
  return div;
}
function setPrefix(text){ prefixEl.textContent = text; }
function escapeHtml(s){ return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function jolt(){ wrapEl.classList.remove('jolt'); void wrapEl.offsetWidth; wrapEl.classList.add('jolt'); }

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

/* ---------------- site meta ---------------- */
(async function loadMeta(){
  const { data } = await api('GET', '/api/public/site');
  if(data){
    siteSettings = data;
    if(data.siteTitle){
      const t = document.getElementById('site-title');
      t.textContent = data.siteTitle; t.setAttribute('data-text', data.siteTitle);
    }
    if(data.subtitle) document.getElementById('site-subtitle').textContent = data.subtitle;
    if(data.nodeTag) document.getElementById('site-node').textContent = data.nodeTag;
    // цветовая гамма, заданная в админке (Настройки сайта)
    if(data.accentColor) document.documentElement.style.setProperty('--sig-cyan', data.accentColor);
    if(data.dossierColor) document.documentElement.style.setProperty('--phosphor', data.dossierColor);
  }
})();

/* ---------------- keystroke click (tiny, lazy audio ctx) ---------------- */
let kctx = null;
function keyClick(){
  try{
    if(!kctx) kctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = kctx.createOscillator(); const g = kctx.createGain();
    o.type='square'; o.frequency.value = 1200 + Math.random()*300;
    g.gain.value = 0.02;
    o.connect(g).connect(kctx.destination);
    o.start(); o.stop(kctx.currentTime + 0.02);
  }catch(e){}
}
function laughSound(){
  try{
    if(!kctx) kctx = new (window.AudioContext || window.webkitAudioContext)();
    const notes = [520, 470, 560, 430, 600, 410, 540];
    let t = kctx.currentTime;
    notes.forEach((freq) => {
      const o = kctx.createOscillator(); const g = kctx.createGain();
      o.type = 'square'; o.frequency.setValueAtTime(freq, t);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.06, t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.085);
      o.connect(g).connect(kctx.destination);
      o.start(t); o.stop(t + 0.1);
      t += 0.085;
    });
  }catch(e){}
}
function beepSound(){
  try{
    if(!kctx) kctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = kctx.createOscillator(); const g = kctx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, kctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.08, kctx.currentTime + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, kctx.currentTime + 0.3);
    o.connect(g).connect(kctx.destination);
    o.start(); o.stop(kctx.currentTime + 0.32);
  }catch(e){}
}

/* ---------------- default (built-in) easter egg: laughing skull ---------------- */
const DEFAULT_SKULL_A =
"   .-\"\"\"\"\"-.   \n  /  o   o  \\  \n |     ^     | \n |   \\___/   | \n  \\  '---'  /  \n   '.-----.'   \n    _|   |_    \n   |_|   |_|   ";
const DEFAULT_SKULL_B =
"   .-\"\"\"\"\"-.   \n  /  ^   ^  \\  \n |    \\_/    | \n |  \\_____/  | \n  \\ '.....' /  \n   '.-----.'   \n    _|   |_    \n   |_|   |_|   ";

const eggEl  = document.getElementById('egg-skull');
const eggPre = document.getElementById('egg-pre');
const eggCap = document.getElementById('egg-caption');
let eggFlip = null, eggHideTimer = null;

function spawnEgg(eggData){
  clearInterval(eggFlip);
  clearTimeout(eggHideTimer);
  eggEl.classList.remove('hide-egg');
  void eggEl.offsetWidth;
  eggEl.classList.add('show-egg');
  jolt();

  const frames = (eggData && eggData.frames && eggData.frames.length) ? eggData.frames : [DEFAULT_SKULL_A, DEFAULT_SKULL_B];
  eggCap.textContent = (eggData && eggData.caption) ? eggData.caption : 'HA HA HA';
  eggPre.textContent = frames[0];

  const soundStyle = eggData ? (eggData.soundStyle || 'laugh') : 'laugh';
  if(soundStyle === 'laugh') laughSound();
  else if(soundStyle === 'beep') beepSound();

  let f = 0;
  if(frames.length > 1){
    eggFlip = setInterval(() => {
      f = (f + 1) % frames.length;
      eggPre.textContent = frames[f];
    }, 130);
  }

  eggHideTimer = setTimeout(() => {
    clearInterval(eggFlip);
    eggEl.classList.remove('show-egg');
    eggEl.classList.add('hide-egg');
  }, 1350);
}

async function spawnWrongLoginEgg(){
  let eggData = null;
  try{
    const { data } = await api('GET', '/api/public/egg/wrong-login' + (currentProfile ? ('?profileId=' + currentProfile.id) : ''));
    if(data){
      eggData = {
        frames: data.asciiFrames && data.asciiFrames.length ? data.asciiFrames : null,
        caption: data.caption,
        soundStyle: data.soundStyle
      };
    }
  }catch(e){}
  spawnEgg(eggData);
}

/* ---------------- boot sequence ---------------- */
const bootLines = [
  ['connecting to node', 'out-dim'],
  ['handshake ......................... <b class="out-ok">OK</b>', 'out-dim'],
  ['signal lock ........................ <b class="out-ok">OK</b>', 'out-dim'],
];
function runBoot(){
  let i = 0;
  const step = () => {
    if(i < bootLines.length){
      printLine(bootLines[i][0], bootLines[i][1]);
      i++;
      setTimeout(step, 260 + Math.random()*180);
    } else {
      printLine('Welcome to the restricted archive relay.', 'out-cyan');
      printLine('You\'re logged in as "Guest".', 'out-dim');
      printLine(new Date().toLocaleString('en-US', {month:'long', day:'numeric', year:'numeric', hour:'numeric', minute:'2-digit', hour12:true}), 'out-dim');
      printLine('Your IP: 127.0.0.1', 'out-dim');
      printLine('&nbsp;', '');
      mode = 'cmd';
      setPrefix('[ Guest@arrs.host : ~ ] # ');
      inputEl.focus();
    }
  };
  step();
}

/* ---------------- command handling ---------------- */
async function handleCommand(raw){
  const val = raw.trim();
  const cmd = val.toLowerCase();
  if(cmd === '') return;

  if(cmd === 'help'){
    printLine('available commands:', 'out-dim');
    printLine('  login    — request access to the restricted archive', 'out-dim');
    printLine('  whoami   — show current session identity', 'out-dim');
    printLine('  status   — node signal status', 'out-dim');
    printLine('  clear    — clear the screen', 'out-dim');
    printLine('  ...additional commands may exist. this terminal rewards curiosity.', 'out-dim');
    return;
  }
  if(cmd === 'login'){
    printLine('restricted archive — authentication required.', 'out-cyan');
    mode = 'user';
    setPrefix('login: ');
    return;
  }
  if(cmd === 'whoami'){
    printLine(currentProfile ? `${currentProfile.login || currentProfile.displayName} — access level: AUTHENTICATED` : 'guest (unauthenticated) — access level: PUBLIC', 'out-dim');
    return;
  }
  if(cmd === 'status'){
    printLine('SIGNAL 96% &nbsp;|&nbsp; RELAY ONLINE &nbsp;|&nbsp; UPTIME 214d 06h', 'out-dim');
    return;
  }
  if(cmd === 'clear'){
    outEl.innerHTML = '';
    return;
  }

  // не встроенная команда — спросим бэкенд: может, это кастомная команда / код цепочки / пасхалка
  const { data } = await api('POST', '/api/public/command', { profileId: currentProfile ? currentProfile.id : null, input: val });
  if(data && data.ok){
    if(data.kind === 'command'){
      String(data.text || '').split('\n').forEach(line => printLine(escapeHtml(line), 'out-dim'));
      if(data.redirectUrl){
        printLine(`&rarr; redirecting to <a href="${escapeHtml(data.redirectUrl)}" style="color:var(--sig-cyan)" target="_blank">${escapeHtml(data.redirectUrl)}</a>`, 'out-cyan');
        setTimeout(() => {
          if(data.redirectUrl.startsWith('http://') || data.redirectUrl.startsWith('https://')){
            window.open(data.redirectUrl, '_blank');
          } else {
            window.location.href = data.redirectUrl;
          }
        }, 2000);
      }
    } else if(data.kind === 'chain'){
      printLine(escapeHtml(data.message || 'ACCESS UNLOCKED.'), 'out-ok');
      if(data.pageSlug){
        printLine(`&rarr; new page unlocked: <a href="/page/${encodeURIComponent(data.pageSlug)}" style="color:var(--sig-cyan)" target="_blank">/page/${escapeHtml(data.pageSlug)}</a>`, 'out-cyan');
      }
    } else if(data.kind === 'egg'){
      spawnEgg({
        frames: data.egg.asciiFrames,
        caption: data.egg.caption,
        soundStyle: data.egg.soundStyle
      });
    }
    return;
  }
  printLine(`bash: ${escapeHtml(val)}: command not found — try <b>help</b>`, 'out-err');
  jolt();
}

/* ---------------- login state machine ---------------- */
function handleUser(raw){
  pendingUser = raw.trim();
  mode = 'pass';
  setPrefix('password: ');
  inputEl.type = 'password';
}

async function handlePass(raw){
  inputEl.type = 'text';
  const { data } = await api('POST', '/api/public/login', { login: pendingUser, password: raw });

  if(data && data.ok){
    currentProfile = data.profile;
    if(currentProfile.showDossier === false){
      // "тихий" логин — просто ключ для разблокировки команд/цепочек/пасхалок,
      // без визуального досье
      printLine('AUTHENTICATION OK.', 'out-ok');
      printLine('session bound. additional commands may now respond differently.', 'out-dim');
      attempts = 0;
      mode = 'cmd';
      const handle = (currentProfile.displayName || 'user').toLowerCase().replace(/[^a-z0-9]+/g, '') || 'user';
      setPrefix(`[ ${handle}@arrs.host : ~ ] # `);
      inputEl.type = 'text';
      inputEl.focus();
    } else {
      printLine('AUTHENTICATION OK — decrypting archive...', 'out-ok');
      mode = 'decrypt';
      setPrefix('');
      inputEl.blur();
      runDecrypt();
    }
  } else {
    attempts++;
    if(attempts >= 3){
      printLine('ACCESS DENIED — too many attempts. connection throttled.', 'out-err');
      spawnWrongLoginEgg();
      lockOut();
    } else {
      printLine(`ACCESS DENIED — invalid credentials. (attempt ${attempts}/3)`, 'out-err');
      spawnWrongLoginEgg();
      jolt();
      mode = 'cmd';
      setPrefix('[ Guest@arrs.host : ~ ] # ');
    }
  }
}

function lockOut(){
  locked = true;
  inputEl.disabled = true;
  let t = 8;
  const iv = setInterval(() => {
    setPrefix(`retry available in ${t}s... `);
    t--;
    if(t < 0){
      clearInterval(iv);
      locked = false;
      inputEl.disabled = false;
      attempts = 0;
      mode = 'cmd';
      setPrefix('[ Guest@arrs.host : ~ ] # ');
      inputEl.focus();
    }
  }, 1000);
}

/* ---------------- decrypt animation -> dossier reveal ---------------- */
function runDecrypt(){
  const bar = printLine('', 'prog-line');
  let pct = 0;
  const blocks = 24;
  const iv = setInterval(() => {
    pct += Math.floor(4 + Math.random()*10);
    if(pct > 100) pct = 100;
    const filled = Math.round((pct/100) * blocks);
    bar.innerHTML = `[${'█'.repeat(filled)}${'░'.repeat(blocks - filled)}] <b>${pct}%</b>`;
    if(pct === 100){
      clearInterval(iv);
      printLine('FILE DECRYPTED.', 'out-ok');
      setTimeout(() => {
        document.getElementById('login-screen').classList.add('flash-out');
        setTimeout(showDossier, 650);
      }, 400);
    }
  }, 110);
}

function showDossier(){
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('crt2').classList.add('show');
  renderDossier(currentProfile);
}

/* ---------------- dossier rendering (fully data-driven) ---------------- */
function renderDossier(p){
  const el = document.getElementById('dossier');

  // цветовая гамма конкретного профиля (если задана) — переопределяет фосфор/зелёный только внутри досье
  if(p.accentColor) el.style.setProperty('--phosphor', p.accentColor);
  if(p.secondaryColor) el.style.setProperty('--green', p.secondaryColor);

  const metaHtml = (p.meta || []).map(m => `<div><b>${escapeHtml(m.label)}</b><span>${escapeHtml(m.value)}</span></div>`).join('');
  const statsHtml = (p.stats || []).map(s => `
    <div class="stat"><div class="num" data-count="${parseInt(s.value,10) || 0}">0</div><div class="lbl">${escapeHtml(s.label)}</div></div>
  `).join('');
  const sectionsHtml = (p.sections || []).map(s => `
    <div class="section">
      <h3>${escapeHtml(s.title)}</h3>
      <div class="type-out"><div>${s.body || ''}</div></div>
    </div>
  `).join('');
  const tagsHtml = (p.tags || []).length ? `<div class="tags">${p.tags.map(t => `<span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` : '';
  const barsHtml = (p.bars || []).map(b => `
    <div class="bar-row"><span>${escapeHtml(b.label)}</span><div class="bar-track"><div class="bar-fill" data-pct="${b.pct||0}"></div></div><span>${escapeHtml(b.value||'')}</span></div>
  `).join('');

  const portraitHtml = p.portrait
    ? `<img src="${p.portrait}" alt="${escapeHtml(p.displayName || '')}">`
    : `<div class="no-photo">NO PHOTO<br>ON FILE</div>`;

  el.innerHTML = `
    <div class="stamp-bar">
      <span>${escapeHtml(p.stampText || 'RESTRICTED // PERSONNEL FILE')}</span>
      <span class="tick" id="dossier-clock"></span>
    </div>
    <div class="dossier-head">
      <div class="portrait">${portraitHtml}</div>
      <div>
        <div class="id-title">${escapeHtml(p.displayName || '')}</div>
        ${p.callsign ? `<div class="id-callsign">CALLSIGN &laquo;${escapeHtml(p.callsign)}&raquo;</div>` : ''}
        <div class="id-meta">${metaHtml}</div>
      </div>
    </div>
    ${statsHtml ? `<div class="stat-grid">${statsHtml}</div>` : ''}
    ${sectionsHtml}
    ${tagsHtml ? `<div class="section">${tagsHtml}</div>` : ''}
    ${barsHtml ? `<div class="section"><h3>Flight Record</h3>${barsHtml}</div>` : ''}
    <div class="footer-console">
      ${p.audioUrl ? `<div class="audio-toggle" id="audio-toggle"><span class="dot" id="audio-dot"></span><span id="audio-label">Track: Off</span></div>` : '<div></div>'}
      ${p.audioUrl ? `<canvas id="scope" width="220" height="46"></canvas>` : ''}
      <button class="logout" id="logout-btn">Log Out</button>
    </div>
    ${p.audioUrl ? `<audio id="track" src="${p.audioUrl}" preload="none" loop></audio>` : ''}
  `;
  el.classList.add('show');

  animateStats();
  animateBars();
  tickClock();
  setInterval(tickClock, 1000);

  document.getElementById('logout-btn').addEventListener('click', () => location.reload());
  if(p.audioUrl) wireAudio();
}

function tickClock(){
  const el = document.getElementById('dossier-clock');
  if(el) el.textContent = new Date().toLocaleTimeString('en-GB', {hour12:false});
}
function animateStats(){
  document.querySelectorAll('.num[data-count]').forEach(el => {
    const target = parseInt(el.getAttribute('data-count'), 10) || 0;
    let cur = 0;
    const step = Math.max(1, Math.round(target/40));
    const iv = setInterval(() => {
      cur += step;
      if(cur >= target){ cur = target; clearInterval(iv); }
      el.textContent = cur;
    }, 25);
  });
}
function animateBars(){
  document.querySelectorAll('.bar-fill').forEach(el => {
    const pct = el.getAttribute('data-pct');
    requestAnimationFrame(() => { el.style.width = pct + '%'; });
  });
}

function wireAudio(){
  let playing = false, rafId = null;
  const trackEl = document.getElementById('track');
  function start(){
    trackEl.volume = 0.6;
    trackEl.play().then(() => { playing = true; draw(); })
      .catch(() => { document.getElementById('audio-label').textContent = 'Track: tap to play'; });
  }
  function stop(){
    playing = false; trackEl.pause();
    if(rafId) cancelAnimationFrame(rafId);
    document.getElementById('audio-dot').classList.remove('on');
    document.getElementById('audio-label').textContent = 'Track: Off';
  }
  function draw(){
    const canvas = document.getElementById('scope');
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height, mid = h/2;
    (function render(){
      if(!playing) return;
      rafId = requestAnimationFrame(render);
      const t = trackEl.currentTime || 0;
      ctx.fillStyle = '#000'; ctx.fillRect(0,0,w,h);
      ctx.beginPath(); ctx.strokeStyle = '#ffb000'; ctx.lineWidth = 1.4;
      for(let x=0; x<w; x++){
        const phase = x*0.09 + t*6;
        const y = mid + Math.sin(phase)*(mid*0.55) + Math.sin(phase*2.7 + t*3)*(mid*0.18) + (Math.random()-0.5)*2;
        if(x===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    })();
  }
  document.getElementById('audio-toggle').addEventListener('click', () => {
    if(!playing){ start(); document.getElementById('audio-dot').classList.add('on'); document.getElementById('audio-label').textContent = 'Track: On'; }
    else stop();
  });
}

/* ---------------- input wiring ---------------- */
inputEl.addEventListener('keydown', (e) => {
  if(locked){ e.preventDefault(); return; }
  if(e.key.length === 1) keyClick();
  if(e.key === 'Enter'){
    const raw = inputEl.value;
    const echoVal = (mode === 'pass') ? '•'.repeat(raw.length) : raw;
    printLine(`<span class="out-cyan">${escapeHtml(prefixEl.textContent)}</span><span class="out-echo">${escapeHtml(echoVal)}</span>`, '');
    inputEl.value = '';
    if(mode === 'cmd') handleCommand(raw);
    else if(mode === 'user') handleUser(raw);
    else if(mode === 'pass') handlePass(raw);
  }
});
document.getElementById('term-panel').addEventListener('click', () => inputEl.focus());

setTimeout(runBoot, 300);
})();
