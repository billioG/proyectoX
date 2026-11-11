/*
 * MANEJADORES EN LÍNEA SEGUROS (onclick="...", onchange="..." y compañía) SIN 'unsafe-inline'.
 *
 * La política de contenido (CSP) ya no permite script en línea, y eso incluye los atributos onclick="...". En vez de reescribir los ~700 que tiene
 * la app, este archivo los ejecuta con un INTÉRPRETE MÍNIMO (no usa eval, ni new Function, ni setTimeout con texto) que solo entiende el
 * subconjunto de JavaScript que esos atributos usan de verdad: llamadas, this/event, cadenas, números, !, &&, ||, ?:, typeof, comparaciones,
 * if simple, return, asignaciones a value/checked/style.* y funciones flecha de una expresión.
 *
 * Qué lo hace seguro (y distinto de «unsafe-inline»):
 *   - Solo puede LLAMAR funciones de una lista permitida (js/handler-allowlist.js) generada a partir de los manejadores que el propio código
 *     de la app contiene (scripts/handlers-audit.mjs; tests-unit/csp-handlers.test.mjs falla si algo no coincide). Un onclick="fetch(...)"
 *     o "eval(...)" o "document.cookie" inyectado por un atacante NO se ejecuta; en el peor caso invoca una función de la propia interfaz
 *     (como si la persona hubiera tocado ese botón), y esas ya validan permisos en el servidor.
 *   - Los métodos de elementos (closest, remove, classList.add...) salen de una lista fija corta; no hay constructor, __proto__, innerHTML,
 *     cookie, location, src ni href; solo se asigna a value, checked, disabled, hidden, media, textContent, dataset.* y style.*.
 *   - Lo que no entiende o no está permitido NO se ejecuta y queda en la consola (console.error "[manejadores]"), nunca falla en silencio.
 *
 * Se carga como script clásico al inicio del <head> (antes de cualquier botón) y también funciona con require() para las pruebas.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.SafeHandlers = api; api.install(root); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /** Métodos que un manejador puede invocar sobre elementos, eventos, listas y promesas (no sobre funciones globales). */
  var DOM_METHODS = {
    closest: 1, remove: 1, add: 1, toggle: 1, contains: 1, querySelector: 1, querySelectorAll: 1, getElementById: 1, forEach: 1,
    stopPropagation: 1, preventDefault: 1, focus: 1, blur: 1, select: 1, scrollIntoView: 1, then: 1, print: 1, getAttribute: 1,
    toLowerCase: 1, trim: 1, toUpperCase: 1, matches: 1, click: 1,
  };
  /** Propiedades que nunca se leen ni se escriben. */
  var DENY_PROPS = /^(constructor|__proto__|prototype|__defineGetter__|__defineSetter__|__lookupGetter__|innerHTML|outerHTML|insertAdjacentHTML|srcdoc|cookie|location|ownerDocument|defaultView|contentWindow|contentDocument|parentWindow|top|parent|frames|opener|self|globalThis|eval|Function|import)$/;
  /** Propiedades a las que se puede asignar (además de style.* y dataset.*). */
  var ASSIGNABLE = { value: 1, checked: 1, disabled: 1, hidden: 1, media: 1, textContent: 1, scrollTop: 1, scrollLeft: 1, className: 1, selectedIndex: 1 };
  /** Nombres que NUNCA pueden estar en la lista permitida (aunque aparezcan en algún manejador). */
  var NEVER = /^(eval|Function|setTimeout|setInterval|setImmediate|fetch|XMLHttpRequest|WebSocket|EventSource|importScripts|Worker|SharedWorker|ServiceWorker|postMessage|open|execScript|write|writeln|cookie|localStorage|sessionStorage|indexedDB|caches|crypto|constructor|prototype|__proto__|document\.write|innerHTML)$/;

  // ---------------------------------------------------------------- tokenizador
  var PUNCT = ['?.', '===', '!==', '=>', '==', '!=', '&&', '||', '<=', '>=', '(', ')', '[', ']', '.', ',', ';', '?', ':', '!', '=', '<', '>', '+', '-', '*', '/', '%', '{', '}'];
  var KEYWORDS = { typeof: 1, return: 1, if: 1, else: 1, void: 1, this: 1, true: 1, false: 1, null: 1, undefined: 1 };
  var FORBIDDEN_WORDS = { async: 1, await: 1, function: 1, new: 1, class: 1, var: 1, let: 1, const: 1, delete: 1, instanceof: 1, in: 1, yield: 1, with: 1, throw: 1, try: 1, catch: 1, import: 1, for: 1, while: 1, do: 1, switch: 1 };

  function fail(msg) { var e = new Error(msg); e.safeHandlers = true; throw e; }

  function tokenize(src) {
    var toks = [], i = 0, n = src.length;
    while (i < n) {
      var c = src.charAt(i);
      if (/\s/.test(c)) { i++; continue; }
      if (c === "'" || c === '"') {
        var q = c, s = ''; i++;
        while (i < n && src.charAt(i) !== q) {
          var ch = src.charAt(i);
          if (ch === '\\') {
            var nx = src.charAt(i + 1);
            if (nx === 'n') s += '\n'; else if (nx === 't') s += '\t'; else if (nx === 'r') s += '\r';
            else if (nx === 'u' && /^[0-9a-fA-F]{4}$/.test(src.substr(i + 2, 4))) { s += String.fromCharCode(parseInt(src.substr(i + 2, 4), 16)); i += 4; }
            else s += nx;
            i += 2; continue;
          }
          s += ch; i++;
        }
        if (i >= n) fail('cadena sin cerrar');
        i++; toks.push({ t: 'str', v: s }); continue;
      }
      if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src.charAt(i + 1)))) {
        var m = /^[0-9]*\.?[0-9]+(?:[eE][+-]?[0-9]+)?/.exec(src.slice(i));
        toks.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue;
      }
      if (/[A-Za-z_$]/.test(c)) {
        var id = /^[A-Za-z_$][\w$]*/.exec(src.slice(i))[0];
        if (FORBIDDEN_WORDS[id]) fail('no se permite «' + id + '»');
        toks.push({ t: KEYWORDS[id] ? 'kw' : 'id', v: id }); i += id.length; continue;
      }
      if (c === '`') fail('no se permiten plantillas con comillas invertidas');
      var p = null;
      if (c === '?' && src.charAt(i + 1) === '.' && /[0-9]/.test(src.charAt(i + 2))) { toks.push({ t: 'p', v: '?' }); i++; continue; }
      for (var k = 0; k < PUNCT.length; k++) if (src.substr(i, PUNCT[k].length) === PUNCT[k]) { p = PUNCT[k]; break; }
      if (!p) fail('carácter no permitido «' + c + '»');
      toks.push({ t: 'p', v: p }); i += p.length;
    }
    toks.push({ t: 'eof' });
    return toks;
  }

  // ---------------------------------------------------------------- analizador (descenso recursivo)
  function parse(src) {
    var toks = tokenize(src), pos = 0;
    var peek = function () { return toks[pos]; };
    var isP = function (v) { return toks[pos].t === 'p' && toks[pos].v === v; };
    var isKw = function (v) { return toks[pos].t === 'kw' && toks[pos].v === v; };
    var eatP = function (v) { if (!isP(v)) fail('se esperaba «' + v + '»'); pos++; };

    function program() {
      var body = [];
      while (peek().t !== 'eof') { if (isP(';')) { pos++; continue; } body.push(statement()); }
      return { type: 'Program', body: body };
    }
    function statement() {
      if (isKw('return')) {
        pos++;
        if (peek().t === 'eof' || isP(';')) return { type: 'Return', arg: null };
        return { type: 'Return', arg: expression() };
      }
      if (isKw('if')) {
        pos++; eatP('('); var test = expression(); eatP(')');
        var cons = statement(), alt = null;
        if (isP(';') && toks[pos + 1] && toks[pos + 1].t === 'kw' && toks[pos + 1].v === 'else') pos++;
        if (isKw('else')) { pos++; alt = statement(); }
        return { type: 'If', test: test, cons: cons, alt: alt };
      }
      return { type: 'Expr', expr: expression() };
    }
    function expression() { return assignment(); }
    function arrowAhead() {
      // ident =>   |   ( ident, ident ) =>   |   ( ) =>
      if (peek().t === 'id' && toks[pos + 1].t === 'p' && toks[pos + 1].v === '=>') return true;
      if (!isP('(')) return false;
      var k = pos + 1;
      while (toks[k].t === 'id' || (toks[k].t === 'p' && toks[k].v === ',')) k++;
      return toks[k].t === 'p' && toks[k].v === ')' && toks[k + 1].t === 'p' && toks[k + 1].v === '=>';
    }
    function arrow() {
      var params = [];
      if (peek().t === 'id') { params.push(peek().v); pos++; }
      else { eatP('('); while (!isP(')')) { if (peek().t !== 'id') fail('parámetro de función no válido'); params.push(peek().v); pos++; if (isP(',')) pos++; } eatP(')'); }
      eatP('=>');
      if (isP('{')) fail('las funciones flecha solo pueden ser de una expresión');
      return { type: 'Arrow', params: params, body: assignment() };
    }
    function assignment() {
      if (arrowAhead()) return arrow();
      var left = conditional();
      if (isP('=')) {
        if (left.type !== 'Member') fail('solo se puede asignar a una propiedad');
        pos++;
        return { type: 'Assign', target: left, value: assignment() };
      }
      return left;
    }
    function conditional() {
      var test = logicalOr();
      if (isP('?')) { pos++; var a = assignment(); eatP(':'); var b = assignment(); return { type: 'Cond', test: test, a: a, b: b }; }
      return test;
    }
    function logicalOr() { var l = logicalAnd(); while (isP('||')) { pos++; l = { type: 'Logical', op: '||', l: l, r: logicalAnd() }; } return l; }
    function logicalAnd() { var l = equality(); while (isP('&&')) { pos++; l = { type: 'Logical', op: '&&', l: l, r: equality() }; } return l; }
    function equality() {
      var l = relational();
      while (isP('===') || isP('!==') || isP('==') || isP('!=')) { var op = peek().v; pos++; l = { type: 'Binary', op: op, l: l, r: relational() }; }
      return l;
    }
    function relational() {
      var l = additive();
      while (isP('<') || isP('>') || isP('<=') || isP('>=')) { var op = peek().v; pos++; l = { type: 'Binary', op: op, l: l, r: additive() }; }
      return l;
    }
    function additive() {
      var l = multiplicative();
      while (isP('+') || isP('-')) { var op = peek().v; pos++; l = { type: 'Binary', op: op, l: l, r: multiplicative() }; }
      return l;
    }
    function multiplicative() {
      var l = unary();
      while (isP('*') || isP('/') || isP('%')) { var op = peek().v; pos++; l = { type: 'Binary', op: op, l: l, r: unary() }; }
      return l;
    }
    function unary() {
      if (isP('!')) { pos++; return { type: 'Unary', op: '!', arg: unary() }; }
      if (isP('-')) { pos++; return { type: 'Unary', op: '-', arg: unary() }; }
      if (isKw('typeof')) { pos++; return { type: 'Unary', op: 'typeof', arg: unary() }; }
      if (isKw('void')) { pos++; return { type: 'Unary', op: 'void', arg: unary() }; }
      return postfix();
    }
    function postfix() {
      var e = primary(), optional = false;
      for (;;) {
        if (isP('?.')) {
          pos++; optional = true;
          if (isP('(')) {
            pos++; var oargs = [];
            while (!isP(')')) { oargs.push(assignment()); if (isP(',')) pos++; else if (!isP(')')) fail('se esperaba «,» o «)»'); }
            eatP(')');
            e = { type: 'Call', callee: e, args: oargs, optional: true };
          } else if (isP('[')) {
            pos++; var oidx = expression(); eatP(']');
            e = { type: 'Member', obj: e, prop: null, computed: oidx, optional: true };
          } else {
            var ot = peek();
            if (ot.t !== 'id' && ot.t !== 'kw') fail('se esperaba un nombre de propiedad');
            pos++; e = { type: 'Member', obj: e, prop: ot.v, computed: null, optional: true };
          }
        } else if (isP('.')) {
          pos++;
          var t = peek();
          if (t.t !== 'id' && t.t !== 'kw') fail('se esperaba un nombre de propiedad');
          pos++; e = { type: 'Member', obj: e, prop: t.v, computed: null };
        } else if (isP('[')) {
          pos++; var idx = expression(); eatP(']');
          e = { type: 'Member', obj: e, prop: null, computed: idx };
        } else if (isP('(')) {
          pos++; var args = [];
          while (!isP(')')) { args.push(assignment()); if (isP(',')) pos++; else if (!isP(')')) fail('se esperaba «,» o «)»'); }
          eatP(')');
          e = { type: 'Call', callee: e, args: args };
        } else break;
      }
      return optional ? { type: 'Chain', expr: e } : e;
    }
    function primary() {
      var t = peek();
      if (t.t === 'num') { pos++; return { type: 'Lit', v: t.v }; }
      if (t.t === 'str') { pos++; return { type: 'Lit', v: t.v }; }
      if (t.t === 'kw') {
        if (t.v === 'true') { pos++; return { type: 'Lit', v: true }; }
        if (t.v === 'false') { pos++; return { type: 'Lit', v: false }; }
        if (t.v === 'null') { pos++; return { type: 'Lit', v: null }; }
        if (t.v === 'undefined') { pos++; return { type: 'Lit', v: undefined }; }
        if (t.v === 'this') { pos++; return { type: 'This' }; }
        fail('no se esperaba «' + t.v + '»');
      }
      if (t.t === 'id') { pos++; return { type: 'Ident', name: t.v }; }
      if (isP('(')) { pos++; var e = expression(); eatP(')'); return e; }
      if (isP('{')) {
        // Objeto literal tipo JSON ({"a": 1, "b": [..]}): solo datos (los manejadores llevan insignias o preguntas serializadas así).
        pos++; var props = [];
        while (!isP('}')) {
          var kt = peek();
          if (kt.t !== 'str' && kt.t !== 'id' && kt.t !== 'num') fail('clave de objeto no válida');
          pos++; eatP(':');
          props.push({ key: String(kt.v), value: assignment() });
          if (isP(',')) pos++; else if (!isP('}')) fail('se esperaba «,» o «}»');
        }
        eatP('}'); return { type: 'Object', props: props };
      }
      if (isP('[')) {
        pos++; var items = [];
        while (!isP(']')) { items.push(assignment()); if (isP(',')) pos++; else if (!isP(']')) fail('se esperaba «,» o «]»'); }
        eatP(']'); return { type: 'Array', items: items };
      }
      fail('expresión no válida' + (t.t === 'eof' ? ' (fin del texto)' : ' cerca de «' + t.v + '»'));
    }
    var ast = program();
    return ast;
  }

  // ---------------------------------------------------------------- análisis estático (sin ejecutar)
  /** Ruta global de una cadena de miembros: «window.GameArena.rematch» -> «GameArena.rematch». null si no empieza en un global. */
  function globalPath(node, locals) {
    var parts = [];
    var n = node;
    while (n.type === 'Member' && n.prop !== null) { parts.unshift(n.prop); n = n.obj; }
    if (n.type !== 'Ident') return null;
    if (locals && locals[n.name]) return null;
    if (n.name === 'event' || n.name === 'document') return null;
    if (n.name === 'window') { if (!parts.length) return null; return parts.join('.'); }
    parts.unshift(n.name);
    return parts.join('.');
  }

  /** Recorre el AST y devuelve las rutas globales que llama o lee y los métodos DOM que usa. No ejecuta nada. */
  function analyze(ast) {
    var calls = {}, reads = {}, methods = {}, errors = [];
    function walk(n, locals) {
      if (!n) return;
      switch (n.type) {
        case 'Program': n.body.forEach(function (s) { walk(s, locals); }); break;
        case 'Return': walk(n.arg, locals); break;
        case 'Chain': walk(n.expr, locals); break;
        case 'If': walk(n.test, locals); walk(n.cons, locals); walk(n.alt, locals); break;
        case 'Expr': walk(n.expr, locals); break;
        case 'Assign': walk(n.target, locals); walk(n.value, locals); break;
        case 'Cond': walk(n.test, locals); walk(n.a, locals); walk(n.b, locals); break;
        case 'Logical': case 'Binary': walk(n.l, locals); walk(n.r, locals); break;
        case 'Unary': walk(n.arg, locals); break;
        case 'Array': n.items.forEach(function (x) { walk(x, locals); }); break;
        case 'Object': n.props.forEach(function (x) { walk(x.value, locals); }); break;
        case 'Arrow': { var inner = Object.assign({}, locals); n.params.forEach(function (p) { inner[p] = 1; }); walk(n.body, inner); break; }
        case 'Ident': if (!locals[n.name] && n.name !== 'event' && n.name !== 'window' && n.name !== 'document') reads[n.name] = 1; break;
        case 'Member': {
          var gp = globalPath(n, locals);
          if (gp) reads[gp.split('.')[0]] = 1; else walk(n.obj, locals);
          if (n.computed) walk(n.computed, locals);
          break;
        }
        case 'Call': {
          var cp = globalPath(n.callee, locals);
          if (cp) calls[cp] = 1;
          else if (n.callee.type === 'Member' && n.callee.prop !== null) methods[n.callee.prop] = 1;
          else errors.push('llamada a algo que no es una función con nombre');
          if (n.callee.type === 'Member') { if (cp) { var r = globalPath(n.callee, locals); if (r) reads[r.split('.')[0]] = 1; } else walk(n.callee.obj, locals); }
          n.args.forEach(function (a) { walk(a, locals); });
          break;
        }
        default: break;
      }
    }
    walk(ast, {});
    return { calls: Object.keys(calls), reads: Object.keys(reads), methods: Object.keys(methods), errors: errors };
  }

  // ---------------------------------------------------------------- ejecución
  var cache = Object.create(null), cacheSize = 0;
  function compile(code) {
    var hit = cache[code];
    if (hit) return hit;
    var ast = parse(code);
    if (cacheSize > 3000) { cache = Object.create(null); cacheSize = 0; }
    cache[code] = ast; cacheSize++;
    return ast;
  }

  /**
   * Ejecuta el texto de un manejador. `env`: { this, event, win, doc, allow: { calls:[...], reads:[...] } }.
   * Devuelve lo que devolvería un manejador en línea (el valor de «return ...», o undefined).
   */
  function run(code, env) {
    var ast = compile(code);
    var win = env.win, doc = env.doc;
    var allowCalls = env.allowCalls, allowReads = env.allowReads;
    var returned = { done: false, value: undefined };

    function safeGet(obj, prop) {
      if (typeof prop !== 'string' && typeof prop !== 'number') fail('propiedad no válida');
      if (typeof prop === 'string' && DENY_PROPS.test(prop)) fail('propiedad no permitida «' + prop + '»');
      if (obj === null || obj === undefined) return undefined;
      return obj[prop];
    }

    var SHORT = {}; // «a?.b» con a nulo: corta toda la cadena y da undefined
    function evalNode(n, scope) {
      switch (n.type) {
        case 'Lit': return n.v;
        case 'This': return env.this;
        case 'Array': return n.items.map(function (x) { return evalNode(x, scope); });
        case 'Object': { var o = {}; n.props.forEach(function (x) { if (DENY_PROPS.test(x.key)) fail('clave no permitida «' + x.key + '»'); o[x.key] = evalNode(x.value, scope); }); return o; }
        case 'Ident': return identValue(n.name, scope);
        case 'Member': return memberValue(n, scope);
        case 'Chain': try { return evalNode(n.expr, scope); } catch (err) { if (err === SHORT) return undefined; throw err; }
        case 'Call': return callValue(n, scope);
        case 'Unary': {
          if (n.op === 'typeof') {
            // typeof de algo que no existe no falla: da 'undefined'.
            if (n.arg.type === 'Ident' && !scope[n.arg.name] && n.arg.name !== 'event' && n.arg.name !== 'window' && n.arg.name !== 'document') {
              return allowReads[n.arg.name] ? typeof win[n.arg.name] : 'undefined';
            }
            return typeof evalNode(n.arg, scope);
          }
          var v = evalNode(n.arg, scope);
          if (n.op === '!') return !v;
          if (n.op === '-') return -v;
          return undefined;
        }
        case 'Binary': {
          var l = evalNode(n.l, scope), r = evalNode(n.r, scope);
          switch (n.op) {
            case '===': return l === r; case '!==': return l !== r; case '==': return l == r; case '!=': return l != r; // eslint-disable-line eqeqeq
            case '<': return l < r; case '>': return l > r; case '<=': return l <= r; case '>=': return l >= r;
            case '+': return l + r; case '-': return l - r; case '*': return l * r; case '/': return l / r; case '%': return l % r;
            default: fail('operador no permitido');
          }
          break;
        }
        case 'Logical': { var a = evalNode(n.l, scope); return n.op === '&&' ? (a ? evalNode(n.r, scope) : a) : (a ? a : evalNode(n.r, scope)); }
        case 'Cond': return evalNode(n.test, scope) ? evalNode(n.a, scope) : evalNode(n.b, scope);
        case 'Arrow': {
          return function () {
            var inner = Object.assign({}, scope);
            for (var i = 0; i < n.params.length; i++) inner[n.params[i]] = { v: arguments[i] };
            return evalNode(n.body, inner);
          };
        }
        case 'Assign': return assign(n, scope);
        default: fail('expresión no admitida');
      }
      return undefined;
    }

    function identValue(name, scope) {
      if (scope[name]) return scope[name].v;
      if (name === 'event') return env.event;
      if (name === 'window') return win;
      if (name === 'document') return doc;
      if (!allowReads[name]) fail('«' + name + '» no está en la lista permitida de manejadores');
      return win[name];
    }

    function memberValue(n, scope) {
      var gp = globalPath(n, scope);
      if (gp) {
        // Lectura de un global (window.X, X, X.y.z): el primero tiene que estar permitido; el resto se lee sin salir de lo permitido.
        var first = gp.split('.')[0];
        if (!allowReads[first]) fail('«' + first + '» no está en la lista permitida de manejadores');
      }
      var obj = n.obj.type === 'Ident' && n.obj.name === 'window' ? win : evalNode(n.obj, scope);
      if (n.optional && (obj === null || obj === undefined)) throw SHORT;
      var prop = n.computed ? evalNode(n.computed, scope) : n.prop;
      if (obj === win && !allowReads[prop]) fail('«' + prop + '» no está en la lista permitida de manejadores');
      if (obj === doc && !/^(getElementById|querySelector|querySelectorAll|activeElement)$/.test(String(prop))) fail('«document.' + prop + '» no está permitido');
      return safeGet(obj, prop);
    }

    function callValue(n, scope) {
      var callee = n.callee, fn, thisArg, args;
      if (callee.type === 'Ident') {
        if (scope[callee.name]) fail('no se puede llamar a una variable local');
        if (!allowCalls[callee.name]) fail('llamada no permitida: ' + callee.name + '()');
        fn = win[callee.name]; thisArg = win;
      } else if (callee.type === 'Member' && callee.prop !== null) {
        var gp = globalPath(callee, scope);
        if (gp) {
          if (!allowCalls[gp]) fail('llamada no permitida: ' + gp + '()');
          thisArg = callee.obj.type === 'Ident' && callee.obj.name === 'window' ? win : evalNode(callee.obj, scope);
          if (callee.optional && (thisArg === null || thisArg === undefined)) throw SHORT;
          fn = safeGet(thisArg, callee.prop);
        } else {
          if (!DOM_METHODS[callee.prop]) fail('método no permitido: .' + callee.prop + '()');
          thisArg = evalNode(callee.obj, scope);
          if (callee.optional && (thisArg === null || thisArg === undefined)) throw SHORT;
          fn = safeGet(thisArg, callee.prop);
        }
      } else fail('llamada no admitida');
      if (n.optional && (fn === null || fn === undefined)) throw SHORT;
      if (typeof fn !== 'function') fail('no es una función: ' + (callee.prop || callee.name));
      args = n.args.map(function (x) { return evalNode(x, scope); });
      return fn.apply(thisArg, args);
    }

    function assign(n, scope) {
      var t = n.target, prop = t.computed ? evalNode(t.computed, scope) : t.prop;
      var obj = evalNode(t.obj, scope);
      var viaStyle = t.obj.type === 'Member' && t.obj.prop === 'style';
      var viaDataset = t.obj.type === 'Member' && t.obj.prop === 'dataset';
      if (!viaStyle && !viaDataset && !ASSIGNABLE[prop]) fail('no se puede asignar a «' + prop + '»');
      if (obj === win || obj === doc) fail('no se puede asignar a window ni document');
      var v = evalNode(n.value, scope);
      obj[prop] = v;
      return v;
    }

    function exec(stmt, scope) {
      if (returned.done) return;
      switch (stmt.type) {
        case 'Expr': evalNode(stmt.expr, scope); break;
        case 'Return': returned.done = true; returned.value = stmt.arg ? evalNode(stmt.arg, scope) : undefined; break;
        case 'If': if (evalNode(stmt.test, scope)) exec(stmt.cons, scope); else if (stmt.alt) exec(stmt.alt, scope); break;
        default: fail('sentencia no admitida');
      }
    }

    var scope0 = {};
    for (var i = 0; i < ast.body.length && !returned.done; i++) exec(ast.body[i], scope0);
    return returned.value;
  }

  // ---------------------------------------------------------------- instalación (navegador)
  /** Eventos que suben por el DOM (se escuchan en document) y los que no (se escuchan en captura y solo sobre el elemento). */
  var BUBBLING = ['click', 'dblclick', 'change', 'input', 'submit', 'keydown', 'keyup', 'keypress', 'mouseover', 'mouseout', 'mousedown', 'mouseup', 'dragstart', 'dragover', 'drop', 'contextmenu', 'pointerdown', 'touchstart', 'touchend'];
  var DIRECT = ['focus', 'blur', 'load', 'error', 'scroll'];

  function makeAllow(list) {
    var o = Object.create(null);
    (list || []).forEach(function (k) { o[k] = 1; });
    return o;
  }

  function install(win) {
    var doc = win.document;
    if (!doc || !doc.addEventListener) return;
    var cfg = win.__PX_HANDLER_ALLOW || { calls: [], reads: [] };
    var allowCalls = makeAllow(cfg.calls), allowReads = makeAllow(cfg.reads);

    function runOn(el, e) {
      var code = el.getAttribute('on' + e.type);
      if (!code) return;
      // Si el navegador SÍ compiló el atributo (no hay CSP que lo bloquee: pruebas con la CSP desactivada, un navegador sin CSP), él mismo lo ejecuta:
      // aquí no se repite. Con la CSP activa el navegador lo descarta (la propiedad es null) y lo ejecuta este intérprete.
      if (typeof el['on' + e.type] === 'function') return;
      try {
        var res = run(code, { this: el, event: e, win: win, doc: doc, allowCalls: allowCalls, allowReads: allowReads });
        if (res === false) e.preventDefault();
      } catch (err) {
        if (win.console && win.console.error) win.console.error('[manejadores] ' + (err && err.safeHandlers ? 'bloqueado: ' : 'falló: ') + (err && err.message) + '  ->  ' + String(code).slice(0, 140));
      }
    }

    function onBubbling(e) {
      var el = e.target;
      while (el && el !== doc && el.nodeType !== 9) {
        if (el.nodeType === 1 && el.hasAttribute && el.hasAttribute('on' + e.type)) {
          runOn(el, e);
          if (e.cancelBubble) break; // event.stopPropagation() dentro de un manejador: no siguen los de los elementos de arriba
        }
        el = el.parentNode;
      }
    }
    function onDirect(e) {
      var el = e.target;
      if (el && el.nodeType === 1 && el.hasAttribute && el.hasAttribute('on' + e.type)) runOn(el, e);
    }
    BUBBLING.forEach(function (t) { doc.addEventListener(t, onBubbling, false); });
    DIRECT.forEach(function (t) { doc.addEventListener(t, onDirect, true); });
  }

  return { parse: parse, analyze: analyze, run: run, install: install, DOM_METHODS: DOM_METHODS, NEVER: NEVER, ASSIGNABLE: ASSIGNABLE, BUBBLING: BUBBLING, DIRECT: DIRECT, globalPath: globalPath };
});
