import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { z } from 'zod';
import type { BlockCleanupFn, BlockMountContext, InteractiveBlockPlugin } from '../types';
import { cleanupWebGLResources } from '../webglHelper';

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);

const CustomPartSchema = z.object({
  id: z.string().optional(),
  shape: z.enum(['sphere', 'box', 'cylinder', 'torus', 'cone']).default('sphere'),
  color: z.string().default('#38bdf8'),
  position: Vec3Schema.default([0, 0, 0]),
  scale: Vec3Schema.default([1, 1, 1]),
  explodeDir: Vec3Schema.optional(),
  labelAr: z.string().optional(),
  descriptionAr: z.string().optional(),
});

const AnnotationSchema = z.object({
  id: z.string(),
  labelAr: z.string(),
  descriptionAr: z.string(),
  position: Vec3Schema.default([0, 0, 0]),
});

export const Model3DBlockPayloadSchema = z.object({
  modelUrl: z.string().optional(),
  proceduralPreset: z
    .enum(['water_molecule', 'solar_system', 'dna_helix', 'architectural_dome', 'crystal_lattice'])
    .default('water_molecule'),
  parts: z.array(CustomPartSchema).optional(),
  explodeFactor: z.number().min(0).max(2).default(0),
  autoRotate: z.boolean().default(true),
  annotations: z.array(AnnotationSchema).default([]),
});

export type Model3DBlockPayload = z.infer<typeof Model3DBlockPayloadSchema>;

interface ExplodablePart {
  mesh: THREE.Object3D;
  basePos: THREE.Vector3;
  explodeVec: THREE.Vector3;
  labelAr?: string;
}

function createGeometryForShape(shape: 'sphere' | 'box' | 'cylinder' | 'torus' | 'cone'): THREE.BufferGeometry {
  switch (shape) {
    case 'box':
      return new THREE.BoxGeometry(0.9, 0.9, 0.9);
    case 'cylinder':
      return new THREE.CylinderGeometry(0.4, 0.4, 1.1, 20);
    case 'torus':
      return new THREE.TorusGeometry(0.65, 0.16, 14, 36);
    case 'cone':
      return new THREE.ConeGeometry(0.55, 1.1, 20);
    case 'sphere':
    default:
      return new THREE.SphereGeometry(0.55, 24, 18);
  }
}

