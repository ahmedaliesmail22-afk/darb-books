# ✍️ دليل المؤلفين والمراجعين والكتل التفاعلية — منصة درب (`07`)

يوضح هذا الدليل العملي دورة التأليف والنشر غير الهدّام، وصيغ الملفات المدعومة في `@darb/parsers`، وطريقة إنشاء الكتب التفاعلية وتخصيص الكتل الست في [`InteractiveBlockRegistry`](../packages/book-engine/src/blocks/registry.ts).

> راجع أيضاً: [فهرس المستودع (`README.md`)](../README.md) | [مرجع الـ API والصلاحيات](./06_API_AND_RBAC_REFERENCE.md)

---

## 1. دورة حياة الكتاب وتعدد الإصدارات غير الهدّام

تستخدم المنصة حالات النشر المعرّفة في `PublicationStatus` داخل [`schema.prisma`](../apps/api/prisma/schema.prisma) لضمان عدم ظهور أي محتوى غير مراجَع للجمهور وعدم انقطاع القراء عند تحديث الكتب المنشورة:

```text
  [رفع كتاب أو إصدار جديد]
             │
             ▼
          (DRAFT) ──► المعاينة ثلاثية الأبعاد للمؤلف عبر ?versionId=...
             │
             │  توقيع إقرار الملكية الفكرية الإلزامي (ipDeclarationSigned: true)
             ▼
        (SUBMITTED) ──► إنشاء ReviewTicket + دخول طابور المراجعة
             │
             │  استلام المراجع للتذكرة (POST /moderation/versions/:id/claim)
             ▼
       (UNDER_REVIEW) ──► المعاينة 3D + تعبئة قائمة التحقق الديناميكية (moderation.review_checklist)
        /    │    \
       ▼     │     ▼
(CHANGES_    │   (REJECTED)
REQUESTED)   │
  │          ▼
  └────► [إعادة إرسال]     [APPROVE_AND_PUBLISH + صلاحية books.publish]
                                  │
                                  ▼
                             (PUBLISHED) ← تعيين book.activeVersionId لهذا الإصدار
                                           وأرشفة الإصدار المنشور السابق تلقائياً إلى (ARCHIVED)
```

### ضمان النشر غير الهدّام (`Non-Destructive Versioning`)
- عند رفع إصدار جديد (`v2`) لكتاب منشور مسبقاً بـ `v1` via `POST /api/v1/author/books/:slug/versions`:
  - يُحفظ الإصدار الجديد في حالة `DRAFT` وتُرفع ملفاته المستقلة تحت المسار `books/<slug>/v2/...`.
  - يظل `book.status = 'PUBLISHED'` و`book.activeVersionId` مشيراً إلى `v1` دون أي توقف للقراء أثناء تعديل `v2` أو مراجعته أو حتى لو أُعيد بملاحظات (`CHANGES_REQUESTED`).
  - فور اعتماد `v2` (`APPROVE_AND_PUBLISH`)، يتحول `v1` إلى `ARCHIVED` مع الاحتفاظ بسجله، ويصبح `activeVersionId` مشيراً إلى `v2` في معاملة قاعدة بيانات ذرية واحدة مع توثيق القرار في `audit_logs`.

### إجراءات المراجع وإلزامية الملكية الفكرية
- لا يقبل الخادم إرسال أي إصدار (`POST /author/versions/:id/submit`) دون `ipDeclarationSigned: true` (`400 IP_DECLARATION_REQUIRED`).
- يقرأ المراجع بنود قائمة التحقق الحية من `system_configs` (مفتاح `moderation.review_checklist`) ويشترط عند الاعتماد والنشر:
  1. امتلاك صلاحية `books.publish` (وإلا يعيد `403 FORBIDDEN`).
  2. استيفاء كل بند يحمل `required: true` داخل قائمة التحقق (`400 CHECKLIST_INCOMPLETE`).
  3. تأكيد كلٍ من `contentVerified: true` و`ipVerified: true`.
  4. توقيع المؤلف المسبق على إقرار الملكية الفكرية.
- عند اختيار `REQUEST_CHANGES` أو `REJECT` يلزم إدخال ملاحظات واضحة (`notes` ≥ 3 أحرف).

---

## 2. الصيغ المدعومة واستخدام القالب القياسي (`@darb/parsers`)

يسجل [`createDefaultParserRegistry()`](../packages/parsers/src/registry.ts) خمسة محولات مرنة:

