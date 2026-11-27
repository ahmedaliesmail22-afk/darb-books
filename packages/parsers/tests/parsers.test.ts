import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import {
  BookParserError,
  buildOfficialTemplateZip,
  createDefaultParserRegistry,
} from '../src/index';

async function buildMinimalDocxBuffer(heading: string, paragraph: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`
  );
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>${heading}</w:t></w:r></w:p>
    <w:p><w:r><w:t>${paragraph}</w:t></w:r></w:p>
  </w:body>
</w:document>`
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

async function buildMinimalEpubBuffer(title: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file('mimetype', 'application/epub+zip');
  zip.file(
    'META-INF/container.xml',
    `<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>`
  );
  zip.file(
    'OEBPS/content.opf',
    `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>${title}</dc:title>
    <dc:language>ar</dc:language>
  </metadata>
  <manifest>
    <item id="ch1" href="ch1.xhtml" media-type="application/xhtml+xml"/>
  </manifest>
  <spine page-progression-direction="rtl">
    <itemref idref="ch1"/>
  </spine>
</package>`
  );
  zip.file(
    'OEBPS/ch1.xhtml',
    `<html xmlns="http://www.w3.org/1999/xhtml"><head><title>الفصل 1</title></head><body><h1>باب الفيزياء</h1><p>محتوى إلكتروني منظم.</p><script>alert(1)</script></body></html>`
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

describe('Pluggable BookParserRegistry & Format Adapters', () => {
  const registry = createDefaultParserRegistry();

  it('lists all 5 built-in adapters and rejects unrecognized files safely', async () => {
    const formats = registry.listFormats().map((f) => f.formatId);
    expect(formats).toEqual(['template-zip', 'json', 'markdown', 'docx', 'epub']);

    await expect(
      registry.parse({ buffer: Buffer.from('hello'), filename: 'notes.txt' })
    ).rejects.toBeInstanceOf(BookParserError);
  });

  it('generates Official Template ZIP and round-trips it cleanly into Canonical Book Schema with media assets', async () => {
    const templateBuf = await buildOfficialTemplateZip({
      version: '2.1.0',
      title: 'مقدمة في هندسة السحاب',
      sampleTaxonomies: [{ group: 'domain', slug: 'software-engineering', labelAr: 'هندسة البرمجيات' }],
    });

    // Verify guide documenting all 6 interactive blocks is bundled in template ZIP
    const origZip = await JSZip.loadAsync(templateBuf);
    const interactiveGuide = await origZip.file('INTERACTIVE_BLOCKS_GUIDE.md')?.async('string');
    expect(interactiveGuide).toContain('model3d');
    expect(interactiveGuide).toContain('simulation');
    expect(interactiveGuide).toContain('geo_timeline');
    expect(interactiveGuide).toContain('literacy_quran');
    expect(interactiveGuide).toContain('code_sandbox');
    expect(interactiveGuide).toContain('story_magazine');

    // Inject mock mp3/mp4 assets into the template zip
    const zip = await JSZip.loadAsync(templateBuf);
    zip.file('audio/spread_0.mp3', Buffer.from('FAKE_MP3_BYTES'));
    zip.file('videos/ch1.mp4', Buffer.from('FAKE_MP4_BYTES'));
    const enrichedZip = await zip.generateAsync({ type: 'nodebuffer' });

    const parsed = await registry.parse({
      buffer: enrichedZip,
      filename: 'darb-book-template.zip',
      bookSlug: 'cloud-eng-template',
    });

    expect(parsed.formatId).toBe('template-zip');
    expect(parsed.editionData.id).toBe('cloud-eng-template');
    expect(parsed.editionData.title).toBe('مقدمة في هندسة السحاب');
    expect(parsed.chaptersCount).toBe(2);
    expect(parsed.audioTracksCount).toBe(1);
    expect(parsed.videosCount).toBe(1);
    expect(parsed.editionData.spreads[0]?.isFrontCover).toBe(true);
    expect(parsed.editionData.spreads[1]?.right?.html).toContain('toc-item');
    expect(parsed.editionData.spreads[1]?.right?.html).toContain('hold-ring-svg');
  });

  it('parses Markdown with frontmatter, pagebreaks, and sanitizes XSS vectors', async () => {
    const md = `---
title: كتاب البرمجة النظيفة
subtitle: دليل المطورين
direction: rtl
---
# الفصل الأول: البداية
مرحباً بكم في هذا الكتاب <script>evil()</script>
<!-- pagebreak -->
النص في الصفحة الثانية <a href="javascript:alert(1)">رابط</a>

## الفصل الثاني: المعمارية
فقرة الفصل الثاني.
`;

    const parsed = await registry.parse({
      buffer: Buffer.from(md, 'utf8'),
      filename: 'clean-code.md',
    });

    expect(parsed.formatId).toBe('markdown');
    expect(parsed.editionData.title).toBe('كتاب البرمجة النظيفة');
    expect(parsed.chaptersCount).toBe(2);
    const allHtml = parsed.editionData.spreads
      .map((s) => `${s.right?.html ?? ''}${s.left?.html ?? ''}`)
      .join('');
    expect(allHtml).not.toContain('<script');
    expect(allHtml).not.toContain('javascript:');
  });

  it('parses Canonical/Chapter JSON cleanly and validates schema', async () => {
    const json = JSON.stringify({
      title: 'موسوعة الرياضيات',
      chapters: [
        { title: 'الجبر الخطي', html: '<p>المصفوفات والمتجهات.</p>' },
        { title: 'التفاضل', html: '<p>المشتقات والتكاملات.</p>' },
      ],
    });
    const parsed = await registry.parse({
      buffer: Buffer.from(json, 'utf8'),
      filename: 'math.json',
      bookSlug: 'math-encyclopedia',
    });
    expect(parsed.formatId).toBe('json');
    expect(parsed.editionData.id).toBe('math-encyclopedia');
    expect(parsed.chaptersCount).toBe(2);
  });

  it('parses real DOCX OOXML buffer using mammoth', async () => {
    const docxBuf = await buildMinimalDocxBuffer('الفصل الأول: التشريح البرمجي', 'فقرة توضيحية من ملف وورد.');
    const parsed = await registry.parse({
      buffer: docxBuf,
      filename: 'anatomy.docx',
      bookSlug: 'word-anatomy',
    });
    expect(parsed.formatId).toBe('docx');
    expect(parsed.chaptersCount).toBe(1);
    expect(parsed.editionData.spreads[2]?.right?.title).toBe('الفصل الأول: التشريح البرمجي');
  });

  it('parses real EPUB container + OPF spine + XHTML safely', async () => {
    const epubBuf = await buildMinimalEpubBuffer('فيزياء السحاب');
    const parsed = await registry.parse({
      buffer: epubBuf,
      filename: 'cloud-physics.epub',
    });
    expect(parsed.formatId).toBe('epub');
    expect(parsed.editionData.title).toBe('فيزياء السحاب');
    expect(parsed.chaptersCount).toBe(1);
    const combined = parsed.editionData.spreads
      .map((s) => `${s.right?.html ?? ''}${s.left?.html ?? ''}`)
      .join('');
    expect(combined).toContain('محتوى إلكتروني منظم');
    expect(combined).not.toContain('<script');
  });

  it('extracts darb-block interactive JSON blocks cleanly from Markdown manuscripts', async () => {
    const md = `---
title: كتاب الفيزياء والبرمجة التفاعلية
direction: rtl
---
# الفصل الأول: محاكاة وتفاعل
تقديم سريع قبل التجربة.

\`\`\`darb-block
{
  "type": "simulation",
  "title": "محاكاة المقذوفات",
  "payload": {
    "preset": "projectile"
  }
}
\`\`\`

\`\`\`darb-block
{
  "type": "code_sandbox",
  "title": "مختبر الكود",
  "payload": {
    "language": "javascript",
    "starterCode": "console.log(42);"
  }
}
\`\`\`
`;
    const parsed = await registry.parse({
      buffer: Buffer.from(md, 'utf8'),
      filename: 'interactive-md.md',
    });

    const allBlocks = parsed.editionData.spreads.flatMap((sp) => [
      ...(sp.right?.blocks ?? []),
      ...(sp.left?.blocks ?? []),
    ]);
    expect(allBlocks.map((b) => b.type)).toEqual(['simulation', 'code_sandbox']);
  });
});
