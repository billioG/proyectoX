// Buzón sin internet: las funciones get_feedback_inbox y get_my_ratings de la nube (migrations/feedback-inbox.sql) calculadas con la réplica. Las mismas reglas:
//   * administrador: todo, con el nombre de quien lo escribió y el docente evaluado;
//   * docente: las evaluaciones que recibió y las sugerencias de los estudiantes de SUS clases, ANÓNIMAS (ni id ni nombre de quien escribió);
//   * estudiante: nada (lo suyo lo lee por las tablas).
// El anonimato es real: la política de lectura del nodo (policies.js) tampoco deja al docente leer las tablas directo.
const DAY = 24 * 3600_000;
const LIMIT = 500;
const asMs = (iso) => { const s = String(iso ?? ''); const t = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(s) ? s : `${s}Z`); return Number.isFinite(t) ? t : 0; };
const strip = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

export function createInbox({ store, now = Date.now }) {
  return {
    inbox(args, ctx) {
      if (!ctx?.uid) throw Object.assign(new Error('No autenticado'), { status: 400, code: 'P0001' });
      const admin = ctx.role === 'admin';
      const staff = admin || ctx.role === 'teacher';
      const days = Math.max(1, Math.min(Number.isFinite(Number(args?.p_days)) ? Math.trunc(Number(args.p_days)) : 365, 3650));
      const since = now() - days * DAY;
      const school = args?.p_school ?? null;
      const students = new Map(store.raw('students').map((s) => [s.id, s]));
      const teachers = new Map(store.raw('teachers').map((t) => [t.id, t]));
      const schools = new Map(store.raw('schools').map((s) => [s.code, s.name]));
      const mine = store.raw('teacher_assignments').filter((a) => a.teacher_id === ctx.uid);
      const inMyClasses = (st) => mine.some((a) => a.school_code === st.school_code && a.grade === st.grade && a.section === st.section);
      const where = (st) => ({ school_code: st.school_code, school_name: schools.get(st.school_code) ?? null, grade: st.grade, section: st.section });

      const suggestions = !staff ? [] : store.raw('student_suggestions').flatMap((g) => {
        const st = students.get(g.student_id);
        if (!st || asMs(g.created_at) < since || (school && st.school_code !== school) || !(admin || inMyClasses(st))) return [];
        return [strip({ id: g.id, message: g.message, created_at: g.created_at, rating: g.rating, ...where(st), student_name: admin ? st.full_name : null })];
      });
      const ratings = !staff ? [] : store.raw('teacher_ratings').flatMap((r) => {
        const st = students.get(r.student_id);
        if (!st || asMs(r.created_at) < since || (school && st.school_code !== school) || !(admin || r.teacher_id === ctx.uid)) return [];
        return [strip({
          id: r.id, rating: r.rating, message: r.message, best_moment: r.best_moment, created_at: r.created_at,
          q_interest: r.q_interest, q_practice: r.q_practice, q_resources: r.q_resources, q_respect: r.q_respect, q_clarity: r.q_clarity,
          ...where(st), teacher_name: admin ? teachers.get(r.teacher_id)?.full_name ?? null : null, student_name: admin ? st.full_name : null,
        })];
      });
      const newest = (a, b) => asMs(b.created_at) - asMs(a.created_at);
      return { role: admin ? 'admin' : 'teacher', suggestions: suggestions.sort(newest).slice(0, LIMIT), ratings: ratings.sort(newest).slice(0, LIMIT) };
    },

    /** Las notas que recibió el docente (solo la nota), para el promedio de su perfil. */
    myRatings(args, ctx) {
      return store.raw('teacher_ratings').filter((r) => r.teacher_id === ctx?.uid).map((r) => ({ rating: r.rating }));
    },
  };
}
