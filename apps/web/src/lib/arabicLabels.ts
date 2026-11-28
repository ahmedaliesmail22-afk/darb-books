import type { AuditLogDto, PublicationStatusDto } from './types';

export const ADMIN_TAB_LABELS = {
  cms: '📝 الرئيسية والأخبار',
  taxonomies: '🏷️ التصنيفات والمستويات',
  configs: '🎨 الهوية والتهيئة',
  rbac: '🛡️ الأدوار والمستخدمون',
  audit: '📋 سجل التدقيق',
} as const;

export const CMS_SECTION_LABELS: Record<string, string> = {
  hero: 'الواجهة الترحيبية الرئيسية',
  features: 'مميزات القراءة الغامرة',
  capabilities: 'إمكانات المنصة التعليمية',
  how_it_works: 'كيف تعمل المنصة',
  featured_books: 'أبرز الكتب والإصدارات المعتمدة',
  news_preview: 'معاينة آخر الأخبار',
  footer: 'تذييل الصفحة والروابط السريعة',
};

export function getCmsSectionLabelAr(sectionKey: string, titleAr?: string): string {
  return CMS_SECTION_LABELS[sectionKey] || titleAr || 'قسم مخصص';
}

export const TAXONOMY_GROUP_OPTIONS = [
  { value: 'age_group', labelAr: 'الفئة العمرية' },
  { value: 'education_level', labelAr: 'المستوى التعليمي' },
  { value: 'domain', labelAr: 'التخصص / المجال' },
  { value: 'book_type', labelAr: 'نوع الكتاب' },
] as const;

export function getTaxonomyGroupLabelAr(group: string): string {
  const known: Record<string, string> = {
    age_group: 'الفئة العمرية',
    education_level: 'المستوى التعليمي',
    domain: 'التخصص / المجال',
    book_type: 'نوع الكتاب',
    track_badge: 'مسارات مخصصة',
  };
  if (known[group]) return known[group];
  if (/[\u0600-\u06FF]/.test(group)) return group;
  return `مجموعة مخصصة (${group})`;
}

export const SYSTEM_CONFIG_META: Record<
  string,
  { titleAr: string; categoryAr: string; descriptionAr: string }
> = {
  'branding.portal': {
    titleAr: 'الهوية البصرية والمظهر',
    categoryAr: 'الهوية والمظهر',
    descriptionAr: 'اسم المنصة، الوصف، مسار الشعار، الألوان، الثيم الافتراضي وحجم الخط.',
  },
  'auth.registration_policy': {
    titleAr: 'سياسة التسجيل والحسابات',
    categoryAr: 'التسجيل والأمان',
    descriptionAr: 'آلية تفعيل المستخدمين الجدد، السماح بالتسجيل الذاتي، وطول كلمة المرور.',
  },
  'features.flags': {
    titleAr: 'مفاتيح ميزات المنصة',
    categoryAr: 'الميزات التشغيلية',
    descriptionAr: 'تشغيل وإيقاف المسرح ثلاثي الأبعاد، الراوي الصوتي، الفيديو، وغيرها.',
  },
  'moderation.review_checklist': {
    titleAr: 'قائمة التحقق للمراجعة',
    categoryAr: 'المراجعة والاعتماد',
    descriptionAr: 'بنود الفحص العلمي والملكية الفكرية الظاهرة لفريق المراجعة.',
  },
  'uploads.policy': {
    titleAr: 'سياسة رفع الملفات',
    categoryAr: 'الرفع والملفات',
    descriptionAr: 'الصيغ المسموح بها للمؤلفين والحد الأقصى لحجم الملف بالميجابايت.',
  },
  'templates.official_package': {
    titleAr: 'إعدادات القالب القياسي',
    categoryAr: 'القوالب والنشر',
    descriptionAr: 'رقم إصدار القالب الرسمي وعنوانه والإرشادات المعروضة في بوابة المؤلف.',
  },
  'catalog.age_policy': {
    titleAr: 'سياسة الأمان العمري',
    categoryAr: 'المكتبة والأمان',
    descriptionAr: 'ضوابط التصفية العمرية الصارمة وتطبيقها على الكتب والزوار.',
  },
};

