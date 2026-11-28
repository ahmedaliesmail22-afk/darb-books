# 🛠️ دليل التشغيل والنشر الإنتاجي — منصة درب للكتب التفاعلية (`05`)

يشرح هذا الدليل خطوات تشغيل منصة **درب** محلياً وإنتاجياً في كلٍ من **الوضع الثابت (`Static Mode`)** و**الوضع الحي الكامل (`Full-Stack Cloud Mode`)** استناداً إلى الإعدادات والملفات الفعلية في المستودع.

> راجع أيضاً: [فهرس المستودع (`README.md`)](../README.md) | [مرجع الـ API والصلاحيات](./06_API_AND_RBAC_REFERENCE.md) | [دليل المؤلفين والكتل التفاعلية](./07_AUTHOR_AND_BLOCKS_MANUAL.md)

---

## 1. تشغيل ونشر الوضع الثابت (`Static Fallback Mode`)

صُممت الواجهة (`apps/web`) لتعمل بالكامل على خدمات الاستضافة الثابتة (مثل **GitHub Pages** أو **Cloudflare Pages**) عند غياب خادم API حي، مع قراءة الكتب والوسائط مباشرة من مجلد `public/editions/`.

### كيف تحدد الواجهة وضع التشغيل تلقائياً؟
تحدد دالة `resolveApiBaseUrl()` في [`apps/web/src/lib/apiClient.ts`](../apps/web/src/lib/apiClient.ts) عنوان الـ API وفق الأولوية التالية:
1. معامل الرابط `?api=off` أو `?api=static` ← يفعّل **الوضع الثابت** ويزيل العنوان المحفوظ في `localStorage`.
2. معامل الرابط `?api=https://api.example.com` ← يحفظ العنوان ويتصل به في **الوضع الحي**.
3. متغير `window.__DARB_API_BASE__` أو متغير البناء `VITE_API_BASE_URL`.
4. المحفوظ سابقاً في `localStorage` تحت المفتاح `darb_api_base`.
5. في وضع التطوير (`DEV`) ← يُعيد مساراً نسبياً فارغاً `""` ليُمرر via Vite Proxy نحو `http://127.0.0.1:3000`.
6. في البناء الإنتاجي على نطاقات `github.io` أو المنفذ `4173` دون `VITE_API_BASE_URL` ← يعود إلى `null` ليعمل التطبيق تلقائياً في **الوضع الثابت**.

### النشر الآلي عبر GitHub Pages
يُنفَّذ النشر تلقائياً عند الدفع إلى فرع `main` عبر [`deploy-pages.yml`](../.github/workflows/deploy-pages.yml):
- بيئة البناء: Node.js `22`.
- خطوات التنفيذ: `npm ci` ثم `npm run build` (يفحص الأنواع عبر `npm run typecheck --workspaces` ويبني تطبيق `apps/web` في مجلد `dist/`).
- مسار الرفع إلى Pages: `dist`.

### النشر على Cloudflare Pages
عند ربط المستودع بـ Cloudflare Pages:
- **Build command:** `npm run build`
- **Build output directory:** `dist`
- **Node version:** `22`
- **لربطه بالخادم الخلفي الحي:** أضف متغير البيئة `VITE_API_BASE_URL=https://api.yourdomain.com` داخل إعدادات Cloudflare Pages.

---

## 2. التشغيل الحي محلياً (`Local Full-Stack Setup` مع Microsoft SQL Server)

### الخيار أ: عبر Microsoft SQL Server Express محلياً على ويندوز + `npm run dev:local`
لتشغيل المنصة على جهاز ويندوز يستخدم **SQL Server Express المحلي**:
1. افتح PowerShell بصلاحيات المسؤول (**Run as Administrator**) ونفّذ سكربت التهيئة الآمن:
   ```powershell
   powershell -ExecutionPolicy Bypass -File infra/setup-sqlexpress.ps1
   ```
   يقوم السكربت تلقائياً بتفعيل المصادقة المختلطة (`LoginMode=2`)، فتح بروتوكول `TCP/IP` على المنفذ الثابت `1433`، إعادة تشغيل خدمة `MSSQL$SQLEXPRESS`، وإنشاء مستخدم وقاعدة `darb_books` بكلمة المرور التي تدخلها يدوياً دون تخزين أي أسرار في المستودع.
