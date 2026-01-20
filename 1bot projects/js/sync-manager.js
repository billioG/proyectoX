// ================================================
// GESTOR DE SINCRONIZACIÓN Y OFFLINE - PROJECTX
// ================================================

class SyncManager {
    constructor() {
        this.dbName = 'ProjectX_OfflineDB';
        this.dbVersion = 1;
        this.db = null;
        this.isOnline = navigator.onLine;
        this.syncInterval = null;

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
            this.isOnline = true;
            console.log('🌐 Conexión restaurada');
            showToast('🌐 Conexión restaurada. Sincronizando datos...', 'success');
            this.processQueue();
        });

        window.addEventListener('offline', () => {
            this.isOnline = false;
            console.log('🔌 Sin conexión');
            showToast('🔌 Trabajando en modo offline', 'warning');
            this.updateUI();
        });

        // Verificar periódicamente
        this.syncInterval = setInterval(() => {
            if (this.isOnline) this.processQueue();
        }, 60000); // Cada minuto

        this.updateUI();
    }

    updateUI(pendingCount = null) {
        const indicator = document.getElementById('sync-indicator');
        const icon = document.getElementById('sync-icon');
        const countSpan = document.getElementById('sync-count');

        if (!indicator || !icon || !countSpan) return;

        if (pendingCount === null) {
            this.getQueueCount().then(c => this.updateUI(c));
            return;
        }

        // Resetear clases
        indicator.className = 'sync-status';
        icon.className = 'fas';

        if (!this.isOnline) {
            indicator.classList.add('offline');
            icon.classList.add('fa-cloud-slash');
            indicator.title = 'Estás trabajando offline';
        } else if (pendingCount > 0) {
            indicator.classList.add('pending');
            icon.classList.add('fa-sync', 'syncing');
            indicator.title = `Sincronizando ${pendingCount} acciones pendientes...`;
        } else {
            icon.classList.add('fa-cloud-check');
            indicator.title = 'Todo sincronizado';
        }

        if (pendingCount > 0) {
            countSpan.textContent = pendingCount;
            countSpan.style.display = 'inline-block';
        } else {
            countSpan.style.display = 'none';
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

    async enqueue(action, data) {
        if (!this.db) return;
        return new Promise((resolve, reject) => {
            const transaction = this.db.transaction(['sync_queue'], 'readwrite');
            const store = transaction.objectStore('sync_queue');
            const request = store.add({
                action,
                data,
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

    async processQueue() {
        if (!this.isOnline || !this.db) return;

        const transaction = this.db.transaction(['sync_queue'], 'readwrite');
        const store = transaction.objectStore('sync_queue');
        const request = store.getAll();

        request.onsuccess = async () => {
            const queue = request.result;
            if (queue.length === 0) {
                this.updateUI(); // Update UI even if queue is empty
                return;
            }

            console.log(`🔄 Procesando ${queue.length} acciones pendientes...`);

            for (const item of queue) {
                try {
                    const success = await this.executeAction(item);
                    if (success) {
                        // Eliminar de la cola si tuvo éxito
                        const deleteTx = this.db.transaction(['sync_queue'], 'readwrite');
                        deleteTx.objectStore('sync_queue').delete(item.id);
                        this.updateUI();
                    }
                } catch (err) {
                    console.error(`❌ Error procesando acción ${item.id}:`, err);
                }
            }
        };
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
                    // Actualizar score en el proyecto también
                    await _supabase.from('projects').update({ score: data.total_score }).eq('id', data.project_id);
                    return true;

                case 'toggle_like':
                    // Lógica de like/unlike
                    const { projectId, userId, isLike } = data;
                    if (isLike) {
                        await _supabase.from('project_likes').insert({ project_id: projectId, user_id: userId });
                        await _supabase.rpc('increment_votes', { project_id: projectId });
                    } else {
                        await _supabase.from('project_likes').delete().eq('project_id', projectId).eq('user_id', userId);
                        await _supabase.rpc('decrement_votes', { project_id: projectId });
                    }
                    return true;

                default:
                    console.warn(`⚠️ Acción no soportada: ${action}`);
                    return true; // Eliminar de la cola igual
            }
        } catch (err) {
            console.error(`Ocurrió un error al ejecutar ${action}:`, err);
            return false;
        }
    }
}

// Inicializar el gestor globalmente
const _syncManager = new SyncManager();
