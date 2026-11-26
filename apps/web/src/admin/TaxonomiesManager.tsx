import React, { useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../lib/apiClient';
import { usePortal } from '../lib/portalContext';
import type { TaxonomyItem } from '../lib/types';

export const TaxonomiesManager: React.FC = () => {
  const { apiBase, refreshPortal, showToast } = usePortal();
  const [items, setItems] = useState<TaxonomyItem[]>([]);
  const [filterGroup, setFilterGroup] = useState('');
  const [group, setGroup] = useState('education_level');
  const [slug, setSlug] = useState('');
  const [labelAr, setLabelAr] = useState('');
  const [labelEn, setLabelEn] = useState('');
  const [sortOrder, setSortOrder] = useState(10);
  const [rulesJsonText, setRulesJsonText] = useState('{}');
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

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const rulesJson = JSON.parse(rulesJsonText) as Record<string, unknown>;
      await apiRequest('/api/v1/taxonomies', {
        method: 'POST',
        apiBase,
        body: {
          group: group.trim(),
          slug: slug.trim(),
          labelAr: labelAr.trim(),
          labelEn: labelEn.trim() || null,
          sortOrder: Number(sortOrder),
          isActive: true,
          rulesJson,
        },
      });
      showToast('تمت إضافة التصنيف بنجاح وتحديث القوائم فوراً');
      setSlug('');
      setLabelAr('');
      setLabelEn('');
      setRulesJsonText('{}');
      await loadItems();
      await refreshPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر إضافة التصنيف');
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
              <label htmlFor="taxGroupInput">المجموعة (مرنة: age_group / education_level / domain / book_type / مخصصة)</label>
              <input
                id="taxGroupInput"
                className="portal-input"
                dir="ltr"
                value={group}
                onChange={(e) => setGroup(e.target.value)}
                required
              />
            </div>
            <div className="portal-field">
              <label htmlFor="taxSlugInput">المعرّف (`slug`)</label>
              <input
                id="taxSlugInput"
                className="portal-input"
                dir="ltr"
                placeholder="astronomy-space"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                required
              />
            </div>
            <div className="portal-field">
              <label htmlFor="taxLabelArInput">التسمية بالعربية</label>
              <input
                id="taxLabelArInput"
                className="portal-input"
                value={labelAr}
                onChange={(e) => setLabelAr(e.target.value)}
                required
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
            <div className="portal-field">
              <label>الترتيب</label>
              <input
                type="number"
                className="portal-input"
                value={sortOrder}
                onChange={(e) => setSortOrder(Number(e.target.value))}
              />
            </div>
            <div className="portal-field">
              <label>قواعد إضافية JSON (مثل minAge / maxAge)</label>
              <input
                className="portal-input"
                dir="ltr"
                value={rulesJsonText}
                onChange={(e) => setRulesJsonText(e.target.value)}
              />
            </div>
          </div>
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
                {g}
              </option>
            ))}
          </select>
        </div>

        <div className="portal-table-wrap">
          <table className="portal-table">
            <thead>
              <tr>
                <th>المجموعة</th>
                <th>المعرّف</th>
                <th>الاسم العربي</th>
                <th>الترتيب</th>
                <th>الحالة</th>
                <th>تحكم</th>
              </tr>
            </thead>
            <tbody>
              {displayed.map((item) => (
                <tr key={item.id}>
                  <td><code>{item.group}</code></td>
                  <td><code>{item.slug}</code></td>
                  <td>{item.labelAr}</td>
                  <td>{item.sortOrder}</td>
                  <td>{item.isActive ? '🟢 مفعل' : '🔴 معطل'}</td>
                  <td className="portal-nav">
                    <button
                      type="button"
                      className="portal-btn"
                      onClick={() => void handleMoveSort(item, -1)}
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      className="portal-btn"
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
