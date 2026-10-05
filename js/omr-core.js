/**
 * OMR (lector de hojas de respuestas) -- PROTOTIPO
 * Hoja tamaño Carta con 4 marcas negras en las esquinas, hasta 100 preguntas,
 * 5 opciones (A-E). El mismo diseño (layout) sirve para dibujar la hoja y para
 * saber dónde buscar cada burbuja al escanearla, así no hay dos fuentes de verdad.
 * Sin dependencias.
 */
(function (global) {
  'use strict';

  // ---------- Diseño (mm) ----------
  const PAGE = { w: 215.9, h: 279.4 };            // Carta
  const SHEET = { w: 190, h: 247 };                // distancia entre centros de marcas
  const MARGIN = { x: (PAGE.w - SHEET.w) / 2, y: (PAGE.h - SHEET.h) / 2 };
  const MARK = 9;                                  // lado de cada marca
  const OPTIONS = ['A', 'B', 'C', 'D', 'E'];
  const ROWS_MAX = 25;
  const ROW_PITCH = 7.6;
  const BUBBLE_R = 2.4;
  const OPT_PITCH = 7.2;
  const GRID_TOP = 52;                             // y de la primera fila (origen = centro marca superior izquierda)
  const FIRST_OPT_X = 12;                          // x de la opción A dentro de su columna
  const MAX_QUESTIONS = 100;

  function layout(n) {
    n = Math.max(1, Math.min(MAX_QUESTIONS, Math.floor(n)));
    const cols = Math.ceil(n / ROWS_MAX);
    const rows = Math.ceil(n / cols);
    const pitch = Math.min(SHEET.w / cols, 56);
    const startX = (SHEET.w - cols * pitch) / 2;
    const bubbles = [], labels = [], headers = [];
    for (let q = 0; q < n; q++) {
      const c = Math.floor(q / rows), r = q % rows;
      const colX = startX + c * pitch;
      const y = GRID_TOP + r * ROW_PITCH;
      labels.push({ q, x: colX + 7.5, y });
      OPTIONS.forEach((opt, o) => bubbles.push({ q, o, opt, x: colX + FIRST_OPT_X + o * OPT_PITCH, y }));
    }
    for (let c = 0; c < cols; c++) {
      const colX = startX + c * pitch;
      OPTIONS.forEach((opt, o) => headers.push({ opt, x: colX + FIRST_OPT_X + o * OPT_PITCH, y: GRID_TOP - 6 }));
    }
    return { n, cols, rows, pitch, startX, bubbles, labels, headers, r: BUBBLE_R };
  }

  // ---------- Hoja en SVG (para imprimir y para las pruebas) ----------
  const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // Texto que nunca se sale de su caja: si no cabe, se comprime con textLength.
  function fitText(text, x, y, size, maxW, extra = '') {
    const approx = String(text).length * size * 0.55;
    const fit = approx > maxW ? ` textLength="${maxW}" lengthAdjust="spacingAndGlyphs"` : '';
    return `<text x="${x}" y="${y}" font-size="${size}"${fit} ${extra}>${esc(text)}</text>`;
  }

  /**
   * opciones: { n, title, group, examId }
   * Hoja por alumno: + studentName (impreso en grande) y qr (matriz de booleanos
   * de la librería de QR) arriba a la derecha. Sin ellos, es la hoja genérica.
   */
  function svgSheet({ n, title = 'Evaluación', examId = '', group = '', studentName = '', qr = null } = {}) {
    const L = layout(n);
    const ox = MARGIN.x, oy = MARGIN.y;
    const p = [];
    p.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${PAGE.w}mm" height="${PAGE.h}mm" viewBox="0 0 ${PAGE.w} ${PAGE.h}" font-family="Arial, Helvetica, sans-serif">`);
    p.push(`<rect width="${PAGE.w}" height="${PAGE.h}" fill="#fff"/>`);

    [[0, 0], [SHEET.w, 0], [0, SHEET.h], [SHEET.w, SHEET.h]].forEach(([x, y]) => {
      p.push(`<rect x="${ox + x - MARK / 2}" y="${oy + y - MARK / 2}" width="${MARK}" height="${MARK}" fill="#000"/>`);
    });

    const textW = qr ? 138 : 168;
    p.push(fitText(title, ox + 11, oy + 7, 6, textW, 'font-weight="700"'));
    p.push(fitText(`${group}${group && examId ? ' · ' : ''}${examId ? 'Examen ' + examId : ''} · ${L.n} preguntas`, ox + 11, oy + 12.5, 3, textW, 'fill="#444"'));

    if (qr) {
      // QR a la derecha (zona blanca alrededor para que se lea bien)
      const size = 28, qx = SHEET.w - 8 - size, qy = 6, m = size / qr.length;
      p.push(`<rect x="${ox + qx - 2}" y="${oy + qy - 2}" width="${size + 4}" height="${size + 4}" fill="#fff"/>`);
      qr.forEach((row, r) => {
        let c = 0;
        while (c < row.length) {
          if (!row[c]) { c++; continue; }
          let end = c; while (end < row.length && row[end]) end++;
          p.push(`<rect x="${(ox + qx + c * m).toFixed(3)}" y="${(oy + qy + r * m).toFixed(3)}" width="${((end - c) * m + 0.02).toFixed(3)}" height="${(m + 0.02).toFixed(3)}" fill="#000"/>`);
          c = end;
        }
      });
      if (studentName) {
        p.push(`<text x="${ox + 11}" y="${oy + 20}" font-size="3.2" fill="#444">Alumno:</text>`);
        p.push(fitText(studentName, ox + 11, oy + 26.5, 5, textW, 'font-weight="700"'));
      } else {
        // hoja para fotocopiar: el alumno escribe su nombre
        p.push(`<text x="${ox + 11}" y="${oy + 23}" font-size="3.8">Nombre:</text><line x1="${ox + 28}" y1="${oy + 23}" x2="${ox + 142}" y2="${oy + 23}" stroke="#000" stroke-width=".3"/>`);
      }
      p.push(`<text x="${ox + 11}" y="${oy + 32.5}" font-size="3.4">Fecha:</text><line x1="${ox + 23}" y1="${oy + 32.5}" x2="${ox + 70}" y2="${oy + 32.5}" stroke="#000" stroke-width=".3"/>`);
      p.push(`<text x="${ox + 78}" y="${oy + 32.5}" font-size="3.4">Nota:</text><line x1="${ox + 88}" y1="${oy + 32.5}" x2="${ox + 112}" y2="${oy + 32.5}" stroke="#000" stroke-width=".3"/>`);
    } else {
      p.push(`<text x="${ox + 11}" y="${oy + 22}" font-size="3.6">Nombre:</text><line x1="${ox + 28}" y1="${oy + 22}" x2="${ox + 125}" y2="${oy + 22}" stroke="#000" stroke-width=".3"/>`);
      p.push(`<text x="${ox + 130}" y="${oy + 22}" font-size="3.6">Fecha:</text><line x1="${ox + 142}" y1="${oy + 22}" x2="${ox + 179}" y2="${oy + 22}" stroke="#000" stroke-width=".3"/>`);
      p.push(`<text x="${ox + 11}" y="${oy + 30}" font-size="3.6">Grado y sección:</text><line x1="${ox + 43}" y1="${oy + 30}" x2="${ox + 90}" y2="${oy + 30}" stroke="#000" stroke-width=".3"/>`);
      p.push(`<text x="${ox + 96}" y="${oy + 30}" font-size="3.6">Nota:</text><line x1="${ox + 106}" y1="${oy + 30}" x2="${ox + 125}" y2="${oy + 30}" stroke="#000" stroke-width=".3"/>`);
    }
    p.push(`<text x="${ox + 11}" y="${oy + 38}" font-size="2.8" fill="#333">Rellena por completo UN círculo por pregunta, con lápiz o lapicero oscuro. No dobles ni manches la hoja.</text>`);
    p.push(`<circle cx="${ox + 150}" cy="${oy + 37.2}" r="1.8" fill="#000"/><text x="${ox + 154}" y="${oy + 38.2}" font-size="2.6">bien</text>`);
    p.push(`<circle cx="${ox + 165}" cy="${oy + 37.2}" r="1.8" fill="none" stroke="#000" stroke-width=".3"/><path d="M${ox + 163.8} ${oy + 36} l2.4 2.4 m0 -2.4 l-2.4 2.4" stroke="#000" stroke-width=".3"/><text x="${ox + 169}" y="${oy + 38.2}" font-size="2.6">mal</text>`);

    L.headers.forEach((h) => p.push(`<text x="${ox + h.x}" y="${oy + h.y + 1.1}" font-size="3.4" font-weight="700" text-anchor="middle">${h.opt}</text>`));
    const rowsDrawn = new Set();
    L.bubbles.forEach((b) => {
      const rowKey = b.q;
      if (b.o === 0 && !rowsDrawn.has(rowKey) && (b.q % L.rows) % 2 === 1) {
        p.push(`<rect x="${ox + b.x - FIRST_OPT_X + 0.5}" y="${oy + b.y - ROW_PITCH / 2}" width="${L.pitch - 1}" height="${ROW_PITCH}" fill="#f4f4f4"/>`);
      }
      rowsDrawn.add(rowKey);
    });
    L.labels.forEach((l) => p.push(`<text x="${ox + l.x}" y="${oy + l.y + 1.2}" font-size="3.4" font-weight="700" text-anchor="end">${l.q + 1}</text>`));
    L.bubbles.forEach((b) => {
      p.push(`<circle cx="${ox + b.x}" cy="${oy + b.y}" r="${L.r}" fill="none" stroke="#000" stroke-width=".35"/>`);
      p.push(`<text x="${ox + b.x}" y="${oy + b.y + 0.95}" font-size="2.6" fill="#cfcfcf" text-anchor="middle">${b.opt}</text>`);
    });
    p.push('</svg>');
    return p.join('');
  }

  // ---------- Lector ----------
  function toGray(img) {
    const { data, width: w, height: h } = img;
    const g = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) g[i] = (data[j] * 77 + data[j + 1] * 150 + data[j + 2] * 29) >> 8;
    return g;
  }

  function blur3(g, w, h) {
    const t = new Uint8Array(g.length), o = new Uint8Array(g.length);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; t[i] = (g[x > 0 ? i - 1 : i] + g[i] + g[x < w - 1 ? i + 1 : i]) / 3; }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = y * w + x; o[i] = (t[y > 0 ? i - w : i] + t[i] + t[y < h - 1 ? i + w : i]) / 3; }
    return o;
  }

  // "Oscuro" = bastante más oscuro que su vecindario: aguanta sombras y luz despareja.
  function binarize(g, w, h, win, T) {
    const W = w + 1;
    const I = new Float64Array(W * (h + 1));
    for (let y = 1; y <= h; y++) {
      let row = 0;
      for (let x = 1; x <= w; x++) {
        row += g[(y - 1) * w + (x - 1)];
        I[y * W + x] = I[(y - 1) * W + x] + row;
      }
    }
    const out = new Uint8Array(w * h);
    const r = win >> 1;
    for (let y = 0; y < h; y++) {
      const y0 = Math.max(0, y - r), y1 = Math.min(h - 1, y + r);
      for (let x = 0; x < w; x++) {
        const x0 = Math.max(0, x - r), x1 = Math.min(w - 1, x + r);
        const area = (x1 - x0 + 1) * (y1 - y0 + 1);
        const sum = I[(y1 + 1) * W + (x1 + 1)] - I[y0 * W + (x1 + 1)] - I[(y1 + 1) * W + x0] + I[y0 * W + x0];
        out[y * w + x] = g[y * w + x] < sum / area - T ? 1 : 0;
      }
    }
    return out;
  }

  function components(bin, w, h, minA, maxA) {
    const seen = new Uint8Array(w * h);
    const stack = new Int32Array(w * h);
    const comps = [];
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        if (!bin[idx] || seen[idx]) continue;
        let sp = 0;
        stack[sp++] = idx; seen[idx] = 1;
        let area = 0, sx = 0, sy = 0, minx = x, maxx = x, miny = y, maxy = y;
        while (sp) {
          const pI = stack[--sp];
          const px = pI % w, py = (pI / w) | 0;
          area++; sx += px; sy += py;
          if (px < minx) minx = px; if (px > maxx) maxx = px;
          if (py < miny) miny = py; if (py > maxy) maxy = py;
          if (px > 0 && bin[pI - 1] && !seen[pI - 1]) { seen[pI - 1] = 1; stack[sp++] = pI - 1; }
          if (px < w - 1 && bin[pI + 1] && !seen[pI + 1]) { seen[pI + 1] = 1; stack[sp++] = pI + 1; }
          if (py > 0 && bin[pI - w] && !seen[pI - w]) { seen[pI - w] = 1; stack[sp++] = pI - w; }
          if (py < h - 1 && bin[pI + w] && !seen[pI + w]) { seen[pI + w] = 1; stack[sp++] = pI + w; }
        }
        if (area >= minA && area <= maxA) comps.push({ area, cx: sx / area, cy: sy / area, minx, maxx, miny, maxy });
      }
    }
    return comps;
  }

  // Las marcas son cuadrados negros; girados pocos grados ya no llenan su caja
  // (a 10° ~75 %), así que el filtro individual es laxo y la decisión final la
  // toma la GEOMETRÍA del cuarteto: proporción de la hoja, lados opuestos
  // parecidos y marcas del mismo tamaño.
  function findMarkers(comps, w, h) {
    const minS = 0.012 * w, maxS = 0.09 * w;
    const cand = comps.filter((c) => {
      const bw = c.maxx - c.minx + 1, bh = c.maxy - c.miny + 1;
      const ar = bw / bh, fill = c.area / (bw * bh);
      return ar > 0.6 && ar < 1.65 && fill > 0.6 && bw >= minS && bw <= maxS &&
        c.minx > 1 && c.miny > 1 && c.maxx < w - 2 && c.maxy < h - 2;
    }).sort((a, b) => b.area - a.area).slice(0, 12);
    if (cand.length < 4) return null;

    const RATIO = SHEET.w / SHEET.h;
    const d = (p, q) => Math.hypot(p.cx - q.cx, p.cy - q.cy);
    let best = null;
    const n = cand.length;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) for (let k = j + 1; k < n; k++) for (let l = k + 1; l < n; l++) {
      const q = [cand[i], cand[j], cand[k], cand[l]];
      const areas = q.map((c) => c.area);
      const spread = Math.max(...areas) / Math.min(...areas);
      if (spread > 2.2) continue;
      const by = (f, dir) => q.reduce((m, c) => (dir * f(c) > dir * f(m) ? c : m));
      const tl = by((c) => c.cx + c.cy, -1), br = by((c) => c.cx + c.cy, 1);
      const tr = by((c) => c.cx - c.cy, 1), bl = by((c) => c.cx - c.cy, -1);
      if (new Set([tl, tr, bl, br]).size !== 4) continue;
      const top = d(tl, tr), bot = d(bl, br), left = d(tl, bl), right = d(tr, br);
      const ratio = (top + bot) / (left + right);
      const area = 0.5 * Math.abs((tr.cx - tl.cx) * (bl.cy - tl.cy) - (bl.cx - tl.cx) * (tr.cy - tl.cy)) +
                   0.5 * Math.abs((tr.cx - br.cx) * (bl.cy - br.cy) - (bl.cx - br.cx) * (tr.cy - br.cy));
      if (area < 0.12 * w * h) continue;
      const score = Math.abs(ratio - RATIO) / RATIO + Math.abs(Math.log(top / bot)) + Math.abs(Math.log(left / right)) + 0.3 * Math.log(spread);
      if (score > 0.6) continue;
      if (!best || score < best.score) best = { score, tl, tr, bl, br };
    }
    return best ? { tl: best.tl, tr: best.tr, bl: best.bl, br: best.br } : null;
  }

  // Homografía hoja(mm) -> imagen(px) a partir de las 4 marcas.
  function homography(src, dst) {
    const A = [], b = [];
    for (let i = 0; i < 4; i++) {
      const [x, y] = src[i], [u, v] = dst[i];
      A.push([x, y, 1, 0, 0, 0, -u * x, -u * y]); b.push(u);
      A.push([0, 0, 0, x, y, 1, -v * x, -v * y]); b.push(v);
    }
    const n = 8;
    for (let i = 0; i < n; i++) {
      let piv = i;
      for (let r = i + 1; r < n; r++) if (Math.abs(A[r][i]) > Math.abs(A[piv][i])) piv = r;
      [A[i], A[piv]] = [A[piv], A[i]]; [b[i], b[piv]] = [b[piv], b[i]];
      for (let r = i + 1; r < n; r++) {
        const f = A[r][i] / A[i][i];
        for (let c = i; c < n; c++) A[r][c] -= f * A[i][c];
        b[r] -= f * b[i];
      }
    }
    const h = new Array(n);
    for (let i = n - 1; i >= 0; i--) {
      let s = b[i];
      for (let c = i + 1; c < n; c++) s -= A[i][c] * h[c];
      h[i] = s / A[i][i];
    }
    return (x, y) => {
      const d = h[6] * x + h[7] * y + 1;
      return [(h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d];
    };
  }

  const THRESH = { marked: 0.4, gap: 0.25 };

  function readBubbles(bin, w, h, project, L) {
    const dark = [];
    const centers = [];
    for (let q = 0; q < L.n; q++) dark.push([0, 0, 0, 0, 0]);
    L.bubbles.forEach((b) => {
      const [cx, cy] = project(b.x, b.y);
      const [ex, ey] = project(b.x + L.r, b.y);
      const rpx = Math.hypot(ex - cx, ey - cy);
      const rr = Math.max(2, rpx * 0.7);
      let on = 0, total = 0;
      for (let y = Math.floor(cy - rr); y <= Math.ceil(cy + rr); y++) {
        if (y < 0 || y >= h) continue;
        for (let x = Math.floor(cx - rr); x <= Math.ceil(cx + rr); x++) {
          if (x < 0 || x >= w) continue;
          if ((x - cx) ** 2 + (y - cy) ** 2 > rr * rr) continue;
          total++; if (bin[y * w + x]) on++;
        }
      }
      dark[b.q][b.o] = total ? on / total : 0;
      centers.push({ q: b.q, o: b.o, x: cx, y: cy, r: rpx });
    });
    return { dark, centers };
  }

  function decide(d) {
    const idx = [0, 1, 2, 3, 4].sort((a, b) => d[b] - d[a]);
    const d1 = d[idx[0]], d2 = d[idx[1]];
    if (d1 < THRESH.marked) return { ans: null, doubt: d1 > 0.22 };
    if (d2 >= THRESH.marked && d1 - d2 < THRESH.gap) return { ans: '*', doubt: true };
    return { ans: OPTIONS[idx[0]], doubt: d1 < 0.5 || d2 > 0.28 };
  }

  /** imageData: {data,width,height} RGBA. Devuelve { ok, answers[], doubts[], dark[][], centers[], size } */
  function scanImageData(img, n) {
    const L = layout(n);
    const { width: w, height: h } = img;
    const gray = blur3(toGray(img), w, h);
    const win = Math.max(25, Math.round(Math.min(w, h) / 8)) | 1;
    const bin = binarize(gray, w, h, win, 30);
    const comps = components(bin, w, h, 25, w * h * 0.02);
    const m = findMarkers(comps, w, h);
    if (!m) return { ok: false, error: 'No se ven las 4 marcas negras de las esquinas. Aleja un poco el celular y que entre toda la hoja, con buena luz.', size: { w, h } };

    const project = homography(
      [[0, 0], [SHEET.w, 0], [0, SHEET.h], [SHEET.w, SHEET.h]],
      [[m.tl.cx, m.tl.cy], [m.tr.cx, m.tr.cy], [m.bl.cx, m.bl.cy], [m.br.cx, m.br.cy]]
    );
    const { dark, centers } = readBubbles(bin, w, h, project, L);
    const decided = dark.map(decide);
    return {
      ok: true,
      n: L.n,
      answers: decided.map((x) => x.ans),
      doubts: decided.map((x) => x.doubt),
      dark, centers,
      markers: [m.tl, m.tr, m.bl, m.br].map((c) => ({ x: c.cx, y: c.cy })),
      size: { w, h },
    };
  }

  /** Acepta canvas / img / video; reduce a ~1100 px antes de analizar. */
  function scanSource(src, n, maxSide = 1100) {
    const sw = src.videoWidth || src.naturalWidth || src.width;
    const sh = src.videoHeight || src.naturalHeight || src.height;
    const k = Math.min(1, maxSide / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, c.width, c.height);
    return scanImageData(ctx.getImageData(0, 0, c.width, c.height), n);
  }

  function parseKey(text, n) {
    const letters = String(text || '').toUpperCase().replace(/[^A-E]/g, '').split('');
    return Array.from({ length: n }, (_, i) => letters[i] || null);
  }

  function grade(answers, key) {
    let correct = 0, wrong = 0, blank = 0, multiple = 0, keyed = 0;
    answers.forEach((a, i) => {
      if (!key[i]) return;
      keyed++;
      if (a === null) blank++;
      else if (a === '*') multiple++;
      else if (a === key[i]) correct++;
      else wrong++;
    });
    return { correct, wrong, blank, multiple, total: keyed, percent: keyed ? Math.round((correct / keyed) * 1000) / 10 : 0 };
  }

  global.OMR = { _int: { toGray, binarize, components, findMarkers }, PAGE, SHEET, OPTIONS, MAX_QUESTIONS, layout, svgSheet, scanImageData, scanSource, parseKey, grade, THRESH };
})(typeof window !== 'undefined' ? window : globalThis);
