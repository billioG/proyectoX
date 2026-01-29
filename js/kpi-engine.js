/**
 * KPI ENGINE - Gestión centralizada de métricas y cálculos de rendimiento
 */

/**
 * Calcula los KPIs mensuales de un docente
 * @param {string} teacherId - ID del docente
 * @param {Array} assignments - Lista de asignaciones del docente
 * @returns {Object} Datos de KPIs y XP
 */
window.calculateMonthlyKPIs = async function calculateMonthlyKPIs(teacherId, assignments) {
    const _supabase = window._supabase;
    const SYSTEM_CONFIG = window.SYSTEM_CONFIG || { projectsPerBimester: 4 };

    try {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const startOfMonth = new Date(currentYear, currentMonth - 1, 1).toISOString();
        const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59).toISOString();

        // 1. Obtener datos básicos de actividad
        // Extraer school_codes únicos y válidos de las asignaciones
        const assignmentSchoolCodes = [...new Set((assignments || []).map(a => a.school_code).filter(Boolean))];

        console.log('🔍 KPI Engine - Assignments recibidos:', assignments?.length || 0);
        console.log('🔍 KPI Engine - Estructura de assignments:', JSON.stringify(assignments, null, 2));
        console.log('🔍 KPI Engine - School codes extraídos:', assignmentSchoolCodes);
        const [attRes, evalRes, evidRes, repRes, challengeRes, waiversRes, groupsRes, schoolsRes] = await Promise.all([
            _supabase.from('attendance').select('date').eq('teacher_id', teacherId).gte('date', startOfMonth.split('T')[0]).lte('date', endOfMonth.split('T')[0]),
            _supabase.from('evaluations').select('id').eq('teacher_id', teacherId).gte('created_at', startOfMonth).lte('created_at', endOfMonth),
            _supabase.from('weekly_evidence').select('id').eq('teacher_id', teacherId).gte('created_at', startOfMonth).lte('created_at', endOfMonth),
            _supabase.from('teacher_monthly_reports').select('id').eq('teacher_id', teacherId).eq('month', currentMonth).eq('year', currentYear),
            _supabase.from('teacher_challenges').select('id').eq('teacher_id', teacherId).gte('created_at', startOfMonth).lte('created_at', endOfMonth),
            _supabase.from('attendance_waivers').select('*').eq('teacher_id', teacherId).eq('status', 'approved').gte('date', startOfMonth.split('T')[0]).lte('date', endOfMonth.split('T')[0]),
            // Solo consultar grupos si hay school_codes válidos
            assignmentSchoolCodes.length > 0
                ? _supabase.from('groups').select('*').in('school_code', assignmentSchoolCodes)
                : Promise.resolve({ data: [], error: null }),
            _supabase.from('schools').select('id, code, projects_per_bimestre')
        ]);

        // Contar listas únicas (por fecha)
        const uniqueDates = new Set(attRes.data?.map(r => r.date));
        const attCount = uniqueDates.size;
        const evalCount = evalRes.data?.length || 0;
        const evidCount = evidRes.data?.length || 0;
        const repCount = repRes.data?.length || 0;
        const challengeCount = challengeRes.data?.length || 0;

        // 2. CÁLCULO DE METAS DINÁMICAS
        const safeAssignments = assignments || [];
        const schools = schoolsRes.data || [];
        const approvedWaivers = waiversRes.data || [];

        // Meta de Asistencia: Total de grupos asignados * 4 semanas al mes (menos exenciones)
        // Nota: asumiendo 1 sesión por semana como estándar del sistema
        const SESSIONS_PER_MONTH = 4;
        let rawAttMeta = safeAssignments.length * SESSIONS_PER_MONTH;
        const attWaiversCount = approvedWaivers.length; // Cada exención aprobada descuenta una meta
        const attMeta = Math.max(0, rawAttMeta - attWaiversCount);

        // Meta de Evaluaciones: Total de equipos en sus establecimientos asignados * (Meta de Proyectos por Bimestre)
        // El usuario pide: "Total de Teams en todos los establecimientos asignados * Meta (default 4)"
        // Primero filtramos los grupos que pertenecen a los establecimientos del docente
        const schoolCodes = [...new Set(safeAssignments.map(a => a.school_code).filter(Boolean))]; // Códigos únicos
        const relevantGroups = (groupsRes.data || []).filter(g => schoolCodes.includes(g.school_code));

        let totalEvalMeta = 0;
        schoolCodes.forEach(code => {
            const school = schools.find(s => s.code === code);
            const projectsPerBimester = school?.projects_per_bimestre || SYSTEM_CONFIG.projectsPerBimester || 4;
            const groupsInSchool = relevantGroups.filter(g => g.school_code === code).length;
            totalEvalMeta += (groupsInSchool * projectsPerBimester);

            // Debug logging
            console.log(`📊 KPI Debug - Establecimiento: ${code}, Grupos: ${groupsInSchool}, Meta/Bimestre: ${projectsPerBimester}, Subtotal: ${groupsInSchool * projectsPerBimester}`);
        });
        const evalMeta = totalEvalMeta;

        console.log(`✅ KPI Final - Eval Meta Total: ${evalMeta}, Eval Count: ${evalCount}`);

        // Meta de Evidencia Semanal: Fija en 4 por semana (16 al mes o similar)
        // El usuario dice: "4 evidencias semanales (fijo)" -> Asumimos 4 x 4 semanas = 16? 
        // O tal vez 4 por asignación? El kpi-engine original usaba numAssignments * 4.
        const evidMeta = safeAssignments.length * 4;
        const repMeta = 1;

        // 3. CÁLCULO DE XP (Ponderaciones originales preservadas)
        // XP (30% Asistencia, 40% Eval, 20% Evid, 10% Reporte)
        const attXP = Math.min(30, (attCount / (attMeta || 1)) * 30);
        const evalXP = Math.min(40, (evalCount / (evalMeta || 1)) * 40);
        const evidXP = Math.min(20, (evidCount / (evidMeta || 1)) * 20);
        const repXP = repCount >= 1 ? 10 : 0;
        const challengeXP = Math.min(10, challengeCount * 10); // Bono de retos (hasta 10 XP)

        // 4. XP DE ROCAS MENSUALES
        let rocksXP = 0;
        let rocksCompleted = 0;
        let rocksTotal = 0;

        try {
            if (typeof window.calculateRocksXP === 'function') {
                const rocksData = await window.calculateRocksXP(teacherId, currentMonth, currentYear);
                rocksXP = rocksData.total_xp || 0;
                rocksCompleted = rocksData.completed_rocks || 0;
                rocksTotal = rocksData.total_rocks || 0;
                console.log(`🎯 Tareas - Completadas: ${rocksCompleted}/${rocksTotal}, XP: ${rocksXP}`);
            }
        } catch (err) {
            console.warn('⚠️ Error calculando XP de tareas (función no disponible):', err.message);
        }

        const totalXP = Math.round(attXP + evalXP + evidXP + repXP + challengeXP + rocksXP);

        return {
            attCount, attMeta, attXP,
            evalCount, evalMeta, evalXP,
            evidCount, evidMeta, evidXP,
            repCount, repMeta, repXP,
            challengeCount, challengeXP,
            rocksCompleted, rocksTotal, rocksXP,  // Nuevos campos de rocas
            totalXP
        };
    } catch (err) {
        console.error('Error en KPI Engine:', err);
        return { attCount: 0, attMeta: 0, evalCount: 0, evalMeta: 0, evidCount: 0, evidMeta: 0, repCount: 0, repMeta: 1, totalXP: 0 };
    }
}

/**
 * Calcula el rendimiento general de un colegio para el Success Hub
 */
window.calculateSchoolHealth = async function calculateSchoolHealth(schoolCode) {
    // Esta lógica se puede migrar aquí en el futuro desde admin-success.js
}
