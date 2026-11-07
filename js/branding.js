// Marca propia del colegio: nombre y logo en el encabezado. El crédito «Hecho por Yo Aprendo · Quetzal LMS»
// SIEMPRE se muestra (encabezado cuando hay marca propia, y pie del menú y pantalla de entrada fijos en index.html).
export const CREDIT_TEXT = 'Hecho por Yo Aprendo · Quetzal LMS';
export const MAX_BRAND_NAME = 60;
export const MAX_LOGO_CHARS = 150000;

export const cleanBrandName = (v) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, MAX_BRAND_NAME);
export const isSafeLogo = (v) => typeof v === 'string' && v.length <= MAX_LOGO_CHARS && /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v);

// Qué mostrar para un colegio (fila de `schools`). Sin nombre ni logo válidos => marca de Quetzal.
export function brandView(school) {
  const name = cleanBrandName(school?.brand_name);
  const logo = isSafeLogo(school?.logo_data) ? school.logo_data : null;
  return { name, logo, custom: !!(name || logo) };
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

export function applyBranding(view) {
  const nameEl = document.getElementById('brand-name');
  const logoEl = document.getElementById('brand-logo');
  const creditEl = document.getElementById('brand-credit');
  if (!nameEl) return;
  nameEl.textContent = view.name || 'Quetzal LMS';
  if (logoEl) {
    if (view.logo) { logoEl.src = view.logo; logoEl.classList.remove('hidden'); } else { logoEl.removeAttribute('src'); logoEl.classList.add('hidden'); }
  }
  if (creditEl) creditEl.classList.toggle('hidden', !view.custom);
  document.title = view.name ? `${view.name} · Quetzal LMS` : 'Quetzal LMS | Plataforma Educativa con Gamificación para Escuelas en Guatemala';
}

const cacheKey = (code) => `px_brand_${code}`;
let shownFor = null;

async function refreshBranding() {
  const code = window.currentUser ? window.userData?.school_code : null;
  if (!code) { if (shownFor !== null) { shownFor = null; applyBranding({ name: '', logo: null, custom: false }); } return; }
  if (shownFor === code) return;
  shownFor = code;
  try { const c = localStorage.getItem(cacheKey(code)); if (c) applyBranding(brandView(JSON.parse(c))); } catch { /* sin almacenamiento */ }
  try {
    const { data, error } = await window._supabase.from('schools').select('brand_name, logo_data').eq('code', code).maybeSingle();
    if (error || !data) return; // sin migración, sin internet o sin fila: queda lo que había
    applyBranding(brandView(data));
    try { localStorage.setItem(cacheKey(code), JSON.stringify(data)); } catch { /* sin almacenamiento */ }
  } catch { /* se reintenta al volver a iniciar sesión */ }
}
window.refreshBranding = () => { shownFor = null; return refreshBranding(); };

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  setInterval(refreshBranding, 1500);
}
