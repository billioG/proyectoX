/**
 * OFFLINE KIT -- tablets compartidas sin internet (escuelas rurales).
 *
 * 1. Varias cuentas por dispositivo: cada alumno que entró alguna vez con
 *    internet en esta tablet queda guardado y puede volver a entrar sin
 *    conexión eligiéndose en "¿Quién sos?". Antes solo se guardaba la
 *    última sesión: el resto de los alumnos no podía entrar offline.
 * 2. Contraseña offline: al entrar online se guarda un hash PBKDF2 de la
 *    contraseña (nunca la contraseña) para poder verificarla sin servidor.
 *    Si la clase no usa contraseña, se entra tocando el nombre.
 * 3. Almacenamiento persistente: se le pide al navegador que no borre los
 *    cursos descargados cuando falta espacio.
 */

const ACCOUNTS_KEY = 'PX_OFFLINE_ACCOUNTS';
const MAX_ACCOUNTS = 60;
const PBKDF2_ITERATIONS = 150000;

function readAccounts() {
  try { return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || '{}') || {}; } catch { return {}; }
}

function writeAccounts(map) {
  const entries = Object.entries(map).sort((a, b) => (b[1].savedAt || 0) - (a[1].savedAt || 0)).slice(0, MAX_ACCOUNTS);
  localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(Object.fromEntries(entries)));
}

const toHex = (buf) => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
const fromHex = (hex) => new Uint8Array(hex.match(/.{2}/g).map(h => parseInt(h, 16)));

async function hashSecret(secret, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: PBKDF2_ITERATIONS }, key, 256);
  return toHex(bits);
}

// Se llama en cada login exitoso (online). No toca el hash guardado.
window.saveOfflineAccount = function saveOfflineAccount(user, userData, role) {
  if (!user?.id || !userData) return;
  const map = readAccounts();
  const prev = map[user.id] || {};
  map[user.id] = { ...prev, user, userData, role, savedAt: Date.now() };
  writeAccounts(map);
};

// Se llama cuando el login online fue con contraseña escrita a mano.
// Sin contraseña (clase sin contraseña) se marca como "sin clave".
window.setOfflineAccountSecret = async function setOfflineAccountSecret(userId, secret) {
  const map = readAccounts();
  if (!map[userId]) return;
  if (!secret || !window.crypto?.subtle) {
    map[userId].secretHash = null;
    map[userId].salt = null;
  } else {
    const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
    map[userId].salt = salt;
    map[userId].secretHash = await hashSecret(secret, salt);
  }
  writeAccounts(map);
};

window.listOfflineAccounts = function listOfflineAccounts() {
  return Object.values(readAccounts()).sort((a, b) => (a.userData?.full_name || '').localeCompare(b.userData?.full_name || ''));
};

window.removeOfflineAccount = function removeOfflineAccount(userId) {
  const map = readAccounts();
  delete map[userId];
  writeAccounts(map);
};

// Pide que el navegador no borre caché/IndexedDB por falta de espacio.
window.requestPersistentStorage = async function requestPersistentStorage() {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
};

window.getStorageStatus = async function getStorageStatus() {
  try {
    const [est, persisted] = await Promise.all([
      navigator.storage?.estimate?.() || {},
      navigator.storage?.persisted?.() || false,
    ]);
    return { usage: est.usage || 0, quota: est.quota || 0, persisted: !!persisted };
  } catch {
    return { usage: 0, quota: 0, persisted: false };
  }
};

function mb(bytes) {
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}
window.formatStorageBytes = mb;

// Línea de estado en Cursos: espacio usado y si está protegido de borrado.
window.renderStorageStatus = async function renderStorageStatus() {
  const el = document.getElementById('storage-status');
  if (!el) return;
  const st = await window.getStorageStatus();
  if (!st.quota) return;
  const pct = Math.round((st.usage / st.quota) * 100);
  const low = st.quota - st.usage < 300e6;
  el.innerHTML = `<i class="fas fa-hard-drive"></i> Espacio para cursos offline: ${mb(st.usage)} usados de ${mb(st.quota)} (${pct}%)`
    + (st.persisted
      ? ' · <span class="text-emerald-500 font-bold"><i class="fas fa-shield-halved"></i> protegido</span>'
      : ' · <span class="text-amber-500 font-bold" title="El sistema podría borrar lo descargado si falta espacio">sin proteger</span>')
    + (low ? ' · <span class="text-rose-500 font-bold">¡Queda poco espacio!</span>' : '');
};

