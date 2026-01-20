// Gestión individual de usuarios y exportación CSV - COMPLETO

async function exportAllUsersCSV() {
  showToast('📥 Generando archivo CSV...', 'default');

  try {
    const { data: students } = await _supabase
      .from('students')
      .select('*')
      .order('school, grade, section, full_name');

    if (!students || students.length === 0) {
      return showToast('❌ No hay usuarios para exportar', 'error');
    }

    let csvContent = 'username,password,nombre,email,rol,grado,seccion,establecimiento\n';

    students.forEach(s => {
      const password = s.password_generated || '1bot.org';
      const email = s.email || '';
      const grade = s.grade || '';
      const section = s.section || '';
      const username = s.username || '';
      const nombre = s.full_name || '';
      const rol = s.role || 'estudiante';
      const establecimiento = s.school || '';

      const escapedNombre = nombre.includes(',') ? `"${nombre}"` : nombre;
      const escapedEstablecimiento = establecimiento.includes(',') ? `"${establecimiento}"` : establecimiento;

      csvContent += `${username},${password},${escapedNombre},${email},${rol},${grade},${section},${escapedEstablecimiento}\n`;
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const timestamp = new Date().toISOString().split('T')[0];
    link.href = URL.createObjectURL(blob);
    link.download = `usuarios_proyectox_${timestamp}.csv`;
    link.click();

    showToast(`✅ ${students.length} usuarios exportados a CSV`, 'success');
  } catch (err) {
    console.error('Error exportando CSV:', err);
    showToast('❌ Error al exportar CSV', 'error');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof userRole !== 'undefined' && userRole === 'admin') {
    updateTotalUsersCount();
  }
});

console.log('✅ user-management.js cargado correctamente');
