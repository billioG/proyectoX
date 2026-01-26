// ================================================
// EXPORTACIÓN CSV - ACTUALIZADO CON EMAIL
// ================================================

async function exportStudentsCSV() {
  try {
    const { data: students } = await _supabase
      .from('students')
      .select(`
        *,
        schools(name, code)
      `)
      .order('school_code, grade, section, full_name');

    if (!students || students.length === 0) {
      return showToast('❌ No hay estudiantes para exportar', 'error');
    }

    let csvContent = 'Username,Password,Nombre,Email,CUI,Establecimiento,Codigo,Grado,Seccion\n';

    students.forEach(s => {
      const username = s.username || '';
      const password = s.password_generated || '1bot.org';
      const nombre = (s.full_name || '').replace(/,/g, ';');
      const email = s.email || '';
      const cui = s.cui || '';
      const establecimiento = (s.schools?.name || 'Sin asignar').replace(/,/g, ';');
      const codigo = s.school_code || '';
      const grado = s.grade || '';
      const seccion = s.section || '';

      csvContent += `${username},${password},"${nombre}",${email},${cui},"${establecimiento}",${codigo},${grado},${seccion}\n`;
    });

    downloadCSV(csvContent, 'estudiantes_export.csv');
    showToast(`✅ ${students.length} estudiantes exportados`, 'success');

  } catch (err) {
    console.error('Error exportando estudiantes:', err);
    showToast('❌ Error al exportar', 'error');
  }
}

async function exportProjectsCSV() {
  try {
    const { data: projects } = await _supabase
      .from('projects')
      .select(`
        id,
        title,
        description,
        score,
        votes,
        created_at,
        students(full_name, school_code, grade, section),
        groups(name)
      `)
      .order('created_at', { ascending: false });

    if (!projects || projects.length === 0) {
      return showToast('❌ No hay proyectos para exportar', 'error');
    }

    let csvContent = 'ID,Titulo,Descripcion,Estudiante,Grupo,Codigo_Establecimiento,Grado,Seccion,Puntuacion,Me_Gusta,Fecha\n';

    projects.forEach(p => {
      const title = (p.title || '').replace(/,/g, ';').replace(/"/g, '""');
      const description = (p.description || '').replace(/,/g, ';').replace(/"/g, '""');
      const student = p.students?.full_name || 'N/A';
      const group = p.groups?.name || 'Sin grupo';
      const schoolCode = p.students?.school_code || '';
      const grade = p.students?.grade || '';
      const section = p.students?.section || '';
      const score = p.score || 0;
      const votes = p.votes || 0;
      const date = new Date(p.created_at).toLocaleDateString('es-GT');

      csvContent += `${p.id},"${title}","${description}",${student},${group},${schoolCode},${grade},${section},${score},${votes},${date}\n`;
    });

    downloadCSV(csvContent, 'proyectos_export.csv');
    showToast('✅ Proyectos exportados a CSV', 'success');

  } catch (err) {
    console.error('Error exportando proyectos:', err);
    showToast('❌ Error al exportar', 'error');
  }
}

async function exportGroupsCSV() {
  try {
    const { data: groups } = await _supabase
      .from('groups')
      .select(`
        *,
        group_members(
          role,
          students(full_name)
        ),
        projects(title, score)
      `)
      .order('school_code, grade, section, name');

    if (!groups || groups.length === 0) {
      return showToast('❌ No hay grupos para exportar', 'error');
    }

    let csvContent = 'Nombre_Grupo,Codigo_Establecimiento,Grado,Seccion,Integrantes,Planner,Maker,Speaker,Proyecto,Nota\n';

    groups.forEach(g => {
      const gName = (g.name || '').replace(/,/g, ';').replace(/"/g, '""');
      const schoolCode = g.school_code || '';
      const grade = g.grade || '';
      const section = g.section || '';
      const members = g.group_members || [];
      const planner = (members.find(m => m.role === 'planner')?.students?.full_name || '').replace(/,/g, ';');
      const maker = (members.find(m => m.role === 'maker')?.students?.full_name || '').replace(/,/g, ';');
      const speaker = (members.find(m => m.role === 'speaker')?.students?.full_name || '').replace(/,/g, ';');
      const allMembers = members.map(m => (m.students?.full_name || '').replace(/,/g, ';')).join('; ');

      const projects = g.projects || [];

      if (projects.length === 0) {
        csvContent += `"${gName}",${schoolCode},${grade},${section},"${allMembers}","${planner}","${maker}","${speaker}","Sin proyecto",0\n`;
      } else {
        projects.forEach(p => {
          const pTitle = (p.title || '').replace(/,/g, ';').replace(/"/g, '""');
          const pScore = p.score || 0;
          csvContent += `"${gName}",${schoolCode},${grade},${section},"${allMembers}","${planner}","${maker}","${speaker}","${pTitle}",${pScore}\n`;
        });
      }
    });

    downloadCSV(csvContent, 'proyectos_por_grupo_export.csv');
    showToast('✅ Reporte detallado exportado', 'success');

  } catch (err) {
    console.error('Error exportando grupos:', err);
    showToast('❌ Error al exportar', 'error');
  }
}

function downloadCSV(csvContent, filename) {
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  const timestamp = new Date().toISOString().split('T')[0];
  const finalFilename = filename.replace('.csv', `_${timestamp}.csv`);

  link.setAttribute('href', url);
  link.setAttribute('download', finalFilename);
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

console.log('✅ csv.js cargado correctamente');
