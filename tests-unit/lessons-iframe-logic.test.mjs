// Visor de recursos HTML/SCORM: un enlace dentro del recurso no debe abrir Quetzal dentro del visor (js/lessons-iframe-logic.js + servidor del nodo).
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { iframeBaseFolder, injectBaseHref, classifyLink } from '../js/lessons-iframe-logic.js';
import { sqliteAvailable, startNode, stopAllNodes } from './helpers/start-node.mjs';

after(stopAllNodes);

const APP = 'http://quetzal.local:3000';
const FOLDER = `${APP}/content/lessons/abc/res/`;

test('iframeBaseFolder: carpeta de la dirección que se pidió (relativa o absoluta)', () => {
  assert.equal(iframeBaseFolder('/content/lessons/abc/res/index.html', `${APP}/`), FOLDER);
  assert.equal(iframeBaseFolder('/functions/v1/serve-scorm-entry?path=lessons/abc/res/index.html&lang=es', `${APP}/`), `${APP}/functions/v1/`);
  assert.equal(iframeBaseFolder('https://x.supabase.co/storage/v1/object/public/c/l/i.html', `${APP}/`), 'https://x.supabase.co/storage/v1/object/public/c/l/');
  assert.equal(iframeBaseFolder('http://[', `${APP}/`), null);
});

test('injectBaseHref: con <head> lo pone primero, antes de cualquier script', () => {
  const out = injectBaseHref('<!doctype html><html><head><title>A</title><script src="app.js"></script></head><body></body></html>', FOLDER);
  assert.match(out, /<head><base href="http:\/\/quetzal\.local:3000\/content\/lessons\/abc\/res\/"><title>/);
  assert.ok(out.indexOf('<base') < out.indexOf('<script'));
  assert.match(injectBaseHref('<HEAD lang="es"><p>x</p>', FOLDER), /^<HEAD lang="es"><base href="[^"]+"><p>x<\/p>$/);
});

test('injectBaseHref: <header> no cuenta como <head>', () => {
  const out = injectBaseHref('<header>Hola</header><p>x</p>', FOLDER);
  assert.equal(out, `<head><base href="${FOLDER}"></head><header>Hola</header><p>x</p>`);
});

test('injectBaseHref: sin <head> lo crea (tras <html>, tras el doctype o al inicio)', () => {
  assert.equal(injectBaseHref('<html lang="es"><body>x</body></html>', FOLDER), `<html lang="es"><head><base href="${FOLDER}"></head><body>x</body></html>`);
  assert.equal(injectBaseHref('<!DOCTYPE html><p>x</p>', FOLDER), `<!DOCTYPE html><head><base href="${FOLDER}"></head><p>x</p>`);
  assert.equal(injectBaseHref('<p>x</p>', FOLDER), `<head><base href="${FOLDER}"></head><p>x</p>`);
  assert.equal(injectBaseHref('', FOLDER), `<head><base href="${FOLDER}"></head>`);
});

test('injectBaseHref: si ya trae <base href> no se duplica', () => {
  const src = '<head><base href="https://cdn.example/x/"><title>A</title></head>';
  assert.equal(injectBaseHref(src, FOLDER), src);
  const single = "<head><BASE target='_blank' href='/x/'></head>";
  assert.equal(injectBaseHref(single, FOLDER), single);
  // Un <base> sin href (solo target) no fija la ruta: sí se agrega el nuestro.
  assert.match(injectBaseHref('<head><base target="_blank"></head>', FOLDER), /<head><base href="[^"]+"><base target/);
});

test('injectBaseHref: escapa comillas y símbolos en la carpeta', () => {
  const out = injectBaseHref('<head></head>', 'http://h/a"b<c>&d/');
  assert.equal(out, '<head><base href="http://h/a&quot;b&lt;c&gt;&amp;d/"></head>');
});

test('injectBaseHref: carpeta inválida (no http/https) deja el HTML intacto', () => {
  for (const bad of [null, undefined, '', 'javascript:alert(1)', 'about:srcdoc']) assert.equal(injectBaseHref('<head></head>', bad), '<head></head>');
});

const kind = (href, extra = {}) => classifyLink({ href, target: null, baseUrl: FOLDER, appOrigin: APP, ...extra });

