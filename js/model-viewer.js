/**
 * VISOR 3D (STL / OBJ / GLB) para proyectos de estudiantes.
 * three.js se baja del CDN solo la primera vez que aparece un modelo.
 * Los visores se montan solos: basta con insertar el HTML de
 * window.model3DViewerHtml(url) en cualquier parte.
 */
const THREE_BASE = 'https://cdn.jsdelivr.net/npm/three@0.128.0';
const MODEL_EXTS = ['stl', 'obj', 'glb'];
const LOADER_FILE = { stl: 'STLLoader', obj: 'OBJLoader', glb: 'GLTFLoader' };

const scriptPromises = {};
function loadScript(src) {
  if (!scriptPromises[src]) {
    scriptPromises[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => { delete scriptPromises[src]; reject(new Error('No se pudo cargar ' + src)); };
      document.head.appendChild(s);
    });
  }
  return scriptPromises[src];
}

async function loadThree(ext) {
  await loadScript(`${THREE_BASE}/build/three.min.js`);
  await Promise.all([
    loadScript(`${THREE_BASE}/examples/js/controls/OrbitControls.js`),
    loadScript(`${THREE_BASE}/examples/js/loaders/${LOADER_FILE[ext]}.js`)
  ]);
}

window.modelExtOf = function modelExtOf(url) {
  if (!url || typeof url !== 'string') return null;
  const clean = url.split('#')[0].split('?')[0];
  const ext = (clean.split('.').pop() || '').toLowerCase();
  return MODEL_EXTS.includes(ext) ? ext : null;
};
window.isModel3D = (url) => !!window.modelExtOf(url);

window.model3DViewerHtml = function model3DViewerHtml(url, { ext, className = 'w-full aspect-video', projectId, needsThumb } = {}) {
  const safe = String(url).replace(/"/g, '&quot;');
  const e = ext || window.modelExtOf(url) || 'stl';
  return `<div class="model3d-viewer relative bg-slate-950 ${className}" data-model-url="${safe}" data-model-ext="${e}"${projectId ? ` data-project-id="${Number(projectId)}"` : ''}${needsThumb ? ' data-needs-thumb="1"' : ''}></div>`;
};

function downloadHref(url) {
  if (url.startsWith('blob:')) return null;
  const name = encodeURIComponent('modelo-3d.' + (window.modelExtOf(url) || 'stl'));
  return url + (url.includes('?') ? '&' : '?') + 'download=' + name;
}

function showViewerMessage(el, html) {
  el.innerHTML = `<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs text-center p-4">${html}</div>`;
}

// Escena lista (luces, modelo centrado y escalado, cámara encuadrada). La usan
// el visor interactivo y el generador de miniaturas.
async function buildModelScene(url, ext, aspect) {
  await loadThree(ext);
  const THREE = window.THREE;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x334155, 0.9));
  const key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.position.set(3, 5, 4);
  scene.add(key);

  const object = await new Promise((resolve, reject) => {
    const loader = new THREE[LOADER_FILE[ext]]();
    const material = new THREE.MeshStandardMaterial({ color: 0x4ade80, roughness: 0.55, metalness: 0.1 });
    loader.load(url, (res) => {
      if (ext === 'stl') {
        res.computeVertexNormals();
        resolve(new THREE.Mesh(res, material));
      } else if (ext === 'obj') {
        res.traverse(c => { if (c.isMesh) c.material = material; });
        resolve(res);
      } else {
        resolve(res.scene);
      }
    }, undefined, reject);
  });

  // Tinkercad (y casi todo el CAD) exporta con Z hacia arriba; three usa Y.
  const pivot = new THREE.Group();
  if (ext !== 'glb') object.rotation.x = -Math.PI / 2;
  pivot.add(object);
  scene.add(pivot);

  const box = new THREE.Box3().setFromObject(pivot);
  const center = box.getCenter(new THREE.Vector3());
  const size = box.getSize(new THREE.Vector3());
  object.position.sub(center);
  const radius = Math.max(size.x, size.y, size.z) / 2 || 1;
  const dist = radius / Math.tan((camera.fov * Math.PI) / 360) * 1.3;
  camera.position.set(dist * 0.8, dist * 0.6, dist);
  camera.near = dist / 100;
  camera.far = dist * 100;
  camera.updateProjectionMatrix();

  return { THREE, scene, camera };
}

// Miniatura 16:9 en JPEG (data URL, ~10-20 KB): se guarda en projects.thumbnail_url
// para que el feed muestre una vista previa sin bajar el modelo completo.
const THUMB_W = 480, THUMB_H = 270;
const THUMB_BG = '#0b1220';

