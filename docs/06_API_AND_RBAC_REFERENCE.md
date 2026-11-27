# 🔐 مرجع واجهات البرمجة (`API`) والصلاحيات (`RBAC`) — منصة درب (`06`)

يوثّق هذا المرجع كافة مسارات الخادم الخلفي الفعلية تحت المسار الأساسي `/api/v1/` كما هي مسجّلة في [`apps/api/src/server.ts`](../apps/api/src/server.ts)، مع مصفوفة الصلاحيات الديناميكية المزروعة في [`apps/api/src/seed/seedDatabase.ts`](../apps/api/src/seed/seedDatabase.ts) وآليات التصفية العمرية وبث الوسائط.

> راجع أيضاً: [وثيقة المعمارية](./03_PLATFORM_ARCHITECTURE_AND_SCHEMA.md) | [دليل التشغيل والنشر](./05_OPERATIONS_AND_DEPLOYMENT_GUIDE.md) | [دليل المؤلفين والكتل التفاعلية](./07_AUTHOR_AND_BLOCKS_MANUAL.md)

---

## 1. منظومة المصادقة والـ Dynamic RBAC

تعتمد المنصة على **صلاحيات دقيقة (`Permission Codes`)** مخزنة في قاعدة البيانات لا على أسماء أدوار جامدة، ويُتحقق منها في الحارس [`rbac.ts`](../apps/api/src/plugins/rbac.ts) عبر `requirePermission(code)` و`requireAnyPermission(codes)`.

### الصلاحيات الأساسية الـ 12 (`PERMISSIONS_SEED`)

| كود الصلاحية | الوحدة (`module`) | الوصف العربي |
| :--- | :--- | :--- |
| `configs.manage` | `system` | إدارة تهيئة المنصة والهوية |
| `roles.manage` | `rbac` | إدارة الأدوار والصلاحيات وربطها بالمستخدمين |
| `users.manage` | `users` | إدارة وحالة المستخدمين |
| `taxonomies.manage` | `taxonomies` | إدارة التصنيفات والمستويات الديناميكية |
| `cms.manage` | `cms` | تحرير صفحات وأقسام الواجهة |
| `news.manage` | `cms` | إدارة الأخبار والإعلانات |
| `books.read` | `books` | قراءة وتصفح الكتب المعتمدة |
| `books.create` | `books` | إنشاء ورفع إصدارات الكتب |
| `books.review` | `reviews` | مراجعة الكتب والملكية الفكرية |
| `books.publish` | `books` | اعتماد ونشر إصدارات الكتب |
| `media.upload` | `media` | رفع الوسائط إلى التخزين السحابي |
| `audit.read` | `audit` | الاطلاع على سجل التدقيق |

### الأدوار النظامية الافتراضية الخمسة (`ROLES_SEED`)

| رمز الدور | الاسم | الصلاحيات الممنوحة افتراضياً |
| :--- | :--- | :--- |
| `SUPER_ADMIN` | الإدارة العليا | جميع الصلاحيات الـ 12 (`configs.manage`, `roles.manage`, `users.manage`, `taxonomies.manage`, `cms.manage`, `news.manage`, `books.read`, `books.create`, `books.review`, `books.publish`, `media.upload`, `audit.read`) |
| `PLATFORM_ADMIN` | إدارة التشغيل والمحتوى | `cms.manage`, `news.manage`, `taxonomies.manage`, `users.manage`, `books.read`, `audit.read` |
| `CONTENT_REVIEWER` | مراجع علمي ومدقق ملكية فكرية | `books.read`, `books.review`, `books.publish`, `audit.read` |
| `AUTHOR` | مؤلف / ناشر / أستاذ | `books.read`, `books.create`, `media.upload` |
| `LEARNER` | قارئ / طالب / باحث | `books.read` |

> **مرونة الأدوار المخصصة:** يمكن لأي مستخدم يملك `roles.manage` إنشاء أدوار جديدة عبر `POST /api/v1/rbac/roles` وتخصيص أي مجموعة جزئية من الصلاحيات (مثلاً دور مراجع أولي يملك `books.review` فقط دون `books.publish` فيتمكن من طلب التعديلات بينما يُمنع من الاعتماد النهائي برمز `403`). لا يجوز حذف الأدوار النظامية (`isSystem: true`).

---

## 2. جرد نقاط النهاية الفعلية (`/api/v1/...`)

الرموز المستخدمة في عمود المصادقة والصلاحية:
- **عام:** متاح دون تسجيل دخول.
- **مصادقة اختيارية:** يقرأ هوية المستخدم إن وُجد رمز دخول (`optionalAuthenticate`).
- **مصادقة:** يتطلب `Authorization: Bearer <token>` أو كوكي جلسة صالح (`authenticate`).