export function getSystemConfigTitleAr(key: string): string {
  return SYSTEM_CONFIG_META[key]?.titleAr ?? 'إعداد مخصص';
}

export function getSystemConfigCategoryAr(category: string): string {
  const map: Record<string, string> = {
    branding: 'الهوية والمظهر',
    auth: 'التسجيل والأمان',
    catalog: 'المكتبة والأمان',
    features: 'الميزات التشغيلية',
    uploads: 'الرفع والملفات',
    moderation: 'المراجعة والاعتماد',
    templates: 'القوالب والنشر',
  };
  return map[category] ?? category;
}

export const FEATURE_FLAG_LABELS: Record<string, string> = {
  enable3DStage: 'المسرح ثلاثي الأبعاد والتقليب الورقي',
  enableNarrator: 'الراوي الصوتي الفصيح والمزامنة التلقائية',
  enableChapterVideos: 'عروض الفيديو والكواليس للفصول',
  enableOfflineCache: 'الحفظ والقراءة دون اتصال بالإنترنت',
  enableBookmarks: 'الإشارات المرجعية وحفظ المواضع',
  enableSearch: 'البحث الفوري داخل صفحات الكتاب',
  enableGridOverview: 'معرض مصغّرات الصفحات السريع',
  enableShare: 'مشاركة ونسخ روابط الصفحات',
};

export const UPLOAD_FORMAT_LABELS: Record<string, string> = {
  zip: 'حزمة القالب القياسي المضغوطة',
  json: 'ملف كتاب مهيكل',
  md: 'ملف نصي منسق بالعلامات',
  markdown: 'ملف نصي منسق بالعلامات',
  docx: 'مستند محرر النصوص',
  epub: 'كتاب إلكتروني قياسي',
};

export function getFormatLabelAr(formatId: string, fallback?: string): string {
  return UPLOAD_FORMAT_LABELS[formatId.toLowerCase()] ?? fallback ?? formatId;
}

export const THEME_LABELS: Record<string, string> = {
  sepia: 'مخطوطة كلاسيكية',
  dark: 'الوضع الليلي',
  light: 'الوضع النهاري',
};

export const FONT_SCALE_LABELS: Record<string, string> = {
  sm: 'صغير',
  md: 'متزن',
  lg: 'كبير',
};

export const USER_STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'نشط',
  PENDING_APPROVAL: 'بانتظار اعتماد الإدارة',
  PENDING_VERIFICATION: 'بانتظار تأكيد البريد',
  SUSPENDED: 'موقوف',
};

export const NEWS_STATUS_LABELS: Record<string, string> = {
  PUBLISHED: 'منشور',
  DRAFT: 'مسودة',
  ARCHIVED: 'مؤرشف',
};

export const ROLE_NAME_LABELS: Record<string, string> = {
  SUPER_ADMIN: 'الإدارة العليا',
  PLATFORM_ADMIN: 'إدارة التشغيل والمحتوى',
  CONTENT_REVIEWER: 'مراجع علمي ومدقق ملكية فكرية',
  AUTHOR: 'مؤلف / ناشر / أستاذ',
  LEARNER: 'قارئ / طالب / باحث',
};

export function getRoleDisplayName(code: string, fallbackNameAr?: string): string {
  if (fallbackNameAr && /[\u0600-\u06FF]/.test(fallbackNameAr)) return fallbackNameAr;
  return ROLE_NAME_LABELS[code] ?? fallbackNameAr ?? code;
}

