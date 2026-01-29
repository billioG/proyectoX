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
                "¿Qué vamos a construir hoy? 🤖",
                "¡Recuerda subir tus avances! 🚀",
                "¡El código es tu superpoder! ⚡",
                "¿Has revisado el ranking hoy? 🏆",
                "¡Sigue aprendiendo, 1bot está contigo! 💙"
            ],
            happy: [
                "¡Increíble progreso! 🎉",
                "¡Eres una estrella del código! ⭐",
                "¡Esa racha se ve genial! 🔥",
                "¡Nada te detiene! 🚀"
            ],
            thinking: [
                "Mm... ¿cómo optimizaríamos ese algoritmo? 🤔",
                "Analizando nuevas posibilidades tecnológicas... 📊",
                "¿Y si probamos un enfoque diferente? 💡"
            ],
            sleep: [
                "Zzz... soñando con circuitos... 🔋",
                "Es tarde, ¡mañana seguimos innovando! 🌙",
                "Entrando en modo ahorro de energía... 🔌"
            ]
        },
        docente: {
            normal: [
                "¡Hola, Profe! ¿Listos para inspirar? 🍎",
                "Hay proyectos esperando tu evaluación. 📊",
                "¡Tus alumnos están logrando grandes cosas! 🌟",
                "¿Ya pasaste asistencia hoy? 📋"
            ],
            happy: [
                "¡Excelente gestión de grupo! ✨",
                "Tus KPIs están por las nubes hoy. 📈",
                "¡Gracias por guiar a los futuros inventores! 🤖"
            ],
            work: [
                "Evaluando talentos... ✍️",
                "Sincronizando datos de aprendizaje... 🔄",
                "Preparando el próximo gran desafío. 🎯"
            ]
        },
        admin: {
            normal: [
                "Sistema operativo estable. ✅",
                "Explorando métricas de impacto... 📈",
                "Todo bajo control en ProjectX. 🛡️",
                "¿Revisamos el informe mensual? 📂"
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
        container.className = 'fixed bottom-6 left-6 z-[100] transition-all duration-500 transform hover:scale-105 group';
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
                    left: 0;
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
                    left: 24px;
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
                <svg viewBox="0 0 100 100" id="mascot-svg">
                    <!-- Head -->
                    <rect x="20" y="20" width="60" height="50" rx="15" fill="#00ADEF" />
                    <rect x="25" y="25" width="50" height="40" rx="10" fill="#E2E8F0" class="face-screen" />
                    
                    <!-- Eyes -->
                    <g class="eyes-container">
                        <circle cx="40" cy="45" r="5" fill="#1E293B" class="mascot-eye" id="eye-l" />
                        <circle cx="60" cy="45" r="5" fill="#1E293B" class="mascot-eye" id="eye-r" />
                    </g>
                    
                    <!-- Mouth -->
                    <path d="M40 55 Q50 60 60 55" stroke="#1E293B" stroke-width="3" fill="transparent" id="mascot-mouth" />
                    
                    <!-- Antennas -->
                    <line x1="50" y1="20" x2="50" y2="10" stroke="#00ADEF" stroke-width="4" />
                    <circle cx="50" cy="8" r="4" fill="#6366F1" />
                    
                    <!-- Body (partial) -->
                    <path d="M30 70 L70 70 L75 90 L25 90 Z" fill="#00ADEF" />
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

        bubble.innerText = message;
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
                        <div class="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">🤖</div>
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
            const context = `Usuario: ${currentUser.full_name}, Rol: ${userRole}, Racha: ${userData.streak || 0}`;
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
            document.getElementById(loadingId).innerHTML = "Error al conectar con la IA.";
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
