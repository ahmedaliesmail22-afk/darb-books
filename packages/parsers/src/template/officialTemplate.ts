import JSZip from 'jszip';

export interface OfficialTemplateOptions {
  version?: string;
  title?: string;
  guideMarkdown?: string;
  sampleTaxonomies?: Array<{ group: string; slug: string; labelAr: string }>;
}

const INTERACTIVE_BLOCKS_GUIDE_MD = `# دليل المؤلف لإدراج وتخصيص الكتل التفاعلية في منصة درب

تدعم منصة درب **نظام الإضافات المسجّلة (Interactive Block Registry)** الذي يتيح إدراج مختبرات ومكونات تفاعلية غنية داخل صفحات الكتاب أو في وضع **المختبر الكامل (Fullscreen Lab)**، مع الحفاظ التلقائي على عدم وجود شريط تمرير رأسي.

## طريقتان لإدراج أي كتلة تفاعلية
1. **داخل ملفات Markdown أو فصول القالب (\`chapters/*.md\`):**
   ضع كود JSON للكتلة داخل مقطع محاط بـ \`\`\`darb-block ... \`\`\`. سيقوم المحوّل باستخراج الكتلة ووضعها في صفحة متوازنة تلقائياً.
2. **داخل ملف \`book.json\`:**
   أضف مصفوفة \`blocks: [ ... ]\` مباشرة داخل أي فصل أو صفحة (\`right\` / \`left\`).

---

## أمثلة قياسية جاهزة للنسخ لجميع الكتل الست

### 1. عارض المجسمات ثلاثية الأبعاد (\`model3d\`)
يدعم ملفات \`GLB/GLTF\` (عبر \`modelUrl\`) أو المجسمات الإجرائية والتفكيك ونقاط الشرح:
\`\`\`darb-block
{
  "type": "model3d",
  "title": "التركيب ثلاثي الأبعاد لجزيء الماء",
  "fullscreenCapable": true,
  "payload": {
    "proceduralPreset": "water_molecule",
    "explodeFactor": 0,
    "autoRotate": true,
    "annotations": [
      {
        "id": "o1",
        "labelAr": "ذرة الأكسجين (O)",
        "descriptionAr": "ذرة مركزية تجذب الإلكترونات لتشكيل قطبية الجزيء.",
        "position": [0, 0.15, 0]
      }
    ]
  }
}
\`\`\`

### 2. مختبر المحاكاة العلمية (\`simulation\`)
يدعم المقذوفات \`projectile\`، البندول \`pendulum\`، الغازات \`ideal_gas\`، التداخل الموجي \`wave_interference\`، ورسم الدوال \`function_plotter\`:
\`\`\`darb-block
{
  "type": "simulation",
  "title": "محاكاة حركة المقذوفات",
  "payload": {
    "preset": "projectile",
    "descriptionAr": "عدّل السرعة وزاوية الإطلاق لمراقبة تغير المدى وأقصى ارتفاع",
    "parameters": [
      { "key": "velocity", "labelAr": "السرعة الابتدائية", "unit": "م/ث", "min": 5, "max": 40, "step": 1, "defaultValue": 24 },
      { "key": "angle", "labelAr": "زاوية الإطلاق", "unit": "°", "min": 15, "max": 80, "step": 1, "defaultValue": 45 },
      { "key": "gravity", "labelAr": "الجاذبية", "unit": "م/ث²", "min": 1.6, "max": 15, "step": 0.2, "defaultValue": 9.8 }
    ]
  }
}
\`\`\`

### 3. الخرائط التفاعلية والخطوط الزمنية (\`geo_timeline\`)
\`\`\`darb-block
{
  "type": "geo_timeline",
  "title": "خريطة مراكز العلم والحضارة",
  "payload": {
    "mode": "hybrid",
    "region": "arab_world",
    "layers": [
      { "id": "centers", "labelAr": "مراكز العلم", "color": "#38bdf8", "visibleByDefault": true }
    ],
    "events": [
      {
        "id": "baghdad",
        "yearLabel": "830 م",
        "titleAr": "بيت الحكمة",
        "summaryAr": "مركز الترجمة والبحث في الفلك والرياضيات.",
        "xPercent": 72,
        "yPercent": 48,
        "layerId": "centers"
      }
    ]
  }
}
\`\`\`

### 4. التلاوة والتجويد والإملاء (\`literacy_quran\`)
\`\`\`darb-block
{
  "type": "literacy_quran",
  "title": "تدبر أحكام التلاوة والإملاء",
  "payload": {
    "mode": "tajweed_recitation",
    "topicTitleAr": "التفخيم والقلقلة",
    "ayahOrSentenceAr": "قُلْ هُوَ اللَّهُ أَحَدٌ",
    "segments": [
      { "text": "اللَّهُ", "color": "#facc15", "ruleLabelAr": "لام لفظ الجلالة المفخمة", "explanationAr": "تفخم بعد الفتح أو الضم." },
      { "text": "أَحَدٌ", "color": "#38bdf8", "ruleLabelAr": "قلقلة كبرى", "explanationAr": "قلقلة الدال الموقوف عليها." }
    ],
    "exercises": [
      {
        "id": "ex1",
        "promptAr": "اختر الرسم الإملائي الصحيح",
        "targetWordAr": "قِرَاءَةٌ",
        "choices": ["قِرَاءَةٌ", "قِرَائَةٌ"]
      }
    ]
  }
}
\`\`\`

### 5. محرر وتشغيل الكود الآمن (\`code_sandbox\`)
\`\`\`darb-block
{
  "type": "code_sandbox",
  "title": "مختبر الخوارزميات السريع",
  "payload": {
    "language": "javascript",
    "starterCode": "const nums = [1, 2, 3, 4];\\nconsole.log('Total:', nums.reduce((a, b) => a + b, 0));",
    "expectedOutputContains": "Total: 10"
  }
}
\`\`\`

### 6. تخطيط القصص والمجلات (\`story_magazine\`)
\`\`\`darb-block
{
  "type": "story_magazine",
  "title": "حوار العدد التفاعلي",
  "payload": {
    "layout": "comic_dialogue",
    "kickerAr": "مجلة درب",
    "headlineAr": "مستقبل التلسكوبات المدارية",
    "leadParagraphAr": "نقاش علمي مبسط حول رصد الكواكب البعيدة.",
    "calloutQuoteAr": "المعرفة تبدأ بسؤال.",
    "dialogueTurns": [
      { "speakerAr": "سلمى", "avatarEmoji": "🔭", "textAr": "كيف نرى المجرات البعيدة بدقة؟" },
      { "speakerAr": "طارق", "avatarEmoji": "🛰️", "textAr": "عبر مرايا سداسية دقيقة خارج الغلاف الجوي." }
    ]
  }
}
\`\`\`
`;

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
        title: 'الفصل الأول: التمهيد والكتل التفاعلية',
        subtitle: 'مقدمة تمهيدية مع مثال محاكاة تفاعلية',
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

