// Marca propia del colegio: nombre, logo y color. Se ve en la pantalla de entrada y en el encabezado.
// El crédito «Hecho por Yo Aprendo · Quetzal LMS» SIEMPRE se muestra (encabezado cuando hay marca propia,
// y pie del menú y pantalla de entrada fijos en index.html).
export const CREDIT_TEXT = 'Hecho por Yo Aprendo · Quetzal LMS';
export const MAX_BRAND_NAME = 60;
export const MAX_LOGO_CHARS = 150000;
export const DEFAULT_COLOR = '#00C853';

export const cleanBrandName = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_BRAND_NAME);
export const isSafeLogo = (v) => typeof v === 'string' && v.length <= MAX_LOGO_CHARS && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v);
export const isHexColor = (v) => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

const rgbOf = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lin = (c) => { const s = c / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const luminance = (hex) => { const [r, g, b] = rgbOf(hex); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
// Contraste del texto blanco sobre el color (los botones usan texto blanco). WCAG pide 3:1 para texto grande y botones.
export const contrastWithWhite = (hex) => 1.05 / (luminance(hex) + 0.05);
export const isUsableColor = (hex) => isHexColor(hex) && contrastWithWhite(hex) >= 3;
const mix = (hex, k) => '#' + rgbOf(hex).map((c) => Math.round(c * k).toString(16).padStart(2, '0')).join('');

// Qué mostrar para un colegio. Sin nombre, logo ni color válidos => marca de Quetzal.
export function brandView(school) {
  const name = cleanBrandName(school?.brand_name);
  const logo = isSafeLogo(school?.logo_data) ? school.logo_data : null;
  const color = isUsableColor(school?.brand_color) ? school.brand_color.toLowerCase() : null;
  return { name, logo, color, custom: !!(name || logo || color) };
}

// Reduce la imagen elegida a un cuadrado máximo de `size` px (PNG con transparencia) para guardarla como data URL.
export async function resizeLogo(file, size = 256) {
  if (!file || !/^image\/(png|jpeg|webp)$/.test(file.type)) throw new Error('El logo debe ser PNG, JPG o WEBP.');
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, size / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * k));
  const h = Math.max(1, Math.round(bmp.height * k));
  const canvas = document.createElement('canvas');
  canvas.width = w; canvas.height = h;
  canvas.getContext('2d').drawImage(bmp, 0, 0, w, h);
  const out = canvas.toDataURL('image/png');
  if (!isSafeLogo(out)) throw new Error('El logo es demasiado pesado. Prueba con una imagen más simple.');
  return out;
}

function applyColor(color) {
  const root = document.documentElement.style;
  const names = ['--primary', '--primary-dark', '--primary-rgb', '--primary-dark-rgb', '--lc1'];
  if (!color) { names.forEach((n) => root.removeProperty(n)); document.querySelector('meta[name="theme-color"]')?.setAttribute('content', DEFAULT_COLOR); return; }
  const dark = mix(color, 0.75);
  root.setProperty('--primary', color);
  root.setProperty('--primary-dark', dark);
  root.setProperty('--primary-rgb', rgbOf(color).join(' '));
  root.setProperty('--primary-dark-rgb', rgbOf(dark).join(' '));
  root.setProperty('--lc1', mix(color, 0.7)); // texto «primary» en tema claro (más oscuro, para que se lea)
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', color);
}

export function applyBranding(view) {
  const text = view.name || 'Quetzal LMS';
  const nameEl = document.getElementById('brand-name');
  const logoEl = document.getElementById('brand-logo');
  const creditEl = document.getElementById('brand-credit');
  if (nameEl) nameEl.textContent = text;
  if (logoEl) {
    if (view.logo) { logoEl.src = view.logo; logoEl.classList.remove('hidden'); } else { logoEl.removeAttribute('src'); logoEl.classList.add('hidden'); }
  }
  if (creditEl) creditEl.classList.toggle('hidden', !view.custom);
  // Pantalla de entrada
  const loginName = document.getElementById('login-brand-name');
  const loginLogo = document.getElementById('login-brand-logo');
  const loginTile = document.getElementById('login-brand-tile');
  if (loginName) {
    if (view.name) loginName.textContent = view.name;
    else loginName.innerHTML = 'Quetzal <span class="text-primary-dark dark:text-primary">LMS</span>';
  }
  if (loginLogo) {
    if (view.logo) { loginLogo.src = view.logo; loginLogo.classList.remove('hidden'); } else { loginLogo.removeAttribute('src'); loginLogo.classList.add('hidden'); }
  }
  if (loginTile) loginTile.classList.toggle('hidden', !!view.logo);
  applyColor(view.color);
  document.title = view.name ? `${view.name} · Quetzal LMS` : 'Quetzal LMS | Plataforma Educativa con Gamificación para Escuelas en Guatemala';
}

const COLS = 'brand_name, logo_data, brand_color';
const cacheKey = (code) => `px_brand_${code}`;
const LAST_KEY = 'px_brand_last_code';
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* sin almacenamiento */ } },
};

// Código del colegio a mostrar: sesión iniciada > enlace ?colegio=CODIGO > último colegio de este dispositivo.
export function schoolCodeToShow({ sessionCode, search = '', last = null } = {}) {
  if (sessionCode) return sessionCode;
  const m = /[?&]colegio=([A-Za-z0-9_-]{1,20})\b/.exec(search || '');
  return m ? m[1] : (last || null);
}

// En la nube la pantalla de entrada no puede leer `schools` (solo usuarios con sesión): se usa la vista pública `school_brands`
// (solo código, nombre, logo y color). En el nodo escolar `schools` es de lectura abierta.
async function fetchBrand(code) {
  const sb = window._supabase;
  const onNode = window.QUETZAL_NODE?.rest === true;
  const q = onNode
    ? sb.from('schools').select(COLS).eq('code', code)
    : sb.from('school_brands').select(COLS).eq('code', code);
  const { data, error } = await q.maybeSingle();
  return error ? null : data;
}

// En el nodo, la pantalla de entrada recibe la marca de su colegio dentro de /node-config.js (la API de datos exige sesión).
function nodeBrand() { return window.QUETZAL_NODE?.rest === true ? (window.QUETZAL_NODE.brand || null) : null; }

let shownFor; // undefined = nada aplicado todavía; null = marca por defecto; texto = código mostrado
async function refreshBranding() {
  const sessionCode = window.currentUser ? window.userData?.school_code : null;
  const nb = nodeBrand();
  // Sin sesión en un nodo: el colegio del nodo manda (un nodo es de un solo colegio).
  const code = !sessionCode && nb ? nb.code : schoolCodeToShow({ sessionCode, search: location.search, last: store.get(LAST_KEY) });
  if (!code) { if (shownFor !== null) { shownFor = null; applyBranding(brandView(null)); } return; }
  if (shownFor === code) return;
  shownFor = code;
  const cached = store.get(cacheKey(code));
  if (cached) { try { applyBranding(brandView(JSON.parse(cached))); } catch { /* caché dañada */ } }
  try {
    const data = !sessionCode && nb ? nb : await fetchBrand(code);
    if (!data) return; // sin migración, sin internet o sin fila: queda lo que había
    applyBranding(brandView(data));
    store.set(cacheKey(code), JSON.stringify(data));
    if (sessionCode || /[?&]colegio=/.test(location.search)) store.set(LAST_KEY, code);
  } catch { /* se reintenta al volver a iniciar sesión */ }
}
window.refreshBranding = () => { shownFor = undefined; return refreshBranding(); };

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  refreshBranding();
  setInterval(refreshBranding, 1500);
}
