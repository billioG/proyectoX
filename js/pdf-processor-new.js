async function createUsersFromExtractedData(students) {
    if (students.length === 0) {
        return showToast('❌ No hay estudiantes para crear', 'error');
    }

    const actionsContainer = document.getElementById('pdf-actions-container');
    const progressContainer = document.getElementById('pdf-processing-progress');
    const progressBar = document.getElementById('pdf-progress-bar');
    const statusText = document.getElementById('pdf-processing-status');

    if (actionsContainer) actionsContainer.style.display = 'none';
    if (isProcessingCanceled) return;

    if (extractedSchool) {
        statusText.textContent = 'Guardando establecimiento...';
        await saveSchool(extractedSchool);
    }

    const existingUsernames = new Set();
    const existingEmails = new Set();
    const existingCUIs = new Set();

    try {
        statusText.textContent = 'Verificando duplicados en la nube...';
        const { data: allExisting } = await _supabase.from('students').select('username, email, cui');
        if (allExisting) {
            allExisting.forEach(s => {
                if (s.username) existingUsernames.add(s.username);
                if (s.email) existingEmails.add(s.email);
                if (s.cui) existingCUIs.add(s.cui);
            });
        }
    } catch (e) {
        console.error('Error lookup:', e);
    }

    let successCount = 0;
    let errorCount = 0;
    let skippedCount = 0;

    progressContainer.style.display = 'block';

    for (let i = 0; i < students.length; i++) {
        if (isProcessingCanceled) break;

        const student = students[i];
        const progress = ((i + 1) / students.length) * 100;

        progressBar.style.width = `${progress}%`;
        progressBar.textContent = `${Math.round(progress)}%`;

        statusText.innerHTML = `
            <div style="margin-bottom: 8px;"><strong>Creando estudiantes...</strong> (${i + 1}/${students.length})</div>
            <div style="font-size: 0.9rem; color: #64748b;">👤 <code>${student.username}</code> - ${student.fullName}</div>
        `;

        if (existingUsernames.has(student.username) || existingEmails.has(student.email) || (student.cui && existingCUIs.has(student.cui))) {
            skippedCount++;
            continue;
        }

        try {
            const { data: authData, error: authError } = await _supabase.auth.signUp({
                email: student.email,
                password: student.password,
                options: { data: { full_name: student.fullName, role: 'estudiante' } }
            });

            if (authError) {
                if (authError.message.includes('already registered')) {
                    skippedCount++;
                    continue;
                }
                if (authError.status === 429) {
                    statusText.innerHTML += `<div class="text-rose-500 font-bold mt-2 animate-pulse">⚠️ LÍMITE ALCANZADO. ESPERANDO 60S...</div>`;
                    await new Promise(r => setTimeout(r, 60000));
                    i--; continue;
                }
                throw authError;
            }

            if (!authData.user) throw new Error('Auth error');
            await new Promise(r => setTimeout(r, 500));

            const { error: dbError } = await _supabase.from('students').insert({
                id: authData.user.id,
                full_name: student.fullName,
                username: student.username,
                email: student.email,
                school_code: student.school_code,
                grade: student.grade,
                section: student.section,
                cui: student.cui,
                gender: student.gender || null,
                birth_date: student.birth_date || null,
                password_generated: student.password
            });

            if (dbError) throw dbError;
            successCount++;
            await new Promise(r => setTimeout(r, 2000));

        } catch (err) {
            console.error(`Error:`, err);
            errorCount++;
            await new Promise(r => setTimeout(r, 2000));
        }
    }

    progressBar.style.background = successCount > 0 ? '#10b981' : '#f59e0b';
    progressBar.style.width = '100%';
    statusText.innerHTML = `
        <div class="text-center mb-6"><h3 class="text-xl font-black uppercase">Proceso Completado</h3></div>
        <div class="grid grid-cols-3 gap-4">
            <div class="bg-emerald-50 p-4 rounded-xl text-center"><div class="text-2xl font-black text-emerald-500">${successCount}</div><div class="text-[0.6rem] uppercase tracking-tighter">Éxito</div></div>
            <div class="bg-amber-50 p-4 rounded-xl text-center"><div class="text-2xl font-black text-amber-500">${skippedCount}</div><div class="text-[0.6rem] uppercase tracking-tighter">Omitidos</div></div>
            <div class="bg-rose-50 p-4 rounded-xl text-center"><div class="text-2xl font-black text-rose-500">${errorCount}</div><div class="text-[0.6rem] uppercase tracking-tighter">Errores</div></div>
        </div>
    `;

    if (successCount > 0) showToast(`✅ ${successCount} estudiantes creados`, 'success');
    if (typeof loadStudents === 'function') setTimeout(loadStudents, 2000);
}

console.log('✅ pdf-processor.js cargado correctamente');
