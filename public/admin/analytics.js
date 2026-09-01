// ===== ВКЛАДКА АНАЛИТИКИ (изолирована от admin.js) =====
(function(){
  'use strict';

  let analyticsInterval = null;
  let lastOnline = 0;

  async function fetchAnalytics(){
    try{
      const key = sessionStorage.getItem('md_key') || '';
      const r = await fetch('/api/admin/analytics', {
        credentials: 'include',
        headers: key ? { 'x-admin-key': key } : {}
      });
      if(r.status === 401){
        const k = prompt('Нужен пароль админа для аналитики:');
        if(!k) return null;
        sessionStorage.setItem('md_key', k);
        return fetchAnalytics();
      }
      return await r.json();
    }catch(e){ return null; }
  }

  function onlinePulse(n){
    const el = document.getElementById('an-online-num');
    if(!el) return;
    if(n !== lastOnline){
      el.textContent = n;
      el.style.animation = 'none';
      void el.offsetWidth;
      el.style.animation = 'an-pulse 1.5s ease-out';
      lastOnline = n;
    }
  }

  function progressBar(pct, cls){
    return `<div class="an-bar"><i style="width:${pct}%" class="${cls || ''}"></i></div>`;
  }

  function renderAnalytics(data){
    const main = document.getElementById('admin-main');
    if(!data){
      main.innerHTML = `<div class="an-empty">не удалось загрузить аналитику</div>`;
      return;
    }

    onlinePulse(data.online);

    const chainsHtml = data.chains.map(c => {
      if(c.steps === 0) return '';
      const conv = c.started > 0 ? Math.round((c.completed / c.started) * 100) : 0;
      const stepsHtml = c.byStep.map(s => {
        const pct = c.started > 0 ? Math.round((s.count / c.started) * 100) : 0;
        const label = s.done ? '✓ прошли' : `шаг ${s.step + 1}`;
        const cls = s.done ? 'done' : '';
        return `
          <div class="an-step">
            <div class="an-step-head">
              <span>${label}</span>
              <b>${s.count} <small>(${pct}%)</small></b>
            </div>
            ${progressBar(pct, cls)}
          </div>
        `;
      }).join('');

      return `
        <div class="an-chain">
          <div class="an-chain-head">
            <div>
              <div class="an-chain-name">${escapeAn(c.name)}</div>
              <div class="an-chain-meta">профиль: ${escapeAn(c.profileName)} · шагов: ${c.steps}</div>
            </div>
            <div class="an-chain-stats">
              <div class="an-stat"><b>${c.started}</b><span>начали</span></div>
              <div class="an-stat"><b>${c.completed}</b><span>прошли</span></div>
              <div class="an-stat an-conv"><b>${conv}%</b><span>конверсия</span></div>
            </div>
          </div>
          <div class="an-steps">${stepsHtml}</div>
        </div>
      `;
    }).filter(Boolean).join('');

    main.innerHTML = `
      <style>
        .an-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:#3f5b3e;border:1px solid #3f5b3e;margin-bottom:30px;}
        @media (max-width:640px){.an-grid{grid-template-columns:1fr;}}
        .an-card{background:#05070a;padding:22px 18px;text-align:center;}
        .an-card .num{font-family:'Black Ops One',cursive;font-size:42px;color:#5fd0d6;text-shadow:0 0 14px rgba(95,208,214,.5);line-height:1;}
        .an-card .num.amber{color:#ffb000;text-shadow:0 0 14px rgba(255,176,0,.5);}
        .an-card .num.red{color:#ff3b30;text-shadow:0 0 14px rgba(255,59,48,.5);}
        .an-card .lbl{font-size:10px;letter-spacing:.2em;color:#8fa0a8;text-transform:uppercase;margin-top:8px;display:flex;align-items:center;justify-content:center;gap:6px;}
        .an-card .lbl .dot{width:8px;height:8px;border-radius:50%;background:#5fd0d6;box-shadow:0 0 8px #5fd0d6;animation:an-blink 1.4s infinite;}
        @keyframes an-blink{0%,49%{opacity:1}50%,100%{opacity:.3}}
        @keyframes an-pulse{0%{transform:scale(1);text-shadow:0 0 14px rgba(95,208,214,.5);}50%{transform:scale(1.18);text-shadow:0 0 30px rgba(95,208,214,1);}100%{transform:scale(1);text-shadow:0 0 14px rgba(95,208,214,.5);}}
        .an-chain{border:1px solid rgba(95,208,214,.25);background:linear-gradient(180deg,rgba(95,208,214,.03),rgba(0,0,0,.55));margin-bottom:22px;padding:20px 22px;position:relative;}
        .an-chain::before{content:'CHAIN';position:absolute;top:-9px;left:18px;background:#05070a;padding:0 8px;font-size:9px;letter-spacing:.25em;color:#5fd0d6;}
        .an-chain-head{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:18px;padding-bottom:14px;border-bottom:1px dashed rgba(95,208,214,.2);}
        .an-chain-name{font-family:'Black Ops One',cursive;font-size:16px;color:#f2cbe4;letter-spacing:.06em;}
        .an-chain-meta{font-size:10px;letter-spacing:.15em;color:#8fa0a8;text-transform:uppercase;margin-top:4px;}
        .an-chain-stats{display:flex;gap:14px;}
        .an-stat{text-align:center;min-width:60px;}
        .an-stat b{font-family:'Black Ops One',cursive;font-size:22px;color:#5fd0d6;display:block;line-height:1.1;}
        .an-stat span{font-size:9px;letter-spacing:.15em;color:#8fa0a8;text-transform:uppercase;}
        .an-stat.an-conv b{color:#ffb000;}
        .an-steps{display:grid;gap:10px;}
        .an-step{padding:8px 12px;background:rgba(0,0,0,.4);border-left:2px solid #3f5b3e;}
        .an-step-head{display:flex;justify-content:space-between;font-size:11px;letter-spacing:.1em;color:#d7e3d6;text-transform:uppercase;margin-bottom:6px;}
        .an-step-head b{color:#5fd0d6;}
        .an-step-head b small{color:#8fa0a8;font-weight:normal;}
        .an-bar{height:6px;background:rgba(95,208,214,.08);border:1px solid rgba(95,208,214,.15);position:relative;overflow:hidden;}
        .an-bar i{position:absolute;inset:0;background:linear-gradient(90deg,#5fd0d6,#5fd0d6);width:0;transition:width .8s cubic-bezier(.34,1.56,.64,1);}
        .an-bar i.done{background:linear-gradient(90deg,#ffb000,#ff3b30);}
        .an-empty{text-align:center;padding:40px;color:#8fa0a8;}
        .an-updated{font-size:10px;color:#3f5b3e;letter-spacing:.15em;text-transform:uppercase;text-align:right;margin-top:14px;}
        .an-section-title{font-size:12px;letter-spacing:.3em;color:#3f5b3e;text-transform:uppercase;margin:30px 0 16px;padding-bottom:8px;border-bottom:1px solid #3f5b3e;display:flex;justify-content:space-between;align-items:center;}
        .an-section-title .live{color:#ff3b30;display:flex;align-items:center;gap:6px;animation:an-blink 1.2s infinite;}
        .an-section-title .live::before{content:"";width:7px;height:7px;border-radius:50%;background:#ff3b30;box-shadow:0 0 8px #ff3b30;}
      </style>

      <div class="section-title">📊 Аналитика платформы</div>
      <div class="section-hint">Онлайн терминала в реальном времени и прогресс игроков по цепочкам.</div>

      <div class="an-grid">
        <div class="an-card">
          <div class="num" id="an-online-num">${data.online}</div>
          <div class="lbl"><span class="dot"></span>сейчас онлайн</div>
        </div>
        <div class="an-card">
          <div class="num amber">${data.totalVisitors}</div>
          <div class="lbl">всего игроков</div>
        </div>
        <div class="an-card">
          <div class="num red">${data.chains.length}</div>
          <div class="lbl">активных цепочек</div>
        </div>
      </div>

      <div class="an-section-title">
        <span>прогресс по цепочкам</span>
        <span class="live">live</span>
      </div>

      ${chainsHtml || '<div class="an-empty">пока нет активных цепочек</div>'}

      <div class="an-updated">обновлено: <span id="an-time">${new Date(data.updatedAt).toLocaleTimeString('ru-RU')}</span> · автообновление каждые 5 сек</div>
    `;
  }

  function escapeAn(s){
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  async function refresh(){
    const data = await fetchAnalytics();
    if(data){
      renderAnalytics(data);
      const t = document.getElementById('an-time');
      if(t) t.textContent = new Date(data.updatedAt).toLocaleTimeString('ru-RU');
    }
  }
  window.renderAnalyticsTab = refresh;
  // Подписка на переключение вкладок через делегирование
  document.addEventListener('click', async (e) => {
    const btn = e.target.closest('.nav-btn');
    if(btn && btn.dataset.tab === 'analytics'){
      if(analyticsInterval) clearInterval(analyticsInterval);
      await refresh();
      analyticsInterval = setInterval(refresh, 5000);
    } else if(btn) {
      // ушли с аналитики
      if(analyticsInterval){ clearInterval(analyticsInterval); analyticsInterval = null; }
    }
  });
})();

// ===== Терминальный heartbeat (в site.js не лезем — отдельный скрипт) =====
(function(){
  if(window.location.pathname !== '/' && !document.getElementById('term-input')) return;
  setInterval(async () => {
    try{
      await fetch('/api/public/ping', { method:'POST', credentials:'include' });
    }catch(e){}
  }, 10000);
  // сразу первый пинг
  fetch('/api/public/ping', { method:'POST', credentials:'include' }).catch(()=>{});
})();
