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

window.model3DViewerHtml = function model3DViewerHtml(url, { ext, className = 'w-full aspect-video' } = {}) {
  const safe = String(url).replace(/"/g, '&quot;');
  const e = ext || window.modelExtOf(url) || 'stl';
  return `<div class="model3d-viewer relative bg-slate-950 ${className}" data-model-url="${safe}" data-model-ext="${e}"></div>`;
};

function downloadHref(url) {
  if (url.startsWith('blob:')) return null;
  const name = encodeURIComponent('modelo-3d.' + (window.modelExtOf(url) || 'stl'));
  return url + (url.includes('?') ? '&' : '?') + 'download=' + name;
}

function showViewerMessage(el, html) {
  el.innerHTML = `<div class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs text-center p-4">${html}</div>`;
}

async function mountModelViewer(el) {
  if (el.dataset.mounted) return;
  el.dataset.mounted = '1';
  const url = el.dataset.modelUrl;
  const ext = el.dataset.modelExt;
  showViewerMessage(el, '<i class="fas fa-cube fa-beat text-2xl text-primary"></i><span>Cargando modelo 3D...</span>');

  try {
    await loadThree(ext);
    const THREE = window.THREE;

    const width = el.clientWidth || 400;
    const height = el.clientHeight || 300;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;touch-action:none;cursor:grab';

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
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
