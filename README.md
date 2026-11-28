# 📚 منصة وبوابة درب للكتب التفاعلية ثلاثية الأبعاد (DARB Books Portal)

> **منصة سحابية متكاملة للكتب التعليمية التفاعلية، والقصص والروايات، والمجلات العلمية، والمختبرات الافتراضية ثلاثية الأبعاد — ببنية `Monorepo` قابلة للتمديد وخالية من القيم الجامدة (`No Hardcoding`).**  
> **البوابة الحية على GitHub Pages (الوضع الثابت):** [https://ahmedaliesmail22-afk.github.io/darb-books/](https://ahmedaliesmail22-afk.github.io/darb-books/)

---

## 🌟 نظرة عامة ومبادئ التصميم

تجمع منصة **درب** بين محرك قراءة ورقي مجسم ثلاثي الأبعاد (`Three.js` + تقليب `180°` للغة العربية `RTL` والإنجليزية `LTR`) وبين بنية سحابية مرنة تدار مركزياً من قاعدة البيانات دون الحاجة لتعديل الشيفرة أو إعادة بناء التطبيق:

1. **لا قيم جامدة (`No Hardcoding`):** الفئات العمرية، المستويات التعليمية (من التمهيدي إلى البروفيسوراه)، التخصصات، أنواع الكتب، أقسام الصفحة الرئيسية، الأخبار، قوائم التحقق، القالب القياسي، وإعدادات المنصة والهوية البصرية تُدار ديناميكياً من قاعدة البيانات (`Microsoft SQL Server` + `Prisma ORM`).
2. **صلاحيات مرنة (`Dynamic RBAC`):** 5 أدوار نظامية افتراضية و12 صلاحية دقيقة مع إمكانية إنشاء أدوار مخصصة وربطها بصلاحيات انتقائية، وتوثيق التعديلات في `audit_logs`.
3. **حماية عمرية إلزامية وتخصيص ذكي:** تفرض المكتبة التصفية العمرية حسب `catalog.age_policy`، وتبرز الكتب المطابقة لمستوى المستخدم وتفضيلاته مع بحث عربي مطبّع.
4. **بوابة تأليف متعددة الصيغ وإصدارات غير هدامة:** سجل محولات مرن (`@darb/parsers`) يستوعب `Template ZIP` و`JSON` و`Markdown` و`DOCX` و`EPUB`، مع رفع إصدارات جديدة (`v2`, `v3`) ومعاينتها ثلاثياً دون المساس بالإصدار المنشور (`activeVersionId`) وإلزامية إقرار الملكية الفكرية وبوابة مراجعة للمحتوى.
5. **محرك غامر بـ 6 كتل تفاعلية مسجّلة (`InteractiveBlockRegistry`):** تُحقن داخل الصفحات بصفر شريط تمرير رأسي على الحاسوب والجوال أو تُفتح في **المختبر الكامل (`Fullscreen Lab`)** مع تنظيف صارم لموارد `WebGL`.
6. **دعم الوضعين الحي والثابت (`Hybrid API + Static Fallback`):** يعمل التطبيق بكامل قدراته السحابية عند توفر `@darb/api`، ويعمل تلقائياً في وضع العرض الثابت على `GitHub Pages` قارئاً من `public/editions/`.

---

## 🧩 الكتل التفاعلية الست (`InteractiveBlockRegistry`)

| الكتلة | الوصف التقني | الموقع في الكود |
| :--- | :--- | :--- |
| **`model3d`** | عارض `Three.js` لملفات `GLB/GLTF` ونماذج إجرائية احتياطية مع `OrbitControls`، تفكيك الطبقات (`Explode`)، نقاط شرح تفاعلية، وتحرير صارم لـ `WebGLRenderer` | [`model3dPlugin.ts`](packages/book-engine/src/blocks/plugins/model3dPlugin.ts) |
| **`simulation`** | مختبر محاكاة على `Canvas 2D` بمعاملات قابلة للتعديل (`projectile`, `pendulum`, `ideal_gas`, `wave_interference`, `function_plotter`) | [`simulationPlugin.ts`](packages/book-engine/src/blocks/plugins/simulationPlugin.ts) |
| **`geo_timeline`** | خرائط متجهة `SVG` بطبقات ومسارات قابلة للتبديل ومربوطة بخط زمني تاريخي/جغرافي | [`geoTimelinePlugin.ts`](packages/book-engine/src/blocks/plugins/geoTimelinePlugin.ts) |
| **`literacy_quran`** | عرض الآيات والنصوص بترميز لوني لأحكام التجويد والقواعد مع تمارين إملاء وضبط تفاعلية | [`literacyQuranPlugin.ts`](packages/book-engine/src/blocks/plugins/literacyQuranPlugin.ts) |
| **`code_sandbox`** | محرر وتشغيل آمن لـ JavaScript داخل `Web Worker` معزول بمهلة `1500ms` ومنع الشبكة، ومعاينة `html_css` عبر `iframe sandbox` | [`codeSandboxPlugin.ts`](packages/book-engine/src/blocks/plugins/codeSandboxPlugin.ts) |
| **`story_magazine`** | تخطيط مرن للقصص والروايات والمجلات يتضمن اقتباسات، حوارات متسلسلة، واستطلاعات للقراء | [`storyMagazinePlugin.ts`](packages/book-engine/src/blocks/plugins/storyMagazinePlugin.ts) |

---

## 🏛️ هيكل المستودع الفعلي (`Monorepo Structure`)

```text
darb-books/
├── .github/
│   └── workflows/
│       ├── deploy-pages.yml           # مسار CI/CD لنشر الواجهة تلقائياً إلى GitHub Pages
│       ├── ci-api-sqlserver.yml       # اختبارات الخادم الخلفي أمام حاوية Microsoft SQL Server 2022
│       └── build-android.yml          # بناء حزمتي Android APK و Release AAB (API 36) سحابياً
├── apps/
│   ├── web/                           # تطبيق React + Vite + TypeScript (الويب والواجهة الموحدة لتطبيق الأندرويد)
│   │   ├── src/pages/                 # HomePage, LibraryPage, ReaderPage, AuthPages, OnboardingPage, ProfileSettingsPage, LegalPages (/privacy, /usage, /terms), GuideAndNewsPage, AuthorPortalPage, ModerationPortalPage
│   │   ├── src/admin/                 # AdminLayout, CmsAndNewsManager, TaxonomiesManager, SystemConfigsManager, RbacAndUsersManager, AuditLogsViewer
│   │   ├── src/components/            # PortalHeader, BookReaderShell
│   │   ├── src/lib/offline/           # networkMonitor, localDatabase (SQLite/IndexedDB), offlineBookAssets, syncManager
│   │   └── vite.config.ts
│   ├── api/                           # الخادم الخلفي Node.js + Fastify + Prisma ORM + Microsoft SQL Server (@prisma/adapter-mssql)
│   │   ├── .env.example               # نموذج متغيرات البيئة (SQL Server, JWT, Seed, Cloudflare R2 / Local Storage)
│   │   ├── prisma/                    # schema.prisma (sqlserver), migrations/0001_init_sqlserver/, seed.ts
│   │   ├── src/local.ts               # نقطة التشغيل المحلية المتكاملة مع SQL Server (إنشاء القاعدة والترحيل والبذر التلقائي)
│   │   ├── src/routes/                # health, auth (+ DELETE /api/v1/auth/me), systemConfigs, taxonomies, rbac, cms, books, media, templates, author, moderation, audit
│   │   ├── src/services/              # security, configService, ageGating, storage (Local & S3/R2 + Range 206)
│   │   ├── src/seed/seedDatabase.ts   # بذر الصلاحيات الـ 12 والأدوار الـ 5 والتصنيفات والتهيئة والكتب الثلاثة
│   │   └── tests/                     # اختبارات الوحدات واختبارات تكامل T-SQL عبر testHarness
│   └── mobile/                        # تطبيق أندرويد بنواة Capacitor 8 (Offline-First + SQLite + Android SDK 36)
│       ├── capacitor.config.ts        # معرف الحزمة com.darb.books والاسم العربي «درب للكتب التفاعلية»
│       └── android/                   # مشروع Android / Gradle الجاهز للتوقيع والرفع إلى Google Play
├── packages/
│   ├── book-schema/                   # مخططات TypeScript و Zod المشتركة (Book, Block, Catalog, Theme, Storage)
│   ├── book-engine/                   # نواة القارئ 3D (BookStage3D, FlipEngine, NarratorController, VideoModal, OfflineManager, InteractiveBlockRegistry)
│   └── parsers/                       # سجل محولات الصيغ (Template ZIP, JSON, Markdown, DOCX, EPUB) ومولد القالب القياسي
├── public/
│   ├── editions/                      # catalog.json, epic-v1.json, anatomical-v1.json, interactive-showcase.json
│   ├── audio/ & videos/               # المقاطع الصوتية والفيديوهات المتزامنة مع الكتب المرجعية
│   ├── engine/                        # ملفات التحويل المتوافقة مع الروابط القديمة
│   ├── icons/, manifest.webmanifest, sw.js
├── infra/
│   ├── docker-compose.yml             # بيئة التطوير المحلية (Microsoft SQL Server 2022 + MinIO متوافق مع R2/S3)
│   └── setup-sqlexpress.ps1           # سكربت تهيئة منفذ 1433 والمصادقة المختلطة على SQL Server Express محلياً (ويندوز)
├── tools/                             # مشغّل الوضع المحلي (dev-local.mjs) وسكربتات توليد الوسائط والمحتوى المرجعي
├── docs/                              # الوثائق المرجعية والتوثيق التشغيلي والتقني للمنصة
└── package.json                       # تعريف مساحات العمل وسكربتات البناء والتشغيل والاختبار الموحدة
```

---

## 🚀 أوامر التشغيل والبناء والاختبار

### 1. التثبيت الأولي
```powershell
npm install
```

### 2. التشغيل الحي المتكامل مع Microsoft SQL Server محلياً (`Full Live Local Mode`)
```powershell
# أ) إذا كنت تستخدم SQL Server Express محلياً على ويندوز (للمرة الأولى فقط — بصلاحيات المسؤول):
powershell -ExecutionPolicy Bypass -File infra/setup-sqlexpress.ps1

# ب) أو لتشغيل SQL Server 2022 + MinIO عبر Docker Compose:
docker compose -f infra/docker-compose.yml up -d mssql minio

# ثم التشغيل الفوري للخادم الخلفي (3000) والواجهة (4173) مع التهيئة والبذر التلقائي:
npm run dev:local
```
- يحفظ التعديلات في قاعدة **Microsoft SQL Server** والملفات المرفوعة في `apps/api/.storage/` (مع حفظ أسرار التطوير المحلية في `apps/api/.local-state/.local-secrets.json`).
- في التشغيل الأول تلقائياً: ينشئ قاعدة البيانات إذا لم تكن موجودة، يطبّق ترحيل `0001_init_sqlserver/migration.sql`، يبذر التصنيفات و`CMS` والكتب الثلاثة، ويطبع بيانات دخول المدير المحلي في الطرفية.
- لتشغيل الخادم الخلفي المحلي وحده: `npm run dev:api:local`.

### 3. التشغيل في الوضع الثابت والأوفلاين (`Static / Offline-First Mode`)
```powershell
npm run build
npm run preview
```
تعمل الواجهة محلياً على `http://127.0.0.1:4173` مع تفعيل الوضع الثابت ومزامنة التخزين المحلي تلقائياً عند غياب خادم API.

### 4. التشغيل الحي القياسي الإنتاجي (`Standard API Setup` + Mobile Sync)
```powershell
# 1. تهيئة apps/api/.env من المثال وتعبئة DATABASE_URL لـ SQL Server وأسرار JWT
Copy-Item apps/api/.env.example apps/api/.env

# 2. توليد Prisma Client وتطبيق الهجرات وبذر قاعدة البيانات
npm run db:generate
npm run db:migrate:deploy --workspace=@darb/api
npm run db:seed

# 3. تشغيل الخادم الخلفي (المنفذ 3000) والواجهة (المنفذ 4173) في نافذتين
npm run dev:api
npm run dev

# 4. مزامنة حزمة الويب داخل مشروع أندرويد (Capacitor)
npm run cap:sync --workspace=@darb/mobile
```

### 5. أوامر الاختبارات وفحص الأنواع والبناء
| الأمر | الوظيفة |
| :--- | :--- |
| `npm run dev:local` | تشغيل الوضع الحي المحلي الكامل (SQL Server + API + Vite) بأمر واحد |
| `npm run dev:api:local` | تشغيل الخادم الخلفي المحلي مع إنشاء القاعدة والترحيل والبذر تلقائياً |
| `npm run test:engine` | اختبارات سجل الكتل التفاعلية وتنظيف `WebGL` في `@darb/book-engine` |
| `npm run test:parsers` | اختبارات المحولات الخمس واستخراج `darb-block` وتوليد القالب في `@darb/parsers` |
| `npm run test:api` | اختبارات وحدات `SQL Server/Codec` + اختبارات تكامل API عند توفر خادم SQL Server على المنفذ `1433` |
| `npm run cap:sync --workspace=@darb/mobile` | بناء الواجهة ومزامنة ملفات `dist/` وإضافات Capacitor داخل `apps/mobile/android` |
| `npm run typecheck` | تشغيل `tsc --noEmit` عبر جميع مساحات العمل (`--workspaces`) |
| `npm run build` | فحص الأنواع لكل الحزم + بناء الواجهة الإنتاجية في `dist/` |
| `npm run build --workspace=@darb/api` | فحص الأنواع وتجميع الخادم الخلفي عبر `esbuild` إلى `apps/api/dist/index.js` |

---

## 📖 فهرس وثائق المشروع (`docs/`)

| الوثيقة | المحتوى والغرض |
| :--- | :--- |
| [`docs/01_DARB_ANATOMICAL_BOOK.md`](docs/01_DARB_ANATOMICAL_BOOK.md) | المرجع التاريخي والهندسي للكتاب التشريحي *(مخطوطة ثابتة محمية)* |
| [`docs/02_DARB_EPIC_STORY.md`](docs/02_DARB_EPIC_STORY.md) | المرجع الأدبي والتوثيقي للملحمة السردية *(مخطوطة ثابتة محمية)* |
| [`docs/03_PLATFORM_ARCHITECTURE_AND_SCHEMA.md`](docs/03_PLATFORM_ARCHITECTURE_AND_SCHEMA.md) | المعمارية الموحدة، مبادئ المرونة، وتصميم قاعدة البيانات |
| [`docs/04_PHASED_ACTION_PLAN.md`](docs/04_PHASED_ACTION_PLAN.md) | خطة التنفيذ المرحلية ومعايير القبول للمراحل 0–4 |
| [`docs/05_OPERATIONS_AND_DEPLOYMENT_GUIDE.md`](docs/05_OPERATIONS_AND_DEPLOYMENT_GUIDE.md) | **دليل التشغيل والنشر الإنتاجي:** الوضع الثابت، Docker، المتغيرات، R2/CORS، والنسخ الاحتياطي |
| [`docs/06_API_AND_RBAC_REFERENCE.md`](docs/06_API_AND_RBAC_REFERENCE.md) | **مرجع واجهات البرمجة والصلاحيات:** جرد جميع مسارات `/api/v1/`، مصفوفة الـ RBAC، والآليات |
| [`docs/07_AUTHOR_AND_BLOCKS_MANUAL.md`](docs/07_AUTHOR_AND_BLOCKS_MANUAL.md) | **دليل المؤلفين والمراجعين والكتل التفاعلية:** دورة النشر، الصيغ، وأمثلة الكتل الست |
| [`docs/08_ADMIN_PANEL_USER_MANUAL.md`](docs/08_ADMIN_PANEL_USER_MANUAL.md) | **الدليل المرجعي للوحة التحكم:** شرح تفصيلي لكل تبويب وزر وحقل وقائمة وجدول وتصدير |
| [`docs/09_PLATFORM_USAGE_GUIDE.md`](docs/09_PLATFORM_USAGE_GUIDE.md) | **دليل الاستخدام الشامل للمنصة:** الأدوار، أوضاع التشغيل، وخريطة الصفحات الكاملة |
| [`docs/10_PLATFORM_HOW_TO_USE_GUIDE.md`](docs/10_PLATFORM_HOW_TO_USE_GUIDE.md) | **دليل طريقة الاستخدام الشامل:** كيف تستخدم القارئ 3D وبوابة المؤلف والمراجعة والبحث |
| [`docs/11_PLATFORM_STEP_BY_STEP_GUIDE.md`](docs/11_PLATFORM_STEP_BY_STEP_GUIDE.md) | **دليل خطوات الاستخدام الشامل:** خطوات مرقّمة لكل رحلة عمل من التشغيل حتى النشر |
| [`docs/12_PRIVACY_POLICY.md`](docs/12_PRIVACY_POLICY.md) | **سياسة الخصوصية:** معالجة بيانات الحسابات والأعمار وتقدم القراءة وسجل التدقيق |
| [`docs/13_ACCEPTABLE_USE_POLICY.md`](docs/13_ACCEPTABLE_USE_POLICY.md) | **سياسة الاستخدام المقبول:** حماية القاصرين، ضوابط النشر، وسلامة المختبرات البرمجية |
| [`docs/14_TERMS_OF_USE.md`](docs/14_TERMS_OF_USE.md) | **شروط الاستخدام:** الحسابات، إقرارات الملكية الفكرية، المراجعة، وإخلاء المسؤولية |
| [`docs/15_MOBILE_APP_AND_SQLSERVER_GUIDE.md`](docs/15_MOBILE_APP_AND_SQLSERVER_GUIDE.md) | **دليل التحول إلى SQL Server وتطبيق الأندرويد أوفلاين (APK / Google Play):** المعمارية، SQLite، المزامنة، وبناء CI/CD |

---

## 📜 الترخيص والملكية الفكرية

جميع الحقوق محفوظة لمنظومة **درب التعليمية الذكية**. تخضع المخطوطات في `docs/01_DARB_ANATOMICAL_BOOK.md` و`docs/02_DARB_EPIC_STORY.md` للحماية كمصادر مرجعية ثابتة لا يجوز تعديلها، كما يتطلب نشر أي كتاب أو تحديث عبر بوابة المؤلف توقيع إقرار الملكية الفكرية والمصادقة الإدارية.
