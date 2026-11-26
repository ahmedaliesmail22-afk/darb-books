import type {
  BookParserAdapter,
  ParsedBookPackage,
  ParserFormatDescriptor,
  ParserInput,
} from './types';

export class BookParserError extends Error {
  public readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export class BookParserRegistry {
  private readonly adapters = new Map<string, BookParserAdapter>();

  public register(adapter: BookParserAdapter): this {
    this.adapters.set(adapter.formatId, adapter);
    return this;
  }

  public unregister(formatId: string): boolean {
    return this.adapters.delete(formatId);
  }

  public get(formatId: string): BookParserAdapter | undefined {
    return this.adapters.get(formatId);
  }

  public listFormats(): ParserFormatDescriptor[] {
    return Array.from(this.adapters.values()).map((a) => ({
      formatId: a.formatId,
      labelAr: a.labelAr,
      labelEn: a.labelEn,
      extensions: [...a.extensions],
      mimeTypes: [...a.mimeTypes],
      descriptionAr: a.descriptionAr,
    }));
  }

  public resolveAdapter(input: ParserInput): BookParserAdapter {
    if (input.format) {
      const explicit = this.adapters.get(input.format.toLowerCase().trim());
      if (!explicit) {
        throw new BookParserError(
          'UNSUPPORTED_FORMAT',
          `صيغة الملف غير مسجّلة في سجل المحولات: ${input.format}`
        );
      }
      return explicit;
    }

    for (const adapter of this.adapters.values()) {
      if (adapter.canHandle(input)) {
        return adapter;
      }
    }

    throw new BookParserError(
      'UNRECOGNIZED_FORMAT',
      `تعذر التعرف على محول مناسب للملف: ${input.filename}`
    );
  }

  public async parse(input: ParserInput): Promise<ParsedBookPackage> {
    if (!input.buffer || input.buffer.length === 0) {
      throw new BookParserError('EMPTY_FILE', 'الملف المرفوع فارغ');
    }
    const adapter = this.resolveAdapter(input);
    return adapter.parse(input);
  }
}
