export type ThemeMode = 'sepia' | 'dark' | 'light';
export type FontScale = 'sm' | 'md' | 'lg';

export interface BookPageSide {
  isCover?: boolean;
  isBlank?: boolean;
  header?: string;
  title?: string;
  html: string;
}

export interface BookSpread {
  isFrontCover?: boolean;
  isBackCover?: boolean;
  pageRightNum?: number;
  pageLeftNum?: number;
  right?: BookPageSide | null;
  left?: BookPageSide | null;
}

export interface MobilePage {
  spreadIdx: number;
  isCover?: boolean;
  side: 'right' | 'left';
  data: BookPageSide;
  pageNum?: number;
  indicator: string;
}

export interface EditionMeta {
  id: string;
  title: string;
  subtitle: string;
  badge: string;
  badgeColor: string;
  theme: string;
  description: string;
  dataFile: string;
  audioDir: string;
  videoDir: string;
  chaptersCount: number;
  spreadsCount: number;
  audioTracksCount: number;
  videosCount: number;
  releaseDate: string;
  status: string;
}

export interface CatalogData {
  defaultEdition: string;
  editions: EditionMeta[];
}

export interface EditionData {
  id: string;
  title: string;
  subtitle?: string;
  spreads: BookSpread[];
}

export interface ReadingProgressRecord {
  spreadIdx: number;
  pageLabel: string;
  updatedAt: number;
}

export interface BookmarkRecord {
  id: string;
  editionId: string;
  spreadIdx: number;
  title: string;
  subtitle: string;
  createdAt: number;
}

export interface SearchHit {
  spreadIdx: number;
  title: string;
  snippetHtml: string;
  pageLabel: string;
}

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
