// La lista de cursos del docente pide «courses?select=*,teachers(full_name),schools(name),lessons(id)»: con el esquema REAL del
// nodo debe responder (antes daba 400 porque courses no tenía la relación teachers).
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest } from '../school-node/rest/query.js';
import { createEngine } from '../school-node/rest/engine.js';
import { SCHEMA } from '../school-node/rest/schema.js';

const data = {
  courses: [{ id: 'c1', title: 'Robótica', school_code: 'ESC1', created_by: 't1' }, { id: 'c2', title: 'Sin autor', school_code: 'ESC1', created_by: null }],
  teachers: [{ id: 't1', full_name: 'Marta Gómez', email: 'secreto@x.com' }],
  schools: [{ code: 'ESC1', name: 'Escuela Uno' }],
  lessons: [{ id: 'l1', course_id: 'c1' }, { id: 'l2', course_id: 'c1' }],
};
const store = { all: (t) => data[t] || [], put() {}, remove() {} };
const policy = { canRead: () => true, canInsert: () => false, canUpdate: () => false, canDelete: () => false };

test('courses con autor (teachers), escuela y lecciones: responde y solo expone el nombre del autor', () => {
  const req = parseRequest({ method: 'GET', url: '/rest/v1/courses?select=*,teachers(full_name),schools(name),lessons(id)&order=title.asc', headers: {} });
  const { rows } = createEngine({ schema: SCHEMA, store, policy }).execute(req, { uid: 't1', role: 'authenticated' });
  assert.deepEqual(rows.map((r) => r.title), ['Robótica', 'Sin autor']);
  assert.deepEqual(rows[0].teachers, { full_name: 'Marta Gómez' });
  assert.equal(rows[1].teachers, null);
  assert.equal(rows[0].schools.name, 'Escuela Uno');
  assert.equal(rows[0].lessons.length, 2);
  assert.doesNotMatch(JSON.stringify(rows), /secreto/);
});
