/**
 * PRESENCIA DE ALUMNOS PARA EL DOCENTE
 * Los alumnos ya publican su presencia en una sala de Realtime por clase
 * (GameArena.syncPresence en game-arena.js: "conectado" = app abierta y
 * visible). Acá el docente/admin solo ESCUCHA esas salas -- no se anuncia, no
 * hay tablas ni SQL -- y marca en la lista de estudiantes quién está en línea.
 */
const MAX_ROOMS = 40;
const channels = new Map();

// Debe coincidir con el nombre de sala de GameArena.syncPresence().
function roomName(school, grade, section) {
  return `online-${school}-${grade}-${section}`.normalize('NFD').replace(/[^\w-]/g, '_');
}

function paint() {
  const online = new Set();
  channels.forEach(c => c.ids.forEach(id => online.add(id)));

  let total = 0;
  document.querySelectorAll('.student-card[data-id]').forEach(card => {
    const on = online.has(card.dataset.id);
    if (on) total++;
    card.querySelector('.presence-dot')?.classList.toggle('hidden', !on);
    card.querySelector('.presence-pill')?.classList.toggle('hidden', !on);
  });

  document.querySelectorAll('.class-online[data-room]').forEach(el => {
    const n = channels.get(el.dataset.room)?.ids.size || 0;
    el.innerHTML = n
      ? `<span class="inline-flex items-center gap-1 text-emerald-500 font-bold"><span class="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>${n} en línea</span>`
      : '';
  });

  const totalEl = document.getElementById('students-online-total');
  if (totalEl) {
    totalEl.innerHTML = total
      ? `<span class="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span> ${total} ${total === 1 ? 'alumno en línea' : 'alumnos en línea'} ahora`
      : '<i class="fas fa-user-clock"></i> Ningún alumno en línea ahora';
  }
}

function watch(students) {
  const supabase = window._supabase;
  if (!supabase?.channel || window.isNodeSession) return;

  const wanted = [...new Set((students || [])
    .filter(s => s.school_code && s.grade && s.section)
    .map(s => roomName(s.school_code, s.grade, s.section)))].slice(0, MAX_ROOMS);

  channels.forEach((entry, room) => {
    if (!wanted.includes(room)) { supabase.removeChannel(entry.ch); channels.delete(room); }
  });

  wanted.forEach(room => {
    if (channels.has(room)) return;
    const entry = { ids: new Set(), ch: supabase.channel(room) };
    channels.set(room, entry);
    entry.ch.on('presence', { event: 'sync' }, () => {
      entry.ids = new Set(Object.keys(entry.ch.presenceState()));
      paint();
    }).subscribe();
  });

  paint();
}

window.StudentPresence = { roomName, watch, paint };
