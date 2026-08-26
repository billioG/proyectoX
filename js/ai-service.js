/**
 * AI SERVICE - Integración con OpenAI para Quetzal LMS
 * La llamada real pasa por la edge function `ai-proxy` -- la API key de
 * OpenAI vive solo como secret server-side, nunca en el bundle del cliente.
 */

const AIService = {
    async ask(prompt, context = '') {
        try {
            const { data: { session } } = await window._supabase.auth.getSession();
            const response = await fetch(`${window.SUPABASE_URL}/functions/v1/ai-proxy`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${session?.access_token || ''}`
                },
                body: JSON.stringify({ prompt, context })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error);
            return data.content;
        } catch (err) {
            console.error('AI Error:', err);
            return 'Lo siento, mis circuitos están ocupados procesando datos. ¡Vuelve a intentarlo en un momento! <i class="fas fa-robot"></i><i class="fas fa-bolt"></i>';
        }
    },

    /**
     * Genera un mensaje proactivo para la mascota basado en los datos del usuario
     */
    async getProactiveMessage(userData, userRole) {
        const prompt = userRole === 'estudiante'
            ? `Genera un mensaje corto de bienvenida o motivación para un estudiante llamado ${userData.full_name}. Tiene una racha de ${userData.streak || 0} días y está en el nivel ${Math.floor((userData.xp || 0) / 500) + 1}.`
            : `Genera un mensaje corto de apoyo para un docente llamado ${userData.full_name}. Ayúdale a sentirse valorado por su labor enseñando tecnología.`;

        return this.ask(prompt, `Rol: ${userRole}, Nombre: ${userData.full_name}`);
    }
};

window.AIService = AIService;
