import { CatalogDataSchema, type CatalogData } from './catalog';
import { EditionDataSchema, type EditionData } from './book';

export function normalizeAssetDir(rawPath: string): string {
  const cleaned = rawPath.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
  const withSlash = cleaned.endsWith('/') ? cleaned : `${cleaned}/`;
  return `./${withSlash}`;
}

export function normalizeDataFile(rawPath: string): string {
  const cleaned = rawPath.replace(/^(\.\.\/)+/, '').replace(/^\.\//, '');
  return `./${cleaned}`;
}

export function stripHtmlText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u065F\u0670]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .toLowerCase();
}

export function parseCatalogData(raw: unknown): CatalogData {
  return CatalogDataSchema.parse(raw);
}

export function parseEditionData(raw: unknown): EditionData {
  return EditionDataSchema.parse(raw);
}
