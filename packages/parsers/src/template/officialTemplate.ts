import JSZip from 'jszip';

export interface OfficialTemplateOptions {
  version?: string;
  title?: string;
  guideMarkdown?: string;
  sampleTaxonomies?: Array<{ group: string; slug: string; labelAr: string }>;
}

export async function buildOfficialTemplateZip(
  options: OfficialTemplateOptions = {}
): Promise<Buffer> {
  const zip = new JSZip();
  const version = options.version ?? '1.0.0';
  const title = options.title ?? 'عنوان الكتاب التفاعلي النموذجي';

  const manifest = {
    schemaVersion: version,
    slug: 'sample-darb-book',
    title,
    subtitle: 'عنوان فرعي توضيحي للكتاب',
    description: 'وصف مختصر يظهر في بطاقة الكتاب داخل مكتبة منصة درب.',
    badge: 'قالب قياسي',
    badgeColor: '#d4af37',
    theme: 'royal-gold',
    direction: 'rtl',
    taxonomySlugs: ['all-ages', 'general-reading', 'interactive-book'],
    chapters: [
      {
        id: 1,
        title: 'الفصل الأول: التمهيد والأساسيات',
        subtitle: 'مقدمة تمهيدية واضحة لبناء المحتوى',
        file: 'chapters/01-introduction.md',
      },
      {
        id: 2,
        title: 'الفصل الثاني: المفاهيم التطبيقية',
        subtitle: 'أمثلة وشروحات مفصلة مقسمة تلقائياً إلى نشرات',
        file: 'chapters/02-chapter-two.md',
      },
    ],
  };

  const taxonomyNotes =
    options.sampleTaxonomies && options.sampleTaxonomies.length > 0
      ? options.sampleTaxonomies
          .map((t) => `- \`${t.group}\`: \`${t.slug}\` (${t.labelAr})`)
          .join('\n')
      : '- استخدم معرفات التصنيفات النشطة من بوابة المؤلف أو لوحة التحكم.';

  const readme = `# القالب القياسي الرسمي لمنصة درب للكتب التفاعلية (الإصدار ${version})

${options.guideMarkdown ?? 'هذا القالب قابل للتحديث من إدارة المنصة ويساعد المؤلفين على إعداد كتب متوافقة مع القارئ ثلاثي الأبعاد والراوي الصوتي.'}

## البنية القياسية للحزمة
- \`book.manifest.json\`: البيانات الوصفية وتصنيفات الكتاب وترتيب الفصول.
- \`chapters/*.md\`: نصوص الفصول بصيغة Markdown (يمكن استخدام \`<!-- pagebreak -->\` لبدء صفحة جديدة يدوياً).
- \`audio/spread_0.mp3 ..\` (اختياري): ملفات الصوت المتزامنة مع كل نشرة.
- \`videos/ch1.mp4 ..\` (اختياري): مقاطع الفيديو التعريفية للفصول.
- \`assets/\` (اختياري): الصور أو الرسوم المرفقة.

## أمثلة من التصنيفات النشطة حالياً في قاعدة البيانات
${taxonomyNotes}
`;

  zip.file('README.md', readme);
  zip.file('book.manifest.json', JSON.stringify(manifest, null, 2));
  zip.file(
    'chapters/01-introduction.md',
    `---
title: الفصل الأول: التمهيد والأساسيات
subtitle: مقدمة تمهيدية واضحة لبناء المحتوى
---

مرحباً بك في القالب القياسي الرسمي لمنصة درب!

يمكنك كتابة الفقرات العربية واللاتينية بشكل طبيعي، وإضافة القوائم والاقتباسات، ليقوم المحوّل بتوزيعها على صفحات متوازنة داخل الكتاب ثلاثي الأبعاد.

<!-- pagebreak -->

### نصائح سريعة للكتابة
- استخدم فاصل \`<!-- pagebreak -->\` للتحكم الدقيق ببداية الصفحة التالية.
- أرفق ملفات الصوت في مجلد \`audio/\` بأسماء \`spread_0.mp3\`, \`spread_1.mp3\` عند الرغبة.
`
  );
  zip.file(
    'chapters/02-chapter-two.md',
    `---
title: الفصل الثاني: المفاهيم التطبيقية
subtitle: أمثلة وشروحات مفصلة
---

هذا هو الفصل الثاني من النموذج الرسمي. يمكنك رفع هذا القالب كما هو للتجربة ثم معاينته داخل المحرك ثلاثي الأبعاد قبل إرساله للمراجعة وتوقيع إقرار الملكية الفكرية.
`
  );

  zip.file('audio/.gitkeep', '');
  zip.file('videos/.gitkeep', '');
  zip.file('assets/.gitkeep', '');

  return zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
}