2. أنشئ ملف `apps/api/.env` من القالب [`apps/api/.env.example`](../apps/api/.env.example) وضع رابط `DATABASE_URL` بكلمة المرور التي اخترتها.
3. شغّل المنصة الكاملة (الخادم الخلفي + الواجهة):
   ```powershell
   npm run dev:local
   ```

**كيف يعمل [`apps/api/src/local.ts`](../apps/api/src/local.ts) و[`tools/dev-local.mjs`](../tools/dev-local.mjs)؟**
1. يتحقق من اتصال **Microsoft SQL Server** (المحدد في `DATABASE_URL`)، وينشئ القاعدة تلقائياً إن لم تكن موجودة، ثم يطبّق هجرات [`0001_init_sqlserver/migration.sql`](../apps/api/prisma/migrations/0001_init_sqlserver/migration.sql) عبر جدول التتبع `[dbo].[_darb_local_migrations]`.
2. تحفظ أسرار التطوير المحلية والوسائط المرفوعة في `apps/api/.local-state/` و`apps/api/.storage/` (كلاهما مستثنى في [`.gitignore`](../.gitignore)).
3. في التشغيل الأول فقط (عندما يكون جدول `users` فارغاً): يبذر البيانات الأولية عبر [`seedDatabase.ts`](../apps/api/src/seed/seedDatabase.ts)، ويطبع بريد المدير وكلمة المرور المحلية في الطرفية، وفي كل تشغيل لاحق يستأنف البيانات المحفوظة بأمان.
4. لتشغيل الخادم الخلفي المحلي منفرداً: `npm run dev:api:local`.

### الخيار ب: عبر Docker Compose (`SQL Server 2022` + `MinIO`)
يوفر ملف [`infra/docker-compose.yml`](../infra/docker-compose.yml) خدمتين جاهزتين للتطوير المحلي:
- **`darb-books-mssql`:** صورة `mcr.microsoft.com/mssql/server:2022-latest` على المنفذ `1433`.
- **`darb-books-r2-local`:** صورة `minio/minio:latest` متوافقة مع واجهة S3/R2 على المنفذ `9000` (API) والمنفذ `9001` (لوحة التحكم، المستخدم `darbminio`، كلمة المرور `darbminio_dev_secret`).

```powershell
docker compose -f infra/docker-compose.yml up -d
```

### الخيار ج: استخدام SQL Server / Azure SQL خارجي
مرّر رابط الاتصال القياسي في `DATABASE_URL` داخل `apps/api/.env` دون الحاجة لتشغيل Docker Compose.

---

## 3. متغيرات البيئة لـ `@darb/api`

تُحمَّل متغيرات البيئة وتُدقق صرامتها عبر `EnvSchema` في [`apps/api/src/env.ts`](../apps/api/src/env.ts)، ويمكن البدء بنسخ القالب [`apps/api/.env.example`](../apps/api/.env.example):

