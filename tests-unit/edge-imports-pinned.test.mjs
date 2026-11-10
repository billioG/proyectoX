// Las Edge Functions importan sus librerías con versión EXACTA. Con «@supabase/supabase-js@2» (sin fijar) cada despliegue puede traer una
// versión distinta: el 9/11/2026 eso, junto con tipos sueltos, dejó el chequeo de tipos del CI en rojo.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FUNCS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'supabase', 'functions');
const files = [];
for (const d of fs.readdirSync(FUNCS, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  for (const f of fs.readdirSync(path.join(FUNCS, d.name))) if (f.endsWith('.ts')) files.push(path.join(FUNCS, d.name, f));
}

test('ninguna Edge Function importa librerías sin versión exacta', () => {
  const bad = [];
  for (const f of files) {
    const src = fs.readFileSync(f, 'utf8');
    for (const m of src.matchAll(/(?:from\s+|import\s+)['"]((?:https:\/\/esm\.sh\/|npm:)[^'"]+)['"]/g)) {
      // …@2.118.0 (exacta) sí; …@2 o sin versión, no.
      if (!/@\d+\.\d+\.\d+(?:[/?][^'"]*)?$/.test(m[1])) bad.push(`${path.relative(FUNCS, f)}: ${m[1]}`);
    }
  }
  assert.deepEqual(bad, [], 'fija la versión exacta de estas importaciones');
});

test('todas las funciones usan la misma versión de supabase-js', () => {
  const versions = new Set();
  for (const f of files) for (const m of fs.readFileSync(f, 'utf8').matchAll(/supabase-js@([0-9.]+)/g)) versions.add(m[1]);
  assert.equal(versions.size, 1, `versiones distintas: ${[...versions].join(', ')}`);
});
