// Importar preguntas de un cuestionario (Quiz) desde un archivo JSON.
//
// Lo usa el constructor de cuestionarios de lessons.js. Convierte lo que el
// docente sube (o pega) al formato interno de quiz_data y le dice, en
// español, qué pregunta tiene un problema. Es "todo o nada": si una
// pregunta tiene un error no se importa ninguna, para no dejar un examen
// con preguntas faltantes sin que el docente lo note.
//
// Formato amigable (también se aceptan las llaves internas en inglés):
//   { "preguntas": [
//     { "tipo": "mc",     "pregunta": "...", "opciones": ["a", "b", "c"], "correcta": "B" },
//     { "tipo": "tf",     "pregunta": "...", "correcta": true },
//     { "tipo": "number", "pregunta": "...", "correcta": 12, "tolerancia": 0.5 },
//     { "tipo": "range",  "pregunta": "...", "min": 1, "max": 5 },
//     { "tipo": "text",   "pregunta": "..." } ] }

export const QUIZ_IMPORT_LIMITS = {
  maxQuestions: 100,
  maxQuestionLength: 2000,
  maxOptionLength: 500,
  minOptions: 2,
  maxOptions: 8,
  maxBytes: 1_000_000,
};

const TYPE_ALIASES = {
  mc: ['mc', 'opcionmultiple', 'multiple', 'multiplechoice', 'seleccionmultiple', 'alternativas'],
  tf: ['tf', 'vf', 'verdaderofalso', 'truefalse', 'verdaderooffalso', 'verdaderoofalso'],
  number: ['number', 'numero', 'numerico', 'numeroexacto'],
  range: ['range', 'rango'],
  text: ['text', 'texto', 'abierta', 'respuestaabierta', 'open'],
};

const KEYS = {
  type: ['tipo', 'type'],
  question: ['pregunta', 'question', 'enunciado'],
  options: ['opciones', 'options', 'alternativas', 'choices', 'respuestas'],
  correct: ['correcta', 'correct', 'respuesta', 'respuestacorrecta', 'answer'],
  correctIndex: ['correctindex'],
  correctBool: ['correctbool'],
  correctNumber: ['correctnumber'],
  tolerance: ['tolerancia', 'tolerance'],
  min: ['min', 'minimo'],
  max: ['max', 'maximo'],
};

const CONTAINER_KEYS = ['preguntas', 'questions', 'quiz', 'quizdata', 'items', 'cuestionario'];

// Minúsculas, sin tildes ni signos: "Opción múltiple" -> "opcionmultiple".
const norm = (v) => String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');

function pick(obj, names) {
  for (const key of Object.keys(obj)) {
    if (names.includes(norm(key))) return { found: true, value: obj[key] };
  }
  return { found: false, value: undefined };
}