| المتغير | الافتراضي في `.env.example` / الكود | الوصف |
| :--- | :--- | :--- |
| `NODE_ENV` | `development` | وضع التشغيل (`development`, `test`, `production`) |
| `PORT` | `3000` | منفذ الاستماع للخادم الخلفي |
| `HOST` | `127.0.0.1` | عنوان الربط (`0.0.0.0` داخل الحاويات والخوادم الإنتاجية) |
| `CORS_ORIGIN` | `http://127.0.0.1:4173,http://localhost:4173,capacitor://localhost,http://localhost` | قائمة النطاقات المسموح بها مفصولة بفاصلة (تشمل تطبيق Capacitor) |
| `DATABASE_URL` | `sqlserver://127.0.0.1:1433;database=darb_books;user=darb;password=...;encrypt=false;trustServerCertificate=true` | سلسلة اتصال Microsoft SQL Server |
| `JWT_ACCESS_SECRET` | — *(مطلوب، ≥ 16 حرفاً)* | سر توقيع رموز الوصول JWT Access Token |
| `JWT_REFRESH_SECRET` | — *(مطلوب، ≥ 16 حرفاً)* | سر توقيع الجلسات |
| `JWT_ACCESS_TTL_SEC` | `900` | عمر رمز الوصول بالثواني (15 دقيقة افتراضياً) |
| `JWT_REFRESH_TTL_DAYS` | `30` | عمر رمز التحديث بالأيام |
| `COOKIE_SECURE` | `false` | اضبطها `true` في الإنتاج فوق HTTPS لحماية الكوكيز |
| `SEED_ADMIN_EMAIL` | `admin@darb-books.local` | بريد حساب المدير الأعلى الأولي عند البذر |
| `SEED_ADMIN_PASSWORD` | — *(إلزامي عند `db:seed`)* | كلمة مرور المدير الأعلى الأولي |
| `SEED_ADMIN_NAME` | `مدير منصة درب الأعلى` | اسم العرض لحساب المدير الأعلى |
| `SEED_SYNC_MEDIA` | غير مفعّل (`false`) | عند ضبطه `true` يرفع ملفات الصوت والفيديو من `public/` إلى التخزين المحدد أثناء البذر |
| `STORAGE_DRIVER` | `local` | `local` للتخزين على القرص أو `r2` للتخزين السحابي المتوافق مع S3/Cloudflare R2 |
| `STORAGE_LOCAL_DIR` | `./.storage` | مسار التخزين المحلي عند استخدام `STORAGE_DRIVER=local` |
| `S3_ENDPOINT` | — *(إلزامي مع `r2`)* | نقطة نهاية Cloudflare R2 (`https://<account-id>.r2.cloudflarestorage.com`) أو MinIO |
| `S3_REGION` | `auto` | المنطقة (`auto` لـ Cloudflare R2) |
| `S3_BUCKET` | `darb-books-media` | اسم حاوية التخزين (`Bucket`) |
| `S3_ACCESS_KEY_ID` | — *(إلزامي مع `r2`)* | مفتاح الوصول |
| `S3_SECRET_ACCESS_KEY` | — *(إلزامي مع `r2`)* | المفتاح السري |
| `R2_PUBLIC_BASE_URL` | فارغ | رابط CDN العام للحاوية إن وُجد (اختياري) |
| `PUBLIC_ASSETS_FALLBACK_DIR` | غير محدد | مجلد بديل لقراءة الوسائط عند غياب الكائن في التخزين المحلي |

> **تنبيه أمان:** ملف `.env` و`apps/*/.env` ومخرجات `apps/api/dist/` مستبعدة في [`.gitignore`](../.gitignore) ويجب عدم إضافتها إلى المستودع أبداً.

---

## 4. الهجرات والبذر وتشغيل التطوير

تُعرّف إعدادات Prisma في [`apps/api/prisma.config.ts`](../apps/api/prisma.config.ts) ومخطط البيانات في [`apps/api/prisma/schema.prisma`](../apps/api/prisma/schema.prisma):

```powershell
# 1. توليد عميل Prisma
npm run db:generate

# 2. تطبيق الهجرة الأولية (apps/api/prisma/migrations/0001_init_sqlserver)
npm run db:migrate:deploy --workspace=@darb/api

# 3. البذر الأولي (يتطلب وجود SEED_ADMIN_PASSWORD في البيئة أو apps/api/.env)
npm run db:seed
```

للتشغيل التطويري المتزامن:
- الخادم الخلفي (`http://127.0.0.1:3000`): `npm run dev:api`
- الواجهة (`http://127.0.0.1:4173` مع تمرير `/api` إلى `http://127.0.0.1:3000`): `npm run dev`

---

## 5. النشر الإنتاجي الكامل وCloudflare R2

### أ. بناء وتشغيل `@darb/api`
```powershell
npm ci
npm run db:generate
npm run db:migrate:deploy --workspace=@darb/api
npm run build --workspace=@darb/api
npm start --workspace=@darb/api
```
يقوم `npm run build --workspace=@darb/api` بتجميع حزم `@darb/book-schema` و`@darb/parsers` مع الخادم في ملف واحد [`apps/api/dist/index.js`](../apps/api/package.json) مع الإبقاء على اعتماديات `npm` خارجية.  
للتحقق من جاهزية الخادم بعد الإقلاع، استدعِ `GET /api/v1/health`.

