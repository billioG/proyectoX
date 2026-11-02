// Progreso de práctica (lectura, matemática, pensamiento, lenguaje) calculado EN EL NODO con las mismas cuentas que las funciones de la nube
// get_my_progress / get_group_progress / get_groups_progress (migrations/practice-progress.sql). Usa lo que bajó de la nube
// (`practice_results`, internas: la app no las lee directo) más la práctica que los estudiantes hicieron aquí y todavía no sube.
// Los retos entre estudiantes no existen sin internet: reto_n vale 0.
import { RestError } from './query.js';

const COMPETENCIES = ['lectura', 'matematica', 'pensamiento', 'lenguaje'];
const GAME_COMPETENCY = { quiz: 'lectura', timed_math: 'matematica', debug: 'pensamiento', hangman: 'lenguaje', spelling: 'lenguaje' };
const DAY = 24 * 3600_000;
const clamp = (v, lo, hi, dflt) => Math.max(lo, Math.min(Number.isFinite(Number(v)) ? Math.trunc(Number(v)) : dflt, hi));
const pct = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 100) : null);
const iso = (ms) => new Date(ms).toISOString();
const day = (ms) => iso(ms).slice(0, 10);
// Postgres date_trunc('week'): lunes a las 00:00 UTC.
const weekStart = (ms) => { const d = new Date(ms); return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); };
const forbidden = () => new RestError(400, 'No tenés acceso a este grupo', 'P0001');
const isTeacher = (ctx) => ctx?.role === 'teacher' || ctx?.role === 'admin';

