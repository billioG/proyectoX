// La capa local compatible con Supabase, armada: almacén + XP pendiente + acceso + funciones emuladas + rutas HTTP.
// Una sola instancia por base de datos (ver restStoreFor): el servidor y la sincronización comparten la misma caché.
import { restStoreFor } from './store.js';
import { SCHEMA } from './schema.js';
import { createAuth } from './auth.js';
import { createRestXp } from './xp.js';
import { createRpcs } from './rpcs.js';
import { createRestRoutes } from './routes.js';

export function createRestLayer(db, { now = Date.now, random = Math.random, onChange = () => {} } = {}) {
  const store = restStoreFor(db, SCHEMA);
  const xp = createRestXp({ db, store, now, random });
  store.setView('students', () => xp.overlay());
  const auth = createAuth({ store, now });
  const rpcs = createRpcs({ store, xp });
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
  const ready = () => {
    if (store.verifierCount() === 0) return false;
    const active = store.all('students').filter((s) => s.status !== 'egresado' && s.status !== 'baja');
    return active.length > 0 && active.every((s) => store.classVerifier(`${s.school_code}|${s.grade}|${s.section}`));
  };
  return { store, auth, xp, rpcs, routes, ready };
}
