// Lógica pura de XP de la función de la nube node-sync (supabase/functions/node-sync/xp.ts).
// TypeScript sin sintaxis no borrable: Node 22 lo importa directo. Con Node 20 se omite.
import test from 'node:test';
import assert from 'node:assert/strict';

let mod = null;
let skip = false;
try {
  mod = await import('../supabase/functions/node-sync/xp.ts');
} catch (e) {
  if (e?.code === 'ERR_MODULE_NOT_FOUND' && /xp\.ts/.test(String(e.message))) {
    // Falta el archivo: en Node 22 es un fallo real; en Node 20 no se puede importar TypeScript de todos modos.
    if (Number(process.versions.node.split('.')[0]) >= 22) throw e;
  }
  skip = 'esta versión de Node no importa TypeScript (usa Node 22)';
}

const ctx = (over = {}) => ({ studentIds: new Set(['s1', 's2']), today: '2026-11-01', ...over });
const chest = (patch = {}) => ({ kind: 'chest', student_id: 's1', ref: '2026-11-01', xp: 50, gems: 15, ...patch });
const bad = (patch, c) => { const r = mod.validateXpEvent(chest(patch), c || ctx()); assert.equal(r.ok, false, JSON.stringify(patch)); assert.ok(r.error); };

test('constantes acordadas', { skip }, () => {
  assert.equal(mod.XP_PER_LESSON, 10);
  assert.deepEqual(mod.CHEST_PRIZES.map(p => [p.xp, p.gems]), [[20, 5], [50, 15], [100, 50]]);
});

test('validateXpEvent acepta un cofre válido de hoy y de ayer', { skip }, () => {
  for (const p of [{ xp: 20, gems: 5 }, { xp: 50, gems: 15 }, { xp: 100, gems: 50 }]) {
    const r = mod.validateXpEvent(chest(p), ctx());
    assert.equal(r.ok, true);
    assert.deepEqual(r.event, { student_id: 's1', ref: '2026-11-01', xp: p.xp, gems: p.gems });
  }
  assert.equal(mod.validateXpEvent(chest({ ref: '2026-10-31' }), ctx()).ok, true);
  assert.equal(mod.validateXpEvent(chest({ ref: '2026-10-29' }), ctx()).ok, true, 'hasta 3 días atrás');
});

test('validateXpEvent rechaza tipo, estudiante, fechas y premios inválidos', { skip }, () => {
  bad({ kind: 'lesson' });
  bad({ kind: 'otro' });
  bad({ student_id: 'ajeno' });
  bad({ student_id: 42 });
  bad({ ref: '2026-11-02' });            // futura
  bad({ ref: '2026-10-28' });            // hace 4 días
  bad({ ref: '2026-02-30' });            // no existe
  bad({ ref: '01/11/2026' });            // formato
  bad({ ref: undefined });
  bad({ xp: 999, gems: 15 });            // premio inventado
  bad({ xp: 100, gems: 5 });             // xp válido con gemas que no corresponden
  bad({ xp: '50', gems: 15 });           // tipo
});

test('computeStudentXp: proyectos×50 + votos×10 + notas + insignias×100 + xp bonus', { skip }, () => {
  const out = mod.computeStudentXp({
    students: [{ id: 's1', xp: 40, gems: 12 }],
    projects: [
      { id: 'p1', user_id: 's1', group_id: null, score: 80, votes: 2 },
      { id: 'p2', user_id: 's1', group_id: null, score: 70, votes: 1 },
    ],
    memberships: [],
    badgeCounts: new Map([['s1', 1]]),
  });
  // 2×50 + 3×10 + 150 + 100 + 40 = 420
  assert.deepEqual(out.get('s1'), { xp_total: 420, gems: 12 });
});

test('computeStudentXp: proyecto de equipo cuenta para cada miembro y no se duplica', { skip }, () => {
  const out = mod.computeStudentXp({
    students: [{ id: 's1', xp: 0, gems: 0 }, { id: 's2', xp: 0, gems: 0 }, { id: 's3', xp: 0, gems: 0 }],
    projects: [
      { id: 'p1', user_id: 's1', group_id: 7, score: 100, votes: 0 }, // de s1 y de su equipo: cuenta una vez
      { id: 'p2', user_id: 's9', group_id: 7, score: 0, votes: 0 },   // de otro miembro del equipo
    ],
    memberships: [{ group_id: 7, student_id: 's1' }, { group_id: 7, student_id: 's2' }],
    badgeCounts: new Map(),
  });
  assert.equal(out.get('s1').xp_total, 2 * 50 + 100);
  assert.equal(out.get('s2').xp_total, 2 * 50 + 100);
  assert.equal(out.get('s3').xp_total, 0);
});

test('computeStudentXp: sin datos de gemas o xp cuenta cero', { skip }, () => {
  const out = mod.computeStudentXp({ students: [{ id: 's1' }], projects: [{ id: 'p', user_id: 's1', group_id: null, score: null, votes: null }], memberships: [], badgeCounts: new Map() });
  assert.deepEqual(out.get('s1'), { xp_total: 50, gems: 0 });
});