### أ. الصحة (`health.ts`)
| الطريقة | المسار | المصادقة / الصلاحية | الوصف |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/health` | عام | فحص اتصال PostgreSQL ومعرفة محرك التخزين (`local` / `r2`) |

### ب. المصادقة والملف الشخصي والمستخدمون (`auth.ts`)
| الطريقة | المسار | المصادقة / الصلاحية | الوصف |
| :--- | :--- | :--- | :--- |
| `POST` | `/api/v1/auth/register` | عام | تسجيل حساب وفق سياسة `auth.registration_policy` (فوري / تحقق بريد / موافقة إدارية) |
| `POST` | `/api/v1/auth/verify-email` | عام | تأكيد البريد الإلكتروني عبر `token` وتفعيل الحساب |
| `POST` | `/api/v1/auth/login` | عام | تسجيل الدخول وإصدار `JWT` + `Refresh Token` (كوكيز + جسم الاستجابة) |
| `POST` | `/api/v1/auth/refresh` | عام (برمز التحديث) | تدوير رمز التحديث مع كشف إعادة الاستخدام وإبطال الرموز |
| `POST` | `/api/v1/auth/logout` | عام | إبطال رمز التحديث ومسح كوكيز الجلسة |
| `GET` | `/api/v1/auth/me` | مصادقة | جلب بيانات المستخدم وأدواره وصلاحياته وملفه (`user_profiles`) |
| `PUT` | `/api/v1/auth/onboarding` | مصادقة | حفظ أو تعديل الفئة العمرية، المستوى التعليمي، المفضلات، وتفضيلات القراءة |
| `GET` | `/api/v1/users` | `users.manage` أو `roles.manage` | استعراض المستخدمين وأدوارهم وملفاتهم (مع تصفية اختيارية بـ `?status=`) |
| `PATCH` | `/api/v1/users/:id/status` | `users.manage` | تغيير حالة المستخدم (`ACTIVE`, `PENDING_VERIFICATION`, `PENDING_APPROVAL`, `SUSPENDED`) وتوثيقه في `audit_logs` |

### ج. التهيئة المركزية والبوابة العامة (`systemConfigs.ts`)
| الطريقة | المسار | المصادقة / الصلاحية | الوصف |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/public/bootstrap` | عام | إرجاع التهيئة العامة (`isPublic: true`)، التصنيفات الفعالة مجمعة، أقسام `home` المرئية، وآخر 5 أخبار منشورة |
| `GET` | `/api/v1/configs` | `configs.manage` | استعراض جميع إعدادات `system_configs` (مع فلترة اختيارية `?category=`) |
| `PUT` | `/api/v1/configs/:key` | `configs.manage` | إنشاء أو تحديث مفتاح تهيئة مركزي وتوثيقه في `audit_logs` |

**مفاتيح التهيئة المزروعة في `system_configs`:**
- `branding.portal` (`isPublic: true`): اسم المنصة، الألوان، الشعار، الثيم وحجم الخط الافتراضي.
- `auth.registration_policy` (`isPublic: true`): نمط التسجيل (`instant`, `email_verification`, `admin_approval`)، الحد الأدنى لكلمة المرور، الدور الافتراضي.
- `catalog.age_policy` (`isPublic: true`): تفعيل التصفية العمرية الإلزامية (`strictAgeGating`)، عمر الكتب غير المصنفة، تفعيلها للضيوف.
- `features.flags` (`isPublic: true`): أعلام تفعيل المحرك `3D`، الراوي، الفيديو، القراءة دون إنترنت، الإشارات، البحث، المصغرات، المشاركة.
- `uploads.policy` (`isPublic: false`): الصيغ المسموحة (`['zip', 'json', 'md', 'docx', 'epub']`) والحد الأقصى بالـ MB (`100`).
- `moderation.review_checklist` (`isPublic: false`): بنود قائمة التحقق الإلزامية والاختيارية في بوابة المراجعة.
- `templates.official_package` (`isPublic: true`): رقم إصدار القالب القياسي، عنوانه، وإرشاداته.

