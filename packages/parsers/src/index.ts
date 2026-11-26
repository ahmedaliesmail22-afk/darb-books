export * from './types';
export { BookParserRegistry, BookParserError } from './registry';
export {
  sanitizeBookHtml,
  parseMarkdownFrontmatter,
  splitHtmlIntoPageChunks,
  buildCanonicalEditionFromChapters,
} from './shared/spreadBuilder';
export { JsonBookParser } from './adapters/jsonParser';
export { MarkdownBookParser } from './adapters/markdownParser';
export { DocxBookParser } from './adapters/docxParser';
export { EpubBookParser } from './adapters/epubParser';
export { TemplateZipParser } from './adapters/templateZipParser';
export {
  buildOfficialTemplateZip,
  type OfficialTemplateOptions,
} from './template/officialTemplate';

import { BookParserRegistry } from './registry';
import { TemplateZipParser } from './adapters/templateZipParser';
import { JsonBookParser } from './adapters/jsonParser';
import { MarkdownBookParser } from './adapters/markdownParser';
import { DocxBookParser } from './adapters/docxParser';
import { EpubBookParser } from './adapters/epubParser';

export function createDefaultParserRegistry(): BookParserRegistry {
  return new BookParserRegistry()
    .register(new TemplateZipParser())
    .register(new JsonBookParser())
    .register(new MarkdownBookParser())
    .register(new DocxBookParser())
    .register(new EpubBookParser());
}
