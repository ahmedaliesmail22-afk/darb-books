import fs from 'node:fs';
import path from 'node:path';
import type { PrismaClient } from '@prisma/client';
import {
  normalizeAssetDir,
  normalizeDataFile,
  parseCatalogData,
  parseEditionData,
} from '@darb/book-schema';
import { stringifyJson } from '../lib/jsonCodec';
import { hashPassword } from '../services/security';
import { inferMimeType, type StorageService } from '../services/storage';
import { recordAuditLog } from '../plugins/audit';

type MediaAssetType = 'SOURCE_DOC' | 'AUDIO' | 'VIDEO' | 'IMAGE' | 'MODEL_3D' | 'OTHER';

export interface SeedOptions {
  publicDir?: string;
  adminEmail: string;
  adminPassword: string;
  adminName?: string;
  storage?: StorageService;
  syncMediaToStorage?: boolean;
}

const PERMISSIONS_SEED = [
  { code: 'configs.manage', module: 'system', labelAr: 'إدارة تهيئة المنصة والهوية', labelEn: 'Manage System Configs' },
  { code: 'roles.manage', module: 'rbac', labelAr: 'إدارة الأدوار والصلاحيات', labelEn: 'Manage Roles & Permissions' },
  { code: 'users.manage', module: 'users', labelAr: 'إدارة وحالة المستخدمين', labelEn: 'Manage Users' },
  { code: 'taxonomies.manage', module: 'taxonomies', labelAr: 'إدارة التصنيفات والمستويات الديناميكية', labelEn: 'Manage Taxonomies' },
  { code: 'cms.manage', module: 'cms', labelAr: 'تحرير صفحات وأقسام الواجهة', labelEn: 'Manage CMS Pages & Sections' },
  { code: 'news.manage', module: 'cms', labelAr: 'إدارة الأخبار والإعلانات', labelEn: 'Manage News Posts' },
  { code: 'books.read', module: 'books', labelAr: 'قراءة وتصفح الكتب المعتمدة', labelEn: 'Read Published Books' },
  { code: 'books.create', module: 'books', labelAr: 'إنشاء ورفع إصدارات الكتب', labelEn: 'Create & Upload Book Versions' },
  { code: 'books.review', module: 'reviews', labelAr: 'مراجعة الكتب والملكية الفكرية', labelEn: 'Review Book Submissions' },
  { code: 'books.publish', module: 'books', labelAr: 'اعتماد ونشر إصدارات الكتب', labelEn: 'Approve & Publish Books' },
  { code: 'media.upload', module: 'media', labelAr: 'رفع الوسائط إلى التخزين السحابي', labelEn: 'Upload Media Assets' },
  { code: 'audit.read', module: 'audit', labelAr: 'الاطلاع على سجل التدقيق', labelEn: 'Read Audit Logs' },
] as const;

const ROLES_SEED: Array<{
  code: string;
  nameAr: string;
  nameEn: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
}> = [
  {
    code: 'SUPER_ADMIN',
    nameAr: 'الإدارة العليا',
    nameEn: 'Super Admin',
    description: 'التحكم الكامل بالتهيئة والهوية والأدوار والصلاحيات والتصنيفات والمحتوى',
    isSystem: true,
    permissions: PERMISSIONS_SEED.map((p) => p.code),
  },
  {
    code: 'PLATFORM_ADMIN',
    nameAr: 'إدارة التشغيل والمحتوى',
    nameEn: 'Platform Admin',
    description: 'إدارة أقسام الصفحة الرئيسية والأخبار والمستخدمين والتصنيفات وسجل التدقيق',
    isSystem: true,
    permissions: ['cms.manage', 'news.manage', 'taxonomies.manage', 'users.manage', 'books.read', 'audit.read'],
  },
  {
    code: 'CONTENT_REVIEWER',
    nameAr: 'مراجع علمي ومدقق ملكية فكرية',
    nameEn: 'Content Reviewer',
    description: 'فحص الإصدارات المرفوعة وتوثيق المحتوى وحقوق النشر والاعتماد',
    isSystem: true,
    permissions: ['books.read', 'books.review', 'books.publish', 'audit.read'],
  },
  {
    code: 'AUTHOR',
    nameAr: 'مؤلف / ناشر / أستاذ',
    nameEn: 'Author / Publisher',
    description: 'إنشاء الكتب ورفع الإصدارات والوسائط ومتابعة المراجعة',
    isSystem: true,
    permissions: ['books.read', 'books.create', 'media.upload'],
  },
  {
    code: 'LEARNER',
    nameAr: 'قارئ / طالب / باحث',
    nameEn: 'Learner / Reader',
    description: 'تصفح المكتبة واستخدام القارئ ثلاثي الأبعاد وحفظ التقدم والتفضيلات',
    isSystem: true,
    permissions: ['books.read'],
  },
];

