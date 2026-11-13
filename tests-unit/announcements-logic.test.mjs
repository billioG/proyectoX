// Avisos leídos: lógica pura (js/announcements-logic.js) + que la bandeja revise el error del upsert y actualice el estado.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  announcementIdsToMark, announcementReadRows, readIdsAfterMark,
} from '../js/announcements-logic.js';

const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

test('announcementIdsToMark: solo los no leídos, sin repetir y en orden', () => {
  const anns = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'b' }];
  assert.deepEqual(announcementIdsToMark(anns, new Set(['a'])), ['b', 'c']);
  assert.deepEqual(announcementIdsToMark(anns, ['a', 'b', 'c']), []);
  assert.deepEqual(announcementIdsToMark(null, null), []);
  assert.deepEqual(announcementIdsToMark([null, { id: null }, { id: 'x' }], new Set()), ['x']);
});

test('announcementReadRows arma las filas del upsert', () => {
  assert.deepEqual(announcementReadRows(['a', 'b'], 'u1'), [
    { announcement_id: 'a', user_id: 'u1' }, { announcement_id: 'b', user_id: 'u1' },
  ]);
  assert.deepEqual(announcementReadRows(null, 'u1'), []);
});

test('readIdsAfterMark: agrega los ids si el guardado salió bien y no toca el Set original', () => {
  const before = new Set(['a']);
  const after = readIdsAfterMark(before, ['b', 'c'], null);
  assert.deepEqual([...after].sort(), ['a', 'b', 'c']);
  assert.deepEqual([...before], ['a']);
});

test('readIdsAfterMark: si el guardado falló (error) NO se da nada por leído', () => {
  const after = readIdsAfterMark(new Set(['a']), ['b'], { message: 'JWT expired', code: '401' });
  assert.deepEqual([...after], ['a']);
});

test('la bandeja revisa el error del upsert, avisa con toast y actualiza tarjetas y contador solo si salió bien', () => {
  const ann = read('js/announcements.js');
  assert.match(ann, /from '\.\/announcements-logic\.js'/);
  const i = ann.indexOf("from('announcement_reads').upsert(");
  assert.ok(i > 0, 'sigue existiendo el upsert');
  const tail = ann.slice(i);
  assert.match(tail, /res\?\.error/, 'revisa el error del upsert');
  assert.match(tail, /console\.warn\('No se pudo marcar los avisos como leídos/);
  assert.match(tail, /window\.showToast\?\.\([^)]*'warning'\)/, 'toast cuando falla');
  const errBlock = tail.slice(tail.indexOf('if (markError)'), tail.indexOf('readIds = readIdsAfterMark'));
  assert.match(errBlock, /return;/, 'con error no sigue (no marca en memoria ni recalcula)');
  assert.doesNotMatch(errBlock, /loadAnnouncementsUnreadCount/);
  assert.match(tail, /readIds = readIdsAfterMark\(readIds, unreadIds, null\)/, 'actualiza readIds en memoria');
  assert.match(tail, /\[data-announcement-dot\]'\)\?\.remove\(\)/, 'quita el punto de «no leído»');
  assert.match(tail, /classList\.remove\('bg-primary\/5', 'border-primary\/20'\)/, 'quita el fondo de «no leído»');
  assert.match(tail, /loadAnnouncementsUnreadCount\(\{ force: true \}\)/, 'recalcula la campanita tras guardar');
  assert.match(ann, /data-announcement-id=/);
  assert.match(ann, /data-announcement-dot/);
});

test('los retos 1v1 pendientes siguen sumando al contador de la campanita', () => {
  const ann = read('js/announcements.js');
  assert.match(ann, /unreadAnnouncements \+ pendingSurveys\.length \+ \(unreadCommentNotifs\?\.length \|\| 0\) \+ pendingChallenges\.length/);
});
