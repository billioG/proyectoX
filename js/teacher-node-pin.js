/**
 * PIN PARA ENTRAR AL NODO ESCOLAR SIN INTERNET -- tarjeta en el Perfil del docente.
 * El docente lo fija EN LÍNEA (no hay código compartido): el navegador calcula el hash (PBKDF2-SHA256, 150000 vueltas, el mismo
 * esquema que el PIN de los estudiantes y que usa el nodo) y manda SOLO el hash y la sal a set_teacher_node_pin(); el servidor
 * nunca ve el PIN. En el nodo el docente entra con su correo y ese PIN (migrations/teacher-node-pin.sql).
 */
const ITERATIONS = 150000;
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function hashPin(pin, saltHex) {
  const salt = new Uint8Array(saltHex.match(/.{2}/g).map((h) => parseInt(h, 16)));
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: ITERATIONS }, key, 256));
}

const say = (html, type) => window.showToast?.(html, type);

async function savePin(card, pin, again) {
  if (!/^\d{6}$/.test(pin)) return say('<i class="fas fa-circle-xmark"></i> El PIN son 6 números', 'error');
  if (pin !== again) return say('<i class="fas fa-circle-xmark"></i> Los dos PIN no coinciden', 'error');
  const salt = toHex(crypto.getRandomValues(new Uint8Array(16)));
  const { error } = await window._supabase.rpc('set_teacher_node_pin', { p_hash: await hashPin(pin, salt), p_salt: salt });
  if (error) return say(`<i class="fas fa-circle-xmark"></i> ${/Could not find the function|PGRST202/i.test(error.message || '') ? 'Esta función todavía no está lista, prueba más tarde' : 'No se pudo guardar el PIN'}`, 'error');
  say('<i class="fas fa-circle-check"></i> Listo: ya puedes entrar al nodo de tu escuela con tu correo y este PIN', 'success');
  card.remove();
  injectCard();
}

async function clearPin(card) {
  const { error } = await window._supabase.rpc('clear_teacher_node_pin');
  if (error) return say('<i class="fas fa-circle-xmark"></i> No se pudo quitar el PIN', 'error');
  say('<i class="fas fa-circle-check"></i> PIN quitado: ya no entras al nodo hasta crear otro', 'success');
  card.remove();
  injectCard();
}

async function injectCard() {
  const host = document.getElementById('profile-content');
  if (!host || window.IS_NODE_REST || window.userRole !== 'docente' || host.querySelector('#teacher-node-pin-card')) return;
  const { data: has, error } = await window._supabase.rpc('has_teacher_node_pin');
  if (error || host.querySelector('#teacher-node-pin-card')) return; // sin la migración no se muestra nada
  const card = document.createElement('div');
  card.id = 'teacher-node-pin-card';
  card.className = 'glass-card p-6 mt-6';
  card.innerHTML = `
    <h3 class="text-sm font-black uppercase tracking-widest text-slate-700 dark:text-white mb-1"><i class="fas fa-wifi text-primary mr-2"></i> PIN para entrar sin internet</h3>
    <p class="text-xs text-slate-500 dark:text-slate-400 mb-4">${has
      ? 'Ya tienes un PIN: con él entras al nodo de tu escuela usando tu correo. Puedes cambiarlo cuando quieras.'
      : 'Crea un PIN de 6 números para entrar al nodo de tu escuela cuando no haya internet. Solo tú lo conoces: se guarda cifrado y nadie más puede verlo.'}</p>
    <div class="flex flex-col sm:flex-row gap-3">
      <input type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="PIN de 6 números" data-pin
        class="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white">
      <input type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="Repite el PIN" data-again
        class="flex-1 px-4 py-3 bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white">
      <button type="button" data-save class="btn-primary-tw px-5 h-12 text-xs uppercase font-bold">${has ? 'Cambiar PIN' : 'Guardar PIN'}</button>
    </div>
    ${has ? '<button type="button" data-clear class="mt-3 text-xs font-bold text-rose-500 underline">Quitar mi PIN</button>' : ''}`;
  card.querySelector('[data-save]').onclick = () => savePin(card, card.querySelector('[data-pin]').value.trim(), card.querySelector('[data-again]').value.trim());
  card.querySelector('[data-clear]')?.addEventListener('click', () => clearPin(card));
  host.appendChild(card);
}

// El perfil se vuelve a dibujar cada vez que se abre: la tarjeta se agrega cuando el contenido ya está.
const watcher = new MutationObserver(() => { injectCard(); });
function start() {
  const host = document.getElementById('profile-content');
  if (host) watcher.observe(host, { childList: true });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
