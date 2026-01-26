/**
 * CERTIFICATES - Sistema de Diplomas STEEAM 1Bot
 * Generación de reconocimientos para Tutores Senior y Estudiantes Destacados
 */

async function checkAndGenerateCertificates() {
    if (!currentUser) return;

    if (userRole === 'docente' || userRole === 'admin') {
        const { data: teacher } = await _supabase.from('teachers').select('certification_points, rank_title, full_name').eq('id', currentUser.id).single();
        if (teacher && teacher.certification_points >= 500) {
            showCertificateClaim('teacher_senior', teacher);
        }
    } else if (userRole === 'estudiante') {
        const { data: projects, count } = await _supabase.from('projects').select('id', { count: 'exact', head: true }).eq('user_id', currentUser.id);
        if (count >= 4) { // Meta: 4 proyectos al año para ser "Estudiante STEEAM"
            showCertificateClaim('student_steeam', { full_name: currentUser.full_name });
        }
    }
}

function showCertificateClaim(type, data) {
    const key = `cert_claimed_${type}_${currentUser.id}_2026`;
    if (localStorage.getItem(key)) return;

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[800] flex items-center justify-center p-6 bg-slate-950/90 backdrop-blur-xl animate-fadeIn';
    modal.innerHTML = `
        <div class="glass-card w-full max-w-lg p-0 overflow-hidden shadow-2xl animate-slideUp border-amber-500/30 border-2">
            <div class="p-12 text-center bg-gradient-to-br from-amber-500 to-orange-700 text-white relative">
                 <div class="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')] opacity-10"></div>
                 <i class="fas fa-certificate text-7xl mb-6 animate-pulse text-amber-200"></i>
                 <h2 class="text-3xl font-black uppercase tracking-tighter">¡LOGRO DESBLOQUEADO!</h2>
                 <p class="text-amber-100 text-sm mt-2 font-bold uppercase tracking-widest">Has ganado un Reconocimiento Oficial</p>
            </div>
            <div class="p-10 text-center bg-white dark:bg-slate-900">
                <p class="text-slate-600 dark:text-slate-300 font-medium leading-relaxed mb-8">
                    Tu compromiso con el ecosistema **STEEAM 1Bot** te ha hecho acreedor al diploma de:
                    <br><span class="text-xl font-black text-amber-600 uppercase block mt-2">${type === 'teacher_senior' ? '🎓 Tutor Senior de Impacto' : '🌟 Estudiante STEEAM Certificado'}</span>
                </p>
                <div class="flex flex-col gap-4">
                    <button class="btn-primary-tw h-14 text-xs font-black uppercase tracking-widest bg-amber-500 hover:bg-amber-600 border-none shadow-xl shadow-amber-500/20" onclick="generateVisualCertificate('${type}', '${data.full_name}')">
                        <i class="fas fa-download mr-2"></i> Generar y Descargar Diploma
                    </button>
                    <button class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-[0.6rem] font-black uppercase tracking-widest" onclick="this.closest('.fixed').remove()">Cerrar</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function generateVisualCertificate(type, name) {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 z-[900] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-2xl animate-fadeIn';

    // Diseño de Diploma Premium
    const certHTML = `
        <div class="relative w-[800px] h-[600px] bg-white text-slate-900 border-[20px] border-double border-amber-600 p-16 flex flex-col items-center justify-between shadow-2xl overflow-hidden font-serif" id="certificate-canvas">
            <!-- Ornamentos -->
            <div class="absolute top-0 left-0 w-32 h-32 border-t-8 border-l-8 border-amber-300 pointer-events-none"></div>
            <div class="absolute top-0 right-0 w-32 h-32 border-t-8 border-r-8 border-amber-300 pointer-events-none"></div>
            <div class="absolute bottom-0 left-0 w-32 h-32 border-b-8 border-l-8 border-amber-300 pointer-events-none"></div>
            <div class="absolute bottom-0 right-0 w-32 h-32 border-b-8 border-r-8 border-amber-300 pointer-events-none"></div>
            <div class="absolute inset-0 border border-slate-100 m-2 pointer-events-none"></div>
            <div class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 opacity-[0.03] text-[30rem] pointer-events-none rotate-12"><i class="fas fa-rocket text-primary"></i></div>

            <div class="text-center z-10 w-full">
                <div class="flex items-center justify-center gap-4 mb-8">
                    <div class="w-16 h-1 bg-amber-600"></div>
                    <i class="fas fa-graduation-cap text-4xl text-amber-600"></i>
                    <div class="w-16 h-1 bg-amber-600"></div>
                </div>
                <h3 class="text-xl font-bold tracking-[0.3em] uppercase mb-4 text-slate-500">Certificado de Excelencia</h3>
                <h1 class="text-5xl font-black text-slate-900 mb-8 tracking-tighter uppercase">STEEAM 1BOT Guatemala</h1>
                
                <p class="text-lg text-slate-600 mb-6 italic">Se otorga con honor el presente reconocimiento a:</p>
                <h2 class="text-4xl font-black border-b-4 border-slate-900 pb-2 inline-block px-10 mb-8 uppercase tracking-tighter">${name}</h2>
                
                <p class="text-lg text-slate-600 leading-relaxed max-w-xl mx-auto mb-10">
                    Por su destacado compromiso, liderazgo y resultados excepcionales en el ecosistema de educación tecnológica durante el ciclo 2026, alcanzando el grado de <br>
                    <span class="font-black text-amber-600 uppercase text-xl mt-2 block">${type === 'teacher_senior' ? '🎓 TUTOR SENIOR DE IMPACTO' : '🌟 ESTUDIANTE STEEAM CERTIFICADO'}</span>
                </p>
                
                <div class="flex justify-between items-end w-full px-12 pt-10">
                    <div class="text-center">
                        <div class="w-48 border-b border-slate-400 mb-2"></div>
                        <p class="text-[0.6rem] font-bold uppercase tracking-widest">Coordinación Académica</p>
                    </div>
                    <div class="relative flex items-center justify-center">
                         <div class="w-24 h-24 rounded-full border-4 border-amber-500/30 flex items-center justify-center text-amber-500 text-3xl opacity-50"><i class="fas fa-award"></i></div>
                         <div class="absolute text-[0.5rem] font-bold uppercase tracking-tighter text-slate-300 mt-20">Sello de Verificación</div>
                    </div>
                    <div class="text-center">
                        <div class="w-48 border-b border-slate-400 mb-2"></div>
                        <p class="text-[0.6rem] font-bold uppercase tracking-widest">Dirección de Operaciones</p>
                    </div>
                </div>
            </div>
            
            <p class="text-[0.5rem] text-slate-300 uppercase tracking-widest z-10">Documento Verificado Digitalmente • ID Certificado: ${Math.random().toString(36).substr(2, 9).toUpperCase()}</p>
        </div>
    `;

    modal.innerHTML = `
        <div class="flex flex-col items-center gap-8 animate-slideUp">
            ${certHTML}
            <div class="flex gap-4">
                <button class="btn-primary-tw px-8 h-12 text-[0.6rem] font-black uppercase tracking-widest" onclick="window.print()">
                    <i class="fas fa-print mr-2"></i> Imprimir / Guardar PDF
                </button>
                <button class="btn-secondary-tw px-8 h-12 text-[0.6rem] font-black uppercase tracking-widest border-2" onclick="this.closest('.fixed').remove()">
                    Cerrar Vista
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Guardar en Storage/DB que ya lo reclamó
    const key = `cert_claimed_${type}_${currentUser.id}_2026`;
    localStorage.setItem(key, 'true');
    _supabase.from('certificates').upsert({ owner_id: currentUser.id, type: type, year: 2026, metadata: { name: name } });
}

// Iniciar chequeo al cargar
setTimeout(checkAndGenerateCertificates, 3000);
