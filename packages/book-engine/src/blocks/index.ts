import { InteractiveBlockRegistry } from './registry';
import { codeSandboxPlugin } from './plugins/codeSandboxPlugin';
import { geoTimelinePlugin } from './plugins/geoTimelinePlugin';
import { literacyQuranPlugin } from './plugins/literacyQuranPlugin';
import { model3dPlugin } from './plugins/model3dPlugin';
import { simulationPlugin } from './plugins/simulationPlugin';
import { storyMagazinePlugin } from './plugins/storyMagazinePlugin';

export type {
  BlockCleanupFn,
  BlockMountContext,
  BlockPluginMetadata,
  BlockRenderMode,
  InteractiveBlockPlugin,
} from './types';
export { InteractiveBlockRegistry } from './registry';
export { InteractiveLabModal, type InteractiveLabModalOptions } from './labModal';
export {
  cleanupWebGLResources,
  disposeSceneResources,
  type SafeWebGLCleanupOptions,
} from './webglHelper';
export {
  model3dPlugin,
  Model3DBlockPayloadSchema,
  type Model3DBlockPayload,
} from './plugins/model3dPlugin';
export {
  simulationPlugin,
  SimulationBlockPayloadSchema,
  type SimulationBlockPayload,
} from './plugins/simulationPlugin';
export {
  geoTimelinePlugin,
  GeoTimelineBlockPayloadSchema,
  type GeoTimelineBlockPayload,
} from './plugins/geoTimelinePlugin';
export {
  literacyQuranPlugin,
  LiteracyQuranBlockPayloadSchema,
  type LiteracyQuranBlockPayload,
} from './plugins/literacyQuranPlugin';
export {
  codeSandboxPlugin,
  CodeSandboxBlockPayloadSchema,
  type CodeSandboxBlockPayload,
} from './plugins/codeSandboxPlugin';
export {
  storyMagazinePlugin,
  StoryMagazineBlockPayloadSchema,
  type StoryMagazineBlockPayload,
} from './plugins/storyMagazinePlugin';

export function createDefaultBlockRegistry(): InteractiveBlockRegistry {
  const registry = new InteractiveBlockRegistry();
  registry
    .register(model3dPlugin)
    .register(simulationPlugin)
    .register(geoTimelinePlugin)
    .register(literacyQuranPlugin)
    .register(codeSandboxPlugin)
    .register(storyMagazinePlugin);
  return registry;
}
