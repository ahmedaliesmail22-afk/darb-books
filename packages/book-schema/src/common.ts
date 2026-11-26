import { z } from 'zod';

export const ThemeModeSchema = z.enum(['sepia', 'dark', 'light']);
export type ThemeMode = z.infer<typeof ThemeModeSchema>;

export const FontScaleSchema = z.enum(['sm', 'md', 'lg']);
export type FontScale = z.infer<typeof FontScaleSchema>;

export const BookDirectionSchema = z.enum(['rtl', 'ltr']);
export type BookDirection = z.infer<typeof BookDirectionSchema>;

export const ExtensibleMetadataSchema = z.record(z.string(), z.unknown());
export type ExtensibleMetadata = z.infer<typeof ExtensibleMetadataSchema>;
