// La capa local compatible con Supabase, armada: almacén + XP pendiente + acceso + funciones emuladas + rutas HTTP.
// Una sola instancia por base de datos (ver restStoreFor): el servidor y la sincronización comparten la misma caché.
import { restStoreFor } from './store.js';
import { SCHEMA } from './schema.js';
import { createAuth } from './auth.js';
import { createRestXp } from './xp.js';
import { createRpcs } from './rpcs.js';
import { createRestRoutes } from './routes.js';
import { createPhotos } from './photos.js';
import { createReactionStore } from '../reactions.js';

// `projects`: { upload, pendingCount, register } del almacén de proyectos del nodo (server.js): el estudiante sube su proyecto con la app real.
export function createRestLayer(db, { now = Date.now, random = Math.random, onChange = () => {}, projects = null } = {}) {
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
    return (row) => {
      const url = row.content_url;
      if (typeof url !== 'string') return row;
      // Lo que bajó de la nube (storage_base) y lo que el docente subió aquí (la dirección del nodo, con el nombre o la IP que usó).
      if (base && url.startsWith(base)) return { ...row, content_url: `/content/${url.slice(base.length)}` };
      const m = /^https?:\/\/[^/]+\/storage\/v1\/object\/public\/course-content\/(lessons\/.+)$/.exec(url);
      return m ? { ...row, content_url: `/content/${m[1]}` } : row;
    };
  });
  const auth = createAuth({ store, now });
  const reactions = createReactionStore(db, { now });
  // Votos de cada proyecto con las reacciones pendientes de este nodo (para que todos vean el mismo número).
  store.setView('projects', () => {
    const pending = new Set(reactions.pending().map((r) => Number(r.project_id)));
    return pending.size ? (row) => (pending.has(Number(row.id)) ? { ...row, votes: reactions.adjustVotes(row.id, row.votes) } : row) : (row) => row;
  });
  const rpcs = createRpcs({ store, xp, now, reactions });
  const routes = createRestRoutes({
    store, auth, rpcs, projects,
    // Una lección que se completa por primera vez paga XP (en la nube lo hace un disparador de lesson_completions).
    onChange: (changes = []) => {
      for (const c of changes) {
        if (c.table === 'projects' && c.op === 'insert' && projects) { projects.register(c.row); continue; } // el archivo y los datos pasan al almacén de proyectos
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
