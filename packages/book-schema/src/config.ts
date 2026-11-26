import { z } from 'zod';
import {
  BookDirectionSchema,
  ExtensibleMetadataSchema,
  FontScaleSchema,
  ThemeModeSchema,
} from './common';

export const FeatureFlagsSchema = z
  .object({
    enable3DStage: z.boolean().default(true),
    enableNarrator: z.boolean().default(true),
    enableChapterVideos: z.boolean().default(true),
    enableOfflineCache: z.boolean().default(true),
    enableBookmarks: z.boolean().default(true),
    enableSearch: z.boolean().default(true),
    enableGridOverview: z.boolean().default(true),
    enableShare: z.boolean().default(true),
    enableFontScaling: z.boolean().default(true),
    enableThemeSwitch: z.boolean().default(true),
  })
  .passthrough();

export type FeatureFlags = z.infer<typeof FeatureFlagsSchema>;

export const EngineFontsConfigSchema = z
  .object({
    pageFont: z.string().optional(),
    uiFont: z.string().optional(),
  })
  .passthrough();

export type EngineFontsConfig = z.infer<typeof EngineFontsConfigSchema>;

export const Stage3DThemeLightingSchema = z
  .object({
    ambientColor: z.string(),
    ambientIntensity: z.number(),
    keyColor: z.string(),
    keyIntensity: z.number(),
    accentColor: z.string(),
    accentIntensity: z.number(),
    paperEdgeColor: z.string(),
  })
  .passthrough();

export type Stage3DThemeLighting = z.infer<typeof Stage3DThemeLightingSchema>;

export const EngineBrandingConfigSchema = z
  .object({
    portalTitle: z.string().default('بوابة درب للكتب التفاعلية'),
    cloudLabel: z.string().default('منظومة درب السحابية'),
  })
  .passthrough();

export type EngineBrandingConfig = z.infer<typeof EngineBrandingConfigSchema>;

export const EngineConfigSchema = z
  .object({
    direction: BookDirectionSchema.default('rtl'),
    defaultTheme: ThemeModeSchema.default('sepia'),
    defaultFontScale: FontScaleSchema.default('md'),
    fonts: EngineFontsConfigSchema.optional(),
    autoFlipDelayMs: z.number().int().nonnegative().default(100),
    longPressDelayMs: z.number().int().positive().default(600),
    mobileBreakpointPx: z.number().int().positive().default(960),
    storagePrefix: z.string().default('darb_books'),
    swUrl: z.string().default('./sw.js'),
    swScope: z.string().default('./'),
    features: FeatureFlagsSchema.default({}),
    branding: EngineBrandingConfigSchema.optional(),
    stageLightingOverrides: z
      .object({
        sepia: Stage3DThemeLightingSchema.optional(),
        dark: Stage3DThemeLightingSchema.optional(),
        light: Stage3DThemeLightingSchema.optional(),
      })
      .catchall(Stage3DThemeLightingSchema)
      .optional(),
    metadata: ExtensibleMetadataSchema.optional(),
  })
  .passthrough();

export type EngineConfig = z.infer<typeof EngineConfigSchema>;
export type EngineConfigInput = z.input<typeof EngineConfigSchema>;
