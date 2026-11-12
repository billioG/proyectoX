// Comprueba las cabeceras de seguridad que entrega el sitio (después de poner Cloudflare delante; ver docs/CLOUDFLARE_PASO_A_PASO.md).
//   node scripts/verificar-cabeceras.mjs                      revisa https://clases.yoaprendo.online/
//   node scripts/verificar-cabeceras.mjs https://otro.sitio/  revisa otra dirección
// Sale con código 1 si falta alguna o si una tiene un valor que rompería la app (p. ej. geolocation=() o camera=()).

const url = process.argv[2] || 'https://clases.yoaprendo.online/';

/** [cabecera, función que valida el valor y devuelve '' si está bien o el motivo si no] */
export const CHECKS = [
  ['content-security-policy', (v) => (/frame-ancestors\s+'none'/.test(v) ? '' : "falta frame-ancestors 'none'")],
  ['x-content-type-options', (v) => (/^nosniff$/i.test(v.trim()) ? '' : 'debe ser nosniff')],
  ['referrer-policy', (v) => (/strict-origin-when-cross-origin|same-origin|strict-origin/.test(v) ? '' : 'valor no esperado')],
  ['permissions-policy', (v) => {
    const bad = [];
    if (!/camera=\([^)]*self[^)]*\)/.test(v)) bad.push('la cámara (QR de asistencia, escáner de exámenes) quedó bloqueada: camera=(self)');
    if (!/geolocation=\([^)]*self[^)]*\)/.test(v)) bad.push('la ubicación (reportes, bonos de visita) quedó bloqueada: geolocation=(self)');
    return bad.join('; ');
  }],
  ['strict-transport-security', (v) => (/max-age=\d{7,}/.test(v) ? (/preload|includeSubDomains/i.test(v) ? 'sin includeSubDomains ni preload hasta confirmar los subdominios' : '') : 'max-age muy corto o ausente')],
];

export async function check(target) {
  const res = await fetch(target, { method: 'GET', redirect: 'follow' });
  const rows = [];
  for (const [name, validate] of CHECKS) {
    const value = res.headers.get(name);
    if (value === null) { rows.push({ name, ok: false, why: 'no viene' }); continue; }
    const why = validate(value);
    rows.push({ name, ok: !why, why, value });
  }
  return { status: res.status, server: res.headers.get('server'), rows };
}

if (process.argv[1] && process.argv[1].endsWith('verificar-cabeceras.mjs')) {
  const r = await check(url);
  console.log(`${url} -> HTTP ${r.status} · servidor: ${r.server}`);
  for (const x of r.rows) console.log(`${x.ok ? 'OK    ' : 'FALTA '} ${x.name}${x.value ? `: ${x.value}` : ''}${x.why ? `  <- ${x.why}` : ''}`);
  const bad = r.rows.filter((x) => !x.ok);
  console.log(bad.length ? `\n${bad.length} cabecera(s) por corregir.` : '\nTodas las cabeceras de seguridad están.');
  process.exit(bad.length ? 1 : 0);
}
