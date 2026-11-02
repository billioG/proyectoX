// Cobertura de la app real sobre el nodo escolar: qué tablas y funciones (RPC) de la nube usa la app (js/) y cuáles
// sirve o emula el nodo (school-node/rest). Sirve para decidir qué falta y para detectar, tras cambiar la app, cosas
// nuevas que el nodo todavía no entiende (la app las pediría y fallarían sin internet).
//
//   node scripts/node-cobertura.mjs            informe en pantalla
//   node scripts/node-cobertura.mjs --json     lo mismo como JSON
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');

function walk(dir, out = []) {
  for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (e.name.endsWith('.js')) out.push(rel);
  }
  return out;
}

// Tablas y funciones que la app pide, con los archivos que las usan.
const tablesUsed = new Map();
const rpcsUsed = new Map();
for (const file of walk('js')) {
  const text = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const m of text.matchAll(/\.from\(\s*['"](\w+)['"]/g)) (tablesUsed.get(m[1]) || tablesUsed.set(m[1], new Set()).get(m[1])).add(path.basename(file));
  for (const m of text.matchAll(/rpc\(\s*['"](\w+)['"]/g)) (rpcsUsed.get(m[1]) || rpcsUsed.set(m[1], new Set()).get(m[1])).add(path.basename(file));
}

// Lo que sirve el nodo: tablas reales, tablas que responden vacío y funciones emuladas.
const schema = read('school-node/rest/schema.js');
const empty = new Set([...schema.matchAll(/^  (\w+): emptyTable\(\)/gm)].map((m) => m[1]));
const real = new Set([...schema.matchAll(/^  (\w+): table\(/gm)].map((m) => m[1]));
const emulated = new Set([
  ...[...read('school-node/rest/rpcs.js').matchAll(/^    (\w+): \(/gm)].map((m) => m[1]),
  ...[...read('school-node/rest/routes.js').matchAll(/^    (\w+): \(args\)/gm)].map((m) => m[1]),
]);

const tables = [...tablesUsed.keys()].sort();
const rpcs = [...rpcsUsed.keys()].sort();
const report = {
  tablas: {
    usadasPorLaApp: tables.length,
    realesEnElNodo: tables.filter((t) => real.has(t)),
    vaciasEnElNodo: tables.filter((t) => empty.has(t)),
    sinServir: tables.filter((t) => !real.has(t) && !empty.has(t)).map((t) => ({ tabla: t, archivos: [...tablesUsed.get(t)] })),
  },
  funciones: {
    usadasPorLaApp: rpcs.length,
    emuladas: rpcs.filter((r) => emulated.has(r)),
    sinEmular: rpcs.filter((r) => !emulated.has(r)).map((r) => ({ funcion: r, archivos: [...rpcsUsed.get(r)] })),
  },
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const line = (n, total, what) => `${what}: ${n} de ${total}`;
  console.log('COBERTURA DE LA APP REAL SOBRE EL NODO\n');
  console.log(line(report.tablas.realesEnElNodo.length, tables.length, 'Tablas con datos reales en el nodo'));
  console.log(line(report.tablas.vaciasEnElNodo.length, tables.length, 'Tablas que responden vacío (sin error)'));
  console.log(line(report.tablas.sinServir.length, tables.length, 'Tablas que el nodo no sirve (la app recibe error 404)'));
  for (const t of report.tablas.sinServir) console.log(`   - ${t.tabla}  (${t.archivos.join(', ')})`);
  console.log('');
  console.log(line(report.funciones.emuladas.length, rpcs.length, 'Funciones (RPC) emuladas en el nodo'));
  console.log(line(report.funciones.sinEmular.length, rpcs.length, 'Funciones sin emular (la app recibe error 404)'));
  for (const f of report.funciones.sinEmular) console.log(`   - ${f.funcion}  (${f.archivos.join(', ')})`);
}