### د. التصنيفات الديناميكية (`taxonomies.ts`)
| الطريقة | المسار | المصادقة / الصلاحية | الوصف |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/taxonomies` | مصادقة اختيارية | إرجاع التصنيفات (دعم `?group=`؛ ومع `includeInactive=true` يتطلب `taxonomies.manage`) |
| `POST` | `/api/v1/taxonomies` | `taxonomies.manage` | إنشاء تصنيف جديد ضمن أي مجموعة (`age_group`, `education_level`, `domain`, `book_type` أو مخصصة) |
| `PATCH` | `/api/v1/taxonomies/:id` | `taxonomies.manage` | تعديل بيانات أو قواعد `rulesJson` أو حالة تفعيل التصنيف |
| `POST` | `/api/v1/taxonomies/reorder` | `taxonomies.manage` | تحديث ترتيب العرض (`sortOrder`) دفعة واحدة |
| `DELETE` | `/api/v1/taxonomies/:id` | `taxonomies.manage` | تعطيل التصنيف ناعمياً (`isActive: false`) حفاظاً على سلامة الروابط التاريخية |

### هـ. إدارة الأدوار والصلاحيات (`rbac.ts`)
| الطريقة | المسار | المصادقة / الصلاحية | الوصف |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/rbac/permissions` | `roles.manage` | قائمة الصلاحيات المعرّفة في المنصة |
| `GET` | `/api/v1/rbac/roles` | `roles.manage` | قائمة الأدوار النظامية والمخصصة مع الصلاحيات وعدد المستخدمين |
| `POST` | `/api/v1/rbac/roles` | `roles.manage` | إنشاء دور مخصص جديد وربطه بأكواد `permissionCodes` |
| `PATCH` | `/api/v1/rbac/roles/:id` | `roles.manage` | تعديل اسم/حالة/صلاحيات أي دور |
| `DELETE` | `/api/v1/rbac/roles/:id` | `roles.manage` | حذف دور مخصص (`isSystem: false` فقط) |
| `PUT` | `/api/v1/rbac/users/:userId/roles` | `roles.manage` | إسناد أدوار (`roleCodes`) للمستخدم المستهدف |

### و. نظام إدارة المحتوى والأخبار (`cms.ts`)
| الطريقة | المسار | المصادقة / الصلاحية | الوصف |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/cms/pages` | `cms.manage` | عرض جميع صفحات CMS وأقسامها بما فيها المخفية |
| `GET` | `/api/v1/cms/pages/:slug` | مصادقة اختيارية | جلب صفحة محددة وأقسامها المرئية (أو الكل لحاملي `cms.manage`) |
| `PUT` | `/api/v1/cms/pages/:slug/sections/:sectionKey` | `cms.manage` | إنشاء أو تحديث قسم في الصفحة الرئيسية أو أي صفحة أخرى |
| `GET` | `/api/v1/news` | مصادقة اختيارية | عرض الأخبار المنشورة للعامة (والمسودات لحاملي `news.manage`) |
| `POST` | `/api/v1/news` | `news.manage` | إنشاء خبر جديد |
| `PATCH` | `/api/v1/news/:id` | `news.manage` | تعديل أو نشر أو أرشفة خبر |
| `DELETE` | `/api/v1/news/:id` | `news.manage` | حذف خبر |

### ز. الكتب والتقدم والإشارات المرجعية (`books.ts`)
| الطريقة | المسار | المصادقة / الصلاحية | الوصف |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/books` | مصادقة اختيارية | قائمة الكتب المنشورة مع **التصفية العمرية الإلزامية**، الترتيب بالتطابق (`matchScore`)، وبحث `?q=` مطبّع و`?taxonomy=` و`?recommendedOnly=true` |
| `GET` | `/api/v1/books/:slug` | مصادقة اختيارية | تفاصيل الكتاب؛ لحاملي `books.publish` يعرض غير المنشور وكل الإصدارات، وإلا يتحقق من النشر والأهلية العمرية |
| `GET` | `/api/v1/books/:slug/editions-data` | مصادقة اختيارية | إرجاع `canonicalDataJson` للإصدار النشط المنشور مع التحقق العمري |
| `POST` | `/api/v1/books` | `books.create` (+ `books.publish` عند `publishNow: true`) | إنشاء كتاب برمجياً عبر JSON |
| `PUT` | `/api/v1/books/:slug/progress` | مصادقة | حفظ النشرة الحالية `currentSpread` والنسبة `percent` والإشارات المرجعية `bookmarksJson` |
| `GET` | `/api/v1/books/:slug/progress` | مصادقة | جلب تقدم القراءة والإشارات للكتاب |
| `GET` | `/api/v1/books/progress/mine` | مصادقة | جلب تقدم القراءة لكل كتب المستخدم مجمعة بـ `slug` |