export const PERMISSION_LABELS: Record<string, string> = {
  'configs.manage': 'إدارة تهيئة المنصة والهوية',
  'roles.manage': 'إدارة الأدوار والصلاحيات',
  'users.manage': 'إدارة وحالة المستخدمين',
  'taxonomies.manage': 'إدارة التصنيفات والمستويات الديناميكية',
  'cms.manage': 'تحرير صفحات وأقسام الواجهة',
  'news.manage': 'إدارة الأخبار والإعلانات',
  'books.read': 'قراءة وتصفح الكتب المعتمدة',
  'books.create': 'إنشاء ورفع إصدارات الكتب',
  'books.review': 'مراجعة الكتب والملكية الفكرية',
  'books.publish': 'اعتماد ونشر إصدارات الكتب',
  'media.upload': 'رفع الوسائط إلى التخزين السحابي',
  'audit.read': 'الاطلاع على سجل التدقيق',
};

export function getPermissionLabelAr(code: string, fallback?: string): string {
  return fallback || PERMISSION_LABELS[code] || code;
}

export const REVIEW_DECISION_LABELS: Record<string, string> = {
  APPROVE_AND_PUBLISH: 'اعتماد ونشر',
  REQUEST_CHANGES: 'طلب تعديلات',
  REJECT: 'رفض الإصدار',
};

export function getReviewDecisionLabelAr(decision?: string | null): string {
  if (!decision) return 'ملاحظة مراجعة';
  return REVIEW_DECISION_LABELS[decision] ?? decision;
}

export function getPublicationStatusLabelAr(status: string): string {
  const map: Record<PublicationStatusDto, string> = {
    DRAFT: 'مسودة (غير منشور)',
    SUBMITTED: 'مرسل للمراجعة',
    UNDER_REVIEW: 'قيد المراجعة العلمية',
    CHANGES_REQUESTED: 'مطلوب تعديلات',
    PUBLISHED: 'معتمد ومنشور',
    REJECTED: 'مرفوض',
    ARCHIVED: 'مؤرشف (إصدار سابق)',
  };
  return (map as Record<string, string>)[status] ?? status;
}

const ARABIC_CHAR_MAP: Record<string, string> = {
  'ا': 'a', 'أ': 'a', 'إ': 'i', 'آ': 'a', 'ى': 'a', 'ة': 't',
  'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'h', 'خ': 'kh',
  'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z', 'س': 's', 'ش': 'sh',
  'ص': 's', 'ض': 'd', 'ط': 't', 'ظ': 'z', 'ع': 'a', 'غ': 'gh',
  'ف': 'f', 'ق': 'q', 'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n',
  'ه': 'h', 'و': 'w', 'ؤ': 'w', 'ي': 'y', 'ئ': 'y', 'ء': '',
  '٠': '0', '١': '1', '٢': '2', '٣': '3', '٤': '4',
  '٥': '5', '٦': '6', '٧': '7', '٨': '8', '٩': '9',
};

export function transliterateArabicToAscii(text: string): string {
  const stripped = text
    .normalize('NFKD')
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '');
  let out = '';
  for (const ch of stripped) {
    if (ARABIC_CHAR_MAP[ch] !== undefined) {
      out += ARABIC_CHAR_MAP[ch];
    } else if (/[a-zA-Z0-9]/.test(ch)) {
      out += ch.toLowerCase();
    } else {
      out += ' ';
    }
  }
  return out;
}

function stableShortHash(input: string): string {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36).slice(0, 5);
}

export function slugifyArabicToSlug(input: string, fallbackPrefix = 'item'): string {
  const ascii = transliterateArabicToAscii(input)
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  if (ascii.length >= 2) return ascii;
  const trimmed = input.trim();
  if (!trimmed) return '';
  return `${fallbackPrefix}-${stableShortHash(trimmed)}`;
}

export function slugifyArabicToSnakeKey(input: string, fallbackPrefix = 'section'): string {
  const ascii = transliterateArabicToAscii(input)
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 56);
  if (ascii.length >= 2) return ascii;
  const trimmed = input.trim();
  if (!trimmed) return '';
  return `${fallbackPrefix}_${stableShortHash(trimmed)}`;
}

