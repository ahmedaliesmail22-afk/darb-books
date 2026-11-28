import type { Taxonomy } from '@prisma/client';
import { parseJson } from '../lib/jsonCodec';
import type { AgePolicy } from './configService';

export interface AgeRuleShape {
  minAge?: number;
  maxAge?: number | null;
  ageRank?: number;
}

function readAgeRule(rulesJson: unknown): AgeRuleShape {
  const parsed = typeof rulesJson === 'string' ? parseJson<unknown>(rulesJson, {}) : rulesJson;
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {};
  }
  const obj = parsed as Record<string, unknown>;
  return {
    minAge: typeof obj.minAge === 'number' ? obj.minAge : undefined,
    maxAge: typeof obj.maxAge === 'number' ? obj.maxAge : obj.maxAge === null ? null : undefined,
    ageRank: typeof obj.ageRank === 'number' ? obj.ageRank : undefined,
  };
}

/**
 * يحسب الحد الأدنى للعمر المطلوب للكتاب انطلاقاً من تصنيف الفئة العمرية المرتبط به،
 * مع احترام القيمة الافتراضية من system_configs في حال لم يُحدد تصنيف عمري للكتاب.
 */
export function resolveBookMinAge(bookTaxonomies: Taxonomy[], policy: AgePolicy): number {
  const ageTaxonomies = bookTaxonomies.filter((t) => t.group === 'age_group');
  if (ageTaxonomies.length === 0) {
    return policy.unratedBookMinAge;
  }
  const minAges = ageTaxonomies
    .map((t) => readAgeRule(t.rulesJson).minAge)
    .filter((v): v is number => typeof v === 'number');
  if (minAges.length === 0) return policy.unratedBookMinAge;
  return Math.max(...minAges);
}

/**
 * يتحقق من أهلية المستخدم العمرية لكتاب محدد دون كود جامد.
 * إذا كانت الفئة العمرية للمستخدم بدون سقف أعلى (مثلاً 18+ حيث maxAge: null) يُسمح له بالكل.
 */
export function isBookAllowedForAgeGroup(
  bookTaxonomies: Taxonomy[],
  userAgeGroup: Taxonomy | null | undefined,
  policy: AgePolicy
): boolean {
  if (!policy.strictAgeGating) return true;
  const bookMinAge = resolveBookMinAge(bookTaxonomies, policy);

  if (!userAgeGroup) {
    if (!policy.enforceForGuests) return true;
    return bookMinAge <= 0;
  }

  const rule = readAgeRule(userAgeGroup.rulesJson);
  if (rule.maxAge === null) return true;
  if (typeof rule.maxAge === 'number') {
    return bookMinAge <= rule.maxAge;
  }
  if (typeof rule.minAge === 'number') {
    return bookMinAge <= rule.minAge;
  }
  return true;
}

export function computePersonalizationScore(input: {
  bookTaxonomyIds: string[];
  educationLevelId?: string | null;
  preferredTaxonomyIds: string[];
}): { matchScore: number; isRecommended: boolean } {
  let score = 0;
  if (input.educationLevelId && input.bookTaxonomyIds.includes(input.educationLevelId)) {
    score += 10;
  }
  const prefSet = new Set(input.preferredTaxonomyIds);
  for (const tid of input.bookTaxonomyIds) {
    if (prefSet.has(tid)) score += 5;
  }
  return {
    matchScore: score,
    isRecommended: score > 0,
  };
}
