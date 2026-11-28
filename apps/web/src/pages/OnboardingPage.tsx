import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ApiError } from '../lib/apiClient';
import { syncManager } from '../lib/offline/syncManager';
import { usePortal } from '../lib/portalContext';

export const OnboardingPage: React.FC = () => {
  const { apiBase, taxonomies, user, refreshUser, showToast } = usePortal();
  const navigate = useNavigate();

  const ageGroups = (taxonomies.age_group ?? []).filter((t) => t.isActive);
  const educationLevels = (taxonomies.education_level ?? []).filter((t) => t.isActive);
  const domains = (taxonomies.domain ?? []).filter((t) => t.isActive);
  const bookTypes = (taxonomies.book_type ?? []).filter((t) => t.isActive);

  const [ageGroupId, setAgeGroupId] = useState<string>(user?.profile?.ageGroupId ?? '');
  const [educationLevelId, setEducationLevelId] = useState<string>(
    user?.profile?.educationLevelId ?? ''
  );
  const [preferredIds, setPreferredIds] = useState<string[]>(
    user?.profile?.preferredTaxonomyIds ?? []
  );
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!ageGroupId && ageGroups.length > 0) {
      setAgeGroupId(ageGroups[0].id);
    }
    if (!educationLevelId && educationLevels.length > 0) {
      setEducationLevelId(educationLevels[0].id);
    }
  }, [ageGroupId, ageGroups, educationLevelId, educationLevels]);

  const togglePref = (id: string) => {
    setPreferredIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const res = await syncManager.syncProfileSettings({
        apiBase,
        body: {
          ageGroupId: ageGroupId || null,
          educationLevelId: educationLevelId || null,
          preferredTaxonomyIds: preferredIds,
        },
      });
      if (!res.queued) {
        await refreshUser();
        showToast('تم حفظ تفضيلاتك وتخصيص المكتبة بنجاح');
      } else {
        showToast('تم حفظ التفضيلات محلياً وستتم مزامنتها تلقائياً عند عودة الاتصال');
      }
      navigate('/library');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حفظ التهيئة');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="portal-main">
      <div className="portal-card" style={{ maxWidth: 740, margin: '12px auto' }}>
        <span className="portal-badge">التهيئة الذكية الأولى (من تصنيفات قاعدة البيانات)</span>
        <h1>مرحباً {user?.fullName || 'بك'} — خصّص رحلتك التعليمية</h1>
        <p>
          تُستخدم هذه الخيارات لفرض الأمان العمري وإبراز الكتب والروايات والمختبرات الأنسب لمستواك،
          ويمكنك تعديلها في أي وقت من صفحة الإعدادات.
        </p>

        {error && <div className="portal-error-box">{error}</div>}

        <form className="portal-form" onSubmit={(e) => void handleSave(e)}>
          <div className="portal-field">
            <label htmlFor="onbAgeGroup">الفئة العمرية (إلزامي لأمان المحتوى)</label>
            <select
              id="onbAgeGroup"
              className="portal-select"
              value={ageGroupId}
              onChange={(e) => setAgeGroupId(e.target.value)}
            >
              {ageGroups.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.labelAr}
                </option>
              ))}
            </select>
          </div>

          <div className="portal-field">
            <label htmlFor="onbEduLevel">المستوى التعليمي أو الدراسي</label>
            <select
              id="onbEduLevel"
              className="portal-select"
              value={educationLevelId}
              onChange={(e) => setEducationLevelId(e.target.value)}
            >
              {educationLevels.map((lvl) => (
                <option key={lvl.id} value={lvl.id}>
                  {lvl.labelAr}
                </option>
              ))}
            </select>
          </div>

          <div className="portal-field">
            <label>التخصصات والمجالات المفضلة</label>
            <div className="portal-chips">
              {[...domains, ...bookTypes].map((item) => {
                const selected = preferredIds.includes(item.id);
                return (
                  <button
                    key={item.id}
                    type="button"
                    className={`portal-chip${selected ? ' selected' : ''}`}
                    onClick={() => togglePref(item.id)}
                  >
                    {selected ? '✓ ' : ''}
                    {item.labelAr}
                  </button>
                );
              })}
            </div>
          </div>

          <button type="submit" className="portal-btn primary" disabled={saving}>
            {saving ? 'جاري الحفظ...' : 'حفظ ودخول المكتبة ←'}
          </button>
        </form>
      </div>
    </main>
  );
};
