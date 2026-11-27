import type { BookBlock } from '@darb/book-schema';
import type { z } from 'zod';

export type BlockRenderMode = 'inline' | 'fullscreen';

export type BlockCleanupFn = () => void;

export interface BlockMountContext {
  mode: BlockRenderMode;
  block: BookBlock;
  isMobile: boolean;
  onOpenFullscreen: () => void;
  onToast?: (msg: string) => void;
}

export interface InteractiveBlockPlugin<TPayload = unknown> {
  type: string;
  labelAr: string;
  descriptionAr: string;
  icon: string;
  schema: z.ZodType<TPayload, z.ZodTypeDef, unknown>;
  examplePayload: TPayload;
  extractSearchText?: (payload: TPayload) => string;
  mountInline: (
    container: HTMLElement,
    payload: TPayload,
    ctx: BlockMountContext
  ) => BlockCleanupFn | void;
  mountFullscreen: (
    container: HTMLElement,
    payload: TPayload,
    ctx: BlockMountContext
  ) => BlockCleanupFn | void;
}

export interface BlockPluginMetadata {
  type: string;
  labelAr: string;
  descriptionAr: string;
  icon: string;
  examplePayload: unknown;
}
