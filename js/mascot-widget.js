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
                '¿Qué construimos hoy? <i class="fas fa-robot"></i>',
                '¡Subí tus avances! <i class="fas fa-rocket"></i>',
                'El código es tu superpoder <i class="fas fa-bolt"></i>',
                '¿Viste el ranking hoy? <i class="fas fa-trophy"></i>',
                '¡Seguí aprendiendo! <i class="fas fa-heart"></i>',
                '¿Cómo te sentís hoy? <i class="fas fa-heart"></i>',
                'Equivocarse también es aprender <i class="fas fa-seedling"></i>',
                'Un paso a la vez, vas bien <i class="fas fa-shoe-prints"></i>'
            ],
            happy: [
                '¡Increíble progreso! <i class="fas fa-champagne-glasses"></i>',
                '¡Sos una estrella! ⭐',
                '¡Esa racha se ve genial! <i class="fas fa-fire"></i>',
                '¡Nada te detiene! <i class="fas fa-rocket"></i>'
            ],
            thinking: [
                '¿Cómo optimizamos eso? <i class="fas fa-circle-question"></i>',
                'Pensando ideas nuevas... <i class="fas fa-chart-bar"></i>',
                '¿Probamos otro enfoque? <i class="fas fa-lightbulb"></i>'
            ],
            sleep: [
                'Zzz... <i class="fas fa-battery-full"></i>',
                'Mañana seguimos <i class="fas fa-moon"></i>',
                'Ahorrando energía <i class="fas fa-plug"></i>'
            ],
            concerned: [
                'Ayer no te vi por acá... <i class="fas fa-face-frown"></i>',
                '¿Todo bien? Te extrañé ayer <i class="fas fa-heart-crack"></i>'
            ],
            sad: [
                'Hace días que no venís... ¿me extrañaste? <i class="fas fa-face-sad-tear"></i>',
                'Tu racha te espera hace días <i class="fas fa-face-sad-tear"></i>'
            ]
        },
        docente: {
            normal: [
                '¡Hola, Profe! <i class="fas fa-apple-whole"></i>',
                'Tenés proyectos por evaluar <i class="fas fa-chart-bar"></i>',
                '¡Tus alumnos la rompen! <i class="fas fa-star"></i>',
                '¿Pasaste asistencia hoy? <i class="fas fa-clipboard-list"></i>'
            ],
            happy: [
                '¡Excelente gestión! <i class="fas fa-wand-magic-sparkles"></i>',
                'Tus KPIs van genial <i class="fas fa-chart-line"></i>',
                '¡Gracias por guiarlos! <i class="fas fa-robot"></i>'
            ],
            work: [
                'Evaluando talentos... <i class="fas fa-pen"></i>',
                'Sincronizando datos... <i class="fas fa-arrows-rotate"></i>',
                'Preparando el próximo reto <i class="fas fa-bullseye"></i>'
            ],
            concerned: [
                'Ayer no te vimos, Profe <i class="fas fa-face-frown"></i>'
            ],
            sad: [
                'Hace días que no entra, Profe... sus alumnos preguntan <i class="fas fa-face-sad-tear"></i>'
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
        // Se llama tanto desde app.js (si ya había sesión al cargar) como
        // desde auth.js justo al loguearse -- este guard evita duplicar el
        // intervalo de startCycle() si ambas rutas llegan a dispararse.
        if (this._initialized) return;
        this._initialized = true;
        console.log("🤖 Iniciando Mascota...");
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
        // z-[250]: por encima de TODOS los modales de la app (el más alto
        // en uso es z-[240], el quiz de eventos sorpresa) -- antes estaba
        // en z-[100] y quedaba tapada por el reproductor de cursos
        // (z-[200]), donde los estudiantes pasan la mayor parte del tiempo.
        container.className = 'fixed bottom-6 right-[92px] md:bottom-6 md:right-6 z-[250] transition-all duration-500 transform hover:scale-105 group';
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
                    border: 2px solid #00C853;
                    opacity: 0;
                    transform: translateY(10px) scale(0.9);
                    transition: all 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
                    pointer-events: none;
                }
                .dark .mascot-bubble {
                    background: #1e293b;
                    color: white;
                    border-color: #00C853;
                    box-shadow: 0 10px 25px rgba(0,0,0,0.3);
                }
                .mascot-bubble::after {
                    content: '';
                    position: absolute;
                    top: 100%;
                    right: 24px;
                    border: 10px solid transparent;
                    border-top-color: #00C853;
                }
                .mascot-bubble.show {
                    opacity: 1;
                    transform: translateY(0) scale(1);
                }
                .mascot-robot {
                    width: 80px;
                    height: 80px;
                    cursor: pointer;
                    filter: drop-shadow(0 5px 15px rgba(0,200,83,0.25));
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

                    <!-- Párpados caídos (tristeza/preocupación) -- ocultos por
                    defecto, setFace() los muestra en 'concerned'/'sad'. -->
                    <path id="eyelid-l" d="M 132 150 Q 160 130 188 150 L 188 158 Q 160 140 132 158 Z" fill="#00C853" style="display:none" />
                    <path id="eyelid-r" d="M 212 150 Q 240 130 268 150 L 268 158 Q 240 140 212 158 Z" fill="#00C853" style="display:none" />

                    <!-- Lágrima -- solo en 'sad' (3+ días sin entrar). -->
                    <path id="mascot-tear" d="M 160 190 C 160 205 148 212 148 222 C 148 230 154 235 160 235 C 166 235 172 230 172 222 C 172 212 160 205 160 190 Z" fill="#4FC3F7" style="display:none" />

                    <!-- Brillo festivo -- solo en meses de fiesta grande (cumpleaños,
                    Halloween, Navidad), ver setSeasonalExpression(). -->
                    <path id="mascot-sparkle-l" d="M 168 148 l 3 8 l 8 3 l -8 3 l -3 8 l -3 -8 l -8 -3 l 8 -3 Z" fill="#FFFFFF" style="display:none" />
                    <path id="mascot-sparkle-r" d="M 248 148 l 3 8 l 8 3 l -8 3 l -3 8 l -3 -8 l -8 -3 l 8 -3 Z" fill="#FFFFFF" style="display:none" />

                    <!-- Pico Amarillo -->
                    <path d="M 182 168 Q 200 162 218 168 C 218 195 200 218 200 218 C 200 218 182 195 182 168 Z" fill="#FFC107" />
                    <path d="M 188 170 Q 200 166 212 170 C 210 185 200 202 200 202 C 200 202 190 185 188 170 Z" fill="#FFA000" opacity="0.5" />

                    <!-- Accesorio del mes -- ver getSeasonalAccessorySvg(), se
                    llena en render() según la fecha actual. -->
                    <g id="mascot-accessory"></g>
                </svg>
            </div>
        `;
        document.body.appendChild(container);
        this.restorePosition(container);
        this.enableDrag(container);

        // Accesorio de temporada -- automático según el mes actual.
        const month = new Date().getMonth();
        const accessory = document.getElementById('mascot-accessory');
        if (accessory) accessory.innerHTML = this.getSeasonalAccessorySvg(month);
        this.setSeasonalExpression(month);

        // Show first message after a delay
        setTimeout(() => this.talk(), 2000);
    },

    // Accesorio de temporada por mes (0=enero ... 11=diciembre). Coordenadas
    // pensadas para el viewBox 400x500 del SVG de la mascota -- cabeza
    // centrada en x=200, y≈65-160. Elegidos simples y decorativos a
    // propósito (sin íconos religiosos ni caricaturas de rasgos/vestimenta
    // indígena específica) para que ninguno resulte pesado ni de mal gusto.
    getSeasonalAccessorySvg(month) {
        switch (month) {
            case 0: // Enero -- regreso a clases: birrete de graduación, grande y arriba de todo
                return `
                    <polygon points="200,8 275,45 200,82 125,45" fill="#212121" stroke="#000" stroke-width="2" />
                    <rect x="175" y="45" width="50" height="30" fill="#37474F" />
                    <line x1="270" y1="45" x2="272" y2="90" stroke="#FBC02D" stroke-width="4" />
                    <circle cx="272" cy="96" r="10" fill="#FBC02D" />
                `;
            case 1: // Febrero -- mes del amor: anteojos de corazón grandes, tapan los ojos
                return `
                    <path d="M 160 148 C 143 118 98 128 98 158 C 98 185 133 200 160 228 C 187 200 222 185 222 158 C 222 128 177 118 160 148 Z" fill="#EC407A" stroke="#AD1457" stroke-width="5" />
                    <path d="M 240 148 C 223 118 178 128 178 158 C 178 185 213 200 240 228 C 267 200 302 185 302 158 C 302 128 257 118 240 148 Z" fill="#EC407A" stroke="#AD1457" stroke-width="5" />
                    <rect x="200" y="150" width="20" height="8" fill="#AD1457" />
                `;
            case 2: // Marzo -- Día de la Mujer: gran moño morado en la cabeza
                return `
                    <path d="M 200 45 C 155 15 110 40 150 68 C 110 90 155 115 200 85 Z" fill="#AB47BC" stroke="#6A1B9A" stroke-width="4" />
                    <path d="M 200 45 C 245 15 290 40 250 68 C 290 90 245 115 200 85 Z" fill="#AB47BC" stroke="#6A1B9A" stroke-width="4" />
                    <circle cx="200" cy="65" r="18" fill="#8E24AA" stroke="#6A1B9A" stroke-width="3" />
                `;
            case 3: // Abril -- Día de la Tierra: gran hoja/brote sobre la cabeza
                return `
                    <path d="M 200 20 C 145 30 130 90 185 105 C 175 65 190 35 200 20 Z" fill="#81C784" stroke="#2E7D32" stroke-width="4" />
                    <path d="M 200 20 C 255 30 270 90 215 105 C 225 65 210 35 200 20 Z" fill="#4CAF50" stroke="#2E7D32" stroke-width="4" />
                    <line x1="200" y1="20" x2="200" y2="100" stroke="#2E7D32" stroke-width="4" />
                `;
            case 4: // Mayo -- Día de la Madre: corona de flores grande en la frente
                return `
                    <circle cx="150" cy="75" r="22" fill="#F48FB1" stroke="#C2185B" stroke-width="3" /><circle cx="200" cy="55" r="24" fill="#F06292" stroke="#C2185B" stroke-width="3" /><circle cx="250" cy="75" r="22" fill="#F48FB1" stroke="#C2185B" stroke-width="3" />
                    <circle cx="150" cy="75" r="8" fill="#FFEB3B" /><circle cx="200" cy="55" r="9" fill="#FFEB3B" /><circle cx="250" cy="75" r="8" fill="#FFEB3B" />
                `;
            case 5: // Junio -- Día del Padre y del Maestro: corbata grande + birrete chico
                return `
                    <path d="M 178 90 L 222 90 L 210 130 L 200 145 L 190 130 Z" fill="#5C6BC0" stroke="#283593" stroke-width="3" />
                    <path d="M 185 200 L 215 200 L 208 285 L 200 305 L 192 285 Z" fill="#3949AB" stroke="#1A237E" stroke-width="3" />
                `;
            case 6: // Julio -- cumpleaños: gorro de fiesta grande + confeti abundante
                return `
                    <path d="M 165 95 L 235 95 L 200 15 Z" fill="#FFCA28" stroke="#F57F17" stroke-width="3" />
                    <circle cx="200" cy="12" r="10" fill="#FF5252" />
                    <rect x="178" y="55" width="12" height="12" fill="#EC407A" transform="rotate(20 184 61)" />
                    <rect x="205" y="65" width="12" height="12" fill="#42A5F5" transform="rotate(-15 211 71)" />
                    <circle cx="120" cy="120" r="7" fill="#FF5252" /><circle cx="290" cy="130" r="7" fill="#29B6F6" /><circle cx="110" cy="200" r="7" fill="#66BB6A" /><circle cx="300" cy="220" r="7" fill="#FFEE58" />
                `;
            case 7: // Agosto -- Día Internacional de los Pueblos Indígenas: banda tejida colorida en el pecho, más ancha
                return `
                    <path d="M 130 190 L 270 190 L 270 250 L 130 250 Z" fill="#D32F2F" />
                    <path d="M 130 202 L 270 202 L 270 214 L 130 214 Z" fill="#FBC02D" />
                    <path d="M 130 226 L 270 226 L 270 238 L 130 238 Z" fill="#1976D2" />
                    <path d="M 130 214 L 270 214 L 270 226 L 130 226 Z" fill="#43A047" />
                `;
            case 8: // Septiembre -- Independencia de Guatemala: banda diagonal ancha con estrella
                return `
                    <path d="M 130 180 L 165 180 L 235 330 L 200 330 Z" fill="#4FC3F7" stroke="#0288D1" stroke-width="3" />
                    <path d="M 165 180 L 195 180 L 265 330 L 235 330 Z" fill="#FFFFFF" stroke="#B0BEC5" stroke-width="2" />
                    <path d="M 170 240 l 6 -18 l 6 18 l -15 -11 h 18 z" fill="#4FC3F7" />
                `;
            case 9: // Octubre -- Halloween: sombrero de bruja grande
                return `
                    <path d="M 200 5 L 250 95 L 150 95 Z" fill="#4A148C" stroke="#1A0033" stroke-width="3" />
                    <ellipse cx="200" cy="97" rx="55" ry="13" fill="#4A148C" stroke="#1A0033" stroke-width="3" />
                    <rect x="175" y="65" width="50" height="14" fill="#FF6F00" />
                `;
            case 10: // Noviembre -- Día de Muertos: corona de cempasúchil, más flores y más grande (sin calaveras)
                return `
                    <circle cx="140" cy="85" r="18" fill="#FB8C00" stroke="#E65100" stroke-width="2" /><circle cx="180" cy="55" r="18" fill="#FFA726" stroke="#E65100" stroke-width="2" /><circle cx="220" cy="55" r="18" fill="#FFA726" stroke="#E65100" stroke-width="2" /><circle cx="260" cy="85" r="18" fill="#FB8C00" stroke="#E65100" stroke-width="2" />
                    <circle cx="140" cy="85" r="7" fill="#BF360C" /><circle cx="180" cy="55" r="7" fill="#BF360C" /><circle cx="220" cy="55" r="7" fill="#BF360C" /><circle cx="260" cy="85" r="7" fill="#BF360C" />
                `;
            case 11: // Diciembre -- Navidad: gorro navideño grande y esponjoso
                return `
                    <path d="M 200 10 L 250 95 Q 185 78 150 100 Z" fill="#E53935" stroke="#B71C1C" stroke-width="3" />
                    <ellipse cx="150" cy="100" rx="26" ry="15" fill="#FFFFFF" />
                    <circle cx="250" cy="90" r="15" fill="#FFFFFF" />
                `;
            default:
                return '';
        }
    },

    // Meses de fiesta grande -- ojos con brillo (expresión distinta, no solo
    // accesorio) además del disfraz de arriba.
    festiveMonths: [6, 9, 11],

    setSeasonalExpression(month) {
        const sparkleL = document.getElementById('mascot-sparkle-l');
        const sparkleR = document.getElementById('mascot-sparkle-r');
        if (!sparkleL || !sparkleR) return;
        const show = this.festiveMonths.includes(month);
        sparkleL.style.display = show ? 'block' : 'none';
        sparkleR.style.display = show ? 'block' : 'none';
    },

    // Recuerda dónde la dejó el usuario -- por device (localStorage), no
    // sincroniza entre dispositivos a propósito, cada pantalla tiene su
    // propio tamaño y le puede convenir un lugar distinto.
    restorePosition(container) {
        try {
            const saved = JSON.parse(localStorage.getItem('PX_MASCOT_POS') || 'null');
            if (saved && typeof saved.left === 'number' && typeof saved.top === 'number') {
                const maxLeft = window.innerWidth - container.offsetWidth;
                const maxTop = window.innerHeight - container.offsetHeight;
                container.style.left = `${Math.min(Math.max(0, saved.left), Math.max(0, maxLeft))}px`;
                container.style.top = `${Math.min(Math.max(0, saved.top), Math.max(0, maxTop))}px`;
                container.style.right = 'auto';
                container.style.bottom = 'auto';
            }
        } catch (e) { /* posición corrupta en localStorage -- se queda en la esquina default */ }
    },

    // Arrastrable con mouse y touch (Pointer Events cubre ambos). Un click
    // simple (sin mover) sigue abriendo el chat -- solo un movimiento real
    // arriba del umbral cuenta como arrastre y bloquea ese click.
    enableDrag(container) {
        const robot = container.querySelector('.mascot-robot');
        if (!robot) return;
        let startX = 0, startY = 0, startLeft = 0, startTop = 0, dragging = false, moved = false;

        const onPointerDown = (e) => {
            if (e.button !== undefined && e.button !== 0) return;
            dragging = true;
            moved = false;
            const rect = container.getBoundingClientRect();
            startLeft = rect.left;
            startTop = rect.top;
            startX = e.clientX;
            startY = e.clientY;
        };

        const onPointerMove = (e) => {
            if (!dragging) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (!moved && Math.hypot(dx, dy) > 6) {
                moved = true;
                container.style.transition = 'none';
                robot.style.cursor = 'grabbing';
            }
            if (!moved) return;
            e.preventDefault();

            const maxLeft = window.innerWidth - container.offsetWidth;
            const maxTop = window.innerHeight - container.offsetHeight;
            container.style.left = `${Math.min(Math.max(0, startLeft + dx), Math.max(0, maxLeft))}px`;
            container.style.top = `${Math.min(Math.max(0, startTop + dy), Math.max(0, maxTop))}px`;
            container.style.right = 'auto';
            container.style.bottom = 'auto';
        };

        const onPointerUp = () => {
            if (!dragging) return;
            dragging = false;
            container.style.transition = '';
            robot.style.cursor = 'pointer';
            if (moved) {
                const rect = container.getBoundingClientRect();
                localStorage.setItem('PX_MASCOT_POS', JSON.stringify({ left: rect.left, top: rect.top }));
                this._justDragged = true;
            }
        };

        robot.addEventListener('pointerdown', onPointerDown);
        window.addEventListener('pointermove', onPointerMove);
        window.addEventListener('pointerup', onPointerUp);

        // Si el click que sigue viene justo después de un arrastre real, se
        // bloquea acá -- si no, soltar el mouse después de mover abría el
        // chat de golpe (el navegador dispara click igual tras un drag).
        robot.addEventListener('click', (e) => {
            if (this._justDragged) {
                e.stopImmediatePropagation();
                e.preventDefault();
                this._justDragged = false;
            }
        }, true);
    },

    async talk() {
        const bubble = document.getElementById('mascot-msg');
        if (!bubble) return;

        // Primer mensaje de la sesión -- si el usuario estuvo ausente, la
        // mascota lo saluda triste/preocupada en vez del mensaje random de
        // siempre (window._daysSinceLastLogin lo calcula updateLoginStreak
        // ANTES de sobreescribir last_login, ver gamification.js).
        let isMoodGreeting = false;
        if (!this._greetedThisSession) {
            this._greetedThisSession = true;
            const daysAway = window._daysSinceLastLogin || 0;
            if (daysAway >= 3) { this.currentState = 'sad'; isMoodGreeting = true; }
            else if (daysAway >= 1) { this.currentState = 'concerned'; isMoodGreeting = true; }
        }

        let message = "";

        // Si tenemos AIService disponible, intentamos obtener un mensaje
        // "inteligente" -- salvo que este sea el saludo de "te extrañé" por
        // ausencia, que no debe competir con un mensaje random de la IA.
        if (!isMoodGreeting && typeof window.AIService !== 'undefined' && window.currentUser) {
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
        } else if (message.length > 140) {
            // Red de seguridad -- el prompt ya le pide a la IA una sola
            // frase corta (ver ai-proxy short:true), pero por si igual
            // se pasa, se corta en el último punto/final de oración
            // completo en vez de a la mitad de una palabra/frase.
            const cut = message.slice(0, 140);
            const lastSentenceEnd = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
            message = lastSentenceEnd > 40 ? cut.slice(0, lastSentenceEnd + 1) : cut.replace(/\s+\S*$/, '') + '...';
        }

        bubble.innerHTML = message;
        bubble.classList.add('show');
        this.setFace(this.currentState);

        setTimeout(() => {
            bubble.classList.remove('show');
        }, 8000);
    },

    async openAIChat() {
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
                            <h3 class="font-black uppercase tracking-widest text-sm leading-none">Preguntarle al Asistente IA</h3>
                            <p class="text-[0.6rem] font-bold opacity-70 mt-1 uppercase">Impulsado por OpenAI GPT-4o</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2">
                        <button onclick="MascotWidget.clearChatHistory()" class="w-8 h-8 rounded-lg bg-black/10 hover:bg-black/20 flex items-center justify-center transition-all" title="Borrar historial">
                            <i class="fas fa-trash-alt text-xs"></i>
                        </button>
                        <button class="w-8 h-8 rounded-lg bg-black/10 hover:bg-black/20 flex items-center justify-center transition-all" onclick="this.closest('.fixed').remove()">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </div>

                <div id="ai-chat-history" class="p-6 space-y-4 max-h-[400px] overflow-y-auto custom-scrollbar bg-slate-50 dark:bg-slate-950/20">
                    <div class="text-center text-slate-400 text-xs py-4"><i class="fas fa-spinner fa-spin"></i></div>
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

        await this.renderChatHistory();

        const input = document.getElementById('ai-chat-input');
        input.focus();
        input.onkeypress = (e) => { if (e.key === 'Enter') this.sendAIMessage(); };
    },

    userBubbleHtml(text) {
        return `<div class="flex gap-3 justify-end"><div class="bg-primary text-white p-4 rounded-2xl rounded-tr-none shadow-md text-sm font-bold max-w-[80%]">${text}</div></div>`;
    },

    assistantBubbleHtml(text) {
        return `<div class="flex gap-3"><div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs shrink-0"><i class="fas fa-feather"></i></div><div class="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none shadow-sm text-sm font-medium text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-800">${text}</div></div>`;
    },

    async renderChatHistory() {
        const history = document.getElementById('ai-chat-history');
        if (!history || !window._supabase || !window.currentUser) return;

        const { data: messages } = await window._supabase.from('mascot_chat_messages')
            .select('role, content').eq('user_id', window.currentUser.id)
            .order('created_at', { ascending: true }).limit(40);

        if (!messages?.length) {
            history.innerHTML = this.assistantBubbleHtml('¡Hola! Soy tu asistente de IA. ¿En qué puedo ayudarte hoy con tus proyectos de tecnología?');
            return;
        }

        history.innerHTML = messages.map(m => m.role === 'user' ? this.userBubbleHtml(m.content) : this.assistantBubbleHtml(m.content)).join('');
        history.scrollTop = history.scrollHeight;
    },

    async saveChatMessage(role, content) {
        if (!window._supabase || !window.currentUser) return;
        await window._supabase.from('mascot_chat_messages').insert({ user_id: window.currentUser.id, role, content });
    },

    async clearChatHistory() {
        if (!confirm('¿Borrar todo el historial de esta conversación?')) return;
        await window._supabase.from('mascot_chat_messages').delete().eq('user_id', window.currentUser.id);
        await this.renderChatHistory();
    },

    async sendAIMessage() {
        const input = document.getElementById('ai-chat-input');
        const history = document.getElementById('ai-chat-history');
        const text = input.value.trim();
        if (!text) return;

        input.value = '';
        history.innerHTML += this.userBubbleHtml(text);
        history.scrollTop = history.scrollHeight;
        this.saveChatMessage('user', text);

        const loadingId = 'ai-loading-' + Date.now();
        history.innerHTML += `
            <div id="${loadingId}" class="flex gap-3">
                <div class="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-xs shrink-0"><i class="fas fa-feather"></i></div>
                <div class="bg-white dark:bg-slate-800 p-4 rounded-2xl rounded-tl-none shadow-sm text-sm font-medium text-slate-400 border border-slate-100 dark:border-slate-800 flex items-center gap-2">
                    <i class="fas fa-circle-notch fa-spin"></i> Procesando...
                </div>
            </div>
        `;
        history.scrollTop = history.scrollHeight;

        try {
            // Antes se mandaba SOLO el mensaje actual, sin nada de lo dicho
            // antes -- por eso "continuá" no continuaba nada, la IA no tenía
            // memoria real de la conversación (cada request era independiente).
            //
            // BUG: esta variable se llamaba `history` también, tapando (shadowing)
            // al `history` de arriba (el elemento del DOM) dentro de este bloque
            // try -- la respuesta SÍ se guardaba en la base, pero nunca se
            // pintaba en pantalla porque `history.innerHTML += ...` estaba
            // escribiendo sobre el array, no sobre el DOM. Por eso la
            // respuesta "aparecía" recién al cerrar y volver a abrir el chat
            // (ahí renderChatHistory() sí lee de la base de cero).
            const { data: priorMessages } = await window._supabase.from('mascot_chat_messages')
                .select('role, content').eq('user_id', window.currentUser.id)
                .order('created_at', { ascending: false }).limit(11);
            const chatHistory = (priorMessages || []).reverse().slice(0, -1).slice(-10);

            const context = `Usuario: ${window.userData?.full_name || ''}, Rol: ${window.userRole}, Racha: ${window.userData?.streak || 0}`;
            const response = await AIService.ask(text, context, false, chatHistory);
            document.getElementById(loadingId)?.remove();

            history.innerHTML += this.assistantBubbleHtml(response);
            history.scrollTop = history.scrollHeight;
            this.saveChatMessage('assistant', response);
        } catch (err) {
            console.error('Mascot chat error:', err);
            const loadingEl = document.getElementById(loadingId);
            if (loadingEl) loadingEl.innerHTML = 'Error al conectar con la IA.';
        }
    },

    setFace(state) {
        const eyeL = document.getElementById('eye-l');
        const eyeR = document.getElementById('eye-r');
        const eyelidL = document.getElementById('eyelid-l');
        const eyelidR = document.getElementById('eyelid-r');
        const tear = document.getElementById('mascot-tear');
        if (!eyeL || !eyeR) return;

        eyeL.setAttribute('fill', state === 'alert' ? '#EF4444' : '#1E293B');
        eyeR.setAttribute('fill', state === 'alert' ? '#EF4444' : '#1E293B');

        const showEyelids = state === 'concerned' || state === 'sad';
        if (eyelidL) eyelidL.style.display = showEyelids ? 'block' : 'none';
        if (eyelidR) eyelidR.style.display = showEyelids ? 'block' : 'none';
        if (tear) tear.style.display = state === 'sad' ? 'block' : 'none';
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