| معرّف الصيغة (`formatId`) | الامتدادات | الاستخدام الأمثل |
| :--- | :--- | :--- |
| **`template-zip`** | `.zip` | الحزمة الرسمية الكاملة (`book.manifest.json` + فصول `chapters/*.md` أو `book.json` + وسائط `audio/` و`videos/` و`assets/`) |
| **`json`** | `.json` | ملف JSON كامل مطابق لـ `EditionDataSchema` (`spreads[]`) أو بصيغة مبسطة (`title` + `chapters[]` مع `blocks[]` اختيارية) |
| **`markdown`** | `.md`, `.markdown` | مخطوطة ببيانات رأسية Frontmatter (`title`, `subtitle`, `direction`, `badge`) وفواصل صفحات `<!-- pagebreak -->` ومقاطع `darb-block` |
| **`docx`** | `.docx` | مستندات Word تُحوَّل عبر `mammoth` وتُقسَّم فصولها حسب العناوين `Heading 1 / 2` مع تعقيم HTML |
| **`epub`** | `.epub` | كتب EPUB القياسية عبر قراءة `META-INF/container.xml` وملف `OPF` وترتيب `spine` وتعقيم XHTML |

> تخضع الملفات المرفوعة لسياسة `uploads.policy` المخزنة في `system_configs` (الصيغ المسموحة وحجم الملف الأقصى بالميجابايت، 100 MB افتراضياً).

### محتويات القالب القياسي القابل للتحديث
يُولَّد القالب حياً عند زيارة `GET /api/v1/templates/official/download` عبر [`buildOfficialTemplateZip()`](../packages/parsers/src/template/officialTemplate.ts) من إعدادات `templates.official_package` والتصنيفات النشطة الحالية، ويحتوي على:
- `README.md`: تعليمات النسخة الحالية وقائمة معرفات التصنيفات (`slug`) النشطة في المنصة.
- `INTERACTIVE_BLOCKS_GUIDE.md`: مرجع الكتل التفاعلية الست وأمثلة JSON للنسخ الفوري.
- `book.manifest.json`: توصيف الكتاب (`schemaVersion`, `slug`, `title`, `subtitle`, `description`, `badge`, `badgeColor`, `theme`, `direction`, `taxonomySlugs`, `chapters`).
- `chapters/*.md`: نماذج الفصول (تتضمن مثالاً عملياً لكتلة `simulation`).
- مجلدات `audio/` (بأسماء `spread_0.mp3`, `spread_1.mp3`...), `videos/` (بأسماء `ch1.mp4`, `ch2.mp4`...), و`assets/` للمجسمات والصور.

### طريقتا إدراج الكتل التفاعلية داخل المحتوى
1. **داخل ملفات Markdown أو فصول القالب (`chapters/*.md`):** ضع بنية الكتلة داخل سياج ```` ```darb-block ... ``` ````، حيث يتولى [`buildChapterPagesFromMarkdown`](../packages/parsers/src/shared/spreadBuilder.ts) التحقق منها بـ `BookBlockSchema` وإفراد صفحة متوازنة لها تلقائياً لمنع الازدحام.
2. **داخل JSON (`spreads` أو فصول مبسطة):** مرّر مصفوفة `blocks: [ { id, type, title, fullscreenCapable, payload } ]` مباشرة.

> **قواعد التصميم الصفحي:** يُفضَّل الاكتفاء بمقدمة مختصرة (سطر إلى سطرين) + كتلة تفاعلية واحدة في الصفحة الواحدة مع تفعيل `"fullscreenCapable": true` لتعمل النشرة بسلاسة وصفر شريط تمرير رأسي على الحاسوب والجوال.

---

## 3. المرجع العملي وأمثلة JSON الحقيقية للكتل التفاعلية الست

الأمثلة التالية مطابقة تماماً لمخططات `Zod` الفعلية ومقتبسة من [`public/editions/interactive-showcase.json`](../public/editions/interactive-showcase.json) و[`officialTemplate.ts`](../packages/parsers/src/template/officialTemplate.ts):

### 1. عارض المجسمات ثلاثية الأبعاد (`model3d`)
- **المخطط (`Model3DBlockPayloadSchema`):** يدعم `modelUrl` (مسار `.glb`/`.gltf`)، أو نماذج إجرائية جاهزة `proceduralPreset` (`water_molecule` | `solar_system` | `dna_helix` | `architectural_dome` | `crystal_lattice`)، أو مصفوفة `parts[]` مخصصة (`sphere` | `box` | `cylinder` | `torus` | `cone`)، و`explodeFactor` (`0..2`)، و`autoRotate`، و`annotations[]`.

