// PIN personal de cada docente en el nodo escolar. La lista de docentes y sus clases la baja la sincronización
// (tabla teachers); el PIN (6 números) vive SOLO en este nodo, con hash y sal, y nunca se sube a la nube.
// La primera vez, para crear el PIN, hace falta el código de docente del nodo (config.teacherCode): así nadie
// puede adueñarse del nombre de otro docente. Tras 5 intentos fallidos se bloquea 5 minutos.

const MAX_ATTEMPTS = 5;
const LOCK_MS = 5 * 60 * 1000;

export class TeacherAuthError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'TeacherAuthError';
    this.status = status;
  }
}

/**
 * @param db   base SQLite del nodo
 * @param opts { now?, hashPin(pin, saltHex), verifySetupCode(code) -> boolean }
 */
export function createTeacherStore(db, { now = Date.now, hashPin, verifySetupCode }) {
  const row = (id) => db.prepare('SELECT * FROM teachers WHERE id = ?').get(id);
  const fail = (t) => {
    const attempts = t.failed_attempts + 1;
    db.prepare('UPDATE teachers SET failed_attempts = ?, locked_until = ? WHERE id = ?')
      .run(attempts >= MAX_ATTEMPTS ? 0 : attempts, attempts >= MAX_ATTEMPTS ? now() + LOCK_MS : 0, t.id);
  };

  return {
    /** Docentes para elegir su nombre: sin datos sensibles. */
    list() {
      return db.prepare('SELECT id, full_name, pin_hash FROM teachers ORDER BY full_name').all()
        .map(t => ({ id: t.id, full_name: t.full_name, has_pin: !!t.pin_hash }));
    },

    /** El docente con sus clases (assignments ya como lista), o null. */
    get(id) {
      const t = row(id);
      if (!t) return null;
      let assignments = [];
      try { assignments = JSON.parse(t.assignments || '[]'); } catch { /* sin clases */ }
      return { ...t, assignments };
    },

    /**
     * Entra con el PIN. Si el docente aún no tiene PIN, este mismo pedido lo crea, pero solo con el código de docente
     * del nodo. Devuelve { teacher, created }; lanza TeacherAuthError (400 formato, 403 código, 404, 401, 429).
     */
    login(teacherId, pin, setupCode) {
      const t = row(teacherId);
      if (!t) throw new TeacherAuthError(404, 'Docente no encontrado.');
      if (!/^\d{6}$/.test(String(pin ?? ''))) throw new TeacherAuthError(400, 'El PIN son 6 números.');
      if (t.locked_until > now()) {
        const mins = Math.ceil((t.locked_until - now()) / 60000);
        throw new TeacherAuthError(429, `Demasiados intentos. Espera ${mins} minuto(s) o pide ayuda a quien administra el nodo.`);
      }

      let created = false;
      if (!t.pin_hash) {
        if (!verifySetupCode(setupCode)) {
          fail(t);
          throw new TeacherAuthError(403, 'Para crear tu PIN escribe el código de docente de esta escuela.');
        }
        const salt = Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, '0')).join('');
        db.prepare('UPDATE teachers SET pin_hash = ?, pin_salt = ?, pin_updated_at = ? WHERE id = ?')
          .run(hashPin(String(pin), salt), salt, new Date(now()).toISOString(), t.id);
        created = true;
      } else if (hashPin(String(pin), t.pin_salt) !== t.pin_hash) {
        fail(t);
        throw new TeacherAuthError(401, 'PIN incorrecto.');
      }
      db.prepare('UPDATE teachers SET failed_attempts = 0, locked_until = 0 WHERE id = ?').run(t.id);
      return { teacher: this.get(t.id), created };
    },

    /** Borra el PIN y desbloquea (lo pide quien administra el nodo con el código de docente). */
    resetPin(teacherId) {
      return db.prepare('UPDATE teachers SET pin_hash = NULL, pin_salt = NULL, pin_updated_at = NULL, failed_attempts = 0, locked_until = 0 WHERE id = ?')
        .run(teacherId).changes > 0;
    },
  };
}
