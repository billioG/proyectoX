// Respaldo y restauración de la base del nodo (school-node/backup.js), con bases reales en carpetas temporales.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { sqliteAvailable, openSqlite } from './helpers/start-node.mjs';

const skip = sqliteAvailable() ? false : 'better-sqlite3 no está instalado para este Node (usa Node 20)';
const backup = skip ? null : await import('../school-node/backup.js');
const { openDb } = skip ? {} : await import('../school-node/db.js');

function freshNode(n = 2) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-bk-'));
  const dataDir = path.join(dir, 'data');
  const db = openDb(dataDir);
  for (let i = 1; i <= n; i++) db.prepare("INSERT INTO students (id, username, full_name, status) VALUES (?, ?, ?, 'activo')").run(`s${i}`, `u${i}`, `Alumno ${i}`);
  return { dir, dataDir, db };
}
const at = (s) => new Date(`2026-11-0${s}T10:00:00`);
const count = (file) => { const d = openSqlite(file); try { return d.prepare('SELECT count(*) n FROM students').get().n; } finally { d.close(); } };

test('respalda con el servidor "encendido" (base abierta con WAL) y el respaldo trae todo lo escrito', { skip }, async () => {
  const { dataDir, db } = freshNode(3);
  db.prepare("INSERT INTO meta (key, value) VALUES ('algo','x')").run(); // queda en el -wal, sin checkpoint
  const r = await backup.createBackup({ dataDir, now: at(1) });
  assert.match(path.basename(r.file), /^node-20261101-100000\.db$/);
  assert.equal(r.students, 3);
  assert.equal(count(r.file), 3);
  assert.equal(fs.existsSync(`${r.file}.tmp`), false);
  db.close();
});

test('conserva solo los últimos N respaldos y nunca borra el más reciente', { skip }, async () => {
  const { dataDir, db } = freshNode();
  db.close();
  for (const d of [1, 2, 3, 4]) await backup.createBackup({ dataDir, keep: 100, now: at(d) });
  const dir = path.join(dataDir, 'backups');
  fs.writeFileSync(path.join(dir, 'notas-del-docente.txt'), 'no tocar');
  assert.deepEqual(backup.pruneBackups(dir, 2).sort(), ['node-20261101-100000.db', 'node-20261102-100000.db']);
  assert.deepEqual(backup.listBackups(dir).map((b) => b.name), ['node-20261104-100000.db', 'node-20261103-100000.db']);
  assert.equal(fs.existsSync(path.join(dir, 'notas-del-docente.txt')), true, 'solo toca archivos de respaldo');
  assert.equal(backup.pruneBackups(dir, 0).length, 1, 'aunque pidan 0, se queda el último');
  assert.equal(backup.listBackups(dir).length, 1);
});

test('restaura: la base de antes queda guardada, sin restos del -wal, y la nueva se abre bien', { skip }, async () => {
  const { dataDir, db } = freshNode(2);
  const r = await backup.createBackup({ dataDir, now: at(1) });
  db.prepare("INSERT INTO students (id, username, full_name, status) VALUES ('s9','u9','Nuevo','activo')").run(); // se pierde al restaurar
  db.close();
  fs.writeFileSync(path.join(dataDir, 'node.db-wal'), 'basura de la base vieja');
  const out = backup.restoreBackup({ file: r.file, dataDir, now: at(2) });
  assert.equal(out.students, 2);
  assert.equal(count(path.join(dataDir, 'node.db')), 2);
  assert.equal(count(out.kept), 3, 'la base anterior se conserva');
  assert.equal(fs.existsSync(path.join(dataDir, 'node.db-wal')), false);
  assert.match(path.basename(out.kept), /^node\.db\.antes-de-restaurar-20261102-100000$/);
});

test('rechaza archivos que no son una base del nodo y deja la actual intacta', { skip }, async () => {
  const { dir, dataDir, db } = freshNode(2);
  db.close();
  const garbage = path.join(dir, 'roto.db');
  fs.writeFileSync(garbage, 'esto no es sqlite');
  assert.throws(() => backup.restoreBackup({ file: garbage, dataDir }), /no sirve para restaurar/);
  const other = path.join(dir, 'otra.db');
  const o = openSqlite(other); o.exec('CREATE TABLE cosas (id)'); o.close();
  assert.throws(() => backup.restoreBackup({ file: other, dataDir }), /no parece una base del nodo/);
  assert.throws(() => backup.restoreBackup({ file: path.join(dir, 'no-existe.db'), dataDir }), /No existe/);
  assert.equal(count(path.join(dataDir, 'node.db')), 2);
  assert.deepEqual(fs.readdirSync(dataDir).filter((f) => f.includes('antes-de-restaurar')), []);
});

test('un nodo sin base todavía da un mensaje claro', { skip }, async () => {
  const dataDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'quetzal-bk-')), 'data');
  await assert.rejects(backup.createBackup({ dataDir }), /No hay base/);
});

test('--files guarda proyectos y fotos pendientes en un .tar.gz (y se borra junto con su respaldo)', { skip: skip || (spawnSync('tar', ['--version']).status !== 0 && 'no hay tar') }, async () => {
  const { dataDir, db } = freshNode();
  db.close();
  fs.mkdirSync(path.join(dataDir, 'projects'));
  fs.writeFileSync(path.join(dataDir, 'projects', 'p1.mp4'), 'video');
  fs.mkdirSync(path.join(dataDir, 'content')); // se vuelve a bajar: no entra
  fs.writeFileSync(path.join(dataDir, 'content', 'curso.pdf'), 'pdf');
  const r = await backup.createBackup({ dataDir, files: true, now: at(1) });
  assert.ok(r.archive && fs.existsSync(r.archive));
  const list = spawnSync('tar', ['-tzf', path.basename(r.archive)], { cwd: path.dirname(r.archive), encoding: 'utf8' }).stdout;
  assert.match(list, /projects/);
  assert.doesNotMatch(list, /content/);
  await backup.createBackup({ dataDir, files: true, keep: 1, now: at(2) });
  assert.equal(fs.existsSync(r.archive), false, 'al borrar el respaldo viejo se va su archivo');
});

test('la memoria USB solo cuenta si hay un disco distinto montado', { skip }, () => {
  assert.equal(backup.usbMounted('/no/existe/quetzal-usb'), false);
  assert.equal(backup.usbMounted(path.join(os.tmpdir(), 'no-hay-usb')), false);
});

test('por línea de comandos: respalda, lista y restaura con el config.json real', { skip }, async () => {
  const { dir, dataDir, db } = freshNode(2);
  db.close();
  fs.writeFileSync(path.join(dir, 'config.json'), JSON.stringify({ cloudUrl: 'http://127.0.0.1:1', nodeToken: 'x', dataDir: './data' }));
  const cli = path.resolve('school-node/backup.js');
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8', env: { ...process.env, QUETZAL_CONFIG_DIR: dir } });
  const a = run();
  assert.equal(a.status, 0, a.stderr);
  assert.match(a.stdout, /Respaldo listo: .*node-\d{8}-\d{6}\.db \(.*2 estudiantes\)/);
  assert.match(run('--list').stdout, /node-\d{8}-\d{6}\.db/);
  const file = backup.listBackups(path.join(dataDir, 'backups'))[0].file;
  const b = run('--restore', file);
  assert.equal(b.status, 0, b.stderr);
  assert.match(b.stdout, /Restaurado \(2 estudiantes\)/);
  assert.equal(run('--restore').status, 1);
});