// ---------- "¿Quién sos?" ----------
window.openOfflineAccountPicker = function openOfflineAccountPicker() {
  const accounts = window.listOfflineAccounts();
  const s = window.sanitizeInput || ((v) => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])));
  document.getElementById('offline-picker')?.remove();

  const avatar = (a) => a.userData?.profile_photo_url
    ? `<img src="${s(a.userData.profile_photo_url)}" alt="" style="width:100%;height:100%;object-fit:cover">`
    : s((a.userData?.full_name || '?').trim().charAt(0).toUpperCase());

  const modal = document.createElement('div');
  modal.id = 'offline-picker';
  modal.style.cssText = 'position:fixed;inset:0;z-index:300;background:#0f172a;color:#fff;overflow-y:auto;padding:1.5rem;font-family:inherit';
  modal.innerHTML = `
    <div style="max-width:40rem;margin:0 auto">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem">
        <h2 style="font-size:1.5rem;font-weight:900;margin:0;color:#fff">¿Quién sos?</h2>
        <button onclick="document.getElementById('offline-picker').remove()" style="width:2.5rem;height:2.5rem;border-radius:.75rem;border:0;background:rgba(255,255,255,.08);color:#cbd5e1;cursor:pointer"><i class="fas fa-times"></i></button>
      </div>
      <p style="color:#94a3b8;font-size:.85rem;margin:0 0 1.25rem"><i class="fas fa-wifi" style="opacity:.5"></i> Sin internet: tocá tu nombre. Solo aparecen quienes ya entraron alguna vez en esta tablet con internet.</p>
      ${accounts.length ? `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(7.5rem,1fr));gap:.75rem">
        ${accounts.map(a => `
          <button onclick="window.pickOfflineAccount('${a.user.id}')" style="display:flex;flex-direction:column;align-items:center;gap:.5rem;padding:1rem .5rem;border-radius:1.25rem;border:2px solid rgba(255,255,255,.08);background:rgba(255,255,255,.05);color:#fff;cursor:pointer">
            <span style="width:4rem;height:4rem;border-radius:9999px;overflow:hidden;display:flex;align-items:center;justify-content:center;font-size:1.6rem;font-weight:900;background:linear-gradient(135deg,#6366f1,#ec4899)">${avatar(a)}</span>
            <span style="font-size:.8rem;font-weight:800;line-height:1.2;text-align:center">${s(a.userData?.full_name || a.user.email || 'Usuario')}</span>
            ${a.secretHash ? '<span style="font-size:.6rem;color:#94a3b8"><i class="fas fa-lock"></i> con contraseña</span>' : ''}
          </button>`).join('')}
      </div>` : `<p style="color:#94a3b8;text-align:center;padding:2rem 0">Nadie entró todavía en esta tablet con internet.</p>`}
    </div>`;
  document.body.appendChild(modal);
};

window.pickOfflineAccount = function pickOfflineAccount(userId) {
  const acc = readAccounts()[userId];
  if (!acc) return;
  if (!acc.secretHash) return window.enterOfflineAccount(userId);

  const s = window.sanitizeInput || ((v) => v);
  const box = document.createElement('div');
  box.id = 'offline-pass';
  box.style.cssText = 'position:fixed;inset:0;z-index:310;background:rgba(2,6,23,.85);display:flex;align-items:center;justify-content:center;padding:1.5rem';
  box.innerHTML = `
    <div style="width:100%;max-width:22rem;background:#1e293b;border-radius:1.5rem;padding:1.5rem;color:#fff;text-align:center">
      <div style="font-weight:900;font-size:1.1rem;margin-bottom:.25rem">${s(acc.userData?.full_name || '')}</div>
      <p style="color:#94a3b8;font-size:.8rem;margin:0 0 1rem">Escribí tu contraseña</p>
      <input id="offline-pass-input" type="password" autocomplete="current-password"
        style="width:100%;height:3rem;border-radius:.9rem;border:2px solid rgba(255,255,255,.15);background:rgba(255,255,255,.06);color:#fff;text-align:center;font-size:1.1rem;box-sizing:border-box"
        onkeydown="if(event.key==='Enter') window.verifyOfflinePassword('${userId}')">
      <p id="offline-pass-error" style="color:#fb7185;font-size:.8rem;min-height:1.2rem;margin:.5rem 0"></p>
      <div style="display:flex;gap:.5rem">
        <button onclick="document.getElementById('offline-pass').remove()" style="flex:1;height:2.75rem;border-radius:.9rem;border:0;background:rgba(255,255,255,.08);color:#cbd5e1;font-weight:800;cursor:pointer">Volver</button>
        <button onclick="window.verifyOfflinePassword('${userId}')" style="flex:1;height:2.75rem;border-radius:.9rem;border:0;background:#22c55e;color:#fff;font-weight:900;cursor:pointer">Entrar</button>
      </div>
    </div>`;
  document.body.appendChild(box);
  document.getElementById('offline-pass-input')?.focus();
};

window.verifyOfflinePassword = async function verifyOfflinePassword(userId) {
  const acc = readAccounts()[userId];
  const input = document.getElementById('offline-pass-input');
  if (!acc || !input) return;
  const ok = (await hashSecret(input.value.trim(), acc.salt)) === acc.secretHash;
  if (!ok) {
    document.getElementById('offline-pass-error').textContent = 'Contraseña incorrecta';
    input.value = '';
    return;
  }
  document.getElementById('offline-pass')?.remove();
  window.enterOfflineAccount(userId);
};

window.enterOfflineAccount = function enterOfflineAccount(userId) {
  const acc = readAccounts()[userId];
  if (!acc) return;
  localStorage.setItem('PX_CACHED_USER', JSON.stringify(acc.user));
  localStorage.setItem('PX_CACHED_USER_DATA', JSON.stringify(acc.userData));
  localStorage.setItem('PX_CACHED_ROLE', acc.role);
  document.getElementById('offline-picker')?.remove();
  if (typeof window.enterOfflineSession === 'function') window.enterOfflineSession(acc.user, acc.userData, acc.role);
};