```json
{
  "id": "demo-model3d-water",
  "type": "model3d",
  "title": "تركيب جزيء الماء ثلاثي الأبعاد (H₂O)",
  "fullscreenCapable": true,
  "payload": {
    "proceduralPreset": "water_molecule",
    "explodeFactor": 0,
    "autoRotate": true,
    "annotations": [
      {
        "id": "oxygen",
        "labelAr": "ذرة الأكسجين (O)",
        "descriptionAr": "تقع في المركز بسالبية كهربائية عالية تشكل قطبية الجزيء.",
        "position": [0, 0.15, 0]
      },
      {
        "id": "hydrogen",
        "labelAr": "ذرتا الهيدروجين (H)",
        "descriptionAr": "ترتبطان بزاوية 104.5° لتكوين الروابط الهيدروجينية.",
        "position": [1.1, -0.45, 0]
      }
    ]
  }
}
```

### 2. مختبر المحاكاة العلمية (`simulation`)
- **المخطط (`SimulationBlockPayloadSchema`):** يدعم `preset` (`projectile` | `pendulum` | `ideal_gas` | `wave_interference` | `function_plotter`)، و`curveFormula` (عند اختيار `function_plotter` مثل `"a * sin(b * x + c)"`)، ومصفوفة `parameters[]` تحدد كل منزلق ووحدته ومداه.

```json
{
  "id": "demo-sim-projectile",
  "type": "simulation",
  "title": "مختبر حركة المقذوفات",
  "fullscreenCapable": true,
  "payload": {
    "preset": "projectile",
    "descriptionAr": "حساب المدى الأقصى وارتفاع القمة لحظياً",
    "parameters": [
      { "key": "velocity", "labelAr": "السرعة الابتدائية", "unit": "م/ث", "min": 5, "max": 40, "step": 1, "defaultValue": 24 },
      { "key": "angle", "labelAr": "زاوية الإطلاق", "unit": "°", "min": 15, "max": 80, "step": 1, "defaultValue": 45 },
      { "key": "gravity", "labelAr": "الجاذبية", "unit": "م/ث²", "min": 1.6, "max": 15, "step": 0.2, "defaultValue": 9.8 }
    ]
  }
}
```

### 3. الخرائط التفاعلية والخطوط الزمنية (`geo_timeline`)
- **المخطط (`GeoTimelineBlockPayloadSchema`):** يدعم `mode` (`hybrid` | `map` | `timeline`)، وإقليم الخريطة المتجهة `region` (`arab_world` | `world` | `hejaz` | `andalus` | `custom_grid`)، والطبقات `layers[]`، والمسارات `routes[]`، والأحداث `events[]` (بإحداثيات نسبية `xPercent`, `yPercent` من `0` إلى `100`).

```json
{
  "id": "demo-geo-timeline",
  "type": "geo_timeline",
  "title": "حركة العلم والترجمة في العالم العربي والإسلامي",
  "fullscreenCapable": true,
  "payload": {
    "mode": "hybrid",
    "region": "arab_world",
    "layers": [
      { "id": "science", "labelAr": "مراكز العلم", "color": "#38bdf8", "visibleByDefault": true },
      { "id": "routes", "labelAr": "مسار الرحلات العلمية", "color": "#f59e0b", "visibleByDefault": true }
    ],
    "routes": [
      {
        "id": "r1",
        "labelAr": "مسار الترجمة",
        "color": "#f59e0b",
        "layerId": "routes",
        "points": [[72, 48], [56, 46], [24, 42]]
      }
    ],
    "events": [
      {
        "id": "baghdad",
        "yearLabel": "830 م",
        "titleAr": "بيت الحكمة — بغداد",
        "summaryAr": "مجمع الترجمة والبحث العلمي في الفلك والبصريات والجبر.",
        "xPercent": 72,
        "yPercent": 48,
        "layerId": "science"
      },
      {
        "id": "cordoba",
        "yearLabel": "950 م",
        "titleAr": "قرطبة — الأندلس",
        "summaryAr": "ازدهار المراصد الفلكية والطب والصناعات الهندسية.",
        "xPercent": 24,
        "yPercent": 42,
        "layerId": "science"
      }
    ]
  }
}
```

### 4. التلاوة والإملاء واللغات (`literacy_quran`)
- **المخطط (`LiteracyQuranBlockPayloadSchema`):** يدعم `mode` (`tajweed_recitation` | `dictation_spelling` | `vocab_cards`)، والنص `ayahOrSentenceAr`، والمقاطع التفاعلية المرمّزة لونياً `segments[]`، وتمارين الاختيار الإملائي الفوري `exercises[]`.

