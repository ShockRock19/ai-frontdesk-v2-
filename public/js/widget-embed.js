/* AI Front-Desk — embeddable chat widget.
   Usage on any site:
   <script src="https://YOUR_DOMAIN/js/widget-embed.js" data-business="BUSINESS_ID"></script>
*/
(function () {
  var script = document.currentScript;
  var businessId = script.getAttribute('data-business');
  var origin = new URL(script.src).origin;
  if (!businessId) { console.error('[front-desk] data-business attribute required'); return; }

  var sessionId = localStorage.getItem('fd_session') ||
    (Date.now().toString(36) + Math.random().toString(36).slice(2, 8));
  localStorage.setItem('fd_session', sessionId);

  var css = `
  .fd-btn{position:fixed;bottom:22px;right:22px;width:60px;height:60px;border-radius:50%;
    background:#e9a23b;border:none;cursor:pointer;box-shadow:0 10px 30px -8px rgba(0,0,0,.5);
    z-index:2147483000;font-size:26px;color:#1a1407}
  .fd-win{position:fixed;bottom:94px;right:22px;width:360px;max-width:calc(100vw - 44px);height:520px;
    max-height:calc(100vh - 130px);background:#1c1a14;border:1px solid rgba(239,233,219,.14);
    border-radius:16px;display:none;flex-direction:column;overflow:hidden;z-index:2147483000;
    box-shadow:0 24px 60px -20px rgba(0,0,0,.7);font-family:system-ui,sans-serif;color:#efe9db}
  .fd-win.open{display:flex}
  .fd-head{padding:16px 18px;border-bottom:1px solid rgba(239,233,219,.1);font-weight:600}
  .fd-head small{display:block;color:#a8a08a;font-weight:400;font-size:12px;margin-top:2px}
  .fd-body{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px}
  .fd-msg{max-width:80%;padding:9px 13px;border-radius:13px;font-size:14px;line-height:1.45}
  .fd-msg.bot{background:rgba(233,162,59,.14);border:1px solid rgba(233,162,59,.25);align-self:flex-start}
  .fd-msg.me{background:#2a261d;align-self:flex-end}
  .fd-foot{display:flex;gap:8px;padding:12px;border-top:1px solid rgba(239,233,219,.1)}
  .fd-foot input{flex:1;background:#14130f;border:1px solid rgba(239,233,219,.18);color:#efe9db;
    border-radius:10px;padding:10px 12px;font-size:14px}
  .fd-foot button{background:#e9a23b;border:none;color:#1a1407;border-radius:10px;padding:0 16px;cursor:pointer;font-weight:600}
  .fd-typing{color:#6f6a5b;font-size:13px;align-self:flex-start}`;
  var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  var btn = document.createElement('button'); btn.className = 'fd-btn'; btn.innerHTML = '💬';
  var win = document.createElement('div'); win.className = 'fd-win';
  win.innerHTML =
    '<div class="fd-head" id="fdHead">Chat<small>Usually replies instantly</small></div>' +
    '<div class="fd-body" id="fdBody"></div>' +
    '<div class="fd-foot"><input id="fdInput" placeholder="Type a message…" /><button id="fdSend">Send</button></div>';
  document.body.appendChild(btn); document.body.appendChild(win);

  var body = win.querySelector('#fdBody');
  var input = win.querySelector('#fdInput');
  var started = false;

  function add(text, who) {
    var d = document.createElement('div'); d.className = 'fd-msg ' + who; d.textContent = text;
    body.appendChild(d); body.scrollTop = body.scrollHeight;
  }

  async function boot() {
    if (started) return; started = true;
    try {
      var meta = await fetch(origin + '/public/widget/' + businessId).then((r) => r.json());
      win.querySelector('#fdHead').firstChild.textContent = meta.name || 'Chat';
      add(meta.greeting || 'Hi! How can I help?', 'bot');
    } catch (e) { add('Hi! How can I help?', 'bot'); }
  }

  async function send() {
    var text = input.value.trim(); if (!text) return;
    input.value = ''; add(text, 'me');
    var typing = document.createElement('div'); typing.className = 'fd-typing'; typing.textContent = 'typing…';
    body.appendChild(typing); body.scrollTop = body.scrollHeight;
    try {
      var res = await fetch(origin + '/public/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessId: businessId, sessionId: sessionId, message: text }),
      }).then((r) => r.json());
      typing.remove();
      add(res.reply || 'Sorry, something went wrong.', 'bot');
    } catch (e) { typing.remove(); add('Sorry, I had trouble responding.', 'bot'); }
  }

  btn.addEventListener('click', function () { win.classList.toggle('open'); if (win.classList.contains('open')) { boot(); input.focus(); } });
  win.querySelector('#fdSend').addEventListener('click', send);
  input.addEventListener('keydown', function (e) { if (e.key === 'Enter') send(); });
})();
