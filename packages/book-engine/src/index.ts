export { resolveEngineConfig, applyEngineThemeTokens } from './config/defaults';
export { BookStage3D, type BookStage3DConfig } from './scene/BookStage3D';
export {
  FlipEngine,
  type FlipEngineCallbacks,
  type BlockRendererFn,
} from './reader/FlipEngine';
export {
  NarratorController,
  type NarratorConfig,
  type NarratorCallbacks,
} from './audio/NarratorController';
export { VideoModal, type VideoModalOptions } from './video/VideoModal';
export { OfflineManager, type OfflineManagerConfig } from './pwa/OfflineManager';
export {
  createDefaultBlockRegistry,
  InteractiveBlockRegistry,
  InteractiveLabModal,
  cleanupWebGLResources,
  disposeSceneResources,
  model3dPlugin,
  simulationPlugin,
  geoTimelinePlugin,
  literacyQuranPlugin,
  codeSandboxPlugin,
  storyMagazinePlugin,
  type BlockCleanupFn,
  type BlockMountContext,
  type BlockPluginMetadata,
  type BlockRenderMode,
  type InteractiveBlockPlugin,
  type InteractiveLabModalOptions,
  type SafeWebGLCleanupOptions,
  type Model3DBlockPayload,
  type SimulationBlockPayload,
  type GeoTimelineBlockPayload,
  type LiteracyQuranBlockPayload,
  type CodeSandboxBlockPayload,
  type StoryMagazineBlockPayload,
} from './blocks/index';
