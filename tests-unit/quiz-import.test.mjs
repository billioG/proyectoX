// Pruebas del importador de preguntas JSON (js/quiz-import.js).
// Correr con: npm run test:unit
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuizJson, QUIZ_JSON_EXAMPLE, QUIZ_AI_PROMPT } from '../js/quiz-import.js';

const ok = (input) => {
  const r = parseQuizJson(typeof input === 'string' ? input : JSON.stringify(input));
  assert.deepEqual(r.errors, [], 'no debería tener errores: ' + r.errors.join(' | '));
  return r.questions;
};
const bad = (input) => {
  const r = parseQuizJson(typeof input === 'string' ? input : JSON.stringify(input));
  assert.ok(r.errors.length > 0, 'debería tener errores');
  assert.deepEqual(r.questions, [], 'con errores no se importa nada');
  return r.errors;
};

test('el ejemplo oficial se importa completo y con las respuestas correctas', () => {
  const qs = ok(QUIZ_JSON_EXAMPLE);
  assert.equal(qs.length, 5);
  assert.deepEqual(qs[0], { type: 'mc', question: '¿Cuál es la capital de Guatemala?', options: ['Quetzaltenango', 'Ciudad de Guatemala', 'Antigua Guatemala', 'Cobán'], correctIndex: 1 });
  assert.deepEqual(qs[1], { type: 'tf', question: 'El quetzal es el ave nacional de Guatemala.', correctBool: true });
  assert.deepEqual(qs[2], { type: 'number', question: '¿Cuánto es 7 × 8?', correctNumber: 56, tolerance: 0 });
  assert.equal(qs[3].min, 1820);
  assert.equal(qs[4].type, 'text');
});

test('el JSON del prompt para IA es el mismo ejemplo', () => {
  const m = QUIZ_AI_PROMPT.match(/\{\n  "preguntas"[\s\S]*?\n\}/);
  assert.ok(m, 'el prompt trae el ejemplo');
  assert.deepEqual(JSON.parse(m[0]), QUIZ_JSON_EXAMPLE);
});

test('acepta una lista suelta y el formato interno en inglés', () => {
  const qs = ok([
    { type: 'mc', question: 'A?', options: ['x', 'y', 'z'], correctIndex: 2 },
    { type: 'tf', question: 'B', correctBool: false },
    { type: 'number', question: 'C', correctNumber: 3.5, tolerance: 0.25 },
    { type: 'range', question: 'D', min: 0, max: 10 },
  ]);
  assert.equal(qs[0].correctIndex, 2);
  assert.equal(qs[1].correctBool, false);
  assert.equal(qs[2].tolerance, 0.25);
});

test('mc: letra, texto de la opción (sin tildes ni mayúsculas) o número desde 1', () => {
  const base = { tipo: 'mc', pregunta: 'P', opciones: ['Árbol', 'Río', 'Mar'] };
  assert.equal(ok([{ ...base, correcta: 'c' }])[0].correctIndex, 2);
  assert.equal(ok([{ ...base, correcta: 'arbol' }])[0].correctIndex, 0);
  assert.equal(ok([{ ...base, correcta: 'RÍO' }])[0].correctIndex, 1);
  assert.equal(ok([{ ...base, correcta: 2 }])[0].correctIndex, 1);
});

test('mc: errores claros', () => {
  const base = { tipo: 'mc', pregunta: 'P', opciones: ['a', 'b'] };
  assert.match(bad([{ ...base, correcta: 'D' }])[0], /no coincide con ninguna opción/);
  assert.match(bad([{ ...base, correcta: 3 }])[0], /no coincide/);
  assert.match(bad([{ ...base, correcta: 0 }])[0], /no coincide/);
  assert.match(bad([base])[0], /falta la respuesta correcta/);
  assert.match(bad([{ ...base, opciones: ['solo una'], correcta: 'A' }])[0], /al menos 2 opciones/);
  assert.match(bad([{ ...base, opciones: ['', ' '], correcta: 'A' }])[0], /al menos 2 opciones/);
  assert.match(bad([{ ...base, opciones: 'a,b', correcta: 'A' }])[0], /faltan las "opciones"/);
  assert.match(bad([{ ...base, opciones: Array.from({ length: 9 }, (_, i) => 'o' + i), correcta: 'A' }])[0], /demasiadas opciones/);
});

test('tf: acepta true/false y verdadero/falso/V/F/sí/no', () => {
  for (const [v, expected] of [[true, true], [false, false], ['Verdadero', true], ['falso', false], ['V', true], ['F', false], ['Sí', true], ['no', false]]) {
    assert.equal(ok([{ tipo: 'tf', pregunta: 'P', correcta: v }])[0].correctBool, expected, String(v));
  }
  assert.match(bad([{ tipo: 'tf', pregunta: 'P', correcta: 'quizás' }])[0], /true\/false/);
  assert.match(bad([{ tipo: 'tf', pregunta: 'P' }])[0], /true\/false/);
});

