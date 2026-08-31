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
    printLine('  dossier  — reopen your personnel file', 'out-dim');
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
  if(cmd === 'dossier' || cmd === 'file'){
    if(currentProfile && currentProfile.showDossier !== false){
      document.getElementById('login-screen').classList.add('hidden');
      document.getElementById('crt2').classList.add('show');
      renderDossier(currentProfile);
    } else {
      printLine('no personnel file bound to this session.', 'out-dim');
    }
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
      if(data.locked){
        printLine(escapeHtml(data.message), 'out-err');
        jolt();
      } else {
        printLine(escapeHtml(data.message || 'ACCESS UNLOCKED.'), 'out-ok');
        if(data.repeat) printLine('(code already accepted earlier)', 'out-dim');
        if(data.chainDone) printLine('&rarr; CHAIN COMPLETE. all keys accepted.', 'out-cyan');
        if(data.pageSlug){
          printLine(`&rarr; new page unlocked: <a href="/page/${encodeURIComponent(data.pageSlug)}" style="color:var(--sig-cyan)" target="_blank">/page/${escapeHtml(data.pageSlug)}</a>`, 'out-cyan');
        }
      }
    } else if(data.kind === 'egg'){
      spawnEgg({
        frames: data.egg.asciiFrames,
        caption: data.egg.caption,
        soundStyle: data.egg.soundStyle
      });
      if(data.egg.redirectUrl){
        const url = data.egg.redirectUrl;
        printLine(`&rarr; redirecting to <a href="${escapeHtml(url)}" style="color:var(--sig-cyan)" target="_blank" rel="noopener noreferrer">${escapeHtml(url)}</a>`, 'out-cyan');
        setTimeout(() => {
          if(url.startsWith('http://') || url.startsWith('https://')){
            window.open(url, '_blank');
          } else {
            window.location.href = url;
          }
        }, 2000);
      }
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

function backToTerminal(){
  document.getElementById('crt2').classList.remove('show');
  document.getElementById('dossier').classList.remove('show');
  const ls = document.getElementById('login-screen');
  ls.classList.remove('flash-out');
  ls.classList.remove('hidden');
  inputEl.type = 'text';
  mode = 'cmd';
  const handle = (currentProfile.login || currentProfile.displayName || 'user').toLowerCase().replace(/[^a-z0-9]+/g,'') || 'user';
  setPrefix(`[ ${handle}@arrs.host : ~ ] # `);
  printLine('session restored. type <b>dossier</b> to reopen your file, <b>help</b> for commands.', 'out-cyan');
  inputEl.focus();
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
      <button class="back-term" id="back-term">&gt;_ Terminal</button>
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
  document.getElementById('back-term').addEventListener('click', backToTerminal);
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
// ============================================================
// MELTDOWN: live-тревога, запускаемая из админки
// ============================================================
(function(){
  let lastMdId = null, running = false;

  async function pollMeltdown(){
    if(running) return;
    try{
      const r = await fetch('/api/public/site');
      const s = await r.json();
      const md = s && s.meltdown;
      if(md && md.active && md.id !== lastMdId && (Date.now() - md.startedAt) < 90000){
        lastMdId = md.id;
        startMeltdown();
      }
    }catch(e){}
  }
  setInterval(pollMeltdown, 2000);
  setTimeout(pollMeltdown, 800);

  let mctx = null;
  function mAudio(){ if(!mctx){ try{ mctx = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } return mctx; }
  function siren(){
    const ctx = mAudio(); if(!ctx) return;
    try{
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(420, t);
      o.frequency.linearRampToValueAtTime(860, t + .55);
      o.frequency.linearRampToValueAtTime(420, t + 1.1);
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(.06, t + .06);
      g.gain.exponentialRampToValueAtTime(.0001, t + 1.15);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + 1.2);
    }catch(e){}
  }
  function blip(f){
    const ctx = mAudio(); if(!ctx) return;
    try{
      const t = ctx.currentTime;
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square'; o.frequency.value = f || 980;
      g.gain.setValueAtTime(.0001, t);
      g.gain.exponentialRampToValueAtTime(.04, t + .005);
      g.gain.exponentialRampToValueAtTime(.0001, t + .07);
      o.connect(g).connect(ctx.destination); o.start(t); o.stop(t + .08);
    }catch(e){}
  }

  const DUMP = [
    '[!!] kernel panic :: node 14-4 KORD',
    '[!!] external trace injected :: origin CIA/DIR-9',
    '[!!] firewall bypassed FROM INSIDE',
    '[>>] dumping profile database...',
    '[>>] exfiltrating relay keys...',
    '[!!] integrity check FAILED (0x2F3A)',
    '[!!] ARRS WAS COMPROMISED BY CIA',
    '[>>] overwriting logs... denied',
    '[!!] unauthorized root session #4471',
    '[!!] kill-switch triggered by operator',
    '[>>] broadcasting false telemetry...',
    '[!!] node 07 silent // node 09 silent',
    '[!!] THEY ARE IN THE WIRE',
  ];

  function startMeltdown(){
    running = true;
    const st = document.createElement('style');
    st.textContent = `
      #md-ov{position:fixed;inset:0;z-index:99990;background:#140202;color:#ff4d4d;font-family:'IBM Plex Mono',monospace;overflow:hidden;}
      #md-ov .md-scan{position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.3) 0 1px,transparent 1px 3px);pointer-events:none;}
      #md-ov .md-stripes{position:absolute;top:0;left:0;right:0;height:14px;background:repeating-linear-gradient(45deg,#ff3b30 0 16px,#000 16px 32px);animation:md-move 1s linear infinite;}
      #md-ov .md-stripes.bot{top:auto;bottom:0;animation-direction:reverse;}
      @keyframes md-move{to{background-position:45px 0;}}
      #md-ov .md-title{position:absolute;top:8%;left:0;right:0;text-align:center;font-family:'Black Ops One',cursive;font-size:clamp(26px,6vw,58px);color:#ff3b30;text-shadow:0 0 30px rgba(255,59,48,.8),3px 0 #5fd0d6,-3px 0 #ff5fae;animation:md-flash .5s steps(2) infinite;}
      @keyframes md-flash{0%,100%{opacity:1}50%{opacity:.55}}
      #md-ov .md-sub{position:absolute;top:calc(8% + 74px);left:0;right:0;text-align:center;font-size:12px;letter-spacing:.4em;color:#ffb0b0;text-transform:uppercase;}
      #md-ov .md-dump{position:absolute;top:26%;left:6%;right:6%;height:34%;overflow:hidden;font-size:12px;line-height:1.7;text-shadow:0 0 6px rgba(255,59,48,.6);}
      #md-ov .md-report{position:absolute;top:63%;left:50%;transform:translateX(-50%);width:min(92vw,560px);border:2px solid #ff3b30;background:rgba(0,0,0,.6);padding:14px 18px;display:none;}
      #md-ov .md-report h4{margin:0 0 10px;font-size:11px;letter-spacing:.3em;color:#ffb0b0;}
      #md-ov .md-rep-row{display:flex;justify-content:space-between;font-size:12px;margin-bottom:6px;}
      #md-ov .md-rep-row b{color:#fff;}
      #md-ov.shake{animation:md-shake .18s linear infinite;}
      @keyframes md-shake{0%{transform:translate(0)}25%{transform:translate(-8px,5px)}50%{transform:translate(7px,-6px)}75%{transform:translate(-5px,-4px)}100%{transform:translate(0)}}
      #md-reboot{position:fixed;inset:0;z-index:99991;background:#000;color:#7ea87a;font-family:'IBM Plex Mono',monospace;display:none;padding:10vh 8vw;font-size:13px;line-height:1.9;}
      #md-reboot .md-bar{width:min(80vw,480px);height:10px;border:1px solid #7ea87a;margin:18px 0;position:relative;}
      #md-reboot .md-bar i{position:absolute;inset:1px;background:#7ea87a;width:0;box-shadow:0 0 12px rgba(126,168,122,.8);}
      #md-flash{position:fixed;inset:0;z-index:99992;background:#eafcff;opacity:0;pointer-events:none;}
      #md-flash.go{animation:md-flashout .6s ease forwards;}
      @keyframes md-flashout{0%{opacity:0}30%{opacity:1}100%{opacity:1}}
    `;
    document.head.appendChild(st);

    const ov = document.createElement('div');
    ov.id = 'md-ov';
    ov.innerHTML = `
      <div class="md-scan"></div>
      <div class="md-stripes"></div>
      <div class="md-stripes bot"></div>
      <div class="md-title">ARRS СКОМПРОМЕТИРОВАН</div>
      <div class="md-sub">trace: cia // directorate-9 :: all nodes burned</div>
      <div class="md-dump" id="md-dump"></div>
      <div class="md-report" id="md-report">
        <h4>// ОТЧЁТ ОБ ИНЦИДЕНТЕ //</h4>
        <div class="md-rep-row"><span>узлов потеряно</span><b id="md-r1">0/12</b></div>
        <div class="md-rep-row"><span>профилей раскрыто</span><b id="md-r2">0</b></div>
        <div class="md-rep-row"><span>целостность сети</span><b id="md-r3">100%</b></div>
        <div class="md-rep-row"><span>источник атаки</span><b>CIA // ВНУТРЕННИЙ СЛИВ</b></div>
      </div>
    `;
    document.body.appendChild(ov);

    const flash = document.createElement('div');
    flash.id = 'md-flash';
    document.body.appendChild(flash);

    const reboot = document.createElement('div');
    reboot.id = 'md-reboot';
    reboot.innerHTML = '<div id="md-rb-lines"></div><div class="md-bar"><i id="md-rb-bar"></i></div><div id="md-rb-count"></div>';
    document.body.appendChild(reboot);

    siren();
    const sirenIv = setInterval(siren, 1300);

    const dump = document.getElementById('md-dump');
    let di = 0;
    const dumpIv = setInterval(() => {
      const line = document.createElement('div');
      line.textContent = '> ' + DUMP[di % DUMP.length];
      dump.appendChild(line);
      while(dump.children.length > 14) dump.removeChild(dump.firstChild);
      blip(700 + Math.random() * 500);
      di++;
    }, 140);

    setTimeout(() => ov.classList.add('shake'), 3000);

    setTimeout(() => {
      document.getElementById('md-report').style.display = 'block';
      const t0 = performance.now();
      (function rep(now){
        const p = Math.min(1, ((now || performance.now()) - t0) / 5000);
        document.getElementById('md-r1').textContent = Math.floor(p * 12) + '/12';
        document.getElementById('md-r2').textContent = Math.floor(p * 247);
        document.getElementById('md-r3').textContent = Math.floor(100 - p * 100) + '%';
        if(p < 1) requestAnimationFrame(rep);
      })();
    }, 5000);

    // ===== ПЕРЕЗАПУСК =====
    setTimeout(() => {
      clearInterval(sirenIv); clearInterval(dumpIv);
      ov.style.display = 'none';
      reboot.style.display = 'block';
      const lines = [
        'emergency kill-switch accepted.',
        'purging cia traces from relay memory... OK',
        'burning compromised keys... OK',
        'restoring nodes: 12/12... OK',
        'rebuilding trust chain... OK',
        'wiping incident from public logs... OK',
        'ARRS will remember this.',
        'reboot sequence engaged.'
      ];
      const box = document.getElementById('md-rb-lines');
      lines.forEach((l, i) => {
        setTimeout(() => {
          const d = document.createElement('div');
          d.textContent = '[ ok ] ' + l;
          box.appendChild(d);
          blip(1200);
        }, i * 700);
      });
      const bar = document.getElementById('md-rb-bar');
      const bt0 = performance.now();
      (function barTick(now){
        const p = Math.min(1, ((now || performance.now()) - bt0) / 6000);
        bar.style.width = (p * 100) + '%';
        document.getElementById('md-rb-count').textContent = 'reboot in ' + Math.max(0, Math.ceil(6 - p * 6)) + '...';
        if(p < 1) requestAnimationFrame(barTick);
      })();
    }, 13000);

    setTimeout(() => flash.classList.add('go'), 20500);
    setTimeout(() => window.location.reload(), 21100);
  }
})();