const TAXONOMIES_SEED = [
  // الفئات العمرية
  { group: 'age_group', slug: 'all-ages', labelAr: 'جميع الأعمار (0+)', labelEn: 'All Ages (0+)', sortOrder: 1, rulesJson: { minAge: 0, maxAge: null, ageRank: 0 } },
  { group: 'age_group', slug: 'kids-6-11', labelAr: 'الأطفال (6 - 11 سنة)', labelEn: 'Kids (6-11)', sortOrder: 2, rulesJson: { minAge: 6, maxAge: 11, ageRank: 1 } },
  { group: 'age_group', slug: 'teens-12-15', labelAr: 'الناشئة (12 - 15 سنة)', labelEn: 'Teens (12-15)', sortOrder: 3, rulesJson: { minAge: 12, maxAge: 15, ageRank: 2 } },
  { group: 'age_group', slug: 'youth-16-17', labelAr: 'الشباب (16 - 17 سنة)', labelEn: 'Youth (16-17)', sortOrder: 4, rulesJson: { minAge: 16, maxAge: 17, ageRank: 3 } },
  { group: 'age_group', slug: 'adults-18-plus', labelAr: 'البالغون والباحثون (18+)', labelEn: 'Adults (18+)', sortOrder: 5, rulesJson: { minAge: 18, maxAge: null, ageRank: 4 } },

  // المستويات التعليمية (من التمهيدي إلى البروفيسوراه + التعليم التقني + القراءة العامة)
  { group: 'education_level', slug: 'pre-k', labelAr: 'المرحلة التمهيدية ورياض الأطفال', labelEn: 'Pre-K / Kindergarten', sortOrder: 1, rulesJson: { levelOrder: 1 } },
  { group: 'education_level', slug: 'primary', labelAr: 'المرحلة الابتدائية', labelEn: 'Primary School', sortOrder: 2, rulesJson: { levelOrder: 2 } },
  { group: 'education_level', slug: 'middle', labelAr: 'المرحلة المتوسطة / الإعدادية', labelEn: 'Middle School', sortOrder: 3, rulesJson: { levelOrder: 3 } },
  { group: 'education_level', slug: 'high-school', labelAr: 'المرحلة الثانوية', labelEn: 'High School', sortOrder: 4, rulesJson: { levelOrder: 4 } },
  { group: 'education_level', slug: 'technical-vocational', labelAr: 'التعليم التقني والمهني', labelEn: 'Technical & Vocational', sortOrder: 5, rulesJson: { levelOrder: 5 } },
  { group: 'education_level', slug: 'bachelor', labelAr: 'المرحلة الجامعية (البكالوريوس)', labelEn: 'Bachelor Degree', sortOrder: 6, rulesJson: { levelOrder: 6 } },
  { group: 'education_level', slug: 'master', labelAr: 'الدراسات العليا (الماجستير)', labelEn: 'Master Degree', sortOrder: 7, rulesJson: { levelOrder: 7 } },
  { group: 'education_level', slug: 'phd', labelAr: 'الدكتوراه', labelEn: 'PhD / Doctorate', sortOrder: 8, rulesJson: { levelOrder: 8 } },
  { group: 'education_level', slug: 'professor', labelAr: 'البروفيسوراه والبحث العلمي المتقدم', labelEn: 'Professor / Advanced Research', sortOrder: 9, rulesJson: { levelOrder: 9 } },
  { group: 'education_level', slug: 'general-reading', labelAr: 'القراءة العامة والتثقيف الحر', labelEn: 'General Reading', sortOrder: 10, rulesJson: { levelOrder: 10 } },

  // التخصصات
  { group: 'domain', slug: 'software-engineering', labelAr: 'هندسة البرمجيات والأنظمة السحابية', labelEn: 'Software Engineering', sortOrder: 1, rulesJson: {} },
  { group: 'domain', slug: 'medicine-anatomy', labelAr: 'الطب والتشريح والعلوم الصحية', labelEn: 'Medicine & Anatomy', sortOrder: 2, rulesJson: {} },
  { group: 'domain', slug: 'math-physics', labelAr: 'الرياضيات والفيزياء والكيمياء', labelEn: 'Mathematics & Physics', sortOrder: 3, rulesJson: {} },
  { group: 'domain', slug: 'history-geography', labelAr: 'التاريخ والجغرافيا والحضارات', labelEn: 'History & Geography', sortOrder: 4, rulesJson: {} },
  { group: 'domain', slug: 'arabic-quran', labelAr: 'اللغة العربية والقرآن الكريم', labelEn: 'Arabic & Quran', sortOrder: 5, rulesJson: {} },
  { group: 'domain', slug: 'stories-novels', labelAr: 'القصص والروايات والأدب', labelEn: 'Stories & Novels', sortOrder: 6, rulesJson: {} },
  { group: 'domain', slug: 'scientific-magazines', labelAr: 'المجلات والدوريات العلمية', labelEn: 'Scientific Magazines', sortOrder: 7, rulesJson: {} },
  { group: 'domain', slug: 'accounting-management', labelAr: 'الإدارة والمحاسبة المالية', labelEn: 'Accounting & Management', sortOrder: 8, rulesJson: {} },

  // أنواع الكتب
  { group: 'book_type', slug: 'interactive-book', labelAr: 'كتاب تعليمي تفاعلي', labelEn: 'Interactive Educational Book', sortOrder: 1, rulesJson: {} },
  { group: 'book_type', slug: 'technical-reference', labelAr: 'مرجع تشريحي وتقني', labelEn: 'Technical / Anatomical Reference', sortOrder: 2, rulesJson: {} },
  { group: 'book_type', slug: 'epic-story', labelAr: 'قصة تقنية / ملحمة سردية', labelEn: 'Narrative / Epic Story', sortOrder: 3, rulesJson: {} },
  { group: 'book_type', slug: 'novel', labelAr: 'رواية أدبية', labelEn: 'Novel', sortOrder: 4, rulesJson: {} },
  { group: 'book_type', slug: 'magazine', labelAr: 'مجلة دورية', labelEn: 'Magazine', sortOrder: 5, rulesJson: {} },
  { group: 'book_type', slug: 'interactive-lab', labelAr: 'مختبر تفاعلي غامر', labelEn: 'Interactive Lab', sortOrder: 6, rulesJson: {} },
];

