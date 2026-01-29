/**
 * KOLIBRI SYNC MODULE - 1BOT EDITION
 * Enables Peer-to-Peer synchronization for offline environments.
 */

const KolibriSync = {
    modalId: 'kolibri-sync-modal',
    scannerActive: false,
    scannerStream: null,

    openSyncCenter() {
        const modal = document.createElement('div');
        modal.id = this.modalId;
        modal.className = 'fixed inset-0 z-[1000] flex items-center justify-center p-6 bg-slate-950/95 backdrop-blur-xl animate-fadeIn';

        const isTutor = window.userRole === 'docente' || window.userRole === 'admin';

        modal.innerHTML = `
            <div class="glass-card w-full max-w-2xl p-0 overflow-hidden shadow-2xl animate-slideUp border-primary/30 flex flex-col max-h-[90vh]">
                <div class="bg-gradient-to-br from-primary to-indigo-700 p-8 text-center shrink-0">
                    <h2 class="text-2xl font-black text-white uppercase tracking-tighter">Centro de Sincronización</h2>
                    <p class="text-indigo-100 text-[0.6rem] font-bold uppercase tracking-[0.2em] mt-1 italic">Tecnología Kolibri-1Bot (Offline-P2P)</p>
                </div>

                <div class="p-8 overflow-y-auto space-y-8">
                    ${!isTutor ? `
                        <div class="space-y-6">
                            <div class="p-6 bg-blue-500/10 rounded-2xl border border-blue-500/20 text-center">
                                <i class="fas fa-satellite-dish text-4xl text-blue-500 mb-4 animate-pulse"></i>
                                <h3 class="text-lg font-black uppercase text-slate-800 dark:text-white">Entregar a mi Tutor</h3>
                                <p class="text-xs font-medium text-slate-500 mt-2">Si no tienes internet, genera un código para que tu tutor lo escanee y suba tu trabajo.</p>
                                
                                <button onclick="KolibriSync.generateExportQR()" class="btn-primary-tw w-full mt-6 h-12 bg-blue-600 hover:bg-blue-700">
                                    <i class="fas fa-qrcode"></i> GENERAR CÓDIGO DE ENTREGA
                                </button>
                            </div>
                            <div id="qr-export-container" class="flex flex-col items-center justify-center space-y-4 py-4 hidden">
                                <div id="qrcode" class="p-4 bg-white rounded-2xl shadow-xl"></div>
                                <p class="text-[0.6rem] font-black text-slate-400 uppercase tracking-widest">Pídele a tu tutor que escanee este código</p>
                            </div>
                        </div>
                    ` : `
                        <div class="space-y-6">
                            <div class="p-6 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 text-center relative overflow-hidden">
                                <div class="absolute top-4 right-4 bg-emerald-500/20 text-emerald-600 px-3 py-1 rounded-full text-[0.6rem] font-bold uppercase tracking-widest border border-emerald-500/30">
                                    <i class="fas fa-network-wired mr-1"></i> Data Mule
                                </div>
                                <i class="fas fa-satellite-dish text-4xl text-emerald-500 mb-4 fa-rotate-180"></i>
                                <h3 class="text-lg font-black uppercase text-slate-800 dark:text-white">Recibir / Recolectar Datos</h3>
                                <button onclick="KolibriSync.startScanner()" class="btn-primary-tw w-full mt-6 h-14 bg-emerald-600 hover:bg-emerald-700 shadow-lg shadow-emerald-500/20 text-sm tracking-widest uppercase">
                                    <i class="fas fa-qrcode mr-2"></i> ESCANEAR CÓDIGO DE ENTREGA
                                </button>
                            </div>

                            <div id="scanner-container" class="hidden relative rounded-2xl overflow-hidden aspect-square max-w-xs mx-auto border-4 border-emerald-500 shadow-2xl bg-black">
                                <video id="scanner-video" class="w-full h-full object-cover"></video>
                                <canvas id="scanner-canvas" class="hidden"></canvas>
                                <div class="absolute inset-0 border-[40px] border-black/50 pointer-events-none flex items-center justify-center">
                                    <div class="w-full h-0.5 bg-red-500/80 animate-scanLine shadow-[0_0_15px_rgba(239,68,68,0.8)]"></div>
                                </div>
                                <button onclick="KolibriSync.stopScanner()" class="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-rose-500 transition-colors">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>

                            <div class="p-6 bg-slate-50 dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700">
                                <div id="sync-mule-status" class="flex flex-col gap-4 bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
                                    <div class="flex justify-between items-center">
                                        <div class="text-xs font-bold text-slate-600 dark:text-slate-300">Registros por Sincronizar:</div>
                                        <div id="sync-pending-count" class="text-2xl font-black text-primary">0</div>
                                    </div>
                                    <button id="btn-sync-cloud" onclick="KolibriSync.syncToCloud()" class="btn-primary-tw w-full h-11 text-[0.6rem] bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-500/20 hidden">
                                        <i class="fas fa-cloud-upload-alt mr-2"></i> SUBIR A LA NUBE AHORA
                                    </button>
                                </div>
                                <p id="last-sync-text" class="text-[0.55rem] text-slate-400 mt-3 text-center uppercase tracking-tighter">
                                    <i class="fas fa-info-circle mr-1"></i> Conéctate a internet para subir estos datos automáticamente.
                                </p>
                            </div>
                        </div>
                    `}
                </div>

                <div class="p-6 bg-slate-50 dark:bg-slate-800/50 flex gap-4 shrink-0">
                    <button class="w-full btn-secondary-tw h-12 text-[0.65rem] font-black uppercase tracking-widest rounded-xl" onclick="KolibriSync.close()">Cerrar Centro</button>
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        if (isTutor) this.updatePendingCount();
    },

    close() {
        const modal = document.getElementById(this.modalId);
        if (modal) {
            if (this.scannerActive) this.stopScanner();
            modal.remove();
        }
    },

    async generateExportQR() {
        const data = await window._syncManager.exportPendingData();
        if (!data) return window.showToast('❌ No tienes cambios pendientes', 'warning');

        // VALIDACIÓN CRÍTICA: Impedir transferencia de archivos pesados por QR
        const hasHeavyFiles = data.items.some(i => i.data._fileBlob || (i.data.photo_url && i.data.photo_url.length > 500));

        if (hasHeavyFiles) {
            return window.showToast('⚠️ No se pueden transferir archivos multimedia (videos/fotos) vía QR debido a su tamaño. Conéctate a internet para sincronizar.', 'error');
        }

        const container = document.getElementById('qr-export-container');
        const qrDiv = document.getElementById('qrcode');
        qrDiv.innerHTML = '';
        container.classList.remove('hidden');

        if (typeof QRCode === 'undefined') return window.showToast('❌ Error: Librería QR no cargada', 'error');

        try {
            new QRCode(qrDiv, {
                text: JSON.stringify(data),
                width: 256,
                height: 256,
                colorDark: "#020617",
                colorLight: "#ffffff",
                correctLevel: QRCode.CorrectLevel.L
            });
            window.showToast('🎯 Código generado. Muéstralo a tu tutor.', 'success');
        } catch (e) {
            window.showToast('❌ Error generando QR (Datos demasiado grandes)', 'error');
        }
    },

    async startScanner() {
        this.scannerActive = true;
        const video = document.getElementById('scanner-video');
        const container = document.getElementById('scanner-container');
        container.classList.remove('hidden');

        try {
            // Solicitar mejor resolución para códigos densos
            const stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: "environment",
                    width: { ideal: 1280 }
                }
            });
            this.scannerStream = stream;
            video.srcObject = stream;
            video.setAttribute("playsinline", true);
            video.play();
            requestAnimationFrame(() => this.tickScanner());
        } catch (err) {
            window.showToast('❌ No se pudo acceder a la cámara', 'error');
        }
    },

    stopScanner() {
        this.scannerActive = false;
        if (this.scannerStream) {
            this.scannerStream.getTracks().forEach(track => track.stop());
            this.scannerStream = null;
        }
        const video = document.getElementById('scanner-video');
        if (video) video.srcObject = null;
        const container = document.getElementById('scanner-container');
        if (container) container.classList.add('hidden');
    },

    tickScanner() {
        if (!this.scannerActive) return;
        const video = document.getElementById('scanner-video');
        const canvas = document.getElementById('scanner-canvas');

        if (video && video.readyState === video.HAVE_ENOUGH_DATA) {
            canvas.height = video.videoHeight;
            canvas.width = video.videoWidth;
            const context = canvas.getContext("2d");
            context.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
            const code = typeof jsQR !== 'undefined' ? jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" }) : null;

            if (code) {
                this.handleScannedData(code.data);
                this.stopScanner();
                return;
            }
        }
        requestAnimationFrame(() => this.tickScanner());
    },

    async handleScannedData(data) {
        try {
            // Sonido de éxito (beep corto)
            const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            const oscillator = audioCtx.createOscillator();
            const gainNode = audioCtx.createGain();
            oscillator.type = 'sine';
            oscillator.frequency.value = 800; // Hz
            oscillator.connect(gainNode);
            gainNode.connect(audioCtx.destination);
            oscillator.start();
            gainNode.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.1);
            setTimeout(() => { oscillator.stop(); audioCtx.close(); }, 150);

            // Feedback visual en el marco (Flash Verde)
            const scannerFrame = document.querySelector('#scanner-container > div.absolute');
            if (scannerFrame) {
                scannerFrame.classList.remove('border-black/50');
                scannerFrame.classList.add('border-emerald-500/80');
                setTimeout(() => {
                    scannerFrame.classList.remove('border-emerald-500/80');
                    scannerFrame.classList.add('border-black/50');
                }, 300);
            }

            // SOPORTE PARA QR FRAGMENTADOS (CHUNKED)
            // Formato esperado: "CHUNK|ID_UNICO|INDICE|TOTAL|DATA_PARCIAL"
            if (data.startsWith('CHUNK|')) {
                const parts = data.split('|');
                const transferId = parts[1];
                const index = parseInt(parts[2]);
                const total = parseInt(parts[3]);
                const chunkData = parts.slice(4).join('|');

                if (!this.qrChunks) this.qrChunks = {};
                if (!this.qrChunks[transferId]) this.qrChunks[transferId] = new Array(total).fill(null);

                // Si ya tenemos este chunk, ignorar
                if (this.qrChunks[transferId][index]) return;

                this.qrChunks[transferId][index] = chunkData;
                window.showToast(`📡 Recibido fragmento ${index + 1} de ${total}`, 'info');

                // Verificar si está completo
                if (this.qrChunks[transferId].every(c => c !== null)) {
                    const fullString = this.qrChunks[transferId].join('');
                    delete this.qrChunks[transferId]; // Limpiar memoria
                    this.stopScanner(); // Detener al completar
                    this.processFullPayload(JSON.parse(fullString));
                }
                return; // Continuar escaneando otros chunks
            }

            // Dato normal (Simple)
            const payload = JSON.parse(data);
            this.stopScanner();
            this.processFullPayload(payload);
        } catch (err) {
            window.showToast('❌ Código no válido o incompleto', 'error');
        }
    },

    async processFullPayload(payload) {
        try {
            const success = await window._syncManager.importData(payload);
            if (success) {
                if (typeof confetti === 'function') confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
                this.updatePendingCount();
            }
        } catch (e) {
            console.error(e);
            window.showToast('❌ Error procesando datos', 'error');
        }
    },

    async updatePendingCount() {
        const count = await window._syncManager.getQueueCount();
        const el = document.getElementById('sync-pending-count');
        if (el) el.textContent = count;
        const btn = document.getElementById('btn-sync-cloud');
        if (btn) {
            if (count > 0 && navigator.onLine && !window._syncManager.simulatedOffline) btn.classList.remove('hidden');
            else btn.classList.add('hidden');
        }
    },

    async syncToCloud() {
        const btn = document.getElementById('btn-sync-cloud');
        if (!btn) return;
        btn.disabled = true;
        const originalContent = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i> SUBIENDO...';
        try {
            const result = await window._syncManager.processQueue();
            if (result && result.processed > 0) {
                window.showToast(`✅ ${result.processed} sincronizados`, 'success');
                if (typeof confetti === 'function') confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
            } else {
                window.showToast('Todo actualizado.', 'info');
            }
        } catch (err) {
            window.showToast('❌ Error en sincronización', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = originalContent;
            this.updatePendingCount();
        }
    }
};

window.KolibriSync = KolibriSync;

// Estilos del escáner
const style = document.createElement('style');
style.textContent = `
    @keyframes scanLine { 0%, 100% { top: 0% } 50% { top: 100% } }
    .animate-scanLine { animation: scanLine 3s ease-in-out infinite; }
`;
document.head.appendChild(style);