${options.guideMarkdown ?? 'هذا القالب قابل للتحديث من إدارة المنصة ويساعد المؤلفين على إعداد كتب متوافقة مع القارئ ثلاثي الأبعاد والراوي الصوتي وسجل الكتل التفاعلية.'}

## البنية القياسية للحزمة
- \`book.manifest.json\`: البيانات الوصفية وتصنيفات الكتاب وترتيب الفصول.
- \`INTERACTIVE_BLOCKS_GUIDE.md\`: **دليل مفصل وأمثلة جاهزة للكتل التفاعلية الست (\`model3d\`, \`simulation\`, \`geo_timeline\`, \`literacy_quran\`, \`code_sandbox\`, \`story_magazine\`)**.
- \`chapters/*.md\`: نصوص الفصول بصيغة Markdown (يمكن استخدام \`<!-- pagebreak -->\` أو مقاطع \`darb-block\`).
- \`audio/spread_0.mp3 ..\` (اختياري): ملفات الصوت المتزامنة مع كل نشرة.
- \`videos/ch1.mp4 ..\` (اختياري): مقاطع الفيديو التعريفية للفصول.
- \`assets/\` (اختياري): الصور أو مجسمات \`.glb/.gltf\` المرفقة.

## أمثلة من التصنيفات النشطة حالياً في قاعدة البيانات
${taxonomyNotes}
`;

  zip.file('README.md', readme);
  zip.file('INTERACTIVE_BLOCKS_GUIDE.md', INTERACTIVE_BLOCKS_GUIDE_MD);
  zip.file('book.manifest.json', JSON.stringify(manifest, null, 2));
  zip.file(
    'chapters/01-introduction.md',
    `---
title: الفصل الأول: التمهيد والكتل التفاعلية
subtitle: مقدمة تمهيدية مع مثال محاكاة تفاعلية
---

مرحباً بك في القالب القياسي الرسمي لمنصة درب!

يمكنك كتابة الفقرات العربية واللاتينية بشكل طبيعي، وإدراج كتل تفاعلية عبر \`darb-block\` لتشغيلها داخل الصفحة أو في المختبر الكامل.

\`\`\`darb-block
{
  "type": "simulation",
  "title": "مثال محاكاة: حركة المقذوفات",
  "payload": {
    "preset": "projectile",
    "descriptionAr": "جرّب تغيير السرعة والزاوية لمشاهدة تغير المسار",
    "parameters": [
      { "key": "velocity", "labelAr": "السرعة الابتدائية", "unit": "م/ث", "min": 5, "max": 40, "step": 1, "defaultValue": 22 },
      { "key": "angle", "labelAr": "زاوية الإطلاق", "unit": "°", "min": 15, "max": 80, "step": 1, "defaultValue": 45 },
      { "key": "gravity", "labelAr": "الجاذبية", "unit": "م/ث²", "min": 1.6, "max": 15, "step": 0.2, "defaultValue": 9.8 }
    ]
  }
}
\`\`\`
`
  );
  zip.file(
    'chapters/02-chapter-two.md',
    `---
title: الفصل الثاني: المفاهيم التطبيقية
subtitle: أمثلة وشروحات مفصلة
---

هذا هو الفصل الثاني من النموذج الرسمي. راجع ملف \`INTERACTIVE_BLOCKS_GUIDE.md\` لإضافة مجسمات 3D، خرائط، تجويد، محرر كود، أو تخطيطات مجلات.
`
  );

  zip.file('audio/.gitkeep', '');
  zip.file('videos/.gitkeep', '');
  zip.file('assets/.gitkeep', '');

  return zip.generateAsync({ type: 'nodebuffer' });
}