export function slugifyArabicToRoleCode(input: string): string {
  const ascii = transliterateArabicToAscii(input)
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toUpperCase()
    .slice(0, 48);
  if (ascii.length >= 2) return ascii;
  const trimmed = input.trim();
  if (!trimmed) return '';
  return `CUSTOM_ROLE_${stableShortHash(trimmed).toUpperCase()}`;
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'user.register': 'تسجيل حساب مستخدم جديد',
  'user.verify_email': 'تأكيد البريد الإلكتروني للحساب',
  'user.login': 'تسجيل الدخول إلى المنصة',
  'user.profile.onboarding': 'تحديث الملف التعليمي والتفضيلات',
  'user.status.update': 'تعديل حالة حساب مستخدم',
  'taxonomy.create': 'إضافة تصنيف أو مستوى جديد',
  'taxonomy.update': 'تحديث بيانات تصنيف',
  'taxonomy.reorder': 'إعادة ترتيب التصنيفات',
  'taxonomy.deactivate': 'تعطيل تصنيف',
  'system_config.create': 'إنشاء إعداد تهيئة جديد',
  'system_config.update': 'تحديث إعدادات المنصة والهوية',
  'cms.section.create': 'إنشاء قسم جديد في الصفحة الرئيسية',
  'cms.section.update': 'تحديث قسم في الصفحة الرئيسية',
  'news.create': 'نشر خبر أو إعلان جديد',
  'news.update': 'تعديل خبر أو تحديث حالته',
  'news.delete': 'حذف خبر من البوابة',
  'rbac.role.create': 'إنشاء دور وظيفي مخصص',
  'rbac.role.update': 'تعديل صلاحيات دور وظيفي',
  'rbac.role.delete': 'حذف دور وظيفي مخصص',
  'rbac.user_roles.assign': 'إسناد دور وظيفي لمستخدم',
  'book.create': 'إنشاء سجل كتاب جديد',
  'author.book_upload': 'رفع كتاب جديد وتحويله للمعاينة',
  'author.version_upload': 'رفع إصدار جديد لكتاب قائم',
  'author.version_submit': 'توقيع إقرار الملكية وإرسال الإصدار للمراجعة',
  'moderation.claim': 'استلام إصدار كتاب للمراجعة العلمية',
  'moderation.approve_and_publish': 'اعتماد إصدار كتاب ونشره في المكتبة',
  'moderation.request_changes': 'إعادة إصدار للمؤلف مع طلب تعديلات',
  'moderation.reject': 'رفض نشر إصدار كتاب',
  'media.presign': 'تهيئة رابط رفع وسائط للتخزين السحابي',
  'system.seed': 'التهيئة الأولية وبذر قاعدة بيانات المنصة',
};

export const AUDIT_TARGET_TYPE_LABELS: Record<string, string> = {
  user: 'حساب مستخدم',
  user_profile: 'الملف التعليمي للمستخدم',
  taxonomy: 'تصنيف / مستوى تعليمي',
  system_config: 'إعداد تهيئة المنصة',
  cms_section: 'قسم الصفحة الرئيسية',
  news_post: 'خبر / إعلان',
  role: 'دور وظيفي',
  book: 'كتاب تفاعلي',
  book_version: 'إصدار كتاب',
  media_asset: 'ملف وسائط',
  system: 'بيئة النظام',
};