export function createProgress({ store, now = Date.now }) {
  // Práctica ya guardada en la nube + la que se hizo aquí y está pendiente de subir.
  function plays(studentIds, sinceMs) {
    const ids = new Set(studentIds);
    const out = [];
    for (const r of store.all('practice_results')) {
      const t = Date.parse(r.played_at);
      if (ids.has(r.student_id) && t >= sinceMs && r.competency) out.push({ student_id: r.student_id, competency: r.competency, ok: Number(r.score), t });
    }
    for (const e of store.pending()) {
      if (e.table !== '_rpc' || e.op !== 'log_practice' || !ids.has(e.row?.student_id)) continue;
      const a = e.row.args || {};
      const t = Date.parse(a.p_played_at) || e.created_at;
      if (t >= sinceMs && GAME_COMPETENCY[a.p_game] && a.p_total > 0) out.push({ student_id: e.row.student_id, competency: GAME_COMPETENCY[a.p_game], ok: a.p_correct / a.p_total, t });
    }
    return out;
  }
  const roster = (school, grade, section) => store.all('students')
    .filter((s) => s.school_code === school && s.grade === grade && s.section === section && s.status !== 'baja' && s.status !== 'egresado');
  const canView = (ctx, school, grade, section) => ctx.role === 'admin'
    || store.all('teacher_assignments').some((a) => a.teacher_id === ctx.uid && a.school_code === school && a.grade === grade && a.section === section);
  const byComp = (list, c) => list.filter((p) => p.competency === c);

  return {
    /** Progreso de UN grupo (pantalla de Progreso del docente). */
    getGroupProgress(args, ctx) {
      if (!isTeacher(ctx)) throw forbidden();
      const { p_school: school, p_grade: grade, p_section: section } = args || {};
      if (!canView(ctx, school, grade, section)) throw forbidden();
      const days = clamp(args.p_days ?? 30, 7, 365, 30);
      const since = now() - days * DAY;
      const students = roster(school, grade, section);
      const all = plays(students.map((s) => s.id), now() - 2 * days * DAY);
      const cur = all.filter((p) => p.t >= since), prev = all.filter((p) => p.t < since);
      const perStudent = students.map((s) => {
        const mine = cur.filter((p) => p.student_id === s.id);
        const last = mine.length ? Math.max(...mine.map((p) => p.t)) : null;
        const everyOwn = all.filter((p) => p.student_id === s.id);
        return {
          student_id: s.id, full_name: s.full_name, practice_n: mine.length, reto_n: 0, last_activity: last === null ? null : iso(last), pct: pct(mine.map((p) => p.ok)),
          lectura: pct(byComp(mine, 'lectura').map((p) => p.ok)), matematica: pct(byComp(mine, 'matematica').map((p) => p.ok)),
          pensamiento: pct(byComp(mine, 'pensamiento').map((p) => p.ok)), lenguaje: pct(byComp(mine, 'lenguaje').map((p) => p.ok)),
          pct_prev: pct(prev.filter((p) => p.student_id === s.id).map((p) => p.ok)), last_practice: everyOwn.length ? iso(Math.max(...everyOwn.map((p) => p.t))) : null,
        };
      }).sort((a, b) => (a.last_activity === b.last_activity ? String(a.full_name).localeCompare(String(b.full_name), 'es') : a.last_activity === null ? 1 : b.last_activity === null ? -1 : a.last_activity < b.last_activity ? 1 : -1));
      return {
        days, class_size: students.length, active_students: new Set(cur.map((p) => p.student_id)).size, practicing_students: new Set(cur.map((p) => p.student_id)).size,
        practice_n: cur.length, reto_n: 0,
        competencies: COMPETENCIES.map((c) => ({
          competency: c, plays: byComp(cur, c).length, pct: pct(byComp(cur, c).map((p) => p.ok)), pct_prev: pct(byComp(prev, c).map((p) => p.ok)),
          students: new Set(byComp(cur, c).map((p) => p.student_id)).size,
        })),
        students: perStudent,
      };
    },

    /** Resumen de todos los grupos que el docente puede ver. */
    getGroupsProgress(args, ctx) {
      if (!isTeacher(ctx)) throw new RestError(400, 'No autenticado', 'P0001');
      const days = clamp(args?.p_days ?? 30, 7, 365, 30);
      const since = now() - days * DAY;
      const classes = new Map();
      for (const s of store.all('students')) {
        if (!s.school_code || !s.grade || !s.section || !canView(ctx, s.school_code, s.grade, s.section)) continue;
        classes.set(`${s.school_code}|${s.grade}|${s.section}`, { school_code: s.school_code, grade: s.grade, section: s.section });
      }
      const schools = new Map(store.all('schools').map((x) => [x.code, x.name]));
      return [...classes.values()].map((g) => {
        const ids = roster(g.school_code, g.grade, g.section).map((s) => s.id);
        const mine = plays(ids, since);
        const active = new Set(mine.map((p) => p.student_id)).size;
        return {
          school_code: g.school_code, school_name: schools.get(g.school_code) || g.school_code, grade: g.grade, section: g.section, students: ids.length, active, practicing: active,
          practice_n: mine.length, reto_n: 0, lectura: pct(byComp(mine, 'lectura').map((p) => p.ok)), matematica: pct(byComp(mine, 'matematica').map((p) => p.ok)),
          pensamiento: pct(byComp(mine, 'pensamiento').map((p) => p.ok)), lenguaje: pct(byComp(mine, 'lenguaje').map((p) => p.ok)),
        };
      }).sort((a, b) => String(a.school_name).localeCompare(String(b.school_name), 'es') || String(a.grade).localeCompare(String(b.grade), 'es') || String(a.section).localeCompare(String(b.section), 'es'));
    },

    /** Mi progreso (el estudiante). */
    getMyProgress(args, ctx) {
      if (!ctx?.uid) throw new RestError(400, 'No autenticado', 'P0001');
      const weeks = clamp(args?.p_weeks ?? 8, 2, 26, 8);
      const week0 = weekStart(now()) - (weeks - 1) * 7 * DAY;
      const mine = plays([ctx.uid], week0);
      const dates = new Set(plays([ctx.uid], now() - 400 * DAY).map((p) => day(p.t)));
      let streak = 0, d = dayStart(now());
      if (!dates.has(day(d))) d -= DAY;
      while (streak < 365 && dates.has(day(d))) { streak++; d -= DAY; }
      const weekList = [];
      for (let w = weekStart(week0); w <= weekStart(now()); w += 7 * DAY) weekList.push(w);
      const recent = now() - 14 * DAY, older = now() - 28 * DAY;
      const comps = COMPETENCIES.map((c) => {
        const own = byComp(mine, c);
        return {
          competency: c, practice_n: own.length, reto_n: 0, pct: pct(own.map((p) => p.ok)),
          pct_recent: pct(own.filter((p) => p.t >= recent).map((p) => p.ok)), pct_prev: pct(own.filter((p) => p.t < recent && p.t >= older).map((p) => p.ok)),
          weekly: weekList.map((w) => { const inWeek = own.filter((p) => weekStart(p.t) === w); return { week: day(w), n: inWeek.length, pct: pct(inWeek.map((p) => p.ok)) }; }),
        };
      });
      const weakest = comps.filter((c) => c.practice_n + c.reto_n >= 3).sort((a, b) => (a.pct === null ? 1 : b.pct === null ? -1 : a.pct - b.pct) || (b.practice_n - a.practice_n))[0]?.competency ?? null;
      return {
        competencies: comps, streak_days: streak, practice_7d: mine.filter((p) => p.t >= now() - 7 * DAY).length, practice_total: mine.length, reto_total: 0,
        last_practice_at: mine.length ? iso(Math.max(...mine.map((p) => p.t))) : null, weakest,
      };
    },
  };
}

const dayStart = (ms) => Date.UTC(new Date(ms).getUTCFullYear(), new Date(ms).getUTCMonth(), new Date(ms).getUTCDate());
