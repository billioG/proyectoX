// El nodo sirve las fotos de perfil que descargó (/photos/<huella>.<ext>) y nada más de esa carpeta.
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { sqliteAvailable, startNode, stopAllNodes } from './helpers/start-node.mjs';

after(stopAllNodes);
const GOOD = 'a'.repeat(40) + '.jpg';

test('sirve la foto guardada con su tipo, y rechaza nombres raros, otros archivos y los que no existen', { skip: !sqliteAvailable() && 'better-sqlite3 no disponible' }, async () => {
  const node = await startNode({ dataFiles: { [`photos/${GOOD}`]: 'IMG', 'photos/secreto.txt': 'no', 'config.json': 'no' } });
  const ok = await fetch(`${node.base}/photos/${GOOD}`);
  assert.equal(ok.status, 200);
  assert.match(ok.headers.get('content-type'), /image\/jpeg/);
  assert.equal(await ok.text(), 'IMG');
  for (const bad of ['/photos/secreto.txt', '/photos/..%2Fconfig.json', '/photos/' + 'b'.repeat(40) + '.jpg', '/photos/', '/photos/a.jpg/x']) {
    const r = await fetch(node.base + bad);
    assert.ok([404, 400].includes(r.status), `${bad} -> ${r.status}`);
  }
});
