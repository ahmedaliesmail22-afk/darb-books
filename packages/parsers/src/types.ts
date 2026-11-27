import type { BookBlock, BookDirection, EditionData } from '@darb/book-schema';

export interface ParserInput {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
  format?: string;
  bookSlug?: string;
  titleOverride?: string;
  subtitleOverride?: string;
  defaultDirection?: BookDirection;
}

export interface ExtractedAsset {
  relativePath: string;
  buffer: Buffer;
  mimeType: string;
  assetType: 'AUDIO' | 'VIDEO' | 'IMAGE' | 'MODEL_3D' | 'OTHER';
}

export interface ChapterPageEntry {
  html: string;
  blocks?: BookBlock[];
}

export interface ChapterSource {
  id: number;
  title: string;
  subtitle?: string;
  html: string;
  blocks?: BookBlock[];
  pages?: ChapterPageEntry[];
  hasVideo?: boolean;
}

export interface ParsedBookPackage {
  formatId: string;
  editionData: EditionData;
  extractedAssets: ExtractedAsset[];
  chaptersCount: number;
  spreadsCount: number;
  audioTracksCount: number;
  videosCount: number;
  warnings: string[];
  manifestMetadata?: Record<string, unknown>;
}

export interface ParserFormatDescriptor {
  formatId: string;
  labelAr: string;
  labelEn: string;
  extensions: string[];
  mimeTypes: string[];
  descriptionAr: string;
}

export interface BookParserAdapter extends ParserFormatDescriptor {
  canHandle(input: ParserInput): boolean;
  parse(input: ParserInput): Promise<ParsedBookPackage>;
}
