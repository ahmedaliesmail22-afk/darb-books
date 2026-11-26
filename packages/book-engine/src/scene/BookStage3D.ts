import {
  AmbientLight,
  BoxGeometry,
  Color,
  DirectionalLight,
  Group,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PointLight,
  Scene,
  WebGLRenderer,
} from 'three';
import type { Stage3DThemeLighting, ThemeMode } from '@darb/book-schema';

export interface BookStage3DConfig {
  enabled?: boolean;
  mobileBreakpointPx?: number;
  lightingOverrides?: Partial<Record<ThemeMode, Stage3DThemeLighting>>;
}

interface BookVisualState {
  spreadIndex: number;
  totalSpreads: number;
  isClosedFront: boolean;
  isClosedBack: boolean;
}

const DEFAULT_LIGHTING: Record<ThemeMode, Stage3DThemeLighting> = {
  sepia: {
    ambientColor: '#ffe9c2',
    ambientIntensity: 0.78,
    keyColor: '#ffd991',
    keyIntensity: 1.35,
    accentColor: '#d4af37',
    accentIntensity: 1.9,
    paperEdgeColor: '#ede0c4',
  },
  dark: {
    ambientColor: '#93c5fd',
    ambientIntensity: 0.6,
    keyColor: '#60a5fa',
    keyIntensity: 1.2,
    accentColor: '#38bdf8',
    accentIntensity: 2.1,
    paperEdgeColor: '#1e293b',
  },
  light: {
    ambientColor: '#ffffff',
    ambientIntensity: 0.95,
    keyColor: '#fffbeb',
    keyIntensity: 1.25,
    accentColor: '#f59e0b',
    accentIntensity: 1.1,
    paperEdgeColor: '#e2e8f0',
  },
};

/**
 * مشهد Three.js خفيف الوزن (Low-Poly) يحيط بصفحات القراءة ويمثّل المجسم الفيزيائي للكتاب.
 * يقبل تهيئة ديناميكية للإضاءة ونقاط التوقف ومفاتيح الميزات.
 */
export class BookStage3D {
  private container: HTMLElement;
  private canvas: HTMLCanvasElement;
  private config: BookStage3DConfig;
  private renderer: WebGLRenderer | null = null;
  private scene: Scene | null = null;
  private camera: PerspectiveCamera | null = null;

  private bookGroup: Group | null = null;
  private rightCoverGroup: Group | null = null;
  private leftCoverGroup: Group | null = null;
  private spineMesh: Mesh | null = null;
  private rightPagesMesh: Mesh | null = null;
  private leftPagesMesh: Mesh | null = null;

  private coverMat: MeshStandardMaterial | null = null;
  private trimMat: MeshStandardMaterial | null = null;
  private paperEdgeMat: MeshStandardMaterial | null = null;

  private ambientLight: AmbientLight | null = null;
  private keyLight: DirectionalLight | null = null;
  private accentLight: PointLight | null = null;

  private rafId: number | null = null;
  private dirty = true;
  private isMobileLightMode = false;
  private disposed = false;

  private targetTiltX = 0;
  private targetTiltY = 0;
  private currentTiltX = 0;
  private currentTiltY = 0;
  private flipImpulse = 0;
  private targetOpenFactor = 0;
  private currentOpenFactor = 0;
  private targetProgress = 0;
  private currentProgress = 0;

  constructor(container: HTMLElement, canvas: HTMLCanvasElement, config: BookStage3DConfig = {}) {
    this.container = container;
    this.canvas = canvas;
    this.config = config;
    if (config.enabled === false) {
      this.canvas.style.display = 'none';
      return;
    }
    this.detectPerformanceMode();
    this.initWebGL();
  }

  private detectPerformanceMode(): void {
    const bp = this.config.mobileBreakpointPx ?? 960;
    const reducedMotion =
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.isMobileLightMode = window.innerWidth < bp || reducedMotion;
  }

  private initWebGL(): void {
    try {
      const renderer = new WebGLRenderer({
        canvas: this.canvas,
        alpha: true,
        antialias: !this.isMobileLightMode,
        powerPreference: this.isMobileLightMode ? 'low-power' : 'high-performance',
      });
      renderer.setPixelRatio(
        this.isMobileLightMode ? 1 : Math.min(window.devicePixelRatio || 1, 2)
      );
      this.renderer = renderer;

      const scene = new Scene();
      this.scene = scene;

      const width = Math.max(1, this.container.clientWidth);
      const height = Math.max(1, this.container.clientHeight);
      const camera = new PerspectiveCamera(34, width / height, 0.1, 100);
      camera.position.set(0, 0.35, 11.4);
      camera.lookAt(0, 0, 0);
      this.camera = camera;

      const ambient = new AmbientLight(0xfff1d6, 0.75);
      const key = new DirectionalLight(0xffe4b5, 1.35);
      key.position.set(3.5, 5.5, 8.0);
      const accent = new PointLight(0xd4af37, 1.8, 18);
      accent.position.set(-4.5, 1.8, 5.2);

      scene.add(ambient, key, accent);
      this.ambientLight = ambient;
      this.keyLight = key;
      this.accentLight = accent;

      this.buildLowPolyBook(scene);
      this.resize();
      this.requestFrame();
    } catch {
      this.canvas.style.display = 'none';
      this.renderer = null;
    }
  }