function presetParts(
  preset: Model3DBlockPayload['proceduralPreset']
): Array<z.infer<typeof CustomPartSchema>> {
  switch (preset) {
    case 'solar_system':
      return [
        { id: 'sun', shape: 'sphere', color: '#f59e0b', position: [0, 0, 0], scale: [1.3, 1.3, 1.3], explodeDir: [0, 0.6, 0], labelAr: 'الشمس' },
        { id: 'orbit1', shape: 'torus', color: '#94a3b8', position: [0, 0, 0], scale: [2.2, 2.2, 0.3], explodeDir: [0, 0, 0], labelAr: 'المدار الداخلي' },
        { id: 'earth', shape: 'sphere', color: '#38bdf8', position: [1.45, 0, 0.2], scale: [0.55, 0.55, 0.55], explodeDir: [1.4, 0.4, 0], labelAr: 'الأرض' },
        { id: 'mars', shape: 'sphere', color: '#ef4444', position: [-1.85, 0.1, -0.35], scale: [0.45, 0.45, 0.45], explodeDir: [-1.4, 0.4, -0.3], labelAr: 'المريخ' },
      ];
    case 'dna_helix': {
      const items: Array<z.infer<typeof CustomPartSchema>> = [];
      for (let i = -3; i <= 3; i++) {
        const angle = i * 0.65;
        const y = i * 0.38;
        items.push({
          id: `dna-a-${i}`,
          shape: 'sphere',
          color: '#38bdf8',
          position: [Math.cos(angle) * 0.85, y, Math.sin(angle) * 0.85],
          scale: [0.32, 0.32, 0.32],
          explodeDir: [Math.cos(angle) * 1.1, 0, Math.sin(angle) * 1.1],
          labelAr: 'شريط القواعد A',
        });
        items.push({
          id: `dna-b-${i}`,
          shape: 'sphere',
          color: '#f59e0b',
          position: [-Math.cos(angle) * 0.85, y, -Math.sin(angle) * 0.85],
          scale: [0.32, 0.32, 0.32],
          explodeDir: [-Math.cos(angle) * 1.1, 0, -Math.sin(angle) * 1.1],
          labelAr: 'شريط القواعد B',
        });
      }
      return items;
    }
    case 'architectural_dome':
      return [
        { id: 'base', shape: 'box', color: '#cbbba0', position: [0, -0.65, 0], scale: [2.1, 0.75, 2.1], explodeDir: [0, -0.8, 0], labelAr: 'القاعدة الحجرية' },
        { id: 'drum', shape: 'cylinder', color: '#d4af37', position: [0, 0.1, 0], scale: [1.5, 0.6, 1.5], explodeDir: [0, 0.25, 0], labelAr: 'رقبة القبة' },
        { id: 'dome', shape: 'sphere', color: '#38bdf8', position: [0, 0.72, 0], scale: [1.3, 0.95, 1.3], explodeDir: [0, 1.3, 0], labelAr: 'القبة السماوية' },
      ];
    case 'crystal_lattice':
      return [
        { id: 'c-center', shape: 'box', color: '#38bdf8', position: [0, 0, 0], scale: [0.7, 0.7, 0.7], explodeDir: [0, 0, 0], labelAr: 'خلية الوحدة' },
        { id: 'c-1', shape: 'sphere', color: '#facc15', position: [1, 0.8, 0.8], scale: [0.38, 0.38, 0.38], explodeDir: [1, 0.8, 0.8], labelAr: 'ذرة ركنية' },
        { id: 'c-2', shape: 'sphere', color: '#facc15', position: [-1, 0.8, -0.8], scale: [0.38, 0.38, 0.38], explodeDir: [-1, 0.8, -0.8], labelAr: 'ذرة مقابلة' },
        { id: 'c-3', shape: 'sphere', color: '#facc15', position: [1, -0.8, -0.8], scale: [0.38, 0.38, 0.38], explodeDir: [1, -0.8, -0.8], labelAr: 'ذرة سفلية' },
        { id: 'c-4', shape: 'sphere', color: '#facc15', position: [-1, -0.8, 0.8], scale: [0.38, 0.38, 0.38], explodeDir: [-1, -0.8, 0.8], labelAr: 'ذرة متناظرة' },
      ];
    case 'water_molecule':
    default:
      return [
        { id: 'oxygen', shape: 'sphere', color: '#ef4444', position: [0, 0.15, 0], scale: [1.05, 1.05, 1.05], explodeDir: [0, 0.85, 0], labelAr: 'الأكسجين (O)' },
        { id: 'h1', shape: 'sphere', color: '#38bdf8', position: [-1.15, -0.45, 0.2], scale: [0.62, 0.62, 0.62], explodeDir: [-1.25, -0.5, 0.25], labelAr: 'الهيدروجين 1 (H)' },
        { id: 'h2', shape: 'sphere', color: '#38bdf8', position: [1.15, -0.45, -0.2], scale: [0.62, 0.62, 0.62], explodeDir: [1.25, -0.5, -0.25], labelAr: 'الهيدروجين 2 (H)' },
        { id: 'bond-ring', shape: 'torus', color: '#d4af37', position: [0, -0.1, 0], scale: [1.15, 1.15, 0.45], explodeDir: [0, -0.5, 0], labelAr: 'الزاوية التساهمية 104.5°' },
      ];
  }
}