function cleanText(value) {
  return String(value ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function toNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function toBool(value) {
  if (typeof value === 'boolean') return value;
  const s = norm(value);
  if (['true', 'verdadero', 'v', 'si', 'cierto'].includes(s)) return true;
  if (['false', 'falso', 'f', 'no'].includes(s)) return false;
  return null;
}

function detectType(raw, obj) {
  if (raw.found) {
    const key = norm(raw.value);
    for (const [type, aliases] of Object.entries(TYPE_ALIASES)) if (aliases.includes(key)) return type;
    return null;
  }
  // Sin "tipo": se deduce solo cuando no hay duda.
  if (pick(obj, KEYS.options).found) return 'mc';
  if (pick(obj, KEYS.correctBool).found) return 'tf';
  if (pick(obj, KEYS.min).found && pick(obj, KEYS.max).found) return 'range';
  if (pick(obj, KEYS.correctNumber).found) return 'number';
  const c = pick(obj, KEYS.correct);
  if (c.found && typeof c.value === 'boolean') return 'tf';
  if (c.found && typeof c.value === 'number') return 'number';
  if (!c.found) return 'text';
  return null;
}

// Devuelve { question } o { error } para una pregunta ya con su tipo.
function convertQuestion(obj, type, L) {
  const text = cleanText(pick(obj, KEYS.question).value);
  if (!text) return { error: 'falta el enunciado (campo "pregunta")' };
  if (text.length > L.maxQuestionLength) return { error: `el enunciado es demasiado largo (tiene ${text.length} caracteres y el máximo es ${L.maxQuestionLength})` };

  if (type === 'text') return { question: { type, question: text } };

  if (type === 'mc') {
    const rawOptions = pick(obj, KEYS.options).value;
    if (!Array.isArray(rawOptions)) return { error: 'faltan las "opciones" (una lista de textos)' };
    const options = rawOptions.map(cleanText).filter(Boolean);
    if (options.length < L.minOptions) return { error: `necesita al menos ${L.minOptions} opciones` };
    if (options.length > L.maxOptions) return { error: `tiene demasiadas opciones (máximo ${L.maxOptions})` };
    const longest = Math.max(...options.map(o => o.length));
    if (longest > L.maxOptionLength) return { error: `una opción es demasiado larga (tiene ${longest} caracteres y el máximo es ${L.maxOptionLength})` };

    // Llave interna: correctIndex (empieza en 0).
    const internal = pick(obj, KEYS.correctIndex);
    if (internal.found) {
      const i = toNumber(internal.value);
      if (i === null || !Number.isInteger(i) || i < 0 || i >= options.length) return { error: `"correctIndex" debe ser un número de 0 a ${options.length - 1}` };
      return { question: { type, question: text, options, correctIndex: i } };
    }

    const c = pick(obj, KEYS.correct);
    if (!c.found || c.value === null || c.value === '') return { error: 'falta la respuesta correcta (campo "correcta": la letra, por ejemplo "B", o el texto de la opción)' };

    let index = -1;
    if (typeof c.value === 'number') {
      // 1 = primera opción (como la cuenta un docente, no un programador).
      if (Number.isInteger(c.value) && c.value >= 1 && c.value <= options.length) index = c.value - 1;
    } else {
      const s = cleanText(c.value);
      if (/^[A-Ha-h]$/.test(s) && s.toUpperCase().charCodeAt(0) - 65 < options.length) {
        index = s.toUpperCase().charCodeAt(0) - 65;
      } else {
        index = options.findIndex(o => norm(o) === norm(s) && norm(s) !== '');
      }
    }
    if (index < 0) return { error: `la respuesta correcta "${cleanText(c.value).slice(0, 40)}" no coincide con ninguna opción (usa la letra, de A a ${String.fromCharCode(64 + options.length)}, o el texto exacto de la opción)` };
    return { question: { type, question: text, options, correctIndex: index } };
  }

  if (type === 'tf') {
    const internal = pick(obj, KEYS.correctBool);
    const c = internal.found ? internal : pick(obj, KEYS.correct);
    const b = c.found ? toBool(c.value) : null;
    if (b === null) return { error: 'la respuesta correcta debe ser true/false (o "verdadero"/"falso")' };
    return { question: { type, question: text, correctBool: b } };
  }

  if (type === 'number') {
    const internal = pick(obj, KEYS.correctNumber);
    const c = internal.found ? internal : pick(obj, KEYS.correct);
    const n = c.found ? toNumber(c.value) : null;
    if (n === null) return { error: 'la respuesta correcta debe ser un número' };
    const t = pick(obj, KEYS.tolerance);
    const tol = t.found ? toNumber(t.value) : 0;
    if (tol === null || tol < 0) return { error: 'la "tolerancia" debe ser un número igual o mayor que 0' };
    return { question: { type, question: text, correctNumber: n, tolerance: tol } };
  }

  if (type === 'range') {
    const min = toNumber(pick(obj, KEYS.min).value);
    const max = toNumber(pick(obj, KEYS.max).value);
    if (min === null || max === null) return { error: 'necesita "min" y "max" como números' };
    if (min > max) return { error: '"min" no puede ser mayor que "max"' };
    return { question: { type, question: text, min, max } };
  }

  return { error: 'tipo de pregunta no reconocido' };
}

function findQuestionList(data) {
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    for (const key of Object.keys(data)) {
      if (CONTAINER_KEYS.includes(norm(key)) && Array.isArray(data[key])) return data[key];
    }
  }
  return null;
}

// Quita las vallas ```json que agregan los asistentes de IA al copiar.
function stripFences(text) {
  const m = text.trim().match(/^```[a-zA-Z]*\s*\n([\s\S]*?)\n?```\s*$/);
  return m ? m[1] : text;
}

/**
 * @param {string} text contenido del archivo o texto pegado
 * @returns {{ questions: object[], errors: string[], warnings: string[] }}
 *   Si `errors` trae algo, `questions` viene vacío.
 */
export function parseQuizJson(text, limits = QUIZ_IMPORT_LIMITS) {
  const fail = (msg) => ({ questions: [], errors: [msg], warnings: [] });
  if (typeof text !== 'string' || !text.trim()) return fail('El archivo está vacío.');
  if (text.length > limits.maxBytes) return fail('El archivo es demasiado grande (máximo 1 MB).');

  let data;
  try {
    data = JSON.parse(stripFences(text.replace(/^﻿/, '')));
  } catch (e) {
    return fail(`No es un JSON válido (${e.message}). Revisa las comas y las comillas, o usa «Descargar ejemplo» como guía.`);
  }

  const list = findQuestionList(data);
  if (!list) return fail('No encontré la lista de preguntas. Debe ser una lista, o un objeto con el campo "preguntas".');
  if (!list.length) return fail('La lista de preguntas está vacía.');
  if (list.length > limits.maxQuestions) return fail(`Hay ${list.length} preguntas; el máximo por cuestionario es ${limits.maxQuestions}.`);

  const questions = [];
  const errors = [];
  list.forEach((item, i) => {
    const label = `Pregunta ${i + 1}`;
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      errors.push(`${label}: debe ser un objeto con "pregunta", "tipo" y la respuesta.`);
      return;
    }
    const type = detectType(pick(item, KEYS.type), item);
    if (!type) {
      errors.push(`${label}: tipo no reconocido. Usa mc, tf, number, range o text.`);
      return;
    }
    const result = convertQuestion(item, type, limits);
    if (result.error) errors.push(`${label}: ${result.error}.`);
    else questions.push(result.question);
  });

  if (errors.length) return { questions: [], errors, warnings: [] };
  return { questions, errors: [], warnings: [] };
}

