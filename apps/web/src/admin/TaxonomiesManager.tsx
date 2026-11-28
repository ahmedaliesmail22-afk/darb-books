import React, { useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../lib/apiClient';
import {
  getTaxonomyGroupLabelAr,
  slugifyArabicToSlug,
  slugifyArabicToSnakeKey,
  TAXONOMY_GROUP_OPTIONS,
} from '../lib/arabicLabels';
import { usePortal } from '../lib/portalContext';
import type { TaxonomyItem } from '../lib/types';

interface RuleEntryDraft {
  key: string;
  value: string;
}

export const TaxonomiesManager: React.FC = () => {
  const { apiBase, refreshPortal, showToast } = usePortal();
  const [items, setItems] = useState<TaxonomyItem[]>([]);
  const [filterGroup, setFilterGroup] = useState('');

  // نموذج إضافة تصنيف جديد
  const [groupPreset, setGroupPreset] = useState<string>('education_level');
  const [customGroupInput, setCustomGroupInput] = useState('');
  const [labelAr, setLabelAr] = useState('');
  const [labelEn, setLabelEn] = useState('');
  const [sortOrder, setSortOrder] = useState(10);
  const [slugOverride, setSlugOverride] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);

  // حقول القواعد المرئية (بدلاً من rulesJson)
  const [minAge, setMinAge] = useState('0');
  const [maxAge, setMaxAge] = useState('');
  const [ageRank, setAgeRank] = useState('0');
  const [levelOrder, setLevelOrder] = useState('1');
  const [extraRules, setExtraRules] = useState<RuleEntryDraft[]>([]);

  const [error, setError] = useState<string | null>(null);

  const loadItems = useCallback(async () => {
    try {
      const res = await apiRequest<{ items: TaxonomyItem[] }>(
        '/api/v1/taxonomies?includeInactive=true',
        { apiBase }
      );
      setItems(res.items);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل التصنيفات');
    }
  }, [apiBase]);

  useEffect(() => {
    void loadItems();
  }, [loadItems]);

  const effectiveGroup =
    groupPreset === '__custom__'
      ? slugifyArabicToSnakeKey(customGroupInput, 'group') || customGroupInput.trim()
      : groupPreset;

  const autoSlug = slugifyArabicToSlug(labelAr, 'tax');
  const effectiveSlug = slugTouched ? slugOverride.trim() : autoSlug;

  const buildRulesObject = (): Record<string, unknown> => {
    const result: Record<string, unknown> = {};
    if (effectiveGroup === 'age_group') {
      const parsedMin = Number(minAge);
      result.minAge = Number.isFinite(parsedMin) && parsedMin >= 0 ? parsedMin : 0;
      const trimmedMax = maxAge.trim();
      result.maxAge = trimmedMax === '' ? null : Number(trimmedMax);
      const parsedRank = Number(ageRank);
      result.ageRank = Number.isFinite(parsedRank) && parsedRank >= 0 ? parsedRank : 0;
    } else if (effectiveGroup === 'education_level' && levelOrder.trim() !== '') {
      const parsedOrder = Number(levelOrder);
      if (Number.isFinite(parsedOrder)) {
        result.levelOrder = parsedOrder;
      }
    }

    for (const pair of extraRules) {
      const k = pair.key.trim();
      const v = pair.value.trim();
      if (!k || !v) continue;
      if (v === 'true') result[k] = true;
      else if (v === 'false') result[k] = false;
      else if (/^-?\d+(\.\d+)?$/.test(v)) result[k] = Number(v);
      else result[k] = v;
    }
    return result;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const finalGroup = effectiveGroup.trim();
    const finalSlug = effectiveSlug || autoSlug;
    if (!finalGroup || finalGroup.length < 2) {
      setError('يرجى تحديد المجموعة أو كتابة اسم واضح للمجموعة المخصصة.');
      return;
    }
    if (!finalSlug) {
      setError('يرجى كتابة التسمية بالعربية لتوليد المعرّف تلقائياً.');
      return;
    }

    try {
      const rulesJson = buildRulesObject();
      await apiRequest('/api/v1/taxonomies', {
        method: 'POST',
        apiBase,
        body: {
          group: finalGroup,
          slug: finalSlug,
          labelAr: labelAr.trim(),
          labelEn: labelEn.trim() || null,
          sortOrder: Number(sortOrder),
          isActive: true,
          rulesJson,
        },
      });
      showToast('تمت إضافة التصنيف بنجاح وتحديث القوائم فوراً');
      setLabelAr('');
      setLabelEn('');
      setSlugOverride('');
      setSlugTouched(false);
      setMinAge('0');
      setMaxAge('');
      setAgeRank('0');
      setExtraRules([]);
      await loadItems();
      await refreshPortal();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إضافة التصنيف');
    }
  };

  const handleToggleActive = async (item: TaxonomyItem) => {
    await apiRequest(`/api/v1/taxonomies/${item.id}`, {
      method: 'PATCH',
      apiBase,
      body: { isActive: !item.isActive },
    });
    showToast(item.isActive ? 'تم تعطيل التصنيف' : 'تم تفعيل التصنيف');
    await loadItems();
    await refreshPortal();
  };

  const handleMoveSort = async (item: TaxonomyItem, delta: number) => {
    await apiRequest('/api/v1/taxonomies/reorder', {
      method: 'POST',
      apiBase,
      body: {
        items: [{ id: item.id, sortOrder: item.sortOrder + delta }],
      },
    });
    await loadItems();
    await refreshPortal();
  };

  const formatRulesSummaryAr = (item: TaxonomyItem): string => {
    const r = item.rulesJson ?? {};
    if (item.group === 'age_group') {
      const min = typeof r.minAge === 'number' ? r.minAge : 0;
      const max = typeof r.maxAge === 'number' ? `${r.maxAge} سنة` : 'فما فوق';
      const rank = typeof r.ageRank === 'number' ? ` • رتبة التصفية: ${r.ageRank}` : '';
      return `من ${min} إلى ${max}${rank}`;
    }
    const entries = Object.entries(r).filter(([k]) => k !== 'levelOrder');
    if (typeof r.levelOrder === 'number' && entries.length === 0) {
      return `ترتيب المستوى: ${r.levelOrder}`;
    }
    if (entries.length === 0) return '—';
    return entries.map(([k, v]) => `${k}: ${String(v)}`).join(' • ');
  };

  const groups = Array.from(new Set(items.map((i) => i.group)));
  const displayed = filterGroup ? items.filter((i) => i.group === filterGroup) : items;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && <div className="portal-error-box">{error}</div>}

      <div className="portal-card">
        <h3>➕ إضافة تصنيف أو مستوى تعليمي أو مجموعة مخصصة</h3>
        <form className="portal-form" onSubmit={(e) => void handleCreate(e)}>
          <div className="portal-grid">
            <div className="portal-field">
              <label htmlFor="taxGroupSelect">المجموعة</label>
              <select
                id="taxGroupSelect"
                className="portal-select"
                value={groupPreset}
                onChange={(e) => setGroupPreset(e.target.value)}
              >
                {TAXONOMY_GROUP_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.labelAr}
                  </option>
                ))}
                <option value="__custom__">مجموعة مخصصة أخرى</option>
              </select>
            </div>

            {groupPreset === '__custom__' && (
              <div className="portal-field">
                <label htmlFor="taxGroupInput">اسم المجموعة المخصصة</label>
                <input
                  id="taxGroupInput"
                  className="portal-input"
                  placeholder="مثال: المسارات المهنية"
                  value={customGroupInput}
                  onChange={(e) => setCustomGroupInput(e.target.value)}
                  required
                />
              </div>
            )}

            <div className="portal-field">
              <label htmlFor="taxLabelArInput">التسمية بالعربية</label>
              <input
                id="taxLabelArInput"
                className="portal-input"
                placeholder="مثال: علوم الفضاء والفلك"
                value={labelAr}
                onChange={(e) => setLabelAr(e.target.value)}
                required
              />
            </div>

            <div className="portal-field">
              <label htmlFor="taxSortInput">ترتيب الظهور</label>
              <input
                id="taxSortInput"
                type="number"
                className="portal-input"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
          </div>

          {effectiveGroup === 'age_group' ? (
            <div className="portal-repeater-card">
              <strong style={{ fontSize: '0.92rem' }}>ضوابط الفئة العمرية</strong>
              <div className="portal-grid">
                <div className="portal-field">
                  <label>الحد الأدنى للعمر</label>
                  <input
                    type="number"
                    min={0}
                    className="portal-input"
                    value={minAge}
                    onChange={(e) => setMinAge(e.target.value)}
                  />
                </div>
                <div className="portal-field">
                  <label>الحد الأقصى للعمر (يُترك فارغاً إذا كان مفتوحاً)</label>
                  <input
                    type="number"
                    min={0}
                    className="portal-input"
                    placeholder="مفتوح"
                    value={maxAge}
                    onChange={(e) => setMaxAge(e.target.value)}
                  />
                </div>
                <div className="portal-field">
                  <label>رتبة التصفية العمرية</label>
                  <input
                    type="number"
                    min={0}
                    className="portal-input"
                    value={ageRank}
                    onChange={(e) => setAgeRank(e.target.value)}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="portal-repeater-card">
              <div className="portal-section-title" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: '0.95rem' }}>خصائص إضافية اختيارية</span>
                <button
                  type="button"
                  className="portal-btn"
                  onClick={() => setExtraRules((prev) => [...prev, { key: '', value: '' }])}
                >
                  ➕ إضافة خاصية
                </button>
              </div>
              {effectiveGroup === 'education_level' && (
                <div className="portal-field" style={{ maxWidth: 260 }}>
                  <label>ترتيب المستوى التعليمي</label>
                  <input
                    type="number"
                    min={1}
                    className="portal-input"
                    value={levelOrder}
                    onChange={(e) => setLevelOrder(e.target.value)}
                  />
                </div>
              )}
              {extraRules.map((row, idx) => (
                <div key={idx} className="portal-grid" style={{ alignItems: 'end' }}>
                  <div className="portal-field">
                    <label>اسم الخاصية</label>
                    <input
                      className="portal-input"
                      placeholder="مثال: الشارة أو الرمز"
                      value={row.key}
                      onChange={(e) =>
                        setExtraRules((prev) =>
                          prev.map((item, i) => (i === idx ? { ...item, key: e.target.value } : item))
                        )
                      }
                    />
                  </div>
                  <div className="portal-field">
                    <label>القيمة</label>
                    <input
                      className="portal-input"
                      value={row.value}
                      onChange={(e) =>
                        setExtraRules((prev) =>
                          prev.map((item, i) =>
                            i === idx ? { ...item, value: e.target.value } : item
                          )
                        )
                      }
                    />
                  </div>
                  <button
                    type="button"
                    className="portal-btn danger"
                    onClick={() => setExtraRules((prev) => prev.filter((_, i) => i !== idx))}
                  >
                    حذف
                  </button>
                </div>
              ))}
            </div>
          )}

          <details className="portal-advanced-details">
            <summary>إعدادات تقنية متقدمة (توليد المعرّف تلقائياً)</summary>
            <div className="portal-grid">
              <div className="portal-field">
                <label htmlFor="taxSlugInput">المعرّف البرمجي اللاتيني</label>
                <input
                  id="taxSlugInput"
                  className="portal-input"
                  dir="ltr"
                  value={effectiveSlug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlugOverride(e.target.value);
                  }}
                />
              </div>
              <div className="portal-field">
                <label>التسمية بالإنجليزية (اختياري)</label>
                <input
                  className="portal-input"
                  dir="ltr"
                  value={labelEn}
                  onChange={(e) => setLabelEn(e.target.value)}
                />
              </div>
            </div>
          </details>

          <button type="submit" id="btnAddTaxonomy" className="portal-btn primary">
            إضافة التصنيف
          </button>
        </form>
      </div>

      <div className="portal-card">
        <div className="portal-section-title">
          <span>🏷️ التصنيفات الحالية ({displayed.length})</span>
          <select
            className="portal-select"
            style={{ width: 'auto' }}
            value={filterGroup}
            onChange={(e) => setFilterGroup(e.target.value)}
          >
            <option value="">جميع المجموعات</option>
            {groups.map((g) => (
              <option key={g} value={g}>
                {getTaxonomyGroupLabelAr(g)}
              </option>
            ))}
          </select>
        </div>

        <div className="portal-table-wrap">
          <table className="portal-table">
            <thead>
              <tr>
                <th>المجموعة</th>
                <th>الاسم العربي</th>
                <th>الضوابط والخصائص</th>
                <th>الترتيب</th>
                <th>الحالة</th>
                <th>تحكم</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((item) => (
                <tr key={item.id}>
                  <td>{getTaxonomyGroupLabelAr(item.group)}</td>
                  <td>{item.labelAr}</td>
                  <td>{formatRulesSummaryAr(item)}</td>
                  <td>{item.sortOrder}</td>
                  <td>{item.isActive ? '🟢 مفعل' : '🔴 معطل'}</td>
                  <td className="portal-nav">
                    <button
                      type="button"
                      className="portal-btn"
                      title="تقديم في الترتيب"
                      onClick={() => void handleMoveSort(item, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="portal-btn"
                      title="تأخير في الترتيب"
                      onClick={() => void handleMoveSort(item, 1)}
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      className="portal-btn"
                      onClick={() => void handleToggleActive(item)}
                    >
                      {item.isActive ? 'تعطيل' : 'تفعيل'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
