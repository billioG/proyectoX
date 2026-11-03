// La pantalla de equipos pide order('school_code, grade, section, name'): PostgREST acepta espacios tras la coma y el nodo tiene que hacerlo igual.
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRequest } from '../school-node/rest/query.js';
import { SCHEMA } from '../school-node/rest/schema.js';

test('el orden con espacios tras la coma se entiende', () => {
  const p = parseRequest({ method: 'GET', url: '/rest/v1/groups?select=*&order=school_code,+grade,+section,+name.asc', headers: {} });
  assert.deepEqual(p.order.map((o) => o.col), ['school_code', 'grade', 'section', 'name']);
  assert.equal(p.order[3].dir, 'asc');
  const q = parseRequest({ method: 'GET', url: '/rest/v1/groups?select=*&order=name.desc.nullslast', headers: {} });
  assert.deepEqual(q.order, [{ col: 'name', dir: 'desc', nulls: 'last' }]);
});

test('los equipos traen sus proyectos (groups -> projects) como en la nube', () => {
  assert.deepEqual(SCHEMA.groups.relations.projects, { type: 'many', table: 'projects', fk: 'group_id', ref: 'id' });
});