test('number: acepta coma decimal, tolerancia opcional y rechaza lo inválido', () => {
  const q = ok([{ tipo: 'number', pregunta: 'P', correcta: '3,5' }])[0];
  assert.equal(q.correctNumber, 3.5);
  assert.equal(q.tolerance, 0);
  assert.match(bad([{ tipo: 'number', pregunta: 'P', correcta: 'mucho' }])[0], /debe ser un número/);
  assert.match(bad([{ tipo: 'number', pregunta: 'P', correcta: 1, tolerancia: -1 }])[0], /tolerancia/);
  assert.match(bad([{ tipo: 'number', pregunta: 'P', correcta: Infinity }])[0], /debe ser un número/);
});

test('range: min y max válidos', () => {
  assert.deepEqual(ok([{ tipo: 'rango', pregunta: 'P', mínimo: 1, máximo: 5 }])[0], { type: 'range', question: 'P', min: 1, max: 5 });
  assert.match(bad([{ tipo: 'range', pregunta: 'P', min: 5, max: 1 }])[0], /no puede ser mayor/);
  assert.match(bad([{ tipo: 'range', pregunta: 'P', min: 1 }])[0], /"min" y "max"/);
});

test('tipos con nombres en español y deducción del tipo cuando no hay duda', () => {
  assert.equal(ok([{ tipo: 'Opción múltiple', pregunta: 'P', opciones: ['a', 'b'], correcta: 'A' }])[0].type, 'mc');
  assert.equal(ok([{ tipo: 'Verdadero/Falso', pregunta: 'P', correcta: true }])[0].type, 'tf');
  assert.equal(ok([{ tipo: 'abierta', pregunta: 'P' }])[0].type, 'text');
  assert.equal(ok([{ pregunta: 'P', opciones: ['a', 'b'], correcta: 'B' }])[0].type, 'mc');
  assert.equal(ok([{ pregunta: 'P', correcta: true }])[0].type, 'tf');
  assert.equal(ok([{ pregunta: 'P', correcta: 12 }])[0].type, 'number');
  assert.equal(ok([{ pregunta: 'P', min: 1, max: 2 }])[0].type, 'range');
  assert.equal(ok([{ pregunta: 'P' }])[0].type, 'text');
  assert.match(bad([{ tipo: 'dibujo', pregunta: 'P' }])[0], /tipo no reconocido/);
});

test('todo o nada: un error en cualquier pregunta no importa ninguna', () => {
  const errs = bad([
    { tipo: 'tf', pregunta: 'buena', correcta: true },
    { tipo: 'tf', pregunta: '', correcta: true },
    { tipo: 'mc', pregunta: 'mala', opciones: ['a', 'b'], correcta: 'Z' },
  ]);
  assert.equal(errs.length, 2);
  assert.match(errs[0], /^Pregunta 2: falta el enunciado/);
  assert.match(errs[1], /^Pregunta 3:/);
});

test('enunciados y opciones: limpia caracteres de control y respeta los límites', () => {
  const q = ok([{ tipo: 'tf', pregunta: '  Hola\u0000  \n mundo\t', correcta: true }])[0];
  assert.equal(q.question, 'Hola mundo');
  assert.match(bad([{ tipo: 'tf', pregunta: 'x'.repeat(2001), correcta: true }])[0], /tiene 2001 caracteres y el máximo es 2000/);
  assert.equal(ok([{ tipo: 'tf', pregunta: 'x'.repeat(2000), correcta: true }]).length, 1);
  assert.match(bad([{ tipo: 'mc', pregunta: 'P', opciones: ['a', 'x'.repeat(501)], correcta: 'A' }])[0], /tiene 501 caracteres y el máximo es 500/);
  assert.equal(ok([{ tipo: 'mc', pregunta: 'P', opciones: ['a', 'x'.repeat(500)], correcta: 'A' }]).length, 1);
});

test('el HTML se conserva como texto (la app lo escapa al mostrarlo)', () => {
  const q = ok([{ tipo: 'tf', pregunta: '<img src=x onerror=alert(1)>', correcta: true }])[0];
  assert.equal(q.question, '<img src=x onerror=alert(1)>');
});

test('estructura del archivo', () => {
  assert.match(bad('')[0], /vacío/);
  assert.match(bad('   ')[0], /vacío/);
  assert.match(bad('{ no es json')[0], /No es un JSON válido/);
  assert.match(bad({ otra: 1 })[0], /No encontré la lista de preguntas/);
  assert.match(bad([])[0], /vacía/);
  assert.match(bad([1, 'x', null])[0], /Pregunta 1: debe ser un objeto/);
  assert.match(bad(Array.from({ length: 101 }, () => ({ pregunta: 'P' })))[0], /máximo por cuestionario es 100/);
  assert.equal(ok(Array.from({ length: 100 }, (_, i) => ({ pregunta: 'P' + i }))).length, 100);
});

test('tolera BOM del Bloc de notas y las vallas ```json de las IA', () => {
  const json = JSON.stringify({ preguntas: [{ tipo: 'tf', pregunta: 'P', correcta: true }] });
  assert.equal(ok('﻿' + json).length, 1);
  assert.equal(ok('```json\n' + json + '\n```').length, 1);
  assert.equal(ok('```\n' + json + '\n```').length, 1);
});

test('acepta distintos nombres del contenedor', () => {
  const item = { tipo: 'tf', pregunta: 'P', correcta: true };
  for (const key of ['preguntas', 'questions', 'quiz', 'Cuestionario']) assert.equal(ok({ [key]: [item] }).length, 1, key);
});