### ب. تهيئة Cloudflare R2 وسياسة CORS ودعم `Range 206`
تستخدم خدمة التخزين [`storage.ts`](../apps/api/src/services/storage.ts) عميل `@aws-sdk/client-s3` مع `forcePathStyle: true` وتدعم استدعاءات `GetObjectCommand` بنطاقات البايتات (`bytes=start-end`) لتوليد استجابات `206 Partial Content` و`416 Range Not Satisfiable`.

- **متغيرات R2 الإنتاجية:**
  ```dotenv
  STORAGE_DRIVER=r2
  S3_ENDPOINT=https://<cloudflare-account-id>.r2.cloudflarestorage.com
  S3_REGION=auto
  S3_BUCKET=darb-books-media
  S3_ACCESS_KEY_ID=<your-r2-key-id>
  S3_SECRET_ACCESS_KEY=<your-r2-secret>
  ```
- **ترويسات CORS في الخادم الخلفي ([`server.ts`](../apps/api/src/server.ts)):**
  - `AllowedMethods`: `GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS`
  - `AllowedHeaders`: `Content-Type, Authorization, Range`
  - `ExposedHeaders`: `Content-Range, Accept-Ranges, Content-Length`
- **قاعدة CORS على مستوى R2 Bucket (عند التحميل المباشر من المتصفح بـ `/api/v1/media/presign` أو البث المباشر):**
  - السماح لنطاق الواجهة الإنتاجي بطرق `GET`, `HEAD`, `PUT` وترويسات `Content-Type`, `Range`، وإظهار `Content-Range`, `Accept-Ranges`, `Content-Length`, `ETag`.

### ج. ربط الواجهة الإنتاجية
أثناء بناء الواجهة أو استضافتها على Cloudflare Pages / أي خادم ساكن، عيّن:
- `VITE_API_BASE_URL=https://api.yourdomain.com` قبل تنفيذ `npm run build`.
- تأكد من إضافة نطاق الواجهة ضمن `CORS_ORIGIN` في الخادم الخلفي.

---

## 6. إرشادات الأمان والنسخ الاحتياطي

1. **الأسرار والكوكيز:** استخدم قيماً عشوائية طويلة (`≥ 32` محرفاً) لكل من `JWT_ACCESS_SECRET` و`JWT_REFRESH_SECRET`، وفعّل `COOKIE_SECURE=true` عند التقديم عبر HTTPS.
2. **الحساب الإداري الأولي:** لا تشغّل البذر بكلمات مرور افتراضية ضعيفة، واحذف أو دوّر صلاحيات أي حسابات اختبارية في البيئة الإنتاجية.
3. **النسخ الاحتياطي:**
   - قاعدة البيانات **Microsoft SQL Server**: جدولة النسخ الاحتياطي الكامل (`BACKUP DATABASE [darb_books] TO DISK = ...`) يومياً وحفظ ملفات `.bak` خارج الخادم، مع الاحتفاظ بسجلات `audit_logs` و`book_versions`.
   - وسائط R2: تفعيل Versioning على حاوية R2 ومزامنة احتياطية للأصول المؤرشفة (محتوى النسخ السابقة يبقى غير محذوف تلقائياً عند نشر إصدار أحدث).

---

## 7. تطبيق الأندرويد ومتطلبات Google Play

- يستند تطبيق الأندرويد إلى **Capacitor 8** في [`apps/mobile/`](../apps/mobile/capacitor.config.ts) مع قاعدة SQLite محلية (`@capacitor-community/sqlite`)، وتخزين ملفات بدون إنترنت (`@capacitor/filesystem`)، ومراقبة الشبكة وطابور المزامنة، وصفحات السياسات العامة (`/privacy`, `/usage`, `/terms`)، وحذف الحساب ذاتياً (`DELETE /api/v1/auth/me`).
- راجع الدليل المتكامل: [**`15` — دليل SQL Server وتطبيق الأندرويد أوفلاين والمتاجر**](./15_MOBILE_APP_AND_SQLSERVER_GUIDE.md) ومسار البناء السحابي [`build-android.yml`](../.github/workflows/build-android.yml).
