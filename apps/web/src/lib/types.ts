import type { EditionMeta, FontScale, ThemeMode } from '@darb/book-schema';

export type PortalMode = 'api' | 'static';

export interface TaxonomyItem {
  id: string;
  group: string;
  slug: string;
  labelAr: string;
  labelEn?: string | null;
  description?: string | null;
  parentId?: string | null;
  sortOrder: number;
  isActive: boolean;
  rulesJson: Record<string, unknown>;
}

export interface CmsSectionItem {
  id: string;
  pageId: string;
  sectionKey: string;
  titleAr: string;
  titleEn?: string | null;
  contentJson: Record<string, unknown>;
  sortOrder: number;
  isVisible: boolean;
  updatedAt?: string;
}

export interface CmsPageItem {
  id: string;
  slug: string;
  titleAr: string;
  titleEn?: string | null;
  seoJson: Record<string, unknown>;
  isPublished: boolean;
  sections: CmsSectionItem[];
}

export interface NewsPostItem {
  id: string;
  slug: string;
  title: string;
  summary?: string | null;
  bodyMd: string;
  coverUrl?: string | null;
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  publishedAt?: string | null;
  createdAt?: string;
}

export interface PortalUserProfile {
  ageGroupId: string | null;
  ageGroup: TaxonomyItem | null;
  educationLevelId: string | null;
  educationLevel: TaxonomyItem | null;
  preferredTaxonomyIds: string[];
  preferredTaxonomies: TaxonomyItem[];
  onboardingCompleted: boolean;
  uiPrefsJson: {
    theme?: ThemeMode;
    fontScale?: FontScale;
    [key: string]: unknown;
  };
}

export interface PortalUser {
  id: string;
  email: string;
  fullName: string;
  status: string;
  roles: string[];
  permissions: string[];
  profile: PortalUserProfile | null;
}

export interface PortalBookItem {
  id: string;
  slug: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  badge?: string | null;
  badgeColor?: string | null;
  theme: string;
  direction: 'rtl' | 'ltr';
  coverUrl?: string | null;
  minAge: number;
  isRecommended: boolean;
  matchScore: number;
  taxonomies: TaxonomyItem[];
  activeVersion: {
    id: string;
    versionNumber: number;
    versionLabel: string;
    audioDir?: string | null;
    videoDir?: string | null;
    chaptersCount: number;
    spreadsCount: number;
    audioTracksCount: number;
    videosCount: number;
    publishedAt?: string | null;
  } | null;
  legacyMeta?: EditionMeta;
}

export interface BootstrapPayload {
  configs: Record<string, unknown>;
  taxonomies: Record<string, TaxonomyItem[]>;
  homePage: {
    slug: string;
    titleAr: string;
    titleEn?: string | null;
    seoJson: Record<string, unknown>;
    sections: CmsSectionItem[];
  } | null;
  latestNews: NewsPostItem[];
}

export interface PermissionDto {
  id: string;
  code: string;
  module: string;
  labelAr: string;
  labelEn?: string | null;
  description?: string | null;
}

export interface RoleDto {
  id: string;
  code: string;
  nameAr: string;
  nameEn?: string | null;
  description?: string | null;
  isSystem: boolean;
  isActive: boolean;
  usersCount: number;
  permissions: PermissionDto[];
}

export interface AdminUserDto {
  id: string;
  email: string;
  fullName: string;
  status: 'ACTIVE' | 'PENDING_VERIFICATION' | 'PENDING_APPROVAL' | 'SUSPENDED';
  createdAt: string;
  roles: Array<{ id: string; code: string; nameAr: string }>;
  profile: {
    onboardingCompleted: boolean;
    ageGroup: { id: string; slug: string; labelAr: string } | null;
    educationLevel: { id: string; slug: string; labelAr: string } | null;
  } | null;
}

export interface AuditLogDto {
  id: string;
  actorId: string | null;
  action: string;
  targetType: string;
  targetId: string;
  metadataJson: Record<string, unknown>;
  ipAddress?: string | null;
  createdAt: string;
  actor: { id: string; email: string; fullName: string } | null;
}
