// La capa local compatible con Supabase, armada: almacén + XP pendiente + acceso + funciones emuladas + rutas HTTP.
// Una sola instancia por base de datos (ver restStoreFor): el servidor y la sincronización comparten la misma caché.
import { restStoreFor } from './store.js';
import { SCHEMA } from './schema.js';
import { createAuth } from './auth.js';
import { createRestXp } from './xp.js';
import { createRpcs } from './rpcs.js';
import { createRestRoutes } from './routes.js';
import { createPhotos } from './photos.js';

export function createRestLayer(db, { now = Date.now, random = Math.random, onChange = () => {} } = {}) {
  const store = restStoreFor(db, SCHEMA);
  const xp = createRestXp({ db, store, now, random });
  // Fotos de perfil ya descargadas: salen con la dirección local (si no, la de la nube, que sin internet no carga).
  const photos = createPhotos({ db });
  store.setView('students', () => { const xpRow = xp.overlay(); const photo = photos.mapper(); return (row) => photo(xpRow(row)); });
  store.setView('teachers', () => photos.mapper());
  // Los archivos de los cursos ya están en el nodo (data/content): la dirección de la nube (storage_base) se cambia por la local.
  // Sin esto la app pediría los videos y PDF a la nube y sin internet no cargarían.
  const storageBase = db.prepare("SELECT value FROM meta WHERE key = 'storage_base'");
  store.setView('lessons', () => {
    const base = storageBase.get()?.value;
    if (!base) return (row) => row;
    return (row) => (typeof row.content_url === 'string' && row.content_url.startsWith(base) ? { ...row, content_url: `/content/${row.content_url.slice(base.length)}` } : row);
  });
  const auth = createAuth({ store, now });
  const rpcs = createRpcs({ store, xp, now });
  const routes = createRestRoutes({
    store, auth, rpcs,
    // Una lección que se completa por primera vez paga XP (en la nube lo hace un disparador de lesson_completions).
    onChange: (changes = []) => {
      for (const c of changes) {
        if (c.table !== 'lesson_completions' || c.op === 'delete' || c.row.status !== 'completed') continue;
        if (c.op === 'update' && c.old?.status === 'completed') continue;
        xp.recordLesson(c.row.student_id, c.row.lesson_id);
      }
      onChange(changes);
    },
  });
  // La app real solo se monta sobre la capa si TODOS los estudiantes activos pueden entrar (su clase tiene contraseña conocida);
  // si no, los de esa clase se quedarían sin acceso y es mejor el modo anterior (pantalla propia con PIN) para toda la escuela.
  // Clases (con estudiantes activos) que no tienen contraseña de clase conocida: sus estudiantes no podrían entrar.
  const missingClasses = () => {
    const missing = new Map();
    for (const st of store.all('students')) {
      if (st.status === 'egresado' || st.status === 'baja') continue;
      if (!store.classVerifier(`${st.school_code}|${st.grade}|${st.section}`)) missing.set(`${st.grade} ${st.section}`, true);
    }
    return [...missing.keys()].sort((a, b) => a.localeCompare(b, 'es'));
  };
  const ready = () => {
    if (store.verifierCount() === 0) return false;
    const active = store.all('students').filter((s) => s.status !== 'egresado' && s.status !== 'baja');
    return active.length > 0 && active.every((s) => store.classVerifier(`${s.school_code}|${s.grade}|${s.section}`));
  };
  return { store, auth, xp, rpcs, routes, ready, missingClasses };
}
