/**
 * 1BOT DYNAMIC MASCOT WIDGET
 * Un widget animado que cambia de estado y mensaje periódicamente, estilo Duolingo.
 */

const MascotWidget = {
    states: {
        NORMAL: 'normal',
        HAPPY: 'happy',
        THINKING: 'thinking',
        WORK: 'work',
        SLEEP: 'sleep',
        ALERT: 'alert'
    },

    messages: {
        estudiante: {
            normal: [
                '¿Qué vamos a construir hoy? <i class="fas fa-robot"></i>',
                '¡Recuerda subir tus avances! <i class="fas fa-rocket"></i>',
                '¡El código es tu superpoder! <i class="fas fa-bolt"></i>',
                '¿Has revisado el ranking hoy? <i class="fas fa-trophy"></i>',
                '¡Sigue aprendiendo, 1bot está contigo! <i class="fas fa-heart"></i>'
            ],
            happy: [
                '¡Increíble progreso! <i class="fas fa-champagne-glasses"></i>',
                "¡Eres una estrella del código! ⭐",
                '¡Esa racha se ve genial! <i class="fas fa-fire"></i>',
                '¡Nada te detiene! <i class="fas fa-rocket"></i>'
            ],
            thinking: [
                'Mm... ¿cómo optimizaríamos ese algoritmo? <i class="fas fa-circle-question"></i>',
                'Analizando nuevas posibilidades tecnológicas... <i class="fas fa-chart-bar"></i>',
                '¿Y si probamos un enfoque diferente? <i class="fas fa-lightbulb"></i>'
            ],
            sleep: [
                'Zzz... soñando con circuitos... <i class="fas fa-battery-full"></i>',
                'Es tarde, ¡mañana seguimos innovando! <i class="fas fa-moon"></i>',
                'Entrando en modo ahorro de energía... <i class="fas fa-plug"></i>'
            ]
        },
        docente: {
            normal: [
                '¡Hola, Profe! ¿Listos para inspirar? <i class="fas fa-apple-whole"></i>',
                'Hay proyectos esperando tu evaluación. <i class="fas fa-chart-bar"></i>',
                '¡Tus alumnos están logrando grandes cosas! <i class="fas fa-star"></i>',
                '¿Ya pasaste asistencia hoy? <i class="fas fa-clipboard-list"></i>'
            ],
            happy: [
                '¡Excelente gestión de grupo! <i class="fas fa-wand-magic-sparkles"></i>',
                'Tus KPIs están por las nubes hoy. <i class="fas fa-chart-line"></i>',
                '¡Gracias por guiar a los futuros inventores! <i class="fas fa-robot"></i>'
            ],
            work: [
                'Evaluando talentos... <i class="fas fa-pen"></i>️',
                'Sincronizando datos de aprendizaje... <i class="fas fa-arrows-rotate"></i>',
                'Preparando el próximo gran desafío. <i class="fas fa-bullseye"></i>'
            ]
        },
        admin: {
            normal: [
                'Sistema operativo estable. <i class="fas fa-circle-check"></i>',
                'Explorando métricas de impacto... <i class="fas fa-chart-line"></i>',
                'Todo bajo control en Quetzal LMS. <i class="fas fa-shield"></i>️',
                '¿Revisamos el informe mensual? <i class="fas fa-folder-open"></i>'
            ]
        }
    },

    currentState: 'normal',
    containerId: 'mascot-widget-container',

    init() {
        console.log("🤖 Iniciando Mascota 1Bot...");
        this.render();
        this.startCycle();
        this.applyAnimations();
    },

    render() {
        if (document.getElementById(this.containerId)) return;

        const container = document.createElement('div');
        container.id = this.containerId;
        // En móvil se pone a la IZQUIERDA del botón de menú hamburguesa
        // (fixed, bottom:24px, right:24px, 60px de lado -- ver
        // #mobile-menu-btn en index.html) en vez de apilarse arriba, así
        // nunca se solapan aunque el achicado (ver CSS de .mascot-robot)
        // no alcance -- antes tapaba parte del botón y bloqueaba el toque.
        container.className = 'fixed bottom-6 right-[92px] md:bottom-6 md:right-6 z-[100] transition-all duration-500 transform hover:scale-105 group';
        container.style.pointerEvents = 'none'; // So it doesn't block clicks when not interacting

        container.innerHTML = `
            <style>
                #mascot-widget-container {
                    perspective: 1000px;
                    pointer-events: auto !important;
                }
                .mascot-bubble {
                    position: absolute;
                    bottom: 110%;
                    right: 0;
                    max-width: calc(100vw - 48px);
                    background: white;
                    padding: 12px 16px;
                    border-radius: 20px;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.1);
                    width: 200px;
                    font-size: 0.85rem;
                    font-weight: 700;
                    color: #1e293b;
                    border: 2px solid #00ADEF;
                    opacity: 0;
                    transform: translateY(10px) scale(0.9);
                    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    pointer-events: none;
                }
                .dark .mascot-bubble {
                    background: #1e293b;
                    color: white;
                    border-color: #00ADEF;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.3);
                }
                .mascot-bubble::after {
                    content: '';
                    position: absolute;
                    top: 100%;
                    right: 24px;
                    border: 10px solid transparent;
                    border-top-color: #00ADEF;
                }
                .mascot-bubble.show {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
                .mascot-robot {
                    width: 80px;
                    height: 80px;
                    cursor: pointer;
                    filter: drop-shadow(0 5px 15px rgba(0,173,239,0.2));
                }
                .mascot-robot svg {
                    width: 100%;
                    height: 100%;
                }
                /* En pantallas chicas ocupa menos espacio -- tapaba botones
                   de tarjetas (editar/borrar/etc.) que caen en esa misma
                   esquina inferior derecha. */
                @media (max-width: 640px) {
                    .mascot-robot { width: 52px; height: 52px; }
                }
                
                /* Animations */
                @keyframes mascot-float {
                    0%, 100% { transform: translateY(0); }
                    50% { transform: translateY(-10px); }
                }
                @keyframes mascot-blink {
                    0%, 90%, 100% { transform: scaleY(1); }
                    95% { transform: scaleY(0.1); }
                }
                .mascot-animate-float { animation: mascot-float 3s ease-in-out infinite; }
                .mascot-eye { animation: mascot-blink 4s infinite; transform-origin: center; }
            </style>
            
            <div class="mascot-bubble" id="mascot-msg">
                ¡Hola! ¿Listos para crear algo asombroso?
            </div>
            
            <div class="mascot-robot mascot-animate-float" onclick="MascotWidget.openAIChat()">
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" id="mascot-svg">
                    <!-- Plumas largas de la cola (atrás) -->
                    <path d="M 185 300 C 160 380 90 410 80 480 C 105 480 180 400 195 300 Z" fill="#009624" />
                    <path d="M 215 300 C 240 380 310 410 320 480 C 295 480 220 400 205 300 Z" fill="#00C853" />

                    <!-- Patas -->
                    <ellipse cx="160" cy="335" rx="16" ry="8" fill="#FF9100" />
                    <ellipse cx="240" cy="335" rx="16" ry="8" fill="#FF9100" />

                    <!-- Cuerpo (redondeado) -->
                    <rect x="110" y="100" width="180" height="230" rx="90" fill="#00C853" />

                    <!-- Copete/Cresta de plumas en la cabeza -->
                    <path d="M 170 105 C 170 70 190 65 200 65 C 210 65 230 70 230 105 Z" fill="#5CF29D" />
                    <path d="M 182 100 C 182 78 193 72 200 72 C 207 72 218 78 218 100 Z" fill="#00C853" />

                    <!-- Alas -->
                    <path d="M 110 180 C 65 200 60 265 115 275 C 108 240 115 200 110 180 Z" fill="#009624" />
                    <path d="M 290 180 C 335 200 340 265 285 275 C 292 240 285 200 290 180 Z" fill="#009624" />

                    <!-- Pecho Rojo Característico -->
                    <path d="M 135 195 C 135 295 265 295 265 195 C 265 180 135 180 135 195 Z" fill="#FF3D00" />
                    <path d="M 148 205 C 148 285 252 285 252 205 C 252 193 148 193 148 205 Z" fill="#FF5252" />

                    <!-- Mejillas sonrosadas -->
                    <circle cx="138" cy="182" r="12" fill="#FF2D55" opacity="0.2" />
                    <circle cx="262" cy="182" r="12" fill="#FF2D55" opacity="0.2" />

                    <!-- Ojos grandes de caricatura -->
                    <circle cx="160" cy="158" r="28" fill="#FFFFFF" />
                    <circle cx="166" cy="158" r="15" fill="#1E293B" class="mascot-eye" id="eye-l" />
                    <circle cx="171" cy="152" r="5" fill="#FFFFFF" />

                    <circle cx="240" cy="158" r="28" fill="#FFFFFF" />
                    <circle cx="234" cy="158" r="15" fill="#1E293B" class="mascot-eye" id="eye-r" />
                    <circle cx="229" cy="152" r="5" fill="#FFFFFF" />

                    <!-- Pico Amarillo -->
                    <path d="M 182 168 Q 200 162 218 168 C 218 195 200 218 200 218 C 200 218 182 195 182 168 Z" fill="#FFC107" />
                    <path d="M 188 170 Q 200 166 212 170 C 210 185 200 202 200 202 C 200 202 190 185 188 170 Z" fill="#FFA000" opacity="0.5" />
                </svg>
            </div>
        `;
        document.body.appendChild(container);

        // Show first message after a delay
        setTimeout(() => this.talk(), 2000);
    },

    async talk() {
        const bubble = document.getElementById('mascot-msg');
        if (!bubble) return;

        let message = "";

        // Si tenemos AIService disponible, intentamos obtener un mensaje "inteligente"
        if (typeof window.AIService !== 'undefined' && window.currentUser) {
            try {
                // Solo usamos AI proactiva un 30% de las veces para no saturar la cuota
                if (Math.random() > 0.7) {
                    message = await window.AIService.getProactiveMessage(window.userData, window.userRole);
                }
            } catch (e) { console.error(e); }
        }

        if (!message) {
            const role = typeof window.userRole !== 'undefined' ? window.userRole : 'estudiante';
            const stateMessages = this.messages[role] ? this.messages[role][this.currentState] || this.messages[role].normal : this.messages.estudiante.normal;
            message = stateMessages[Math.floor(Math.random() * stateMessages.length)];
        }

        bubble.innerHTML = message;
        bubble.classList.add('show');
        this.setFace(this.currentState);

        setTimeout(() => {
            bubble.classList.remove('show');
        }, 8000);
    },

    openAIChat() {
        if (typeof AIService === 'undefined') return showToast('IA no disponible', 'warning');

        const modalId = 'mascot-ai-modal';
        if (document.getElementById(modalId)) return;

        const modal = document.createElement('div');
        modal.id = modalId;
        modal.className = 'fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-fadeIn';

        modal.innerHTML = `
            <div class="glass-card w-full max-w-lg bg-white dark:bg-slate-900 border-none shadow-2xl overflow-hidden flex flex-col animate-slideUp">
                <div class="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-primary text-white">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center"><i class="fas fa-robot"></i></div>
                        <div>
                            <h3 class="font-black uppercase tracking-widest text-sm leading-none">Consultar a 1Bot AI</h3>
                            <p class="text-[0.6rem] font-bold opacity-70 mt-1 uppercase">Impulsado por OpenAI GPT-4o</p>
                        </div>
                    </div>
                    <button class="w-8 h-8 rounded-lg bg-black/10 hover:bg-black/20 flex items-center justify-center transition-all" onclick="this.closest('.fixed').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>

                <div id="ai-chat-history" class="p-6 space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950/20">
                    <div class="flex gap-3">
                        <div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs shrink-0">1B</div>
                        <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none shadow-sm text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-800">
                            ¡Hola! Soy tu asistente de IA. ¿En qué puedo ayudarte hoy con tus proyectos de tecnología?
                        </div>
                    </div>
                </div>

                <div class="p-6 bg-white dark:bg-slate-900 border-t border-slate-100 dark:border-slate-800">
                    <div class="relative">
                        <input type="text" id="ai-chat-input" class="w-full pl-5 pr-14 py-4 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold placeholder:text-slate-400 focus:ring-2 focus:ring-primary/20 transition-all outline-none" placeholder="Escribe tu pregunta aquí...">
                        <button onclick="MascotWidget.sendAIMessage()" class="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 bg-primary text-white rounded-xl flex items-center justify-center shadow-lg shadow-primary/20 hover:scale-105 active:scale-95 transition-all">
                            <i class="fas fa-paper-plane"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

        const input = document.getElementById('ai-chat-input');
        input.focus();
        input.onkeypress = (e) => { if (e.key === 'Enter') this.sendAIMessage(); };
    },

    async sendAIMessage() {
        const input = document.getElementById('ai-chat-input');
        const history = document.getElementById('ai-chat-history');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';

        // User Message
        history.innerHTML += `
            <div class="flex gap-3 justify-end">
                <div class="bg-primary text-white p-4 rounded-2xl rounded-tr-none shadow-md text-sm font-bold max-w-[80%]">
                    ${text}
                </div>
            </div>
        `;
        history.scrollTop = history.scrollHeight;

        // Loading
        const loadingId = 'ai-loading-' + Date.now();
        history.innerHTML += `
            <div id="${loadingId}" class="flex gap-3">
                <div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs shrink-0">1B</div>
                <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none shadow-sm text-sm font-medium text-slate-400 border border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <i class="fas fa-circle-notch fa-spin"></i> Procesando...
                </div>
            </div>
        `;
        history.scrollTop = history.scrollHeight;

        try {
            const context = `Usuario: ${window.userData?.full_name || ''}, Rol: ${window.userRole}, Racha: ${window.userData?.streak || 0}`;
            const response = await AIService.ask(text, context);
            document.getElementById(loadingId).remove();

            history.innerHTML += `
                <div class="flex gap-3">
                    <div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs shrink-0">1B</div>
                    <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none shadow-sm text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-800 animate-slideUp">
                        ${response}
                    </div>
                </div>
            `;
            history.scrollTop = history.scrollHeight;
        } catch (err) {
            console.error('Mascot chat error:', err);
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.innerHTML = 'Error al conectar con la IA.';
        }
    },

    setFace(state) {
        const mouth = document.getElementById('mascot-mouth');
        const eyeL = document.getElementById('eye-l');
        const eyeR = document.getElementById('eye-r');
        if (!mouth) return;

        switch (state) {
            case 'happy':
                mouth.setAttribute('d', 'M35 55 Q50 65 65 55');
                break;
            case 'alert':
                mouth.setAttribute('d', 'M40 60 L60 60');
                eyeL.setAttribute('fill', '#EF4444');
                eyeR.setAttribute('fill', '#EF4444');
                break;
            case 'thinking':
                mouth.setAttribute('d', 'M40 58 Q50 55 60 58');
                break;
            default:
                mouth.setAttribute('d', 'M40 55 Q50 60 60 55');
                eyeL.setAttribute('fill', '#1E293B');
                eyeR.setAttribute('fill', '#1E293B');
        }
    },

    startCycle() {
        // Change state every 30-60 seconds
        setInterval(() => {
            const states = Object.values(this.states);
            // Higher chance for normal
            const newState = Math.random() > 0.7 ? states[Math.floor(Math.random() * states.length)] : 'normal';
            this.currentState = newState;

            // If it's late at night, sleep
            const hour = new Date().getHours();
            if (hour > 22 || hour < 6) this.currentState = 'sleep';

            this.talk();
        }, 45000);
    },

    applyAnimations() {
        // Optional: Add hover interactivity to look at cursor
        document.addEventListener('mousemove', (e) => {
            const mascot = document.getElementById(this.containerId);
            if (!mascot) return;

            const rect = mascot.getBoundingClientRect();
            const centerX = rect.left + rect.width / 2;
            const centerY = rect.top + rect.height / 2;

            const angle = Math.atan2(e.clientY - centerY, e.clientX - centerX);
            const distance = Math.min(5, Math.hypot(e.clientX - centerX, e.clientY - centerY) / 50);

            const moveX = Math.cos(angle) * distance;
            const moveY = Math.sin(angle) * distance;

            const eyes = document.querySelector('.eyes-container');
            if (eyes) {
                eyes.style.transform = `translate(${moveX}px, ${moveY}px)`;
            }
        });
    }
};
// Exportar para cargador de módulos
window.MascotWidget = MascotWidget;