  private buildLowPolyBook(scene: Scene): void {
    const bookGroup = new Group();
    this.bookGroup = bookGroup;

    const coverMat = new MeshStandardMaterial({
      color: new Color('#0c1424'),
      roughness: 0.48,
      metalness: 0.22,
    });
    const trimMat = new MeshStandardMaterial({
      color: new Color('#d4af37'),
      roughness: 0.28,
      metalness: 0.78,
    });
    const paperEdgeMat = new MeshStandardMaterial({
      color: new Color('#ede2ca'),
      roughness: 0.85,
      metalness: 0.04,
    });

    this.coverMat = coverMat;
    this.trimMat = trimMat;
    this.paperEdgeMat = paperEdgeMat;

    const halfW = 4.28;
    const bookH = 6.22;
    const boardThick = 0.11;

    const rightCoverGroup = new Group();
    const rightBoard = new Mesh(new BoxGeometry(halfW, bookH, boardThick), coverMat);
    rightBoard.position.set(halfW / 2 + 0.08, 0, -0.22);
    const rightTrim = new Mesh(new BoxGeometry(0.08, bookH + 0.06, boardThick + 0.04), trimMat);
    rightTrim.position.set(halfW + 0.08, 0, -0.22);
    const rightTopTrim = new Mesh(new BoxGeometry(halfW, 0.06, boardThick + 0.03), trimMat);
    rightTopTrim.position.set(halfW / 2 + 0.08, bookH / 2 + 0.01, -0.22);
    const rightBotTrim = new Mesh(new BoxGeometry(halfW, 0.06, boardThick + 0.03), trimMat);
    rightBotTrim.position.set(halfW / 2 + 0.08, -bookH / 2 - 0.01, -0.22);
    rightCoverGroup.add(rightBoard, rightTrim, rightTopTrim, rightBotTrim);
    this.rightCoverGroup = rightCoverGroup;

    const leftCoverGroup = new Group();
    const leftBoard = new Mesh(new BoxGeometry(halfW, bookH, boardThick), coverMat);
    leftBoard.position.set(-halfW / 2 - 0.08, 0, -0.22);
    const leftTrim = new Mesh(new BoxGeometry(0.08, bookH + 0.06, boardThick + 0.04), trimMat);
    leftTrim.position.set(-halfW - 0.08, 0, -0.22);
    const leftTopTrim = new Mesh(new BoxGeometry(halfW, 0.06, boardThick + 0.03), trimMat);
    leftTopTrim.position.set(-halfW / 2 - 0.08, bookH / 2 + 0.01, -0.22);
    const leftBotTrim = new Mesh(new BoxGeometry(halfW, 0.06, boardThick + 0.03), trimMat);
    leftBotTrim.position.set(-halfW / 2 - 0.08, -bookH / 2 - 0.01, -0.22);
    leftCoverGroup.add(leftBoard, leftTrim, leftTopTrim, leftBotTrim);
    this.leftCoverGroup = leftCoverGroup;

    const spineMesh = new Mesh(new BoxGeometry(0.32, bookH + 0.08, 0.34), coverMat);
    spineMesh.position.set(0, 0, -0.26);
    const spineBandTop = new Mesh(new BoxGeometry(0.34, 0.14, 0.36), trimMat);
    spineBandTop.position.set(0, bookH * 0.42, 0);
    const spineBandBot = new Mesh(new BoxGeometry(0.34, 0.14, 0.36), trimMat);
    spineBandBot.position.set(0, -bookH * 0.42, 0);
    spineMesh.add(spineBandTop, spineBandBot);
    this.spineMesh = spineMesh;

    const rightPages = new Mesh(new BoxGeometry(halfW - 0.14, bookH - 0.16, 1), paperEdgeMat);
    rightPages.position.set(halfW / 2 + 0.05, 0, -0.06);
    this.rightPagesMesh = rightPages;

    const leftPages = new Mesh(new BoxGeometry(halfW - 0.14, bookH - 0.16, 1), paperEdgeMat);
    leftPages.position.set(-halfW / 2 - 0.05, 0, -0.06);
    this.leftPagesMesh = leftPages;

    bookGroup.add(rightCoverGroup, leftCoverGroup, spineMesh, rightPages, leftPages);
    scene.add(bookGroup);
  }

  public setBookState(state: BookVisualState): void {
    const isClosed = state.isClosedFront || state.isClosedBack;
    this.targetOpenFactor = isClosed ? 0 : 1;
    const denom = Math.max(1, state.totalSpreads - 1);
    this.targetProgress = Math.max(0, Math.min(1, state.spreadIndex / denom));
    this.dirty = true;
    this.requestFrame();
  }

  public triggerFlipImpulse(direction: 'forward' | 'backward'): void {
    if (this.isMobileLightMode) return;
    this.flipImpulse = direction === 'forward' ? -0.14 : 0.14;
    this.dirty = true;
    this.requestFrame();
  }

