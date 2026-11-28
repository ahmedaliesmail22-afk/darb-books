# 📱 دليل التحول إلى SQL Server وتطبيق الأندرويد أوفلاين (`15`)

يوثّق هذا الدليل المرحلة المتكاملة لتحويل نواة قاعدة البيانات إلى **Microsoft SQL Server**، وبناء تطبيق الأندرويد عبر **Capacitor 8** بنظام العمل دون اتصال أولاً (`Offline-First`) ومزامنة الخادم المركزي واستيفاء متطلبات النشر في متجر **Google Play**.

> راجع أيضاً: [فهرس المستودع (`README.md`)](../README.md) | [دليل التشغيل والنشر (`05`)](./05_OPERATIONS_AND_DEPLOYMENT_GUIDE.md) | [مرجع الـ API والصلاحيات (`06`)](./06_API_AND_RBAC_REFERENCE.md)

---

## 1. الانتقال الفعلي إلى Microsoft SQL Server (`apps/api`)

### أ. المخطط وهجرة T-SQL (`Prisma 7`)
- عُدّل [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma) إلى `provider = "sqlserver"` مع تحويل جميع حقول `Json` إلى `String @db.NVarChar(Max)`، وتحويل التعدادات إلى `String` بقيود منضبطة، وضبط مسارات الحذف المرجعية (`onDelete: NoAction`) لتفادي تعارض دورات `T-SQL` (`Msg 1785`).
- عُدّل قفل الهجرات [`migration_lock.toml`](../apps/api/prisma/migrations/migration_lock.toml) إلى `provider = "sqlserver"`، وأُنشئت هجرة البداية الكاملة في [`apps/api/prisma/migrations/0001_init_sqlserver/migration.sql`](../apps/api/prisma/migrations/0001_init_sqlserver/migration.sql) متضمنة الفهرس الفريد المرشّح `books_active_version_id_key` لـ `WHERE [active_version_id] IS NOT NULL`.
- يستعمل [`prismaClient.ts`](../apps/api/src/prismaClient.ts) محوّل `@prisma/adapter-mssql` (`PrismaMssql`) مع محلل سلاسل الاتصال [`sqlServerConfig.ts`](../apps/api/src/lib/sqlServerConfig.ts) الذي يقبل كلاً من صيغتي `sqlserver://host:port;database=...` و`mssql://...`.
- تتولى الطبقة الموحدة [`jsonCodec.ts`](../apps/api/src/lib/jsonCodec.ts) ترميز وقراءة حقول JSON في جميع المسارات (`audit`, `auth`, `author`, `books`, `cms`, `moderation`, `systemConfigs`, `taxonomies`, `seedDatabase`) دون تغيير أي عقد في استجابات الـ HTTP API أو الواجهة.

### ب. تهيئة SQL Server Express محلياً على ويندوز (منفذ `1433` والمصادقة المختلطة)
عند تشغيل `SQL Server Express` محلياً على ويندوز، قد يكون `TCP/IP` معطلاً والمصادقة مقصورة على Windows Auth فقط. لتهيئته بأمان ودون تخزين أي كلمات مرور في المستودع:
1. افتح نافذة PowerShell بصلاحيات المسؤول (**Run as Administrator**).
2. نفّذ السكربت [`infra/setup-sqlexpress.ps1`](../infra/setup-sqlexpress.ps1):
   ```powershell
   powershell -ExecutionPolicy Bypass -File infra/setup-sqlexpress.ps1
   ```
3. سيطلب منك السكربت إدخال كلمة مرور قوية بشكل تفاعلي، ثم ينفّذ تلقائياً:
   - تفعيل `LoginMode = 2` (المصادقة المختلطة: SQL Server + Windows Authentication).
   - تفعيل `TCP/IP` وضبط المنفذ الثابت `1433`.
   - إعادة تشغيل خدمة `MSSQL$SQLEXPRESS`.
   - إنشاء حساب `darb` وقاعدة `darb_books` ومنحه صلاحية `db_owner` عليها فقط.