function mountModel3D(
  container: HTMLElement,
  payload: Model3DBlockPayload,
  ctx: BlockMountContext
): BlockCleanupFn {
  const viewport = document.createElement('div');
  viewport.className = 'darb-blk-viewport-3d';

  const canvas = document.createElement('canvas');
  canvas.className = 'darb-blk-canvas';
  canvas.setAttribute('data-testid', `model3dCanvas-${ctx.mode}`);
  viewport.appendChild(canvas);

  const controlsBar = document.createElement('div');
  controlsBar.className = 'darb-blk-slider-row';

  let explodeValue = payload.explodeFactor;
  let autoRotate = payload.autoRotate;

  const explodeLabel = document.createElement('span');
  explodeLabel.textContent = `تفكيك (${Math.round(explodeValue * 100)}%)`;

  const explodeSlider = document.createElement('input');
  explodeSlider.type = 'range';
  explodeSlider.min = '0';
  explodeSlider.max = '1.5';
  explodeSlider.step = '0.05';
  explodeSlider.value = String(explodeValue);
  explodeSlider.setAttribute('data-testid', 'model3dExplodeSlider');

  const rotateBtn = document.createElement('button');
  rotateBtn.type = 'button';
  rotateBtn.className = `darb-blk-btn ${autoRotate ? 'active' : ''}`;
  rotateBtn.textContent = autoRotate ? '🔄 تدوير' : '⏸️ متوقف';

  controlsBar.append(explodeLabel, explodeSlider, rotateBtn);

  const noteBox = document.createElement('div');
  noteBox.className = 'darb-blk-note';
  noteBox.style.display = 'none';

  const annotationsWrap = document.createElement('div');
  annotationsWrap.className = 'darb-blk-chips';

  container.append(viewport, controlsBar);
  if (payload.annotations.length > 0) {
    container.append(annotationsWrap, noteBox);
  }

  let intentionalDispose = false;
  let rafId: number | null = null;
  let renderer: THREE.WebGLRenderer | null = null;
  let scene: THREE.Scene | null = null;
  let camera: THREE.PerspectiveCamera | null = null;
  let orbit: OrbitControls | null = null;
  let resizeObserver: ResizeObserver | null = null;
  const explodables: ExplodablePart[] = [];
  const rootGroup = new THREE.Group();

  const applyExplode = (factor: number) => {
    for (const part of explodables) {
      part.mesh.position.copy(part.basePos).addScaledVector(part.explodeVec, factor);
    }
  };

  const renderFallbackNotice = (reason: string) => {
    viewport.innerHTML = `<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;padding:10px;text-align:center;font-size:11.5px;color:#93c5fd;">
      <strong>🧊 وضع التوافق للمجسم ثلاثي الأبعاد</strong>
      <span style="margin-top:4px;color:#cbd5e1;">${reason}</span>
    </div>`;
  };

  const populateProcedural = () => {
    const specs =
      payload.parts && payload.parts.length > 0
        ? payload.parts
        : presetParts(payload.proceduralPreset);
    for (const spec of specs) {
      const geo = createGeometryForShape(spec.shape);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(spec.color),
        roughness: 0.35,
        metalness: 0.28,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(...spec.position);
      mesh.scale.set(...spec.scale);
      rootGroup.add(mesh);

      const basePos = new THREE.Vector3(...spec.position);
      const explodeVec = spec.explodeDir
        ? new THREE.Vector3(...spec.explodeDir)
        : basePos.lengthSq() > 0.01
          ? basePos.clone().normalize()
          : new THREE.Vector3(0, 0.8, 0);

      explodables.push({ mesh, basePos, explodeVec, labelAr: spec.labelAr });
    }
    applyExplode(explodeValue);
  };

  const onContextLost = (ev: Event) => {
    ev.preventDefault();
    if (intentionalDispose) return;
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    renderFallbackNotice('تم تحرير سياق WebGL مؤقتاً لتوفير الذاكرة، ويمكنك متابعة القراءة بأمان.');
  };
  canvas.addEventListener('webglcontextlost', onContextLost);

  try {
    renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: !ctx.isMobile,
      powerPreference: ctx.isMobile ? 'low-power' : 'high-performance',
    });
    renderer.setPixelRatio(ctx.isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.75));

    scene = new THREE.Scene();
    const w = Math.max(160, viewport.clientWidth || 320);
    const h = Math.max(110, viewport.clientHeight || 150);
    renderer.setSize(w, h, false);

    camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 100);
    camera.position.set(0, 1.2, 5.2);

    const ambient = new THREE.AmbientLight(0xffffff, 0.9);
    const key = new THREE.DirectionalLight(0xffe4b5, 1.4);
    key.position.set(4, 6, 5);
    const fill = new THREE.PointLight(0x38bdf8, 1.2, 18);
    fill.position.set(-4, -2, 4);
    scene.add(ambient, key, fill, rootGroup);

    orbit = new OrbitControls(camera, canvas);
    orbit.enableDamping = true;
    orbit.dampingFactor = 0.08;
    orbit.autoRotate = autoRotate;
    orbit.autoRotateSpeed = 1.6;
    orbit.enablePan = false;

    if (payload.modelUrl) {
      const loader = new GLTFLoader();
      loader.load(
        payload.modelUrl,
        (gltf) => {
          if (intentionalDispose) return;
          const box = new THREE.Box3().setFromObject(gltf.scene);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(0.01, size.x, size.y, size.z);
          const normScale = 2.4 / maxDim;
          gltf.scene.scale.setScalar(normScale);
          gltf.scene.position.sub(center.multiplyScalar(normScale));
          rootGroup.add(gltf.scene);

          gltf.scene.traverse((child) => {
            if ((child as THREE.Mesh).isMesh) {
              const basePos = child.position.clone();
              const dir = basePos.lengthSq() > 0.001 ? basePos.clone().normalize() : new THREE.Vector3(0, 0.5, 0);
              explodables.push({ mesh: child, basePos, explodeVec: dir });
            }
          });
          applyExplode(explodeValue);
        },
        undefined,
        () => {
          if (!intentionalDispose) populateProcedural();
        }
      );
    } else {
      populateProcedural();
    }

    const tick = () => {
      if (intentionalDispose || !renderer || !scene || !camera) return;
      orbit?.update();
      renderer.render(scene, camera);
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => {
        if (intentionalDispose || !renderer || !camera) return;
        const rw = Math.max(120, viewport.clientWidth);
        const rh = Math.max(90, viewport.clientHeight);
        renderer.setSize(rw, rh, false);
        camera.aspect = rw / rh;
        camera.updateProjectionMatrix();
      });
      resizeObserver.observe(viewport);
    }
  } catch {
    renderFallbackNotice('تعذر تهيئة WebGL على هذا الجهاز — الوضع التفاعلي متاح كنقاط شرح.');
  }

  const onExplodeInput = () => {
    explodeValue = Number(explodeSlider.value);
    explodeLabel.textContent = `تفكيك (${Math.round(explodeValue * 100)}%)`;
    applyExplode(explodeValue);
  };
  explodeSlider.addEventListener('input', onExplodeInput);

  const onRotateClick = () => {
    autoRotate = !autoRotate;
    if (orbit) orbit.autoRotate = autoRotate;
    rotateBtn.textContent = autoRotate ? '🔄 تدوير' : '⏸️ متوقف';
    rotateBtn.classList.toggle('active', autoRotate);
  };
  rotateBtn.addEventListener('click', onRotateClick);

  payload.annotations.forEach((ann, idx) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `darb-blk-btn${idx === 0 ? ' active' : ''}`;
    btn.textContent = `📍 ${ann.labelAr}`;
    btn.addEventListener('click', () => {
      annotationsWrap.querySelectorAll('.darb-blk-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      noteBox.style.display = 'block';
      noteBox.textContent = `${ann.labelAr}: ${ann.descriptionAr}`;
      if (orbit && camera) {
        orbit.target.set(...ann.position);
        orbit.update();
      }
    });
    annotationsWrap.appendChild(btn);
    if (idx === 0) {
      noteBox.style.display = 'block';
      noteBox.textContent = `${ann.labelAr}: ${ann.descriptionAr}`;
    }
  });

  return () => {
    intentionalDispose = true;
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
    resizeObserver?.disconnect();
    resizeObserver = null;
    canvas.removeEventListener('webglcontextlost', onContextLost);
    explodeSlider.removeEventListener('input', onExplodeInput);
    rotateBtn.removeEventListener('click', onRotateClick);

    cleanupWebGLResources({
      renderer,
      scene,
      controls: orbit,
      forceLoseContext: true,
    });
    renderer = null;
    scene = null;
    camera = null;
    orbit = null;
  };
}