export const QUIZ_JSON_EXAMPLE = {
  preguntas: [
    { tipo: 'mc', pregunta: '¿Cuál es la capital de Guatemala?', opciones: ['Quetzaltenango', 'Ciudad de Guatemala', 'Antigua Guatemala', 'Cobán'], correcta: 'B' },
    { tipo: 'tf', pregunta: 'El quetzal es el ave nacional de Guatemala.', correcta: true },
    { tipo: 'number', pregunta: '¿Cuánto es 7 × 8?', correcta: 56, tolerancia: 0 },
    { tipo: 'range', pregunta: '¿En qué año se firmó la Independencia de Centroamérica? (acepta 1820 a 1822)', min: 1820, max: 1822 },
    { tipo: 'text', pregunta: 'Explica con tus palabras por qué es importante cuidar el agua.' },
  ],
};

export const QUIZ_AI_PROMPT = `Genera un cuestionario de 10 preguntas sobre [TEMA] para estudiantes de [GRADO].
Responde SOLO con JSON válido, sin explicaciones y sin comillas invertidas (\`\`\`).

Formato (cada pregunta usa uno de estos tipos):
${JSON.stringify(QUIZ_JSON_EXAMPLE, null, 2)}

Reglas:
- "tipo" puede ser: "mc" (opción múltiple), "tf" (verdadero/falso), "number" (número exacto), "range" (cualquier número entre "min" y "max") o "text" (respuesta abierta, la califica el docente).
- En "mc", "opciones" es una lista de 2 a 8 textos y "correcta" es la LETRA de la opción correcta ("A", "B", "C"...).
- En "tf", "correcta" es true o false.
- En "number", "correcta" es un número y "tolerancia" (opcional) es cuánto se permite de diferencia.
- Cada pregunta con máximo 2000 caracteres y cada opción con máximo 500.
- Todo en español.`;

// En el navegador queda disponible para lessons.js; en Node (pruebas) no hay window.
if (typeof window !== 'undefined') {
  window.QuizImport = { parse: parseQuizJson, example: QUIZ_JSON_EXAMPLE, aiPrompt: QUIZ_AI_PROMPT, limits: QUIZ_IMPORT_LIMITS };
}
