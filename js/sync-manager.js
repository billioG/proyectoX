// ================================================
// GESTOR DE SINCRONIZACIÓN Y OFFLINE - PROJECTX
// ================================================

class SyncManager {
    constructor() {
        this.dbName = 'ProjectX_OfflineDB';
        this.dbVersion = 1;
        this.db = null;
        this.isOnline = navigator.onLine;
        this.isDevMode = localStorage.getItem('PX_DEV_MODE') === 'true'; // Modo desarrollador
        this.simulatedOffline = localStorage.getItem('PX_SIM_OFFLINE') === 'true'; // Simular offline
        this.syncInterval = null;
        this.isProcessing = false;

        this.initDB();
        this.setupListeners();
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.dbVersion);

            request.onupgradeneeded = (event) => {
                const db = event.target.result;

                // Tabla para la cola de sincronización (acciones pendientes)
                if (!db.objectStoreNames.contains('sync_queue')) {
                    db.createObjectStore('sync_queue', { keyPath: 'id', autoIncrement: true });
                }

                // Cache local para datos (estudiantes, escuelas, etc)
                if (!db.objectStoreNames.contains('data_cache')) {
                    db.createObjectStore('data_cache', { keyPath: 'key' });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                console.log('✅ IndexedDB inicializada');
                this.processQueue(); // Intentar procesar cola al iniciar
                resolve();
            };

            request.onerror = (event) => {
                console.error('❌ Error abriendo IndexedDB:', event.target.error);
                reject(event.target.error);
            };
        });
    }

    setupListeners() {
        window.addEventListener('online', () => {
            if (this.simulatedOffline) return; // Si estamos simulando offline, ignorar
            this.isOnline = true;
            console.log('🌐 Conexión restaurada');
            showToast('<i class="fas fa-globe"></i> Conexión restaurada. Sincronizando datos...', 'success');
            this.processQueue();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('🔌 Sin conexión');
            if (!this.simulatedOffline) showToast('<i class="fas fa-plug"></i> Trabajando en modo offline', 'warning');
            this.updateUI();
        });

        // Aplicar estado inicial basado en simulación
        if (this.simulatedOffline) {
            this.isOnline = false;
            setTimeout(() => this.updateUI(), 1000);
        }

        // Verificar periódicamente
        this.syncInterval = setInterval(() => {
            if (this.isOnline) this.processQueue();
        }, 60000); // Cada minuto

        this.updateUI();
    }

    // --- MÉTODOS DE DESARROLLADOR ---

    toggleDevMode() {
        this.isDevMode = !this.isDevMode;
        localStorage.setItem('PX_DEV_MODE', this.isDevMode);
        showToast(this.isDevMode ? '<i class="fas fa-screwdriver-wrench"></i>️ Modo Dev Activado' : '<i class="fas fa-screwdriver-wrench"></i>️ Modo Dev Desactivado', 'default');
        location.reload(); // Recargar para aplicar cambios de UI
    }

    toggleSimulatedOffline() {
        this.simulatedOffline = !this.simulatedOffline;
        localStorage.setItem('PX_SIM_OFFLINE', this.simulatedOffline);
        this.isOnline = !this.simulatedOffline && navigator.onLine;
        showToast(this.simulatedOffline ? '<i class="fas fa-plug"></i> Simulación Offline Activada' : '<i class="fas fa-globe"></i> Conexión Restaurada', 'info');
        this.updateUI();
        if (this.isOnline) this.processQueue();
    }

    updateUI(pendingCount = null) {
        const indicator = document.getElementById('sync-indicator');
        const icon = document.getElementById('sync-icon');
        const statusText = document.getElementById('sync-status-text');
        const countSpan = document.getElementById('sync-count');

        if (!indicator || !icon || !countSpan) return;

        if (pendingCount === null) {
            this.getQueueCount().then(c => this.updateUI(c));
            return;
        }

        // Resetear clases base
        indicator.className = 'flex items-center gap-2 font-bold text-xs px-3 py-1.5 rounded-full transition-all cursor-pointer';
        icon.className = 'fas';

        if (!this.isOnline) {
            indicator.classList.add('bg-rose-500/10', 'text-rose-500');
            icon.classList.add('fa-cloud-slash');
            if (statusText) statusText.textContent = this.simulatedOffline ? 'SIM OFFLINE' : 'SIN CONEXIÓN';
            indicator.title = 'Estás trabajando offline';
        } else if (pendingCount > 0) {
            indicator.classList.add('bg-amber-500/10', 'text-amber-500');
            icon.classList.add('fa-sync', 'fa-spin');
            if (statusText) statusText.textContent = 'PENDIENTE';
            indicator.title = `Sincronizando ${pendingCount} acciones...`;
        } else {
            indicator.classList.add('bg-emerald-500/10', 'text-emerald-500');
            icon.classList.add('fa-check-circle');
            if (statusText) statusText.textContent = 'CONECTADO';
            indicator.title = 'Todo sincronizado';
        }

        if (pendingCount > 0) {
            countSpan.textContent = pendingCount;
            countSpan.classList.remove('hidden');
        } else {
            countSpan.classList.add('hidden');
        }
    }

    async getQueueCount() {
        if (!this.db) return 0;
        return new Promise((resolve) => {
            const transaction = this.db.transaction(['sync_queue'], 'readonly');
            const store = transaction.objectStore('sync_queue');
            const request = store.count();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => resolve(0);
        });
    }

    // --- MÉTODOS DE CACHÉ DE DATOS ---

    async setCache(key, data) {
        if (!this.db) return;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['data_cache'], 'readwrite');
            const store = transaction.objectStore('data_cache');
            const request = store.put({ key, data, timestamp: Date.now() });

            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    async getCache(key) {
        if (!this.db) return null;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['data_cache'], 'readonly');
            const store = transaction.objectStore('data_cache');
            const request = store.get(key);

            request.onsuccess = () => resolve(request.result?.data || null);
            request.onerror = () => reject(request.error);
        });
    }

    // --- MÉTODOS DE COLA DE SINCRONIZACIÓN ---

    // owner = de quién es la acción. En una tablet compartida la cola tiene
    // acciones de varios alumnos: cada una se sube solo con la sesión de su
    // dueño (o la relevo el docente, ver processQueue). Antes no se guardaba
    // y todo se intentaba subir con la sesión de quien estuviera logueado.
    async enqueue(action, data, owner = window.currentUser?.id || null) {
        if (!this.db) return;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sync_queue'], 'readwrite');
            const store = transaction.objectStore('sync_queue');
            const request = store.add({
                action,
                data,
                owner,
                timestamp: Date.now(),
                retries: 0
            });

            request.onsuccess = () => {
                console.log(`📥 Acción encolada: ${action}`);
                this.updateUI();
                resolve();
            };
            request.onerror = () => reject(request.error);
        });
    }

    // Acciones pendientes de UN usuario (en una tablet compartida la cola
    // mezcla varios alumnos).
    async getOwnedItems(owner, action = null) {
        if (!this.db || !owner) return [];
        const items = await new Promise(resolve => {
            const req = this.db.transaction(['sync_queue'], 'readonly').objectStore('sync_queue').getAll();
            req.onsuccess = () => resolve(req.result || []);
            req.onerror = () => resolve([]);
        });
        return items.filter(i => (i.owner || i.data?.student_id || i.data?.user_id) === owner && (!action || i.action === action));
    }

    async processQueue() {
        if (!this.isOnline || !this.db || this.simulatedOffline) return { processed: 0, total: 0 };
        if (this.isProcessing) return null;

        this.isProcessing = true;
        this.updateUI();

        return new Promise((resolve) => {
            const transaction = this.db.transaction(['sync_queue'], 'readonly');
            const store = transaction.objectStore('sync_queue');
            const request = store.getAll();

            request.onsuccess = async () => {
                const queue = request.result;
                const total = queue.length;

                if (total === 0) {
                    this.isProcessing = false;
                    this.updateUI();
                    resolve({ processed: 0, total: 0 });
                    return;
                }

                console.log(`🔄 Sincronizando ${total} elementos con la nube...`);
                let processed = 0;
                const me = window.currentUser?.id;
                const isTeacher = window.userRole === 'docente' || window.userRole === 'admin';
                const relayBatch = [];

                const removeItem = (id) => new Promise((res, rej) => {
                    const delTx = this.db.transaction(['sync_queue'], 'readwrite');
                    const delReq = delTx.objectStore('sync_queue').delete(id);
                    delReq.onsuccess = () => res();
                    delReq.onerror = () => rej();
                });

                for (const item of queue) {
                    // Acciones viejas (sin owner) se atribuyen por el dato.
                    const owner = item.owner || item.data?.student_id || item.data?.user_id || me;
                    if (owner !== me) {
                        // Progreso de un alumno que trajo el docente (relevo
                        // QR/archivo): se sube en su nombre vía RPC validado.
                        if (isTeacher && item.action === 'mark_lesson_complete') relayBatch.push(item);
                        // Si no, queda en la cola hasta que entre su dueño.
                        continue;
                    }
                    try {
                        const success = await this.executeAction(item);
                        if (success) {
                            await removeItem(item.id);
                            processed++;
                        }
                    } catch (err) {
                        console.error(`Error en item ${item.id}:`, err);
                    }
                }

                if (relayBatch.length) {
                    try {
                        const { data: relay, error } = await _supabase.rpc('relay_lesson_completions', {
                            p_items: relayBatch.map(i => ({ qid: i.id, data: i.data })),
                        });
                        if (error) throw error;
                        for (const qid of relay?.accepted || []) {
                            await removeItem(qid);
                            processed++;
                        }
                    } catch (err) {
                        console.error('Error subiendo progreso de alumnos (relevo):', err);
                    }
                }

                this.isProcessing = false;
                localStorage.setItem('PX_LAST_SYNC_TIME', new Date().toISOString());
                this.updateUI();

                // Disparar evento global para otros componentes
                window.dispatchEvent(new CustomEvent('sync-finished', { detail: { processed, total } }));

                resolve({ processed, total });
            };

            request.onerror = (e) => {
                console.error('Error cargando cola sync:', e);
                this.isProcessing = false;
                this.updateUI();
                resolve({ processed: 0, total: 0 });
            };
        });
    }

    async executeAction(item) {
        const { action, data } = item;

        try {
            switch (action) {
                case 'mark_attendance':
                    const { error: attError } = await _supabase.from('attendance').upsert(data, { onConflict: 'student_id,date' });
                    if (attError) throw attError;
                    return true;

                case 'save_evaluation':
                    const { error: evalError } = await _supabase.from('evaluations').upsert(data, { onConflict: 'project_id' });
                    if (evalError) throw evalError;
                    await _supabase.from('projects').update({ score: data.total_score }).eq('id', data.project_id);

                    // Verificar insignias tras evaluar
                    if (typeof checkAndAwardBadges === 'function') {
                        await checkAndAwardBadges(data.project_id, data.total_score);
                    }
                    return true;

                case 'upload_project':
                    const uploadSuccess = await this.handleFileUploadSync('project-videos', data, 'video_url', 'projects');
                    if (uploadSuccess) {
                        if (data.group_id && typeof rotateRoles === 'function') {
                            console.log(`🔄 Rotando roles para el equipo ${data.group_id}...`);
                            await rotateRoles(data.group_id);
                        }
                        // Verificar insignias tras subir (para insignia de primera publicación)
                        if (typeof checkAndAwardBadges === 'function') {
                            // Buscamos el ID del proyecto recién insertado si es posible, 
                            // pero como insert() no siempre devuelve el ID en modo bulk o sin select, 
                            // confiaremos en que el estudiante verá su insignia al recargar o tras la primera evaluación.
                            // Por ahora, verificamos todas las insignias del autor.
                            await checkAllBadges(data.user_id);
                        }
                    }
                    return uploadSuccess;

                case 'submit_evidence':
                    return await this.handleFileUploadSync('evidence_photos', data, 'photo_url', 'weekly_evidence');

                case 'asset_audit':
                    return await this.handleFileUploadSync('audit_photos', data, 'photo_url', 'asset_audits');

                case 'tutor_checkin':
                    const { error: checkinError } = await _supabase.from('tutor_attendance').insert(data);
                    if (checkinError) throw checkinError;
                    return true;

                // El alumno marcó una lección como vista/completada (o el
                // runtime SCORM/H5P le puso nota) sin internet -- se guardó
                // localmente al toque y esto solo reintenta el upsert real.
                case 'mark_lesson_complete':
                    const { error: completionError } = await _supabase.from('lesson_completions').upsert(data, { onConflict: 'lesson_id,student_id' });
                    if (completionError) throw completionError;
                    return true;

                default:
                    // Antes esto devolvía true, así que processQueue() BORRABA
                    // la acción como si hubiera sincronizado bien -- pérdida
                    // silenciosa de datos si un dispositivo tenía una versión
                    // de la app más vieja/nueva que no reconocía ese tipo de
                    // acción (ej. relevo QR entre un teléfono actualizado y
                    // otro no). Se deja en la cola para reintentar después.
                    console.warn(`⚠️ Acción no soportada todavía, se mantiene en cola: ${action}`);
                    return false;
            }
        } catch (err) {
            console.error(`Ocurrió un error al ejecutar ${action}:`, err);
            return false;
        }
    }

    async handleFileUploadSync(bucket, data, urlField, table) {
        try {
            // 1. Verificar si ya existe un registro idéntico (De-duplicación remota)
            // Esto evita duplicados si un docente ya subió el proyecto vía QR (Kolibri)
            if (table === 'projects') {
                const { data: existing } = await _supabase
                    .from(table)
                    .select('id')
                    .eq('user_id', data.user_id)
                    .eq('title', data.title)
                    .eq('bimestre', data.bimestre)
                    .maybeSingle();

                if (existing) {
                    console.log(`♻️ Saltando duplicado detectado: "${data.title}" ya sincronizado.`);
                    return true;
                }
            }

            // weekly_evidence tiene un constraint de 1 por semana -- si otro
            // dispositivo/queue ya sincronizó la evidencia de esta semana
            // para este docente, insertar de nuevo tira 23505 y el item se
            // queda reintentando para siempre en la cola. Se detecta acá y
            // se descarta como ya-sincronizado en vez de reintentar.
            if (table === 'weekly_evidence') {
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                const { data: existing } = await _supabase
                    .from('weekly_evidence')
                    .select('id')
                    .eq('teacher_id', data.teacher_id)
                    .gte('created_at', sevenDaysAgo)
                    .maybeSingle();

                if (existing) {
                    console.log(`♻️ Evidencia semanal ya existe para este docente -- se descarta duplicado.`);
                    return true;
                }
            }

            // 2. Gestionar el/los archivo(s) si existen -- la mayoría de tablas
            // usan _fileBlob (1 archivo), weekly_evidence usa _fileBlobs (varios,
            // se guardan como array JSON en el mismo campo urlField).
            if (data._fileBlobs?.length) {
                const urls = [];
                for (const blob of data._fileBlobs) {
                    const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
                    const { error: uploadError } = await _supabase.storage.from(bucket).upload(fileName, blob);
                    if (uploadError) throw uploadError;
                    const { data: { publicUrl } } = _supabase.storage.from(bucket).getPublicUrl(fileName);
                    urls.push(publicUrl);
                }
                data[urlField] = JSON.stringify(urls);
                delete data._fileBlobs;
            } else if (data._fileBlob) {
                const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}`;
                const { error: uploadError } = await _supabase.storage
                    .from(bucket)
                    .upload(fileName, data._fileBlob);

                if (uploadError) throw uploadError;

                const { data: { publicUrl } } = _supabase.storage.from(bucket).getPublicUrl(fileName);
                data[urlField] = publicUrl;
                delete data._fileBlob;
            } else if (!data[urlField]) {
                // Fallback si no hay archivo ni URL
                data[urlField] = 'https://via.placeholder.com/400x300?text=Offline+Upload';
            }

            // 3. Insertar registro final
            const { error } = await _supabase.from(table).insert(data);
            if (error) throw error;
            return true;
        } catch (err) {
            console.error(`Error sincronizando a ${table}:`, err);
            return false;
        }
    }

    // --- MÉTODOS DE SINCRONIZACIÓN PEER-TO-PEER (QR / KOLIBRI) ---

    async exportPendingData() {
        if (!this.db) return null;
        const transaction = this.db.transaction(['sync_queue'], 'readonly');
        const store = transaction.objectStore('sync_queue');
        const items = await new Promise(resolve => {
            const req = store.getAll();
            req.onsuccess = () => resolve(req.result);
        });

        // Solo lo del alumno que genera el código (en una tablet compartida
        // la cola puede tener cosas de otros). raw_data (el detalle xAPI/SCORM)
        // se omite: es opcional y no entra en un QR.
        const me = window.currentUser?.id;
        const mine = items.filter(i => (i.owner || i.data?.student_id || i.data?.user_id || me) === me);
        if (mine.length === 0) return null;

        const payload = {
            source: me,
            timestamp: Date.now(),
            items: mine.map(i => {
                const data = { ...i.data };
                if (i.action === 'mark_lesson_complete') delete data.raw_data;
                return { action: i.action, data, owner: me };
            })
        };

        // Comprimir datos para que quepan en QR o sean ligeros (Compresión Agresiva)
        return compressData(payload);
    }

    async importData(payload) {
        if (!payload) return false;

        // Descomprimir datos si vienen en formato corto (Compresión Agresiva)
        const finalPayload = decompressData(payload);
        if (!finalPayload.items) return false;

        console.log(`📥 Importando ${finalPayload.items.length} acciones de otro dispositivo...`);
        // Se conserva el dueño original: el docente que lo recibe no lo sube
        // como propio, lo relevá en nombre del alumno (processQueue).
        for (const item of finalPayload.items) {
            await this.enqueue(item.action, item.data, item.owner || finalPayload.source || item.data?.student_id || null);
        }

        showToast(`<i class="fas fa-circle-check"></i> ${finalPayload.items.length} acciones importadas correctamente`, 'success');
        return true;
    }
}

// Inicializar el gestor globalmente
const _syncManager = new SyncManager();
window._syncManager = _syncManager;

export { SyncManager, _syncManager };