const SYSTEM_CONFIGS_SEED = [
  {
    key: 'branding.portal',
    category: 'branding',
    isPublic: true,
    description: 'الهوية البصرية العامة وعنوان المنصة ومظهرها الافتراضي',
    valueJson: {
      portalTitle: 'بوابة درب للكتب التفاعلية ثلاثية الأبعاد',
      cloudLabel: 'منظومة درب التعليمية السحابية',
      defaultTheme: 'sepia',
      defaultFontScale: 'md',
      primaryColor: '#d4af37',
      accentColor: '#38bdf8',
      logoUrl: './icons/icon-192.png',
    },
  },
  {
    key: 'auth.registration_policy',
    category: 'auth',
    isPublic: true,
    description: 'سياسة التسجيل الذاتي وطريقة تفعيل الحسابات الجديدة',
    valueJson: {
      mode: 'instant',
      allowSelfRegistration: true,
      requireOnboarding: true,
      minPasswordLength: 8,
      defaultRoleCode: 'LEARNER',
    },
  },
  {
    key: 'catalog.age_policy',
    category: 'catalog',
    isPublic: true,
    description: 'سياسة التصفية العمرية الإلزامية في المكتبة',
    valueJson: {
      strictAgeGating: true,
      unratedBookMinAge: 0,
      enforceForGuests: false,
    },
  },
  {
    key: 'features.flags',
    category: 'features',
    isPublic: true,
    description: 'أعلام تفعيل ميزات القارئ والمنصة',
    valueJson: {
      enable3DStage: true,
      enableNarrator: true,
      enableChapterVideos: true,
      enableOfflineCache: true,
      enableBookmarks: true,
      enableSearch: true,
      enableGridOverview: true,
      enableShare: true,
    },
  },
  {
    key: 'uploads.policy',
    category: 'uploads',
    isPublic: false,
    description: 'الصيغ المسموح بها والحد الأقصى لحجم الملفات المرفوعة',
    valueJson: {
      allowedFormats: ['zip', 'json', 'md', 'docx', 'epub'],
      maxFileSizeMb: 100,
    },
  },
  {
    key: 'moderation.review_checklist',
    category: 'moderation',
    isPublic: false,
    description: 'قائمة التحقق المعيارية لفحص المحتوى والملكية الفكرية قبل اعتماد النشر',
    valueJson: {
      items: [
        {
          id: 'ip_ownership',
          labelAr: 'التحقق من ملكية المؤلف للحقوق وخلو العمل من الانتحال أو التعدي على حقوق الغير',
          required: true,
        },
        {
          id: 'content_accuracy',
          labelAr: 'سلامة المادة العلمية والأدبية واللغوية وملاءمتها للمنهج المستهدف',
          required: true,
        },
        {
          id: 'age_appropriateness',
          labelAr: 'مطابقة الفئة العمرية والمستوى التعليمي المحددين للمحتوى الفعلي',
          required: true,
        },
        {
          id: 'media_and_layout',
          labelAr: 'سلامة الصفحات والتنسيق والوسائط المرفقة في المعاينة ثلاثية الأبعاد',
          required: false,
        },
      ],
    },
  },
  {
    key: 'templates.official_package',
    category: 'templates',
    isPublic: true,
    description: 'بيانات وإرشادات القالب القياسي الرسمي لرفع الكتب (يستخدمه مولد القالب في بوابة المؤلف)',
    valueJson: {
      version: '1.1.0',
      title: 'قالب كتاب درب التفاعلي القياسي',
      guideMarkdown:
        'استخدم بنية مجلد chapters/ وملف book.manifest.json، وأرفق ملفات audio/spread_0.mp3 ومقاطع videos/ch1.mp4 عند الحاجة قبل المعاينة ثلاثية الأبعاد والإرسال للمراجعة.',
    },
  },
];

