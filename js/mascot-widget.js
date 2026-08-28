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

                    <!-- Cejas de susto -- solo octubre (araña colgando), ver setSeasonalExpression(). -->
                    <path id="mascot-scared-brow-l" d="M 138 126 L 160 116" stroke="#1E293B" stroke-width="5" stroke-linecap="round" style="display:none" />
                    <path id="mascot-scared-brow-r" d="M 262 126 L 240 116" stroke="#1E293B" stroke-width="5" stroke-linecap="round" style="display:none" />

                    <!-- Pico Amarillo -->
                    <path d="M 182 168 Q 200 162 218 168 C 218 195 200 218 200 218 C 200 218 182 195 182 168 Z" fill="#FFC107" />
                    <path d="M 188 170 Q 200 166 212 170 C 210 185 200 202 200 202 C 200 202 190 185 188 170 Z" fill="#FFA000" opacity="0.5" />

                    <!-- Accesorio del mes -- ver getSeasonalAccessorySvg(), se
                    llena en render() según la fecha actual. -->
                    <g id="mascot-accessory"></g>

                    <!-- Gafas permanentes -- item comprado en la tienda (ver
                    gamification.js buyShopItem 'Gafas de la Mascota'), no
                    depende del mes. Independiente del accesorio estacional
                    de arriba para que puedan convivir sin pisarse. -->
                    <g id="mascot-permanent-accessory"></g>
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

        // Gafas permanentes -- item comprado en la tienda, no depende del mes.
        const permAccessory = document.getElementById('mascot-permanent-accessory');
        if (permAccessory && window.userData?.has_mascot_glasses) {
            permAccessory.innerHTML = this.getGlassesSvg();
        }

        // Show first message after a delay
        setTimeout(() => this.talk(), 2000);
    },

    // Gafas de sol permanentes (item de tienda) -- cubren ambos ojos
    // (centrados en x=160/240, y=158) con un puente al centro, estilo flat
    // sin gradientes igual que el resto del arte de la mascota.
    getGlassesSvg() {
        return `
            <rect x="128" y="143" width="64" height="34" rx="14" fill="#1E293B" />
            <rect x="208" y="143" width="64" height="34" rx="14" fill="#1E293B" />
            <rect x="192" y="152" width="16" height="6" rx="3" fill="#1E293B" />
            <rect x="140" y="150" width="20" height="8" rx="4" fill="#FFFFFF" opacity="0.3" />
            <rect x="220" y="150" width="20" height="8" rx="4" fill="#FFFFFF" opacity="0.3" />
        `;
    },

    // Accesorio de temporada por mes (0=enero ... 11=diciembre). Coordenadas
    // pensadas para el viewBox 400x500 del SVG de la mascota -- cabeza
    // centrada en x=200, y≈65-160. Elegidos simples y decorativos a
    // propósito (sin íconos religiosos ni caricaturas de rasgos/vestimenta
    // indígena específica) para que ninguno resulte pesado ni de mal gusto.
    getSeasonalAccessorySvg(month) {
        switch (month) {
            case 0: // Enero -- regreso a clases: lápiz en un ala, cuaderno en la otra
                return `
                    <g transform="rotate(-35 85 220)">
                        <rect x="70" y="185" width="16" height="70" fill="#FFC107" stroke="#F57F17" stroke-width="1.5" />
                        <rect x="70" y="176" width="16" height="11" fill="#F06292" />
                        <polygon points="70,255 86,255 78,275" fill="#8D6E63" />
                        <polygon points="74,255 82,255 78,266" fill="#37474F" />
                    </g>
                    <rect x="288" y="190" width="46" height="62" rx="4" fill="#42A5F5" stroke="#1565C0" stroke-width="2.5" />
                    <line x1="296" y1="206" x2="326" y2="206" stroke="#FFFFFF" stroke-width="2.5" />
                    <line x1="296" y1="218" x2="326" y2="218" stroke="#FFFFFF" stroke-width="2.5" />
                    <line x1="296" y1="230" x2="326" y2="230" stroke="#FFFFFF" stroke-width="2.5" />
                    <circle cx="290" cy="196" r="2.5" fill="#0D47A1" /><circle cx="290" cy="210" r="2.5" fill="#0D47A1" /><circle cx="290" cy="224" r="2.5" fill="#0D47A1" /><circle cx="290" cy="238" r="2.5" fill="#0D47A1" />
                `;
            case 1: // Febrero -- mes del amor: anteojos de corazón sobre los ojos (tamaño ajustado)
                return `
                    <path d="M 160 145 C 148 128 128 132 128 150 C 128 168 145 178 160 195 C 175 178 192 168 192 150 C 192 132 172 128 160 145 Z" fill="#EC407A" stroke="#AD1457" stroke-width="4" />
                    <path d="M 240 145 C 228 128 208 132 208 150 C 208 168 225 178 240 195 C 255 178 272 168 272 150 C 272 132 252 128 240 145 Z" fill="#EC407A" stroke="#AD1457" stroke-width="4" />
                    <rect x="194" y="150" width="12" height="6" fill="#AD1457" />
                `;
            case 2: // Marzo -- Día de la Mujer: placa "8M" en el pecho (texto, siempre legible)
                return `
                    <rect x="152" y="215" width="96" height="34" rx="17" fill="#9C27B0" stroke="#5E1487" stroke-width="2.5" />
                    <text x="200" y="239" text-anchor="middle" font-size="24" font-weight="bold" font-family="sans-serif" fill="#FFFFFF">8M</text>
                `;
            case 3: // Abril -- Día de la Tierra: mundo grande al frente, a la altura del pecho
                return `
                    <circle cx="200" cy="235" r="46" fill="#42A5F5" stroke="#1565C0" stroke-width="3.5" />
                    <path d="M 158 220 Q 200 205 242 220" stroke="#1565C0" stroke-width="3" fill="none" />
                    <path d="M 158 250 Q 200 265 242 250" stroke="#1565C0" stroke-width="3" fill="none" />
                    <path d="M 200 189 C 185 210 185 260 200 281" stroke="#1565C0" stroke-width="3" fill="none" />
                    <path d="M 178 205 C 168 218 174 230 186 226 C 183 238 198 242 204 230 C 216 235 224 220 212 213 Z" fill="#66BB6A" />
                    <path d="M 205 245 C 198 255 205 268 218 262 C 222 272 236 270 236 258 Z" fill="#66BB6A" />
                `;
            case 4: // Mayo -- Día de la Madre: girasol grande y claro en el ala izquierda
                return `
                    <g transform="translate(88,205) scale(1.8)">
                        <ellipse cx="0" cy="-17" rx="7" ry="11" fill="#FDD835" stroke="#F9A825" stroke-width="1.5" />
                        <ellipse cx="12" cy="-12" rx="7" ry="11" fill="#FDD835" stroke="#F9A825" stroke-width="1.5" transform="rotate(45 12 -12)" />
                        <ellipse cx="17" cy="0" rx="7" ry="11" fill="#FDD835" stroke="#F9A825" stroke-width="1.5" transform="rotate(90 17 0)" />
                        <ellipse cx="12" cy="12" rx="7" ry="11" fill="#FDD835" stroke="#F9A825" stroke-width="1.5" transform="rotate(135 12 12)" />
                        <ellipse cx="0" cy="17" rx="7" ry="11" fill="#FDD835" stroke="#F9A825" stroke-width="1.5" transform="rotate(180 0 17)" />
                        <ellipse cx="-12" cy="12" rx="7" ry="11" fill="#FDD835" stroke="#F9A825" stroke-width="1.5" transform="rotate(225 -12 12)" />
                        <ellipse cx="-17" cy="0" rx="7" ry="11" fill="#FDD835" stroke="#F9A825" stroke-width="1.5" transform="rotate(270 -17 0)" />
                        <ellipse cx="-12" cy="-12" rx="7" ry="11" fill="#FDD835" stroke="#F9A825" stroke-width="1.5" transform="rotate(315 -12 -12)" />
                        <circle cx="0" cy="0" r="11" fill="#795548" stroke="#4E342E" stroke-width="1.5" />
                        <path d="M 0 28 L -5 58 L 8 51 Z" fill="#66BB6A" stroke="#2E7D32" stroke-width="2" />
                    </g>
                `;
            case 5: // Junio -- Día del Padre y del Maestro: solo lentes + corbatín (sin nada arriba de la cabeza)
                return `
                    <circle cx="160" cy="158" r="30" fill="none" stroke="#3E2723" stroke-width="6" />
                    <circle cx="240" cy="158" r="30" fill="none" stroke="#3E2723" stroke-width="6" />
                    <line x1="190" y1="158" x2="210" y2="158" stroke="#3E2723" stroke-width="6" />
                    <path d="M 200 225 L 172 212 L 172 240 Z" fill="#3949AB" stroke="#1A237E" stroke-width="2.5" />
                    <path d="M 200 225 L 228 212 L 228 240 Z" fill="#3949AB" stroke="#1A237E" stroke-width="2.5" />
                    <circle cx="200" cy="225" r="8" fill="#1A237E" />
                `;
            case 6: // Julio -- cumpleaños: gorro de fiesta + más serpentina
                return `
                    <path d="M 165 95 L 235 95 L 200 15 Z" fill="#FFCA28" stroke="#F57F17" stroke-width="3" />
                    <circle cx="200" cy="12" r="10" fill="#FF5252" />
                    <rect x="178" y="55" width="12" height="12" fill="#EC407A" transform="rotate(20 184 61)" />
                    <rect x="205" y="65" width="12" height="12" fill="#42A5F5" transform="rotate(-15 211 71)" />
                    <path d="M 95 140 Q 115 160 95 180 Q 75 200 95 220" stroke="#EC407A" stroke-width="4" fill="none" />
                    <path d="M 305 140 Q 285 160 305 180 Q 325 200 305 220" stroke="#29B6F6" stroke-width="4" fill="none" />
                    <path d="M 120 250 Q 140 270 120 290" stroke="#FFEE58" stroke-width="4" fill="none" />
                    <path d="M 280 250 Q 260 270 280 290" stroke="#66BB6A" stroke-width="4" fill="none" />
                    <circle cx="120" cy="120" r="6" fill="#FF5252" /><circle cx="290" cy="130" r="6" fill="#29B6F6" />
                `;
            case 7: // Agosto -- Día Internacional de los Pueblos Indígenas: corona de plumas grandes y coloridas
                return `
                    <path d="M 138 95 Q 200 74 262 95 L 262 108 Q 200 87 138 108 Z" fill="#8D6E63" stroke="#5D4037" stroke-width="2" />
                    <path d="M 155 98 L 145 20 L 165 55 L 158 10 L 178 48 Z" fill="#43A047" stroke="#1B5E20" stroke-width="2" />
                    <path d="M 178 96 L 172 8 L 192 45 L 184 0 L 202 40 Z" fill="#FDD835" stroke="#F57F17" stroke-width="2" />
                    <path d="M 200 94 L 200 4 L 218 42 L 210 -2 L 228 38 Z" fill="#E53935" stroke="#B71C1C" stroke-width="2" />
                    <path d="M 222 96 L 228 8 L 208 45 L 216 0 L 198 40 Z" fill="#1E88E5" stroke="#0D47A1" stroke-width="2" />
                    <path d="M 245 98 L 255 20 L 235 55 L 242 10 L 222 48 Z" fill="#43A047" stroke="#1B5E20" stroke-width="2" />
                `;
            case 8: // Septiembre -- Independencia de Guatemala: banderita a un lado
                return `
                    <line x1="295" y1="150" x2="295" y2="270" stroke="#8D6E63" stroke-width="5" />
                    <path d="M 295 150 L 355 150 L 355 195 L 295 195 Z" fill="#FFFFFF" stroke="#CFD8DC" stroke-width="1.5" />
                    <path d="M 295 150 L 313 150 L 313 195 L 295 195 Z" fill="#4FC3F7" />
                    <path d="M 337 150 L 355 150 L 355 195 L 337 195 Z" fill="#4FC3F7" />
                `;
            case 9: // Octubre -- Halloween: sombrero de bruja + araña colgando a la altura del pecho
                return `
                    <path d="M 200 5 L 250 95 L 150 95 Z" fill="#4A148C" stroke="#1A0033" stroke-width="3" />
                    <ellipse cx="200" cy="97" rx="55" ry="13" fill="#4A148C" stroke="#1A0033" stroke-width="3" />
                    <rect x="175" y="65" width="50" height="14" fill="#FF6F00" />
                    <line x1="200" y1="100" x2="200" y2="245" stroke="#E0E0E0" stroke-width="1.5" />
                    <path d="M 172 235 Q 200 218 228 235 M 172 260 Q 200 250 228 260 M 178 222 Q 200 245 178 268 M 222 222 Q 200 245 222 268" stroke="#E0E0E0" stroke-width="1.5" fill="none" />
                    <circle cx="200" cy="258" r="11" fill="#212121" /><circle cx="200" cy="243" r="8" fill="#212121" />
                    <line x1="191" y1="252" x2="174" y2="246" stroke="#212121" stroke-width="2.5" /><line x1="191" y1="262" x2="172" y2="264" stroke="#212121" stroke-width="2.5" />
                    <line x1="209" y1="252" x2="226" y2="246" stroke="#212121" stroke-width="2.5" /><line x1="209" y1="262" x2="228" y2="264" stroke="#212121" stroke-width="2.5" />
                `;
            case 10: // Noviembre -- Día de Muertos: aureola + radiografía SOLO del pecho hacia abajo (3 costillas gruesas, puntas redondeadas)
                return `
                    <path d="M 118 195 C 112 240 112 290 140 325 C 160 335 240 335 260 325 C 288 290 288 240 282 195 C 260 210 140 210 118 195 Z" fill="#1565C0" opacity="0.3" />
                    <path d="M 150 225 Q 200 217 250 225 M 150 260 Q 200 252 250 260 M 150 295 Q 200 287 250 295" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" fill="none" opacity="0.9" />
                    <line x1="200" y1="200" x2="200" y2="325" stroke="#FFFFFF" stroke-width="6" stroke-linecap="round" opacity="0.9" />
                    <ellipse cx="200" cy="42" rx="52" ry="13" fill="none" stroke="#FFD54F" stroke-width="6" />
                `;
            case 11: // Diciembre -- Navidad: cuernos de reno
                return `
                    <path d="M 150 92 L 128 55 L 142 62 L 118 30 L 138 48 L 122 15 L 150 60" fill="none" stroke="#795548" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
                    <path d="M 250 92 L 272 55 L 258 62 L 282 30 L 262 48 L 278 15 L 250 60" fill="none" stroke="#795548" stroke-width="7" stroke-linecap="round" stroke-linejoin="round" />
                `;
            default:
                return '';
        }
    },

    // Meses de fiesta grande -- ojos con brillo (expresión distinta, no solo
    // accesorio) además del disfraz de arriba. Octubre tiene su propia
    // expresión (susto por la araña) en vez del brillo.
    festiveMonths: [6, 11],

    setSeasonalExpression(month) {
        const sparkleL = document.getElementById('mascot-sparkle-l');
        const sparkleR = document.getElementById('mascot-sparkle-r');
        const browL = document.getElementById('mascot-scared-brow-l');
        const browR = document.getElementById('mascot-scared-brow-r');
        if (sparkleL && sparkleR) {
            const showSparkle = this.festiveMonths.includes(month);
            sparkleL.style.display = showSparkle ? 'block' : 'none';
            sparkleR.style.display = showSparkle ? 'block' : 'none';
        }
        if (browL && browR) {
            const showScared = month === 9;
            browL.style.display = showScared ? 'block' : 'none';
            browR.style.display = showScared ? 'block' : 'none';
        }
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
