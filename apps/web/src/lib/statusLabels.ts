import type { PublicationStatusDto } from './types';

export const PUBLICATION_STATUS_META: Record<
  PublicationStatusDto,
  { labelAr: string; bg: string; color: string; border: string }
> = {
  DRAFT: {
    labelAr: 'مسودة (غير منشور)',
    bg: 'rgba(148, 163, 184, 0.14)',
    color: '#cbd5e1',
    border: 'rgba(148, 163, 184, 0.35)',
  },
  SUBMITTED: {
    labelAr: 'مرسل للمراجعة',
    bg: 'rgba(56, 189, 248, 0.14)',
    color: '#38bdf8',
    border: 'rgba(56, 189, 248, 0.45)',
  },
  UNDER_REVIEW: {
    labelAr: 'قيد المراجعة العلمية',
    bg: 'rgba(250, 204, 21, 0.15)',
    color: '#facc15',
    border: 'rgba(250, 204, 21, 0.45)',
  },
  CHANGES_REQUESTED: {
    labelAr: 'مطلوب تعديلات',
    bg: 'rgba(251, 146, 60, 0.16)',
    color: '#fb923c',
    border: 'rgba(251, 146, 60, 0.45)',
  },
  PUBLISHED: {
    labelAr: 'معتمد ومنشور',
    bg: 'rgba(34, 197, 94, 0.15)',
    color: '#4ade80',
    border: 'rgba(34, 197, 94, 0.45)',
  },
  REJECTED: {
    labelAr: 'مرفوض',
    bg: 'rgba(239, 68, 68, 0.15)',
    color: '#f87171',
    border: 'rgba(239, 68, 68, 0.45)',
  },
  ARCHIVED: {
    labelAr: 'مؤرشف (إصدار سابق)',
    bg: 'rgba(100, 116, 139, 0.15)',
    color: '#94a3b8',
    border: 'rgba(100, 116, 139, 0.35)',
  },
};

export const TAXONOMY_GROUP_LABELS: Record<string, string> = {
  age_group: 'الفئة العمرية',
  education_level: 'المستوى التعليمي',
  domain: 'التخصص / المجال',
  book_type: 'نوع الكتاب',
};
