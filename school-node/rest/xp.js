// XP del estudiante en la capa local. La nube es la única que escribe XP y gemas: el nodo guarda lo que el estudiante
// ganó aquí (lecciones completadas, cofre diario) en xp_events_local y se lo suma a la base que bajó la sincronización,
// así lo ve al instante. Al sincronizar la nube lo confirma y su base nueva ya lo incluye (ver ../xp.js clearSent).
import { RestError } from './query.js';
import { CHEST_PRIZES, XP_PER_LESSON } from '../xp.js';

export function createRestXp({ db, store, now = Date.now, random = Math.random }) {
  // Guatemala no cambia de hora: UTC-6 todo el año (mismo día que usa la nube para el cofre).
  const today = () => new Date(now() - 6 * 3600_000).toISOString().slice(0, 10);
  const insert = db.prepare('INSERT OR IGNORE INTO xp_events_local (student_id, kind, ref, xp, gems, created_at) VALUES (?, ?, ?, ?, ?, ?)');
  const pending = db.prepare(`SELECT student_id, IFNULL(SUM(xp), 0) AS xp, IFNULL(SUM(gems), 0) AS gems,
    MAX(CASE WHEN kind = 'chest' THEN ref END) AS chest FROM xp_events_local GROUP BY student_id`);

  return {
    /** Mapeador de filas de `students` con lo pendiente sumado (se usa como vista de lectura del almacén). */
    overlay() {
      const byStudent = new Map(pending.all().map((r) => [r.student_id, r]));
      return (row) => {
        const p = byStudent.get(row.id);
        if (!p) return row;
        return {
          ...row,
          xp: (row.xp || 0) + p.xp,
          gems: (row.gems || 0) + p.gems,
          daily_chest_last_claimed: [row.daily_chest_last_claimed, p.chest].filter(Boolean).sort().pop() ?? null,
        };
      };
    },

    /** Anota los 10 XP de una lección. false si ya estaba anotada. */
    recordLesson(studentId, lessonId) {
      return insert.run(studentId, 'lesson', String(lessonId), XP_PER_LESSON, 0, new Date(now()).toISOString()).changes > 0;
    },

    /** Sortea y anota el cofre de hoy (los mismos tres premios que la nube). Error 400 si ya se reclamó. */
    claimChest(studentId) {
      const row = store.all('students').find((s) => s.id === studentId);
      if (!row) throw new RestError(400, 'Usuario no encontrado', 'P0001');
      const last = row.daily_chest_last_claimed;
      if (last && String(last).slice(0, 10) >= today()) throw new RestError(400, 'Ya reclamaste el cofre de hoy', 'P0001');
      const prize = CHEST_PRIZES[Math.min(CHEST_PRIZES.length - 1, Math.floor(random() * CHEST_PRIZES.length))];
      if (insert.run(studentId, 'chest', today(), prize.xp, prize.gems, new Date(now()).toISOString()).changes === 0) {
        throw new RestError(400, 'Ya reclamaste el cofre de hoy', 'P0001');
      }
      return { xp: prize.xp, gems: prize.gems, msg: prize.msg };
    },
  };
}
