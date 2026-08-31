// ===== КНОПКА MELTDOWN (изолирована от admin.js) =====
(function(){
  function fire(key){
    return fetch('/api/admin/meltdown/trigger', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key: key })
    });
  }
  function mount(){
    if(document.getElementById('md-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'md-btn';
    btn.textContent = '🚨 MELTDOWN';
    btn.style.cssText = 'position:fixed;bottom:16px;right:16px;z-index:99999;background:#1a0505;border:1px solid #ff3b30;color:#ff3b30;font-family:inherit;font-size:11px;letter-spacing:.15em;padding:10px 14px;cursor:pointer;text-transform:uppercase;box-shadow:0 0 14px rgba(255,59,48,.4);';
    btn.onclick = async () => {
      if(!confirm('Запустить КОМПРОМЕТАЦИЮ ARRS на основном терминале?')) return;
      let key = sessionStorage.getItem('md_key') || '';
      let r = await fire(key);
      if(r.status === 401){
        key = prompt('Введи пароль админа:') || '';
        if(!key) return;
        sessionStorage.setItem('md_key', key);
        r = await fire(key);
      }
      const d = await r.json().catch(() => ({}));
      alert(d.ok ? '🚨 MELTDOWN запущен! Открой основной терминал.' : 'Ошибка: ' + (d.error || r.status));
    };
    document.body.appendChild(btn);
  }
  if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount);
  else mount();
  window.addEventListener('load', mount);
})();