export const model3dPlugin: InteractiveBlockPlugin<Model3DBlockPayload> = {
  type: 'model3d',
  labelAr: 'عارض مجسم 3D',
  descriptionAr: 'عرض وتدوير وتفكيك المجسمات ثلاثية الأبعاد (GLB/GLTF أو نماذج إجرائية) مع نقاط الشرح',
  icon: '🧊',
  schema: Model3DBlockPayloadSchema,
  examplePayload: {
    proceduralPreset: 'water_molecule',
    explodeFactor: 0,
    autoRotate: true,
    annotations: [
      {
        id: 'oxygen',
        labelAr: 'ذرة الأكسجين (O)',
        descriptionAr: 'تقع في المركز وتحمل شحنة سالبة جزئية لجذب إلكترونات الرابطة.',
        position: [0, 0.15, 0],
      },
      {
        id: 'hydrogen',
        labelAr: 'ذرتا الهيدروجين (H)',
        descriptionAr: 'ترتبطان تساهمياً بزاوية 104.5 درجة لتكوين قطبية جزيء الماء.',
        position: [1.1, -0.45, 0],
      },
    ],
  },
  extractSearchText: (p) =>
    [p.proceduralPreset, ...p.annotations.map((a) => `${a.labelAr} ${a.descriptionAr}`)].join(' '),
  mountInline: mountModel3D,
  mountFullscreen: mountModel3D,
};
