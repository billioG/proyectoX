// XP del estudiante en el nodo escolar. La nube es la única que escribe XP/gemas; el nodo solo
//  - guarda la última base que bajó la sincronización (xp_total, gems, daily_chest_last_claimed, dentro de students.extra),
//  - registra eventos pendientes (xp_events_local): la lección completada (la nube la paga sola al recibir el
//    progreso) y el cofre diario, que el nodo sortea y la nube valida al sincronizar,
// y muestra base + pendientes. Tras un sync exitoso los pendientes enviados se borran, porque la base nueva ya los incluye.

export const XP_PER_LESSON = 10;
// Mismos tres premios que claim_daily_chest y que supabase/functions/node-sync/xp.ts.
const CHEST_PRIZES = [
  { xp: 20, gems: 5, msg: 'Poquito pero bendito' },
  { xp: 50, gems: 15, msg: '¡Nada mal!' },
  { xp: 100, gems: 50, msg: '¡Premio Mayor!' },
];
const XP_PER_LEVEL = 500;

class XpError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'XpError';
    this.status = status;
  }
}

/**
 * @param db   base SQLite del nodo
 * @param opts { now?: () => number, random?: () => number }
 */
export function createXpStore(db, { now = Date.now, random = Math.random } = {}) {
  // Guatemala no cambia de hora: UTC-6 todo el año.
  const today = () => new Date(now() - 6 * 3600_000).toISOString().slice(0, 10);
  const baseOf = (student) => { try { return JSON.parse(student?.extra || '{}'); } catch { return {}; } };

  function summary(student) {
    const base = baseOf(student);
    const pending = db.prepare("SELECT IFNULL(SUM(xp), 0) xp, IFNULL(SUM(gems), 0) gems FROM xp_events_local WHERE student_id = ?").get(student.id);
    const lastLocalChest = db.prepare("SELECT MAX(ref) ref FROM xp_events_local WHERE student_id = ? AND kind = 'chest'").get(student.id).ref;
    const last = [base.daily_chest_last_claimed, lastLocalChest].filter(Boolean).sort().pop() || null;
    const xpTotal = Number(base.xp_total) || 0;
    const gems = Number(base.gems) || 0;
    const xp = xpTotal + pending.xp;
    const day = today();
    return {
      xp_total: xpTotal, gems, xp_pending: pending.xp, gems_pending: pending.gems,
      xp, gems_total: gems + pending.gems,
      level: Math.floor(xp / XP_PER_LEVEL) + 1, level_xp: xp % XP_PER_LEVEL, xp_per_level: XP_PER_LEVEL,
      chest_available: !last || last < day,
      today: day,
      has_base: base.xp_total !== undefined,
    };
  }

  return {
    summary,

    /** Anota los 10 XP de una lección. false si ya estaba anotada. */
    recordLesson(studentId, lessonId) {
      const r = db.prepare(`INSERT OR IGNORE INTO xp_events_local (student_id, kind, ref, xp, gems, created_at) VALUES (?, 'lesson', ?, ?, 0, ?)`)
        .run(studentId, String(lessonId), XP_PER_LESSON, new Date(now()).toISOString());
      return r.changes > 0;
    },

    /** Sortea y anota el cofre de hoy. Lanza XpError 409 si ya se reclamó. */
    claimChest(student) {
      if (!summary(student).chest_available) throw new XpError(409, 'Ya reclamaste el cofre de hoy.');
      const prize = CHEST_PRIZES[Math.min(CHEST_PRIZES.length - 1, Math.floor(random() * CHEST_PRIZES.length))];
      const r = db.prepare(`INSERT OR IGNORE INTO xp_events_local (student_id, kind, ref, xp, gems, created_at) VALUES (?, 'chest', ?, ?, ?, ?)`)
        .run(student.id, today(), prize.xp, prize.gems, new Date(now()).toISOString());
      if (r.changes === 0) throw new XpError(409, 'Ya reclamaste el cofre de hoy.');
      return { xp: prize.xp, gems: prize.gems, msg: prize.msg };
    },

    /** Cofres que faltan por mandar a la nube. */
    pendingChests() {
      return db.prepare("SELECT kind, student_id, ref, xp, gems FROM xp_events_local WHERE kind = 'chest' ORDER BY id").all().map(r => ({ ...r }));
    },

    /**
     * Borra lo que ya se mandó y la nube resolvió. Los cofres solo se borran si la nube los confirmó
     * (`applied` = claves "estudiante|fecha" de applied.xp_events) o los rechazó de forma definitiva
     * (`errors` con permanent: true); un error pasajero, o una función de la nube anterior que no responde
     * applied.xp_events, deja el cofre para reintentarlo en el próximo sync (el estudiante no ve bajar su XP).
     * Una lección cuyo progreso volvió a quedar sucio mientras se sincronizaba conserva su evento.
     */
    clearSent(pushedEvents = [], pushedCompletions = [], { applied, errors } = {}) {
      const delChest = db.prepare("DELETE FROM xp_events_local WHERE kind = 'chest' AND student_id = ? AND ref = ?");
      if (Array.isArray(applied)) {
        const done = new Set(applied);
        for (const e of (Array.isArray(errors) ? errors : [])) if (e && e.permanent === true) done.add(`${e.student_id}|${e.ref}`);
        for (const e of pushedEvents) if (done.has(`${e.student_id}|${e.ref}`)) delChest.run(e.student_id, e.ref);
      }
      const delLesson = db.prepare(`DELETE FROM xp_events_local WHERE kind = 'lesson' AND student_id = ? AND ref = ?
        AND NOT EXISTS (SELECT 1 FROM completions c WHERE c.lesson_id = xp_events_local.ref AND c.student_id = xp_events_local.student_id AND c.dirty = 1)`);
      for (const c of pushedCompletions) delLesson.run(c.student_id, String(c.lesson_id));
    },
  };
}
