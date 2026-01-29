/**
 * AI SERVICE - Integración con OpenAI para ProjectX
 * Nota: El API Key está hardcodeado a petición del usuario para esta fase.
 */

const AIService = {
    apiKey: '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',
    model: 'gpt-4o-mini',

    async ask(prompt, context = '') {
        try {
            const response = await fetch('https://api.openai.com/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify({
                    model: this.model,
                    messages: [
                        {
                            role: 'system',
                            content: `Eres "1Bot", la mascota robótica e inteligente de la plataforma educativa ProjectX. 
                            Tu objetivo es motivar a estudiantes y docentes de robótica y tecnología. 
                            Responde de forma entusiasta, breve y profesional. 
                            Contexto actual del usuario: ${context}`
                        },
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    max_tokens: 150,
                    temperature: 0.7
                })
            });

            const data = await response.json();
            if (data.error) throw new Error(data.error.message);
            return data.choices[0].message.content;
        } catch (err) {
            console.error('AI Error:', err);
            return "Lo siento, mis circuitos están ocupados procesando datos. ¡Vuelve a intentarlo en un momento! 🤖⚡";
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