const HOME_SECTIONS_SEED = [
  {
    sectionKey: 'hero',
    titleAr: 'منصة درب — الكتب التفاعلية ثلاثية الأبعاد لكل المستويات',
    titleEn: 'Darb Platform — 3D Interactive Books',
    sortOrder: 1,
    contentJson: {
      badge: 'الإصدار السحابي الجديد',
      subtitle: 'اقرأ، استمع، وتفاعل مع العلوم والقصص والروايات والمختبرات الافتراضية من التمهيدي حتى البروفيسوراه.',
      primaryCtaText: 'تصفح المكتبة الآن',
      primaryCtaHref: '/library',
      secondaryCtaText: 'دليل النشر والتأليف',
      secondaryCtaHref: '/author',
    },
  },
  {
    sectionKey: 'features',
    titleAr: 'مميزات القراءة الغامرة والتفاعل الذكي',
    titleEn: 'Immersive Reading Features',
    sortOrder: 2,
    contentJson: {
      items: [
        { icon: '📚', title: 'محرك تقليب ثلاثي الأبعاد RTL', desc: 'تجربة ورقية عربية واقعية بإضاءة Three.js ودعم كامل للجوال والحاسوب.' },
        { icon: '🎙️', title: 'راوٍ صوتي فصيح ومزامنة تلقائية', desc: 'استمع لكل نشرة مع تسريع، تقديم/تأخير ±10ث، وانتقال تلقائي سلس.' },
        { icon: '🎬', title: 'كواليس فيديو وكتل تفاعلية', desc: 'عروض فيديو للفصول، ومجسمات ثلاثية الأبعاد ومحاكاة علمية ومختبرات.' },
      ],
    },
  },
  {
    sectionKey: 'capabilities',
    titleAr: 'إمكانيات المنصة من التمهيدي إلى البحث المتقدم',
    titleEn: 'Platform Capabilities',
    sortOrder: 3,
    contentJson: {
      highlights: [
        'تصنيفات ومستويات مرنة تُدار من لوحة التحكم دون قيود جامدة',
        'حماية عمرية إلزامية تضمن ملاءمة المحتوى لكل فئة عمرية',
        'دورة نشر احترافية وإصدارات متعددة لا تعطل النسخ المنشورة',
      ],
    },
  },
  {
    sectionKey: 'how_it_works',
    titleAr: 'كيف تعمل المنصة؟',
    titleEn: 'How It Works',
    sortOrder: 4,
    contentJson: {
      steps: [
        { step: 1, title: 'خصّص رحلتك', desc: 'اختر الفئة العمرية والمستوى التعليمي وتخصصاتك المفضلة عند الدخول.' },
        { step: 2, title: 'اختر الكتاب المناسب', desc: 'تبرز المكتبة الكتب الأنسب لك مع حرية تصفح كافة المجالات المسموحة لعمرك.' },
        { step: 3, title: 'تفاعل وتابع التقدم', desc: 'استمتع بالقراءة والصوت والفيديو والـ PWA مع مزامنة تقدمك سحابياً.' },
      ],
    },
  },
  {
    sectionKey: 'featured_books',
    titleAr: 'أبرز الكتب والإصدارات المعتمدة',
    titleEn: 'Featured Editions',
    sortOrder: 5,
    contentJson: { limit: 6, source: 'dynamic_catalog' },
  },
  {
    sectionKey: 'news_preview',
    titleAr: 'آخر أخبار وتحديثات منظومة درب',
    titleEn: 'Latest News & Releases',
    sortOrder: 6,
    contentJson: { limit: 3 },
  },
  {
    sectionKey: 'footer',
    titleAr: 'منظومة درب التعليمية الذكية',
    titleEn: 'Darb Educational Cloud',
    sortOrder: 7,
    contentJson: {
      copyright: 'جميع الحقوق محفوظة لمنظومة درب للكتب التفاعلية',
      links: [
        { label: 'المكتبة', href: '/library' },
        { label: 'دليل الاستخدام', href: '/guide' },
        { label: 'بوابة المؤلف', href: '/author' },
        { label: 'سياسة الخصوصية', href: '/privacy' },
        { label: 'سياسة الاستخدام', href: '/usage' },
        { label: 'الشروط والأحكام', href: '/terms' },
      ],
    },
  },
];