### ح. الوسائط والبث الجزئي (`media.ts`)
| الطريقة | المسار | المصادقة / الصلاحية | الوصف |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/media/stream/*` | عام | بث ملفات الصوت والفيديو والوسائط من المخزن مع دعم `Range: bytes=...` وإرجاع `206 Partial Content` أو `416` |
| `POST` | `/api/v1/media/presign` | `media.upload` | توليد رابط رفع موقّع (`Presigned PUT URL` لـ R2 أو مسار محلي لـ `local`) وتوثيقه في التدقيق |

### ط. القوالب، بوابة المؤلف، وبوابة المراجعة (`templates.ts`, `author.ts`, `moderation.ts`)
| الطريقة | المسار | المصادقة / الصلاحية | الوصف |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/parsers/formats` | عام | استعراض المحولات المسجلة في `@darb/parsers` وسياسة `uploads.policy` |
| `GET` | `/api/v1/templates/official` | عام | قراءة بيانات `templates.official_package` والتصنيفات النشطة ورابط التحميل |
| `GET` | `/api/v1/templates/official/download` | عام | توليد وتحميل حزمة القالب القياسي `.zip` حياً من `system_configs` والتصنيفات النشطة |
| `GET` | `/api/v1/author/books` | `books.create` | قائمة كتب المؤلف وإصداراتها (`?scope=all` متاح لحاملي `books.review` أو `books.publish`) |
| `GET` | `/api/v1/author/versions/:versionId/preview` | مصادقة | معاينة إصدار محدد في القارئ `3D` لمالك الكتاب أو لحاملي `books.review` أو `books.publish` أو للإصدار المنشور النشط |
| `POST` | `/api/v1/author/books` | `books.create` | رفع وتحويل كتاب جديد (`multipart/form-data`) كـ `DRAFT` دون نشره |
| `POST` | `/api/v1/author/books/:slug/versions` | `books.create` | رفع إصدار جديد غير هدّام (`v2+`) للكتاب دون تعطيل `activeVersionId` المنشور |
| `POST` | `/api/v1/author/versions/:versionId/submit` | `books.create` | إرسال الإصدار للمراجعة؛ **يرفض برمز `400`** إذا لم يكن `ipDeclarationSigned: true` |
| `GET` | `/api/v1/moderation/checklist` | `books.review` | جلب بنود قائمة التحقق من `moderation.review_checklist` |
| `GET` | `/api/v1/moderation/queue` | `books.review` | طابور المراجعة (فلتر `?status=ACTIVE\|ALL\|PUBLISHED\|REJECTED\|...`) |
| `POST` | `/api/v1/moderation/versions/:versionId/claim` | `books.review` | استلام التذكرة وتحويل الإصدار إلى `UNDER_REVIEW` |
| `POST` | `/api/v1/moderation/versions/:versionId/decision` | `books.review` (+ `books.publish` لـ `APPROVE_AND_PUBLISH`) | اتخاذ القرار (`APPROVE_AND_PUBLISH`, `REQUEST_CHANGES`, `REJECT`) وتوثيق التذكرة والتدقيق |

### ي. سجل التدقيق (`audit.ts`)
| الطريقة | المسار | المصادقة / الصلاحية | الوصف |
| :--- | :--- | :--- | :--- |
| `GET` | `/api/v1/audit-logs` | `audit.read` | البحث والتصفية في سجلات التدقيق (`?action=`, `?targetType=`, `?targetId=`, `?actorId=`, `?limit=` بحد أقصى `200`) |

---

## 3. شرح الآليات الجوهرية

### أ. آلية التصفية العمرية والتخصيص ([`ageGating.ts`](../apps/api/src/services/ageGating.ts))
- يُحسب الحد الأدنى لعمر الكتاب `resolveBookMinAge` بأعلى قيمة `rulesJson.minAge` بين تصنيفات `age_group` المرتبطة بالكتاب (أو `unratedBookMinAge` من `catalog.age_policy` إذا خلا من تصنيف عمري).
- إذا كانت `strictAgeGating === true`: يُمنع إظهار أي كتاب يتجاوز الحد الأعلى لعمر المستخدم (`rule.maxAge`) أو يعود برمز `403 AGE_RESTRICTED` عند محاولة فتحه مباشرةً؛ أما فئة `18+` (`maxAge: null`) فتسمح بالوصول لجميع الكتب.
- تُرتَّب الكتب المسموح بها تنازلياً عبر `computePersonalizationScore`: `+10` نقاط لمطابقة المستوى التعليمي و`+5` نقاط لكل تصنيف مفضّل مطابق، مع عدم إخفاء بقية الكتب المسموح بها عمرياً.

### ب. آلية البث الجزئي (`Range 206`)
تستخلص [`parseByteRange`](../apps/api/src/services/storage.ts) ترويسة `Range: bytes=start-end` وتتعامل مع كل الحالات: النطاق الجزئي (`bytes X-Y` أو `bytes X-` أو اللاحق `bytes=-N`) يُرجع `206 Partial Content` مع `Content-Range` و`Accept-Ranges: bytes`، والنطاق غير القابل للاستيفاء يُرجع `416`، والطلب الكامل دون `Range` يُرجع `200`.