export function formatArabicDateTime(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  try {
    return new Intl.DateTimeFormat('ar-EG-u-nu-latn', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  } catch {
    return date.toLocaleString('ar-SA');
  }
}

function readNestedString(obj: Record<string, unknown>, path: string[]): string | null {
  let curr: unknown = obj;
  for (const key of path) {
    if (!curr || typeof curr !== 'object') return null;
    curr = (curr as Record<string, unknown>)[key];
  }
  return typeof curr === 'string' && curr.trim() ? curr.trim() : null;
}

export function describeAuditTargetAr(log: AuditLogDto): string {
  const baseLabel = AUDIT_TARGET_TYPE_LABELS[log.targetType] ?? log.targetType;
  const meta = (log.metadataJson ?? {}) as Record<string, unknown>;

  if (log.targetType === 'system_config') {
    const cfgTitle = getSystemConfigTitleAr(log.targetId);
    return `${baseLabel}: ${cfgTitle !== 'إعداد مخصص' ? cfgTitle : log.targetId}`;
  }

  if (log.targetType === 'cms_section') {
    const sectionKey = readNestedString(meta, ['sectionKey']) ?? readNestedString(meta, ['after', 'sectionKey']);
    const titleAr = readNestedString(meta, ['after', 'titleAr']) ?? readNestedString(meta, ['before', 'titleAr']);
    const secLabel = sectionKey ? getCmsSectionLabelAr(sectionKey, titleAr ?? undefined) : titleAr;
    return secLabel ? `${baseLabel}: ${secLabel}` : baseLabel;
  }

  if (log.targetType === 'taxonomy') {
    if (log.targetId === 'batch') return 'مجموعة تصنيفات';
    const labelAr = readNestedString(meta, ['after', 'labelAr']) ?? readNestedString(meta, ['before', 'labelAr']);
    return labelAr ? `${baseLabel}: ${labelAr}` : baseLabel;
  }

  if (log.targetType === 'role') {
    const nameAr =
      readNestedString(meta, ['nameAr']) ??
      readNestedString(meta, ['after', 'nameAr']) ??
      readNestedString(meta, ['before', 'nameAr']);
    const code = readNestedString(meta, ['code']) ?? readNestedString(meta, ['deletedRoleCode']);
    const readable = nameAr || (code ? getRoleDisplayName(code) : null);
    return readable ? `${baseLabel}: ${readable}` : baseLabel;
  }

  if (log.targetType === 'news_post') {
    const title = readNestedString(meta, ['title']) ?? readNestedString(meta, ['slug']);
    return title ? `${baseLabel}: ${title}` : baseLabel;
  }

  if (log.targetType === 'book' || log.targetType === 'book_version') {
    const title = readNestedString(meta, ['title']) ?? readNestedString(meta, ['slug']);
    const ver = meta.versionNumber;
    if (title && typeof ver === 'number') return `${baseLabel} (الإصدار ${ver}) للكتاب: ${title}`;
    if (title) return `${baseLabel}: ${title}`;
  }

  if (log.targetType === 'user') {
    const afterStatus = readNestedString(meta, ['after', 'status']);
    if (afterStatus && USER_STATUS_LABELS[afterStatus]) {
      return `${baseLabel} (الحالة الجديدة: ${USER_STATUS_LABELS[afterStatus]})`;
    }
    const afterRoles = Array.isArray(meta.afterRoleCodes)
      ? (meta.afterRoleCodes as string[]).map((c) => getRoleDisplayName(c)).join('، ')
      : null;
    if (afterRoles) return `${baseLabel} (الدور المسند: ${afterRoles})`;
  }

  return baseLabel;
}

export interface FormattedAuditEntry {
  id: string;
  timestampText: string;
  actorName: string;
  actorEmail: string;
  actionAr: string;
  targetAr: string;
  detailsSentence: string;
  ipAddress: string;
  raw: AuditLogDto;
}

export function formatAuditLogEntry(log: AuditLogDto): FormattedAuditEntry {
  const timestampText = formatArabicDateTime(log.createdAt);
  const actorName = log.actor?.fullName?.trim() || 'النظام';
  const actorEmail = log.actor?.email || 'تلقائي من النظام';
  const actionAr = AUDIT_ACTION_LABELS[log.action] ?? `تنفيذ إجراء (${log.action})`;
  const targetAr = describeAuditTargetAr(log);
  const detailsSentence = `في تمام ${timestampText} قام ${actorName} بـ ${actionAr} على ${targetAr}`;

  return {
    id: log.id,
    timestampText,
    actorName,
    actorEmail,
    actionAr,
    targetAr,
    detailsSentence,
    ipAddress: log.ipAddress || 'غير متوفر',
    raw: log,
  };
}
