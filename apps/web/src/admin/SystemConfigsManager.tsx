import React, { useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../lib/apiClient';
import { usePortal } from '../lib/portalContext';

interface ConfigRow {
  id: string;
  key: string;
  category: string;
  valueJson: Record<string, unknown>;
  description?: string | null;
  isPublic: boolean;
}

export const SystemConfigsManager: React.FC = () => {
  const { apiBase, refreshPortal, showToast } = usePortal();
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [selectedKey, setSelectedKey] = useState('branding.portal');
  const [category, setCategory] = useState('branding');
  const [isPublic, setIsPublic] = useState(true);
  const [valueJsonText, setValueJsonText] = useState('{}');
  const [error, setError] = useState<string | null>(null);

  const loadConfigs = useCallback(async () => {
    try {
      const res = await apiRequest<{ items: ConfigRow[] }>('/api/v1/configs', { apiBase });
      setConfigs(res.items);
      const first = res.items.find((c) => c.key === 'branding.portal') ?? res.items[0];
      if (first) {
        setSelectedKey(first.key);
        setCategory(first.category);
        setIsPublic(first.isPublic);
        setValueJsonText(JSON.stringify(first.valueJson, null, 2));
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل الإعدادات');
    }
  }, [apiBase]);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  const handleSelectConfig = (row: ConfigRow) => {
    setSelectedKey(row.key);
    setCategory(row.category);
    setIsPublic(row.isPublic);
    setValueJsonText(JSON.stringify(row.valueJson, null, 2));
    setError(null);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const parsed = JSON.parse(valueJsonText) as unknown;
      await apiRequest(`/api/v1/configs/${encodeURIComponent(selectedKey)}`, {
        method: 'PUT',
        apiBase,
        body: {
          category,
          isPublic,
          valueJson: parsed,
        },
      });
      showToast(`تم حفظ إعداد «${selectedKey}» وتطبيقه على المنصة فوراً`);
      await loadConfigs();
      await refreshPortal();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر حفظ الإعداد');
    }
  };

  return (
    <div className="portal-card">
      <h3>🎨 نظام التهيئة والهوية البصرية وسياسات المنصة (`system_configs`)</h3>
      {error && <div className="portal-error-box">{error}</div>}

      <div className="portal-chips">
        {configs.map((c) => (
          <button
            key={c.key}
            type="button"
            className={`portal-chip${selectedKey === c.key ? ' selected' : ''}`}
            onClick={() => handleSelectConfig(c)}
          >
            {c.key}
          </button>
        ))}
      </div>

      <form className="portal-form" style={{ marginTop: 14 }} onSubmit={(e) => void handleSave(e)}>
        <div className="portal-grid">
          <div className="portal-field">
            <label>مفتاح الإعداد (`key`)</label>
            <input
              className="portal-input"
              dir="ltr"
              value={selectedKey}
              onChange={(e) => setSelectedKey(e.target.value)}
              required
            />
          </div>
          <div className="portal-field">
            <label>التصنيف (`category`)</label>
            <input
              className="portal-input"
              dir="ltr"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              required
            />
          </div>
        </div>

        <label>
          <input
            type="checkbox"
            checked={isPublic}
            onChange={(e) => setIsPublic(e.target.checked)}
          />{' '}
          متاح للواجهة العامة (`isPublic`)
        </label>

        <div className="portal-field">
          <label>قيمة التهيئة JSON (الهوية، الألوان، سياسة التسجيل، أو Feature Flags)</label>
          <textarea
            rows={9}
            className="portal-textarea"
            dir="ltr"
            value={valueJsonText}
            onChange={(e) => setValueJsonText(e.target.value)}
          />
        </div>

        <button type="submit" className="portal-btn primary">
          💾 حفظ التهيئة وتطبيقها فوراً
        </button>
      </form>
    </div>
  );
};
