import type { Object3D, Scene, WebGLRenderer } from 'three';

interface DisposableLike {
  dispose: () => void;
}

function disposeMaterial(mat: unknown): void {
  if (!mat || typeof mat !== 'object') return;
  const m = mat as Record<string, unknown> & Partial<DisposableLike>;
  const textureKeys = [
    'map',
    'alphaMap',
    'aoMap',
    'bumpMap',
    'displacementMap',
    'emissiveMap',
    'envMap',
    'lightMap',
    'metalnessMap',
    'normalMap',
    'roughnessMap',
  ];
  for (const key of textureKeys) {
    const tex = m[key] as Partial<DisposableLike> | undefined;
    if (tex && typeof tex.dispose === 'function') {
      tex.dispose();
    }
  }
  if (typeof m.dispose === 'function') {
    m.dispose();
  }
}

export function disposeSceneResources(scene: Scene | null | undefined): void {
  if (!scene) return;
  scene.traverse((obj: Object3D) => {
    const anyObj = obj as unknown as {
      geometry?: Partial<DisposableLike>;
      material?: unknown;
    };
    if (anyObj.geometry && typeof anyObj.geometry.dispose === 'function') {
      anyObj.geometry.dispose();
    }
    if (Array.isArray(anyObj.material)) {
      for (const m of anyObj.material) {
        disposeMaterial(m);
      }
    } else if (anyObj.material) {
      disposeMaterial(anyObj.material);
    }
  });
  scene.clear();
}

export interface SafeWebGLCleanupOptions {
  renderer: WebGLRenderer | null;
  scene: Scene | null;
  controls?: DisposableLike | null;
  forceLoseContext?: boolean;
}

/**
 * تنظيف صارم وآمن لموارد Three.js WebGL لمنع تجاوز حد السياقات النشطة
 * في المتصفح أثناء التقليب السريع بجانب BookStage3D.
 */
export function cleanupWebGLResources(opts: SafeWebGLCleanupOptions): void {
  try {
    opts.controls?.dispose();
  } catch {
    // ignore controls disposal errors
  }

  try {
    disposeSceneResources(opts.scene);
  } catch {
    // ignore scene resource disposal errors
  }

  if (opts.renderer) {
    let loseExt: { loseContext: () => void } | null = null;
    try {
      const gl = opts.renderer.getContext();
      loseExt = gl?.getExtension('WEBGL_lose_context') as { loseContext: () => void } | null;
    } catch {
      loseExt = null;
    }

    try {
      opts.renderer.dispose();
    } catch {
      // ignore renderer disposal errors
    }

    if (opts.forceLoseContext !== false && loseExt && typeof loseExt.loseContext === 'function') {
      try {
        loseExt.loseContext();
      } catch {
        // ignore WebGL loseContext errors
      }
    }
  }
}