4. انسخ [`apps/api/.env.example`](../apps/api/.env.example) إلى `apps/api/.env` وضع `DATABASE_URL` بكلمة المرور التي اخترتها، ثم شغّل `npm run dev:local`.

### ج. التشغيل عبر Docker واختبارات CI
- يوفر [`infra/docker-compose.yml`](../infra/docker-compose.yml) حاوية `mcr.microsoft.com/mssql/server:2022-latest` إلى جانب `MinIO`.
- يتحقق مسار [`ci-api-sqlserver.yml`](../.github/workflows/ci-api-sqlserver.yml) آلياً على GitHub Actions من نجاح اختبارات الوحدات واختبارات تكامل API الكاملة أمام خادم `SQL Server 2022` حيّ.

---

## 2. تطبيق الأندرويد (`apps/mobile`) ونظام العمل أوفلاين أولاً

### أ. مواصفات المشروع واستهداف Android SDK 36
- المجلد الجذري لتطبيق الجوال: `apps/mobile` (`@darb/mobile`) المبني على **Capacitor 8**.
- ملف التهيئة: [`apps/mobile/capacitor.config.ts`](../apps/mobile/capacitor.config.ts):
  - معرف الحزمة (`appId`): `com.darb.books`
  - الاسم العربي للتطبيق (`appName`): `درب للكتب التفاعلية`
  - مجلد الويب المدمج (`webDir`): `../../dist`
- إعدادات Gradle في [`variables.gradle`](../apps/mobile/android/variables.gradle):
  - `minSdkVersion = 24`
  - `compileSdkVersion = 36`
  - `targetSdkVersion = 36` (متوافق مع متطلبات Google Play الجديدة)
- الأذونات في [`AndroidManifest.xml`](../apps/mobile/android/app/src/main/AndroidManifest.xml): `INTERNET` و`ACCESS_NETWORK_STATE`.
- الأيقونات: وُلّدت أيقونات `ic_launcher` و`ic_launcher_round` و`ic_launcher_foreground` لجميع الكثافات (`mdpi` حتى `xxxhdpi`) من شعار المنصة [`public/icons/icon-512.png`](../public/icons/icon-512.png).

### ب. قاعدة البيانات المحلية أوفلاين ومخزن الوسائط وطابور المزامنة
تعمل المنصة في وضع **أوفلاين أولاً (`Offline-First`)** عبر الوحدات في [`apps/web/src/lib/offline/`](../apps/web/src/lib/offline/localDatabase.ts):
1. **[`localDatabase.ts`](../apps/web/src/lib/offline/localDatabase.ts):**
   - على الأندرويد الأصلي (`Capacitor.isNativePlatform()`): يفتح قاعدة **SQLite** أصلية (`darb_books_offline_db`) عبر `@capacitor-community/sqlite` بأربعة جداول (`books`, `reading_progress`, `user_session`, `sync_queue`).
   - على متصفحات الويب: يستخدم **IndexedDB** (`darb_books_local_v1`) بسلاسة تامة.
   - يبذر الكتب المرجعية الثلاثة المدمجة تلقائياً (`epic-v1`, `anatomical-book`, `interactive-showcase`) لقراءة فورية دون اتصال مع دعم جميع الكتل التفاعلية الست.
2. **[`offlineBookAssets.ts`](../apps/web/src/lib/offline/offlineBookAssets.ts):**
   - يوفّر في المكتبة زر **«📥 حفظ للقراءة بدون إنترنت»** لكل كتاب مع مؤشر تقدم حيّ وشارة **«✅ محفوظ أوفلاين»**.
   - يحفظ ملفات الـ JSON والراوي الصوتي والغلاف داخل مخزن التطبيق الخاص via `@capacitor/filesystem` (`Directory.Data`) على الأندرويد (أو `CacheStorage` على الويب) ويحوّل المسارات محلياً عبر `Capacitor.convertFileSrc`.
