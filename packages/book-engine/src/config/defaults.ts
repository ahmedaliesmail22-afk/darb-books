import {
  EngineConfigSchema,
  type EngineConfig,
  type EngineConfigInput,
} from '@darb/book-schema';

export function resolveEngineConfig(input?: EngineConfigInput): EngineConfig {
  return EngineConfigSchema.parse(input ?? {});
}

/**
 * حقن تهيئة الخطوط والاتجاه ديناميكياً في متغيرات CSS الجذرية
 */
export function applyEngineThemeTokens(config: EngineConfig): void {
  const root = document.documentElement;
  if (config.direction) {
    root.setAttribute('dir', config.direction);
  }
  if (config.fonts?.pageFont) {
    root.style.setProperty('--page-font', config.fonts.pageFont);
  }
  if (config.fonts?.uiFont) {
    root.style.setProperty('--ui-font', config.fonts.uiFont);
  }
}