function canvasToThumb(source) {
  const out = document.createElement('canvas');
  out.width = THUMB_W; out.height = THUMB_H;
  const ctx = out.getContext('2d');
  ctx.fillStyle = THUMB_BG;
  ctx.fillRect(0, 0, THUMB_W, THUMB_H);
  ctx.drawImage(source, 0, 0, THUMB_W, THUMB_H);
  return out.toDataURL('image/jpeg', 0.8);
}

window.captureModelThumbnail = async function captureModelThumbnail(url, ext) {
  const { THREE, scene, camera } = await buildModelScene(url, ext, THUMB_W / THUMB_H);
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  try {
    renderer.setPixelRatio(1);
    renderer.setSize(THUMB_W, THUMB_H);
    renderer.setClearColor(0x0b1220, 1);
    camera.lookAt(0, 0, 0);
    renderer.render(scene, camera);
    return canvasToThumb(renderer.domElement);
  } finally {
    renderer.dispose();
    renderer.forceContextLoss?.();
  }
};

// Proyectos subidos antes de las miniaturas: al abrir el visor el dueño (o el
// personal) deja guardada la vista que ya está dibujada. Si no tiene permiso
// el update no toca ninguna fila; si la columna no existe, se ignora.
async function saveThumbFromViewer(el, renderer, scene, camera) {
  const id = Number(el.dataset.projectId);
  if (!id || !window._supabase) return;
  try {
    renderer.render(scene, camera);
    const thumb = canvasToThumb(renderer.domElement);
    await window._supabase.from('projects').update({ thumbnail_url: thumb }).eq('id', id);
    el.dataset.needsThumb = '';
  } catch (e) { /* sin miniatura, no pasa nada */ }
}

async function mountModelViewer(el) {
  if (el.dataset.mounted) return;
  el.dataset.mounted = '1';
  const url = el.dataset.modelUrl;
  const ext = el.dataset.modelExt;
  showViewerMessage(el, '<i class="fas fa-cube fa-beat text-2xl text-primary"></i><span>Cargando modelo 3D...</span>');

  try {
    const width = el.clientWidth || 400;
    const height = el.clientHeight || 300;
    const { THREE, scene, camera } = await buildModelScene(url, ext, width / height);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab';

    const controls = new THREE.OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 2;
    controls.addEventListener('start', () => { controls.autoRotate = false; renderer.domElement.style.cursor = 'grabbing'; });
    controls.addEventListener('end', () => { renderer.domElement.style.cursor = 'grab'; });

    el.innerHTML = '';
    el.appendChild(renderer.domElement);

    const dl = downloadHref(url);
    el.insertAdjacentHTML('beforeend', `
      <div class="absolute bottom-2 left-2 right-2 flex items-center justify-between pointer-events-none">
        <span class="text-[0.6rem] font-bold uppercase tracking-widest text-white/60 bg-black/40 px-2 py-1 rounded-md"><i class="fas fa-hand-pointer"></i> Arrastrá para girar</span>
        ${dl ? `<a href="${dl}" class="pointer-events-auto text-[0.6rem] font-black uppercase tracking-widest text-white bg-black/50 hover:bg-primary px-2 py-1 rounded-md transition-colors"><i class="fas fa-download"></i> Descargar</a>` : ''}
      </div>`);

    if (el.dataset.needsThumb && el.dataset.projectId) saveThumbFromViewer(el, renderer, scene, camera);

    const resize = () => {
      const w = el.clientWidth, h = el.clientHeight;
      if (!w || !h) return;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    let raf;
    const tick = () => {
      if (!el.isConnected) {
        cancelAnimationFrame(raf);
        ro.disconnect();
        renderer.dispose();
        return;
      }
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(tick);
    };
    tick();
  } catch (err) {
    console.error('Error cargando modelo 3D:', err);
    const dl = downloadHref(url);
    showViewerMessage(el, `<i class="fas fa-triangle-exclamation text-lg text-amber-400"></i><span>No se pudo mostrar el modelo 3D.</span>${dl ? `<a href="${dl}" class="text-primary font-bold underline">Descargar archivo</a>` : ''}`);
  }
}

function scan(root) {
  if (root.nodeType !== 1) return;
  if (root.matches?.('.model3d-viewer')) mountModelViewer(root);
  root.querySelectorAll?.('.model3d-viewer').forEach(mountModelViewer);
}

new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(scan)))
  .observe(document.documentElement, { childList: true, subtree: true });
scan(document.documentElement);
