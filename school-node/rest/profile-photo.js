// Cambio de foto de perfil en la capa local: la función claim_first_profile_photo_reward de la nube (migrations/economy-server-side.sql) hecha sin internet. La foto ya está guardada en el
// servidor (profile-photos.js); aquí se valida que sea del propio usuario, se anota el cambio en la bandeja (_rpc, uno por usuario: el último gana) y se muestra al instante en
// `students` / `teachers` junto con el premio de la primera foto (+100 XP y +25 gemas, igual que la nube). La nube lo aplica al sincronizar, cuando la imagen ya llegó a Storage
// (apply_node_profile_photo, migrations/node-profile-photo.sql); lo que baje de la nube reemplaza a lo anotado aquí.
import { RestError } from './query.js';
import { PHOTO_PUBLIC, validPhotoName } from '../profile-photos.js';

export const PHOTO_FN = 'claim_first_profile_photo_reward';
export const PHOTO_XP = 100;
export const PHOTO_GEMS = 25;
const bad = (message) => new RestError(400, message, 'P0001');
export const localPhotoUrl = (name) => `/storage/v1/object/public/profile-photos/${name}`;

export function createProfilePhoto({ store, photoStore }) {
  const pending = () => store.pending().filter((e) => e.table === '_rpc' && e.op === PHOTO_FN && e.row?.student_id);
  const pendingOf = (uid) => pending().find((e) => e.row.student_id === uid)?.row.args || null;

  return {
    claim(args, ctx) {
      if (!ctx?.uid || !['student', 'teacher', 'admin'].includes(ctx.role)) throw bad('Usuario no encontrado');
      let name = '';
      try { name = decodeURIComponent(PHOTO_PUBLIC.exec(new URL(String(args?.p_photo_url ?? ''), 'http://nodo.local').pathname)?.[1] ?? ''); } catch { name = ''; }
      const rec = name ? photoStore.record(name) : null;
      if (!validPhotoName(name, ctx.uid) || !rec || rec.uid !== ctx.uid || !photoStore.exists(name)) throw bad('La foto no se subió en este servidor. Súbela de nuevo.');
      // «Primera foto»: con lo que ve el usuario ahora (incluida una foto cambiada aquí que aún no sube), no con la memoria del navegador.
      const me = store.all(ctx.role === 'student' ? 'students' : 'teachers').find((r) => r.id === ctx.uid);
      if (!me) throw bad('Usuario no encontrado');
      const first = !me.profile_photo_url;
      const carried = pendingOf(ctx.uid)?.rewarded === true;
      store.replacePendingRpc(PHOTO_FN, `photo:${ctx.uid}`, { student_id: ctx.uid, args: { p_name: name, rewarded: carried || first } });
      return first ? { rewarded: true, xp: PHOTO_XP, gems: PHOTO_GEMS } : { rewarded: false };
    },

    /** Vista de `students` / `teachers`: la foto cambiada aquí (y el premio de la primera) mientras la nube no confirma. */
    overlay() {
      const byUid = new Map(pending().map((e) => [e.row.student_id, e.row.args]));
      if (!byUid.size) return (row) => row;
      return (row) => {
        const a = byUid.get(row.id);
        if (!a?.p_name) return row;
        const out = { ...row, profile_photo_url: localPhotoUrl(a.p_name) };
        if (a.rewarded) { out.xp = (Number(row.xp) || 0) + PHOTO_XP; out.gems = (Number(row.gems) || 0) + PHOTO_GEMS; }
        return out;
      };
    },
  };
}