function resolveDefaultPublicDir(): string {
  const candidates = [
    path.resolve(process.cwd(), 'public'),
    path.resolve(process.cwd(), '../../public'),
  ];
  for (const dir of candidates) {
    if (fs.existsSync(path.join(dir, 'editions/catalog.json'))) {
      return dir;
    }
  }
  throw new Error('Could not locate public/editions/catalog.json from ' + process.cwd());
}

export async function seedDatabase(prisma: PrismaClient, options: SeedOptions): Promise<{
  adminUserId: string;
  seededBooks: string[];
  mediaAssetsCount: number;
}> {
  const publicDir = options.publicDir ?? resolveDefaultPublicDir();

  // 1. الصلاحيات الدقيقة
  const existingPerms = await prisma.permission.findMany({ select: { code: true } });
  const existingPermCodes = new Set(existingPerms.map((p) => p.code));
  const missingPerms = PERMISSIONS_SEED.filter((p) => !existingPermCodes.has(p.code));
  if (missingPerms.length > 0) {
    await prisma.permission.createMany({
      data: missingPerms.map((p) => ({
        code: p.code,
        module: p.module,
        labelAr: p.labelAr,
        labelEn: p.labelEn,
      })),
    });
  }
  const allPerms = await prisma.permission.findMany();
  const permByCode = new Map<string, string>(allPerms.map((p) => [p.code, p.id]));

  // 2. الأدوار الافتراضية وربط صلاحياتها
  const existingRoles = await prisma.role.findMany({ select: { code: true } });
  const existingRoleCodes = new Set(existingRoles.map((r) => r.code));
  const missingRoles = ROLES_SEED.filter((r) => !existingRoleCodes.has(r.code));
  if (missingRoles.length > 0) {
    await prisma.role.createMany({
      data: missingRoles.map((r) => ({
        code: r.code,
        nameAr: r.nameAr,
        nameEn: r.nameEn,
        description: r.description,
        isSystem: r.isSystem,
        isActive: true,
      })),
    });
  }
  const allRoles = await prisma.role.findMany();
  const roleByCode = new Map<string, string>(allRoles.map((r) => [r.code, r.id]));

  const existingRolePerms = await prisma.rolePermission.findMany({
    select: { roleId: true, permissionId: true },
  });
  const existingRolePermSet = new Set(
    existingRolePerms.map((rp) => `${rp.roleId}:${rp.permissionId}`)
  );
  const rolePermRows: Array<{ roleId: string; permissionId: string }> = [];
  for (const roleSeed of ROLES_SEED) {
    const roleId = roleByCode.get(roleSeed.code);
    if (!roleId) continue;
    for (const pCode of roleSeed.permissions) {
      const permissionId = permByCode.get(pCode);
      if (permissionId && !existingRolePermSet.has(`${roleId}:${permissionId}`)) {
        rolePermRows.push({ roleId, permissionId });
      }
    }
  }
  if (rolePermRows.length > 0) {
    await prisma.rolePermission.createMany({ data: rolePermRows });
  }

  // 3. المدير الأعلى الأولي (من متغيرات البيئة أو معاملات التشغيل)
  const adminEmail = options.adminEmail.trim().toLowerCase();
  const passwordHash = await hashPassword(options.adminPassword);
  const adminUser = await prisma.user.upsert({
    where: { email: adminEmail },
    create: {
      email: adminEmail,
      passwordHash,
      fullName: options.adminName ?? 'مدير منصة درب الأعلى',
      status: 'ACTIVE',
      emailVerifiedAt: new Date(),
    },
    update: {
      fullName: options.adminName ?? 'مدير منصة درب الأعلى',
      status: 'ACTIVE',
    },
  });

  await prisma.userProfile.upsert({
    where: { userId: adminUser.id },
    create: { userId: adminUser.id, onboardingCompleted: true },
    update: {},
  });

  const superAdminRoleId = roleByCode.get('SUPER_ADMIN')!;
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: adminUser.id, roleId: superAdminRoleId } },
    create: { userId: adminUser.id, roleId: superAdminRoleId, assignedById: adminUser.id },
    update: {},
  });

  // 4. التصنيفات الديناميكية
  const existingTaxes = await prisma.taxonomy.findMany({ select: { group: true, slug: true } });
  const existingTaxKeys = new Set(existingTaxes.map((t) => `${t.group}:${t.slug}`));
  const missingTaxes = TAXONOMIES_SEED.filter((t) => !existingTaxKeys.has(`${t.group}:${t.slug}`));
  if (missingTaxes.length > 0) {
    await prisma.taxonomy.createMany({
      data: missingTaxes.map((tax) => ({
        group: tax.group,
        slug: tax.slug,
        labelAr: tax.labelAr,
        labelEn: tax.labelEn,
        sortOrder: tax.sortOrder,
        isActive: true,
        rulesJson: stringifyJson(tax.rulesJson, '{}'),
      })),
    });
  }
  const allTaxonomies = await prisma.taxonomy.findMany();
  const taxonomyByKey = new Map<string, string>(
    allTaxonomies.map((row) => [`${row.group}:${row.slug}`, row.id])
  );

  // 5. الإعدادات المركزية (system_configs)
  const existingConfigs = await prisma.systemConfig.findMany({ select: { key: true } });
  const existingConfigKeys = new Set(existingConfigs.map((c) => c.key));
  const missingConfigs = SYSTEM_CONFIGS_SEED.filter((cfg) => !existingConfigKeys.has(cfg.key));
  if (missingConfigs.length > 0) {
    await prisma.systemConfig.createMany({
      data: missingConfigs.map((cfg) => ({
        key: cfg.key,
        category: cfg.category,
        valueJson: stringifyJson(cfg.valueJson, 'null'),
        description: cfg.description,
        isPublic: cfg.isPublic,
        updatedById: adminUser.id,
      })),
    });
  }

  // 6. صفحة الرئيسية (cms_pages + cms_sections) والخبر الترحيبي
  const homePage = await prisma.cmsPage.upsert({
    where: { slug: 'home' },
    create: {
      slug: 'home',
      titleAr: 'منصة درب للكتب التفاعلية ثلاثية الأبعاد',
      titleEn: 'Darb Interactive Books Platform',
      isPublished: true,
    },
    update: {},
  });

  const existingSections = await prisma.cmsSection.findMany({
    where: { pageId: homePage.id },
    select: { sectionKey: true },
  });
  const existingSectionKeys = new Set(existingSections.map((s) => s.sectionKey));
  const missingSections = HOME_SECTIONS_SEED.filter((s) => !existingSectionKeys.has(s.sectionKey));
  if (missingSections.length > 0) {
    await prisma.cmsSection.createMany({
      data: missingSections.map((sec) => ({
        pageId: homePage.id,
        sectionKey: sec.sectionKey,
        titleAr: sec.titleAr,
        titleEn: sec.titleEn,
        contentJson: stringifyJson(sec.contentJson, '{}'),
        sortOrder: sec.sortOrder,
        isVisible: true,
        updatedById: adminUser.id,
      })),
    });
  }

  await prisma.newsPost.upsert({
    where: { slug: 'welcome-darb-platform' },
    create: {
      slug: 'welcome-darb-platform',
      title: 'انطلاق البنية السحابية المرنة لمنصة درب للكتب التفاعلية',
      summary: 'إطلاق النواة الخلفية والتصنيفات الديناميكية ودعم الإصدارات المتعددة وبث الوسائط.',
      bodyMd:
        'تتيح منصة درب في بنيتها الجديدة إدارة التصنيفات والمستويات من التمهيدي إلى البروفيسوراه، مع مراجعة علمية وتوثيق للملكية الفكرية وتجربة قراءة ثلاثية الأبعاد.',
      status: 'PUBLISHED',
      publishedAt: new Date(),
      authorId: adminUser.id,
    },
    update: {},
  });

  // 7. ترحيل الكتابين الحاليين من public/editions/
  const catalogRaw = JSON.parse(
    fs.readFileSync(path.join(publicDir, 'editions/catalog.json'), 'utf8')
  );
  const catalog = parseCatalogData(catalogRaw);

  const editionTaxonomyMap: Record<string, string[]> = {
    'epic-v1': [
      'age_group:all-ages',
      'education_level:technical-vocational',
      'education_level:bachelor',
      'education_level:general-reading',
      'domain:software-engineering',
      'domain:stories-novels',
      'book_type:epic-story',
      'book_type:interactive-book',
    ],
    'anatomical-book': [
      'age_group:all-ages',
      'education_level:technical-vocational',
      'education_level:bachelor',
      'education_level:master',
      'domain:software-engineering',
      'book_type:technical-reference',
      'book_type:interactive-book',
    ],
    'interactive-showcase': [
      'age_group:all-ages',
      'education_level:primary',
      'education_level:high-school',
      'education_level:bachelor',
      'education_level:general-reading',
      'domain:math-physics',
      'domain:history-geography',
      'domain:arabic-quran',
      'domain:software-engineering',
      'domain:scientific-magazines',
      'book_type:interactive-lab',
      'book_type:interactive-book',
    ],
  };

  const seededBooks: string[] = [];
  let mediaAssetsCount = 0;

  for (const meta of catalog.editions) {
    const relDataFile = normalizeDataFile(meta.dataFile).replace(/^\.\//, '');
    const editionRaw = JSON.parse(fs.readFileSync(path.join(publicDir, relDataFile), 'utf8'));
    const editionData = parseEditionData(editionRaw);

    const book = await prisma.book.upsert({
      where: { slug: meta.id },
      create: {
        slug: meta.id,
        title: editionData.title || meta.title,
        subtitle: meta.subtitle || editionData.subtitle || null,
        description: meta.description || null,
        badge: meta.badge || null,
        badgeColor: meta.badgeColor || null,
        theme: meta.theme || 'royal-gold',
        direction: editionData.direction || 'rtl',
        status: 'PUBLISHED',
        authorId: adminUser.id,
        metadataJson: stringifyJson({
          releaseDate: meta.releaseDate,
          legacyStatus: meta.status,
        }),
      },
      update: {
        title: editionData.title || meta.title,
        subtitle: meta.subtitle || editionData.subtitle || null,
        description: meta.description || null,
        badge: meta.badge || null,
        badgeColor: meta.badgeColor || null,
        theme: meta.theme || 'royal-gold',
        status: 'PUBLISHED',
      },
    });

    const cleanRelAssetDir = (raw?: string): string => {
      const trimmed = raw?.trim();
      if (!trimmed) return '';
      return normalizeAssetDir(trimmed)
        .replace(/^[./]+/, '')
        .replace(/\/+$/, '');
    };
    const audioDir = cleanRelAssetDir(meta.audioDir);
    const videoDir = cleanRelAssetDir(meta.videoDir);

    const version = await prisma.bookVersion.upsert({
      where: { bookId_versionNumber: { bookId: book.id, versionNumber: 1 } },
      create: {
        bookId: book.id,
        versionNumber: 1,
        versionLabel: 'v1',
        sourceFormat: 'json',
        canonicalJsonUrl: relDataFile,
        canonicalDataJson: stringifyJson(editionRaw, '{}'),
        audioDir: audioDir || null,
        videoDir: videoDir || null,
        chaptersCount: meta.chaptersCount,
        spreadsCount: meta.spreadsCount,
        audioTracksCount: meta.audioTracksCount,
        videosCount: meta.videosCount,
        ipDeclarationSigned: true,
        status: 'PUBLISHED',
        submittedAt: new Date(),
        publishedAt: new Date(),
      },
      update: {
        canonicalDataJson: stringifyJson(editionRaw, '{}'),
        chaptersCount: meta.chaptersCount,
        spreadsCount: meta.spreadsCount,
        audioTracksCount: meta.audioTracksCount,
        videosCount: meta.videosCount,
        status: 'PUBLISHED',
      },
    });

    await prisma.book.update({
      where: { id: book.id },
      data: { activeVersionId: version.id },
    });

    const taxKeys = editionTaxonomyMap[meta.id] ?? ['age_group:all-ages', 'book_type:interactive-book'];
    const existingBookTaxes = await prisma.bookTaxonomy.findMany({
      where: { bookId: book.id },
      select: { taxonomyId: true },
    });
    const existingBookTaxIds = new Set(existingBookTaxes.map((bt) => bt.taxonomyId));
    const bookTaxRows = taxKeys
      .map((key) => taxonomyByKey.get(key))
      .filter((tid): tid is string => Boolean(tid))
      .filter((tid) => !existingBookTaxIds.has(tid))
      .map((taxonomyId) => ({ bookId: book.id, taxonomyId }));
    if (bookTaxRows.length > 0) {
      await prisma.bookTaxonomy.createMany({ data: bookTaxRows });
    }

    // فهرسة ملفات الصوت والفيديو الموجودة لهذا الإصدار دفعة واحدة
    const dirsToScan: Array<{ dir: string; type: MediaAssetType }> = [
      { dir: audioDir, type: 'AUDIO' },
      { dir: videoDir, type: 'VIDEO' },
    ];

    const mediaRows: Array<{
      bookVersionId: string;
      assetType: MediaAssetType;
      r2Key: string;
      mimeType: string;
      sizeBytes: number;
    }> = [];

    for (const entry of dirsToScan) {
      const cleanRelDir = entry.dir.replace(/^[./]+/, '').replace(/\/+$/, '');
      if (!cleanRelDir) continue;
      const fullDir = path.join(publicDir, cleanRelDir);
      if (!fs.existsSync(fullDir)) continue;

      const files = fs.readdirSync(fullDir).sort();
      for (const fileName of files) {
        const fullFile = path.join(fullDir, fileName);
        const stat = fs.statSync(fullFile);
        if (!stat.isFile()) continue;

        const r2Key = `${cleanRelDir}/${fileName}`;
        const mimeType = inferMimeType(r2Key);

        if (options.syncMediaToStorage && options.storage) {
          const buf = fs.readFileSync(fullFile);
          await options.storage.putObject({ key: r2Key, body: buf, contentType: mimeType });
        }

        mediaRows.push({
          bookVersionId: version.id,
          assetType: entry.type,
          r2Key,
          mimeType,
          sizeBytes: stat.size,
        });
      }
    }

    if (mediaRows.length > 0) {
      const existingAssets = await prisma.mediaAsset.findMany({
        select: { r2Key: true },
      });
      const seenR2Keys = new Set(existingAssets.map((a) => a.r2Key));
      const newMediaRows: typeof mediaRows = [];
      for (const row of mediaRows) {
        if (seenR2Keys.has(row.r2Key)) continue;
        seenR2Keys.add(row.r2Key);
        newMediaRows.push(row);
      }
      if (newMediaRows.length > 0) {
        await prisma.mediaAsset.createMany({ data: newMediaRows });
        mediaAssetsCount += newMediaRows.length;
      }
    }

    seededBooks.push(meta.id);
  }

  await recordAuditLog(prisma, {
    actorId: adminUser.id,
    action: 'system.seed',
    targetType: 'system',
    targetId: 'bootstrap',
    metadata: { seededBooks, mediaAssetsCount },
  });

  return { adminUserId: adminUser.id, seededBooks, mediaAssetsCount };
}
