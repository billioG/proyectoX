// Página /wifi del nodo: el docente entra con su correo y contraseña (los mismos de Quetzal), ve las redes Wi-Fi, elige la de su casa y
// escribe la contraseña. No usa librerías: todo lo que viene de las redes se pone con textContent (nunca como HTML).
export function wifiPageHtml() {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Wi-Fi del servidor — Quetzal</title>
<style>
  :root { --bg:#f8fafc; --card:#fff; --ink:#0f172a; --mute:#64748b; --line:#e2e8f0; --brand:#16a34a; --warn:#b45309; --bad:#b91c1c; }
  @media (prefers-color-scheme: dark) { :root { --bg:#0b1220; --card:#111a2e; --ink:#e5edf9; --mute:#94a3b8; --line:#223049; --brand:#22c55e; --warn:#fbbf24; --bad:#f87171; } }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.45 system-ui,-apple-system,Segoe UI,Roboto,sans-serif; padding:16px; }
  main { max-width:520px; margin:0 auto; display:grid; gap:14px; }
  h1 { font-size:1.35rem; margin:.2rem 0 0; } p { margin:0; color:var(--mute); }
  .card { background:var(--card); border:1px solid var(--line); border-radius:14px; padding:14px; display:grid; gap:10px; }
  label { font-weight:600; font-size:.9rem; } input { width:100%; padding:12px; border:1px solid var(--line); border-radius:10px; background:transparent; color:inherit; font:inherit; }
  button { padding:12px 14px; border:0; border-radius:10px; background:var(--brand); color:#fff; font:inherit; font-weight:700; cursor:pointer; }
  button.ghost { background:transparent; color:var(--ink); border:1px solid var(--line); } button:disabled { opacity:.5; cursor:default; }
  .net { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:12px; border:1px solid var(--line); border-radius:10px; background:transparent; color:inherit; text-align:left; width:100%; font-weight:600; }
  .net small { color:var(--mute); font-weight:500; } .row { display:flex; gap:8px; } .row > * { flex:1; }
  .msg { padding:10px 12px; border-radius:10px; border:1px solid var(--line); } .msg.ok { color:var(--brand); } .msg.bad { color:var(--bad); } .msg.warn { color:var(--warn); }
  [hidden] { display:none !important; }
</style></head>
<body><main>
  <div><h1>Conectar a Wi-Fi</h1><p>Para que el servidor se conecte a internet y sincronice (por ejemplo en tu casa). Solo para docentes.</p></div>

  <form id="login" class="card">
    <label for="email">Correo</label><input id="email" type="email" autocomplete="username" required>
    <label for="pass">Contraseña de Quetzal</label><input id="pass" type="password" autocomplete="current-password" required>
    <button type="submit">Entrar</button><div id="login-msg" class="msg bad" hidden></div>
  </form>

  <section id="panel" hidden style="display:grid;gap:14px">
    <div class="card"><div id="state">Consultando…</div><div id="warn" class="msg warn" hidden>Si estás usando el servidor por su Wi-Fi, al cambiar de red esta página se va a cerrar. Vuelve a abrirlo con la dirección nueva.</div>
      <div class="row"><button id="scan" type="button">Buscar redes</button><button id="test" type="button" class="ghost">Probar internet</button></div></div>
    <div id="nets" class="card" hidden></div>
    <form id="connect" class="card" hidden>
      <div>Red: <b id="chosen"></b></div>
      <div id="pw-box"><label for="pw">Contraseña de la red</label><input id="pw" type="password" autocomplete="off"></div>
      <div class="row"><button type="submit" id="go">Conectar</button><button type="button" id="cancel" class="ghost">Cancelar</button></div>
    </form>
    <div id="saved" class="card" hidden></div>
    <div id="msg" class="msg" hidden></div>
  </section>
<script>
(function () {
  var token = null, chosen = null;
  var $ = function (id) { return document.getElementById(id); };
  function show(id, on) { $(id).hidden = !on; }
  function say(text, kind) { var m = $('msg'); m.textContent = text; m.className = 'msg ' + (kind || ''); m.hidden = !text; }
  function api(path, method, body) {
    return fetch(path, { method: method || 'GET', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: body ? JSON.stringify(body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || ('Error ' + r.status)); return d; }); });
  }
  function bars(s) { return s >= 70 ? 'señal fuerte' : s >= 40 ? 'señal media' : 'señal débil'; }
  var last = null;
  function refresh() {
    return api('/api/wifi/status').then(function (s) {
      if (!s.supported) { $('state').textContent = s.reason; show('warn', false); ['scan', 'test'].forEach(function (b) { $(b).disabled = true; }); return; }
      $('state').textContent = (s.connected ? 'Conectado a: ' + s.connected : 'Sin Wi-Fi conectada') + ' · Internet: ' + (s.internet === null ? 'no se pudo comprobar' : s.internet ? 'sí' : 'no');
      last = s;
      show('warn', true);
      var box = $('saved'); box.textContent = '';
      if (s.saved && s.saved.length) {
        var t = document.createElement('b'); t.textContent = 'Redes guardadas'; box.appendChild(t);
        s.saved.forEach(function (name) {
          var r = document.createElement('div'); r.className = 'row';
          var n = document.createElement('div'); n.textContent = name; n.style.alignSelf = 'center';
          var b = document.createElement('button'); b.type = 'button'; b.className = 'ghost'; b.textContent = 'Olvidar';
          b.onclick = function () { api('/api/wifi/forget', 'POST', { ssid: name }).then(function () { say('Se olvidó ' + name + '.', 'ok'); return refresh(); }).catch(function (e) { say(e.message, 'bad'); }); };
          r.appendChild(n); r.appendChild(b); box.appendChild(r);
        });
        show('saved', true);
      } else show('saved', false);
    });
  }
  $('login').onsubmit = function (e) {
    e.preventDefault(); show('login-msg', false);
    fetch('/auth/v1/token?grant_type=password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: $('email').value, password: $('pass').value }) })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(r.status === 429 ? 'Demasiados intentos. Espera unos minutos.' : 'Correo o contraseña incorrectos.'); return d; }); })
      .then(function (d) { token = d.access_token; $('pass').value = ''; show('login', false); $('panel').hidden = false; return refresh(); })
      .catch(function (err) { $('login-msg').textContent = err.message; show('login-msg', true); });
  };
  $('scan').onclick = function () {
    say('Buscando redes…'); $('scan').disabled = true;
    api('/api/wifi/scan').then(function (d) {
      var box = $('nets'); box.textContent = '';
      if (!d.networks.length) { box.textContent = 'No se encontró ninguna red cerca.'; }
      d.networks.forEach(function (n) {
        var b = document.createElement('button'); b.type = 'button'; b.className = 'net';
        var name = document.createElement('span'); name.textContent = n.ssid + (n.connected ? ' (conectada)' : '');
        var info = document.createElement('small'); info.textContent = (n.secured ? '🔒 ' : '') + bars(n.signal);
        b.appendChild(name); b.appendChild(info);
        b.onclick = function () { chosen = n; $('chosen').textContent = n.ssid; show('pw-box', n.secured); $('pw').value = ''; show('connect', true); say(''); if (n.secured) $('pw').focus(); };
        box.appendChild(b);
      });
      show('nets', true); say('');
    }).catch(function (e) { say(e.message, 'bad'); }).then(function () { $('scan').disabled = false; });
  };
  $('cancel').onclick = function () { show('connect', false); chosen = null; };
  $('connect').onsubmit = function (e) {
    e.preventDefault(); if (!chosen) return;
    $('go').disabled = true; say('Conectando a ' + chosen.ssid + '… puede tardar hasta 30 segundos.');
    api('/api/wifi/connect', 'POST', { ssid: chosen.ssid, password: chosen.secured ? $('pw').value : '' })
      .then(function (d) { show('connect', false); $('pw').value = ''; say('Conectado a ' + d.ssid + '. Internet: ' + (d.internet ? 'sí, ya puede sincronizar.' : 'todavía no responde; espera un momento y toca «Probar internet».'), d.internet ? 'ok' : 'warn'); return refresh(); })
      .catch(function (err) { say(err.message, 'bad'); }).then(function () { $('go').disabled = false; });
  };
  // El resultado se queda escrito (antes se borraba al terminar y no se sabía si había internet) y, si no hay, dice por qué.
  $('test').onclick = function () {
    say('Probando… puede tardar unos segundos.'); $('test').disabled = true;
    refresh().then(function () {
      if (!last) return;
      if (last.internet === true) say('Hay internet: el servidor llega a la nube y se sincroniza solo.', 'ok');
      else if (last.internet === false) say('No hay internet. ' + (last.internet_detail || ''), 'bad');
      else say('No se pudo comprobar: falta conectar este servidor a una escuela.', 'warn');
    }).catch(function (e) { say(e.message, 'bad'); }).then(function () { $('test').disabled = false; });
  };
})();
</script></main></body></html>`;
}
