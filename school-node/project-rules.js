// Reglas de un proyecto subido desde el nodo escolar. Son las mismas que aplica la
// nube (js/project-modals.js: título, descripción, bimestre, un archivo de hasta
// 150 MB que es video o modelo 3D); la nube las vuelve a validar al sincronizar.

export const PROJECT_LIMITS = {
  titleMin: 5, titleMax: 120,
  descMin: 40, descMax: 2000,
  maxBytes: 150 * 1024 * 1024,
  maxPendingPerStudent: 5,
  minFreeDiskMB: 2048,
  keepSyncedDays: 7,
};

const FILE_TYPES = {
  mp4: ['video', 'video/mp4'], mov: ['video', 'video/quicktime'], m4v: ['video', 'video/x-m4v'],
  webm: ['video', 'video/webm'], '3gp': ['video', 'video/3gpp'], avi: ['video', 'video/x-msvideo'], mkv: ['video', 'video/x-matroska'],
  stl: ['model3d', 'model/stl'], obj: ['model3d', 'model/obj'], glb: ['model3d', 'model/gltf-binary'],
};

export function classifyFile(filename) {
  const name = String(filename ?? '');
  const dot = name.lastIndexOf('.');
  if (dot < 1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  const found = Object.prototype.hasOwnProperty.call(FILE_TYPES, ext) ? FILE_TYPES[ext] : null;
  return found ? { kind: found[0], ext, mime: found[1] } : null;
}

// Caracteres de control a espacio y espacios repetidos a uno. El HTML NO se toca: la app lo muestra siempre escapado.
const clean = (v) => String(v ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/ {2,}/g, ' ').trim();
const fail = (error) => ({ ok: false, error });

/**
 * @param input { title, description, bimestre, group_id?, filename, size }
 * @param ctx   { memberGroupIds: number[], maxBytes?: number }
 */
export function validateProjectDraft(input, ctx = {}) {
  const L = PROJECT_LIMITS;
  const title = clean(input?.title);
  if (title.length < L.titleMin || title.length > L.titleMax) return fail(`El título debe tener entre ${L.titleMin} y ${L.titleMax} caracteres.`);

  const description = clean(input?.description);
  if (description.length < L.descMin || description.length > L.descMax) return fail(`La descripción debe tener entre ${L.descMin} y ${L.descMax} caracteres.`);

  const bimestre = typeof input?.bimestre === 'number' || (typeof input?.bimestre === 'string' && input.bimestre.trim() !== '') ? Number(input.bimestre) : NaN;
  if (!Number.isInteger(bimestre) || bimestre < 1 || bimestre > 4) return fail('El bimestre debe ser de 1 a 4.');

  const file = classifyFile(input?.filename);
  if (!file) return fail('El archivo debe ser un video (mp4, mov, m4v, webm, 3gp, avi, mkv) o un modelo 3D (stl, obj, glb).');

  const maxBytes = ctx.maxBytes ?? L.maxBytes;
  const size = input?.size;
  if (typeof size !== 'number' || !Number.isInteger(size) || size < 1 || size > maxBytes) return fail('El archivo debe pesar entre 1 byte y 150 MB.');

  let group_id = null;
  if (input?.group_id !== undefined && input.group_id !== null && input.group_id !== '') {
    group_id = Number(input.group_id);
    if (!Number.isInteger(group_id) || !(ctx.memberGroupIds || []).includes(group_id)) return fail('Ese equipo no es tuyo.');
  }

  return { ok: true, value: { title, description, bimestre, group_id, kind: file.kind, ext: file.ext, mime: file.mime, size } };
}