test('classifyLink: lo que lleva a la plataforma', () => {
  // Con el <base> de la carpeta del recurso, «index.html» y «./» quedan dentro del paquete...
  assert.equal(kind('index.html'), 'internal');
  assert.equal(kind('./'), 'internal');
  assert.equal(kind(''), 'internal');
  // ...pero la raíz absoluta, /index.html o la URL completa de la app son la plataforma.
  assert.equal(kind('/'), 'platform');
  assert.equal(kind('/index.html'), 'platform');
  assert.equal(kind('/?http=1'), 'platform');
  assert.equal(kind('/index.html#x'), 'platform');
  assert.equal(kind(`${APP}/`), 'platform');
  assert.equal(kind(`${APP}/index.html`), 'platform');
  assert.equal(kind('../../../../'), 'platform');
});

test('classifyLink: sin <base> (about:srcdoc) lo relativo cae en la raíz de la app, o sea la plataforma', () => {
  for (const href of ['index.html', './', '', '/', './index.html']) assert.equal(kind(href, { baseUrl: 'about:srcdoc' }), 'platform', href);
  assert.equal(kind('otra-pagina.html', { baseUrl: 'about:srcdoc' }), 'internal');
});

test('classifyLink: target _top y _parent siempre se bloquean, sea cual sea el destino', () => {
  for (const t of ['_top', '_parent', ' _TOP ']) {
    assert.equal(kind('otra.html', { target: t }), 'platform', t);
    assert.equal(kind('https://example.com/', { target: t }), 'platform', t);
  }
  assert.equal(kind('otra.html', { target: '_blank' }), 'internal');
  assert.equal(kind('otra.html', { target: '_self' }), 'internal');
});

test('classifyLink: otro archivo del paquete navega normal; externos van a otra pestaña; anclas y esquemas especiales', () => {
  assert.equal(kind('leccion2.html'), 'internal');
  assert.equal(kind('img/robot.png'), 'internal');
  assert.equal(kind('/content/lessons/abc/res/otra.html'), 'internal');
  assert.equal(kind('https://www.mbot.cc/'), 'external');
  assert.equal(kind('//example.com/'), 'external');
  assert.equal(kind(`${APP.replace('3000', '3001')}/`), 'external', 'otro puerto es otro origen');
  assert.equal(kind('#paso2'), 'hash');
  assert.equal(kind('#/pagina'), 'hash');
  assert.equal(kind('mailto:a@b.com'), 'ignore');
  assert.equal(kind('tel:123'), 'ignore');
  assert.equal(kind('javascript:void(0)'), 'ignore');
  assert.equal(kind(null), 'ignore');
  assert.equal(kind('http://['), 'ignore');
});

// ---- Servidor del nodo: una petición de iframe a la app no la recibe ----
const skip = !sqliteAvailable() && 'better-sqlite3 no disponible';

// fetch() de Node no deja fijar cabeceras Sec-Fetch-*: se usa http.request.
const get = (base, p, headers = {}) => new Promise((resolve, reject) => {
  const req = http.request(new URL(p, base), { method: 'GET', headers }, (res) => {
    let body = ''; res.setEncoding('utf8'); res.on('data', (d) => { body += d; }); res.on('end', () => resolve({ status: res.statusCode, body }));
  });
  req.on('error', reject); req.end();
});

test('el nodo no entrega la app a un iframe (/ e /index.html) pero sí a una navegación normal', { skip, timeout: 60000 }, async () => {
  const node = await startNode();
  for (const p of ['/index.html', '/']) {
    const framed = await get(node.base, p, { 'Sec-Fetch-Dest': 'iframe' });
    assert.equal(framed.status, 403, p);
    assert.ok(!/<html|QUETZAL_NODE|<script/i.test(framed.body), 'no entrega la app: ' + p);
    for (const headers of [{}, { 'Sec-Fetch-Dest': 'document' }, { 'Sec-Fetch-Dest': 'empty' }]) {
      const ok = await get(node.base, p, headers);
      assert.equal(ok.status, 200, `${p} ${JSON.stringify(headers)}`);
      assert.match(ok.body, /<html/i);
    }
  }
  // Lo demás (un recurso del paquete) sí se puede ver dentro de un iframe.
  const res = await get(node.base, '/node-config.js', { 'Sec-Fetch-Dest': 'iframe' });
  assert.notEqual(res.status, 403);
});
