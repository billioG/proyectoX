/**
 * KPI ENGINE - Gestión centralizada de métricas y cálculos de rendimiento
 */

/**
 * Calcula los KPIs mensuales de un docente
 * @param {string} teacherId - ID del docente
 * @param {Array} assignments - Lista de asignaciones del docente
 * @returns {Object} Datos de KPIs y XP
 */
async function calculateMonthlyKPIs(teacherId, assignments) {
    try {
        const now = new Date();
        const currentMonth = now.getMonth() + 1;
        const currentYear = now.getFullYear();
        const startOfMonth = new Date(currentYear, currentMonth - 1, 1).toISOString();
        const endOfMonth = new Date(currentYear, currentMonth, 0, 23, 59, 59).toISOString();

        const [attRes, evalRes, evidRes, repRes, challengeRes] = await Promise.all([
            _supabase.from('attendance').select('date').eq('teacher_id', teacherId).gte('date', startOfMonth.split('T')[0]).lte('date', endOfMonth.split('T')[0]),
            _supabase.from('evaluations').select('id').eq('teacher_id', teacherId).gte('created_at', startOfMonth).lte('created_at', endOfMonth),
            _supabase.from('weekly_evidence').select('id').eq('teacher_id', teacherId).gte('created_at', startOfMonth).lte('created_at', endOfMonth),
            _supabase.from('teacher_monthly_reports').select('id').eq('teacher_id', teacherId).eq('month', currentMonth).eq('year', currentYear),
            _supabase.from('teacher_challenges').select('id').eq('teacher_id', teacherId).gte('created_at', startOfMonth).lte('created_at', endOfMonth)
        ]);

        // Contar listas únicas (por fecha)
        const uniqueDates = new Set(attRes.data?.map(r => r.date));
        const attCount = uniqueDates.size;
        const evalCount = evalRes.data?.length || 0;
        const evidCount = evidRes.data?.length || 0;
        const repCount = repRes.data?.length || 0;
        const challengeCount = challengeRes.data?.length || 0;

        // Metas según asignaciones
        const numAssignments = assignments?.length || 0;
        const attMeta = numAssignments * 12;
        const evalMeta = numAssignments * SYSTEM_CONFIG.projectsPerBimester;
        const evidMeta = numAssignments * 4;
        const repMeta = 1;

        // XP (30% Asistencia, 40% Eval, 20% Evid, 10% Reporte)
        const attXP = Math.min(30, (attCount / (attMeta || 1)) * 30);
        const evalXP = Math.min(40, (evalCount / (evalMeta || 1)) * 40);
        const evidXP = Math.min(20, (evidCount / (evidMeta || 1)) * 20);
        const repXP = repCount >= 1 ? 10 : 0;
        const challengeXP = Math.min(10, challengeCount * 10); // Bono de retos (hasta 10 XP)

        const totalXP = Math.round(attXP + evalXP + evidXP + repXP + challengeXP);

        return {
            attCount, attMeta, attXP,
            evalCount, evalMeta, evalXP,
            evidCount, evidMeta, evidXP,
            repCount, repMeta, repXP,
            challengeCount, challengeXP,
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
async function calculateSchoolHealth(schoolCode) {
    // Esta lógica se puede migrar aquí en el futuro desde admin-success.js
}