3. **[`networkMonitor.ts`](../apps/web/src/lib/offline/networkMonitor.ts) و[`syncManager.ts`](../apps/web/src/lib/offline/syncManager.ts):**
   - يراقبان حالة الشبكة عبر `@capacitor/network` (مع عرض الحالة في شريط التنقل العلوي [`PortalHeader.tsx`](../apps/web/src/components/PortalHeader.tsx) وعداد التعديلات المعلقة).
   - عند تسجيل تقدم القراءة أو تعديل الإعدادات في غياب الشبكة، تُحفظ العملية محلياً وتُضاف إلى طابور `sync_queue` وتُرفع تلقائياً إلى الخادم عند عودة الاتصال (أو يدوياً بالضغط على زر المزامنة).

---

## 3. متطلبات متجر Google Play المطبّقة

1. **صفحات السياسات العامة الواضحة ([`LegalPages.tsx`](../apps/web/src/pages/LegalPages.tsx)):**
   - `/privacy`: سياسة الخصوصية وحماية البيانات.
   - `/usage`: سياسة الاستخدام والمحتوى التعليمي.
   - `/terms`: الشروط والأحكام.
   - مربوطة في تذييل [`HomePage.tsx`](../apps/web/src/pages/HomePage.tsx) وبيانات بذر `CMS` وفي مربع الموافقة الإلزامي عند التسجيل [`AuthPages.tsx`](../apps/web/src/pages/AuthPages.tsx).
2. **الحذف الذاتي الدائم للحساب والبيانات (`Account Deletion`):**
   - الخادم الخلفي: مسار `DELETE /api/v1/auth/me` في [`routes/auth.ts`](../apps/api/src/routes/auth.ts) مع تفريغ العلاقات الآمن داخل معاملة `T-SQL` وتسجيل عملية التدقيق `user.self_delete`.
   - الواجهة: قسم مخصص وزر **«🗑️ حذف حسابي وبياناتي نهائياً»** ونافذة تأكيد في [`ProfileSettingsPage.tsx`](../apps/web/src/pages/ProfileSettingsPage.tsx) يحذف الحساب سحابياً ويُفرّغ مخزن الجهاز والرموز محلياً.

---

## 4. البناء السحابي لملفات APK و AAB عبر GitHub Actions

لأن بيئة التطوير قد لا تحتوي على `Android SDK` محلياً، يتكفل مسار [`.github/workflows/build-android.yml`](../.github/workflows/build-android.yml) بالآتي تلقائياً عند الدفع إلى `main` أو التشغيل اليدوي (`workflow_dispatch`):
1. إعداد Node.js 22 وJava 21 و`Android SDK (platforms;android-36, build-tools;36.0.0)`.
2. بناء الواجهة ومزامنتها عبر `npm run build` ثم `npx cap sync android`.
3. تنفيذ `./gradlew assembleDebug bundleRelease` لإنتاج حزمة الاختبار **`APK`** وحزمة المتجر **`AAB`**.
4. إذا أضفت أسرار التوقيع التالية في إعدادات مستودع GitHub (**Settings → Secrets and variables → Actions**)، ينتج المسار حزمة **`Release` موقّعة** جاهزة للرفع على Google Play Console:
   - `ANDROID_KEYSTORE_BASE64`: محتوى ملف `.jks` محولاً إلى Base64.
   - `ANDROID_KEYSTORE_PASSWORD`: كلمة مرور مخزن المفاتيح.
   - `ANDROID_KEY_ALIAS`: اسم المفتاح المستعار (`alias`).
   - `ANDROID_KEY_PASSWORD`: كلمة مرور المفتاح.
   - والمتغير الاختياري `VITE_API_BASE_URL` (في Actions Variables) لربط حزمة التطبيق بعنوان الخادم الحي HTTPS.
5. تحميل المخرجات من صفحة تشغيل Workflow في تبويب **Actions → Artifacts**: `darb-books-android-apk` و`darb-books-android-aab`.