  public setPointerTilt(normX: number, normY: number): void {
    if (this.isMobileLightMode) return;
    this.targetTiltY = normX * 0.08;
    this.targetTiltX = -normY * 0.05;
    this.dirty = true;
    this.requestFrame();
  }

  public resetPointerTilt(): void {
    this.targetTiltX = 0;
    this.targetTiltY = 0;
    this.dirty = true;
    this.requestFrame();
  }

  public setTheme(theme: ThemeMode): void {
    if (!this.ambientLight || !this.keyLight || !this.accentLight || !this.paperEdgeMat) return;
    const palette = this.config.lightingOverrides?.[theme] ?? DEFAULT_LIGHTING[theme];

    this.ambientLight.color.set(palette.ambientColor);
    this.ambientLight.intensity = palette.ambientIntensity;
    this.keyLight.color.set(palette.keyColor);
    this.keyLight.intensity = palette.keyIntensity;
    this.accentLight.color.set(palette.accentColor);
    this.accentLight.intensity = palette.accentIntensity;
    this.paperEdgeMat.color.set(palette.paperEdgeColor);

    this.dirty = true;
    this.requestFrame();
  }

  public setEditionAccent(editionTheme: string): void {
    if (!this.coverMat || !this.trimMat) return;
    if (editionTheme === 'cyan-emerald') {
      this.coverMat.color.set('#08172b');
      this.trimMat.color.set('#38bdf8');
    } else {
      this.coverMat.color.set('#0c1424');
      this.trimMat.color.set('#d4af37');
    }
    this.dirty = true;
    this.requestFrame();
  }

  public resize(): void {
    this.detectPerformanceMode();
    if (!this.renderer || !this.camera) return;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setPixelRatio(
      this.isMobileLightMode ? 1 : Math.min(window.devicePixelRatio || 1, 2)
    );
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
    this.requestFrame();
  }

  private requestFrame(): void {
    if (this.disposed || this.rafId !== null || !this.renderer) return;
    this.rafId = window.requestAnimationFrame(() => this.tick());
  }

  private tick(): void {
    this.rafId = null;
    if (this.disposed || !this.renderer || !this.scene || !this.camera || !this.bookGroup) return;

    const lerpRate = this.isMobileLightMode ? 0.25 : 0.14;
    this.currentOpenFactor += (this.targetOpenFactor - this.currentOpenFactor) * lerpRate;
    this.currentProgress += (this.targetProgress - this.currentProgress) * lerpRate;
    this.currentTiltX += (this.targetTiltX - this.currentTiltX) * 0.14;
    this.currentTiltY += (this.targetTiltY - this.currentTiltY) * 0.14;
    this.flipImpulse *= 0.84;

    const open = this.currentOpenFactor;
    const prog = this.currentProgress;

    if (this.leftCoverGroup && this.rightCoverGroup && this.spineMesh) {
      this.leftCoverGroup.visible = open > 0.04;
      this.leftCoverGroup.position.x = (1 - open) * 1.75;
      this.rightCoverGroup.position.x = (1 - open) * -1.78;
      this.spineMesh.position.x = (1 - open) * -1.82;
      this.spineMesh.rotation.y = (1 - open) * 0.35;
    }

    if (this.rightPagesMesh && this.leftPagesMesh) {
      const maxThickness = 0.28;
      const rightThick = Math.max(0.02, maxThickness * prog) * open;
      const leftThick = Math.max(0.02, maxThickness * (1 - prog)) * open;

      this.rightPagesMesh.visible = open > 0.08;
      this.leftPagesMesh.visible = open > 0.08;
      this.rightPagesMesh.scale.z = rightThick;
      this.leftPagesMesh.scale.z = leftThick;
      this.rightPagesMesh.position.z = -0.14 + rightThick * 0.5;
      this.leftPagesMesh.position.z = -0.14 + leftThick * 0.5;
    }

    this.bookGroup.rotation.x = this.currentTiltX;
    this.bookGroup.rotation.y = this.currentTiltY + this.flipImpulse;

    const scaleFactor = this.isMobileLightMode
      ? 0.62
      : Math.min(1, Math.max(0.76, this.container.clientWidth / 1060));
    this.bookGroup.scale.setScalar(scaleFactor);

    this.renderer.render(this.scene, this.camera);

    const stillMoving =
      Math.abs(this.targetOpenFactor - this.currentOpenFactor) > 0.004 ||
      Math.abs(this.targetProgress - this.currentProgress) > 0.004 ||
      Math.abs(this.targetTiltX - this.currentTiltX) > 0.002 ||
      Math.abs(this.targetTiltY - this.currentTiltY) > 0.002 ||
      Math.abs(this.flipImpulse) > 0.003;

    if (stillMoving) {
      this.requestFrame();
    } else {
      this.dirty = false;
    }
  }

  public isDirty(): boolean {
    return this.dirty;
  }

  public dispose(): void {
    this.disposed = true;
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.renderer?.dispose();
    this.renderer = null;
  }
}
