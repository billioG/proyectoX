// Prepara las Edge Functions para pegarlas en el editor del panel de Supabase (o para llevarlas a otra carpeta).
//
//   node scripts/exportar-funciones.mjs <carpeta-destino>                 todas las funciones
//   node scripts/exportar-funciones.mjs <carpeta-destino> node-sync ai-proxy   solo esas
//
// La única fuente de verdad son supabase/functions/<nombre>/ (ADR-001 en docs/DECISIONES.md). Esto REEMPLAZA a la antigua carpeta
// espejo supabase-functions/: genera, en la carpeta que indiques, una subcarpeta por función con SUS archivos, listos para copiar.
//   * Si una función importa un módulo compartido (`../_shared/xxx.ts`), se copia dentro de su carpeta y el import pasa a `./xxx.ts`,
//     porque el editor del panel solo ve los archivos de la función.
//   * Avisa si una función pasa de 16 archivos (límite del editor del panel).
//   * No toca supabase/functions ni borra nada fuera de la carpeta destino de cada función exportada.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PANEL_FILE_LIMIT = 16;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = path.join(ROOT, 'supabase', 'functions');
const SHARED_IMPORT = /(from\s+['"])(\.\.\/_shared\/([A-Za-z0-9_.-]+\.ts))(['"])/g;

/** Archivos de una función, relativos a su carpeta. */
function listFiles(dir, base = dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? listFiles(p, base) : [path.relative(base, p).split(path.sep).join('/')];
  });
}

export function functionNames(source = SOURCE) {
  return fs.readdirSync(source, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('_') && fs.existsSync(path.join(source, e.name, 'index.ts')))
    .map((e) => e.name).sort();
}

/** Exporta una función. Devuelve { name, files: [...], warnings: [...] }. */
export function exportFunction(name, dest, source = SOURCE) {
  const from = path.join(source, name);
  if (!fs.existsSync(path.join(from, 'index.ts'))) throw new Error(`No existe la función «${name}» en supabase/functions/`);
  const to = path.join(dest, name);
  fs.rmSync(to, { recursive: true, force: true });
  const written = [];
  const warnings = [];
  for (const rel of listFiles(from)) {
    const target = path.join(to, rel);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (!rel.endsWith('.ts')) { fs.copyFileSync(path.join(from, rel), target); written.push(rel); continue; }
    let text = fs.readFileSync(path.join(from, rel), 'utf8');
    text = text.replace(SHARED_IMPORT, (_m, pre, _full, file, post) => {
      const shared = path.join(source, '_shared', file);
      if (!fs.existsSync(shared)) throw new Error(`${name}/${rel} importa ../_shared/${file}, que no existe`);
      const out = path.join(to, file);
      fs.copyFileSync(shared, out);
      if (!written.includes(file)) written.push(file);
      return `${pre}./${file}${post}`;
    });
    fs.writeFileSync(target, text);
    if (!written.includes(rel)) written.push(rel);
  }
  if (written.length > PANEL_FILE_LIMIT) warnings.push(`${name}: ${written.length} archivos; el editor del panel admite ${PANEL_FILE_LIMIT}. Únelos o despliega con la CLI.`);
  return { name, files: written.sort(), warnings };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [dest, ...names] = process.argv.slice(2);
  if (!dest) { console.error('Uso: node scripts/exportar-funciones.mjs <carpeta-destino> [función...]'); process.exit(1); }
  const all = functionNames();
  const wanted = names.length ? names : all;
  const unknown = wanted.filter((n) => !all.includes(n));
  if (unknown.length) { console.error(`No existen: ${unknown.join(', ')}.\nHay: ${all.join(', ')}`); process.exit(1); }
  const out = path.resolve(dest);
  let problems = 0;
  for (const n of wanted) {
    const r = exportFunction(n, out);
    console.log(`${n}: ${r.files.length} archivo(s)`);
    for (const w of r.warnings) { console.warn(`  AVISO ${w}`); problems++; }
  }
  console.log(`\nListo en ${out}. En el panel: Edge Functions → la función → pega cada archivo.`);
  process.exit(problems ? 2 : 0);
}