```json
{
  "id": "demo-literacy-quran",
  "type": "literacy_quran",
  "title": "التلاوة المرمّزة لونياً والتدريب الإملائي",
  "fullscreenCapable": true,
  "payload": {
    "mode": "tajweed_recitation",
    "topicTitleAr": "التفخيم والقلقلة والهمزات",
    "ayahOrSentenceAr": "قُلْ هُوَ اللَّهُ أَحَدٌ",
    "segments": [
      { "text": "قُلْ هُوَ", "ruleLabelAr": "تفخيم القاف", "explanationAr": "حرف القاف من حروف الاستعلاء المفخمة." },
      { "text": "اللَّهُ", "color": "#facc15", "ruleLabelAr": "لام لفظ الجلالة المفخمة", "explanationAr": "تفخم لام لفظ الجلالة بعد الفتح والضم." },
      { "text": "أَحَدٌ", "color": "#38bdf8", "ruleLabelAr": "قلقلة كبرى عند الوقف", "explanationAr": "الدال من حروف (قطب جد) وتظهر بقوة عند الوقف." }
    ],
    "exercises": [
      {
        "id": "ex-qiraah",
        "promptAr": "اختر الكتابة الصحيحة",
        "targetWordAr": "قِرَاءَةٌ",
        "choices": ["قِرَاءَةٌ", "قِرَائَةٌ", "قِرَأَةٌ"],
        "hintAr": "الهمزة المفتوحة بعد الألف الساكنة تكتب على السطر."
      }
    ]
  }
}
```

### 5. محرر الكود الآمن (`code_sandbox`)
- **المخطط (`CodeSandboxBlockPayloadSchema`):** يدعم `language` (`javascript` | `html_css` | `algorithm_trace`)، و`starterCode`، و`hintAr`، و`expectedOutputContains` (لإظهار شارة التحقق المطابق تلقائياً)، و`readOnly`.

```json
{
  "id": "demo-code-sandbox",
  "type": "code_sandbox",
  "title": "تطبيق سريع: مجموع الأعداد وخوارزمية التربيع",
  "fullscreenCapable": true,
  "payload": {
    "language": "javascript",
    "starterCode": "const nums = [2, 4, 6, 8];\nconst squares = nums.map(n => n * n);\nconst sum = squares.reduce((a, b) => a + b, 0);\nconsole.log('Squares:', squares);\nconsole.log('Total Sum =', sum);",
    "hintAr": "اضغط «تشغيل آمن» لرؤية الناتج أو افتح المختبر الكامل للتحرير الواسع.",
    "expectedOutputContains": "Total Sum = 120",
    "readOnly": false
  }
}
```

### 6. تخطيط القصص والمجلات التفاعلية (`story_magazine`)
- **المخطط (`StoryMagazineBlockPayloadSchema`):** يدعم `layout` (`magazine_split` | `comic_dialogue` | `hero_column` | `poll_sidebar`)، وعناصر `kickerAr`, `headlineAr`, `bylineAr`, `leadParagraphAr`, `calloutQuoteAr`, ومقاطع الحوار المتدرج `dialogueTurns[]`, واستطلاع `poll`.

```json
{
  "id": "demo-story-magazine",
  "type": "story_magazine",
  "title": "حوار في مرصد الفلك المداري",
  "fullscreenCapable": true,
  "payload": {
    "layout": "comic_dialogue",
    "kickerAr": "مجلة درب العلمية",
    "headlineAr": "المرايا السداسية وكيف نرى فجر الكون",
    "bylineAr": "إعداد قسم العلوم والتصميم",
    "leadParagraphAr": "تجتمع علوم البصريات والميكانيكا الدقيقة لتوجيه تلسكوب مداري بعيداً عن ضوضاء الأرض.",
    "calloutQuoteAr": "كل قفزة علمية تبدأ بسؤال متقن الصياغة.",
    "dialogueTurns": [
      { "speakerAr": "ندى", "avatarEmoji": "🔭", "textAr": "لماذا نصمم المرآة من قطع سداسية متحركة؟" },
      { "speakerAr": "د. رامي", "avatarEmoji": "🛰️", "textAr": "ليسهل طيّها داخل الصاروخ ثم ضبط انحنائها في الفضاء بالليزر!" }
    ],
    "poll": {
      "questionAr": "اختر موضوع العدد القادم",
      "options": ["مراصد الفضاء", "الذكاء الهندسي"]
    }
  }
}
```
