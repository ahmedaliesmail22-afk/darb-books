import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type * as THREE from 'three';
import {
  cleanupWebGLResources,
  createDefaultBlockRegistry,
  type InteractiveBlockPlugin,
} from '../src/index';

describe('@darb/book-engine InteractiveBlockRegistry', () => {
  it('registers all six built-in interactive block plugins and validates payloads via Zod', () => {
    const registry = createDefaultBlockRegistry();
    const types = registry.list().map((p) => p.type);
    expect(types).toEqual([
      'model3d',
      'simulation',
      'geo_timeline',
      'literacy_quran',
      'code_sandbox',
      'story_magazine',
    ]);

    for (const meta of registry.list()) {
      const check = registry.validateBlock({
        type: meta.type,
        title: meta.labelAr,
        payload: meta.examplePayload as Record<string, unknown>,
      });
      expect(check.ok).toBe(true);
    }

    const badSim = registry.validateBlock({
      type: 'simulation',
      payload: { preset: 'unknown_preset' },
    });
    expect(badSim.ok).toBe(false);
    if (!badSim.ok) {
      expect(badSim.code).toBe('INVALID_BLOCK_PAYLOAD');
    }

    const unknown = registry.validateBlock({
      type: 'non_existent_widget',
      payload: {},
    });
    expect(unknown.ok).toBe(false);
    if (!unknown.ok) {
      expect(unknown.code).toBe('UNKNOWN_BLOCK_TYPE');
    }
  });

  it('supports adding custom plugins without modifying engine core and extracts searchable text', () => {
    const registry = createDefaultBlockRegistry();
    const customPlugin: InteractiveBlockPlugin<{ promptAr: string }> = {
      type: 'chemistry_balancer',
      labelAr: 'موازن المعادلات',
      descriptionAr: 'وزن المعادلات الكيميائية',
      icon: '🧪',
      schema: z.object({ promptAr: z.string().min(2) }),
      examplePayload: { promptAr: 'وازن معادلة الاحتراق' },
      extractSearchText: (p) => p.promptAr,
      mountInline: () => () => {},
      mountFullscreen: () => () => {},
    };

    registry.register(customPlugin);
    expect(registry.has('chemistry_balancer')).toBe(true);
    expect(
      registry.extractSearchableText({
        type: 'chemistry_balancer',
        title: 'نشاط الكيمياء',
        payload: { promptAr: 'وازن معادلة الأكسدة' },
      })
    ).toContain('وازن معادلة الأكسدة');
  });

  it('disposes geometry, materials, textures, controls, renderer, and loses WebGL context cleanly', () => {
    const geoDispose = vi.fn();
    const texDispose = vi.fn();
    const matDispose = vi.fn();
    const controlsDispose = vi.fn();
    const rendererDispose = vi.fn();
    const loseContext = vi.fn();
    const clearScene = vi.fn();

    const fakeScene = {
      traverse: (cb: (obj: unknown) => void) => {
        cb({
          geometry: { dispose: geoDispose },
          material: { map: { dispose: texDispose }, dispose: matDispose },
        });
      },
      clear: clearScene,
    } as unknown as THREE.Scene;

    const fakeRenderer = {
      dispose: rendererDispose,
      getContext: () => ({
        getExtension: (name: string) =>
          name === 'WEBGL_lose_context' ? { loseContext } : null,
      }),
    } as unknown as THREE.WebGLRenderer;

    cleanupWebGLResources({
      renderer: fakeRenderer,
      scene: fakeScene,
      controls: { dispose: controlsDispose },
      forceLoseContext: true,
    });

    expect(controlsDispose).toHaveBeenCalledTimes(1);
    expect(geoDispose).toHaveBeenCalledTimes(1);
    expect(texDispose).toHaveBeenCalledTimes(1);
    expect(matDispose).toHaveBeenCalledTimes(1);
    expect(clearScene).toHaveBeenCalledTimes(1);
    expect(rendererDispose).toHaveBeenCalledTimes(1);
    expect(loseContext).toHaveBeenCalledTimes(1);
  });
});
