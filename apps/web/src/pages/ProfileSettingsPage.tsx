import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import type { FontScale, ThemeMode } from '@darb/book-schema';
import { ApiError, apiRequest } from '../lib/apiClient';
import { usePortal } from '../lib/portalContext';

export const ProfileSettingsPage: React.FC = () => {
  const {
    mode,
    apiBase,
    user,
    taxonomies,
    theme,
    fontScale,
    setTheme,
    setFontScale,
    refreshUser,
    showToast,
  } = usePortal();

  const ageGroups = (taxonomies.age_group ?? []).filter((t) => t.isActive);
  const educationLevels = (taxonomies.education_level ?? []).filter((t) => t.isActive);
  const domains = (taxonomies.domain ?? []).filter((t) => t.isActive);
  const bookTypes = (taxonomies.book_type ?? []).filter((t) => t.isActive);

  const [ageGroupId, setAgeGroupId] = useState(user?.profile?.ageGroupId ?? '');
  const [educationLevelId, setEducationLevelId] = useState(user?.profile?.educationLevelId ?? '');
  const [preferredIds, setPreferredIds] = useState<string[]>(
    user?.profile?.preferredTaxonomyIds ?? []
  );
  const [uiTheme, setUiTheme] = useState<ThemeMode>(theme);
  const [uiFont, setUiFont] = useState<FontScale>(fontScale);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (mode !== 'api' || !user) {
    return (
      <main className="portal-main">
        <div className="portal-card" style={{ maxWidth: 520, margin: '24px auto' }}>
          <h2>⚙️ إعدادات الحساب</h2>
          <p>يرجى تسجيل الدخول مع توفر خادم API لتخصيص ملفك وحفظ التفضيلات سحابياً.</p>
          <Link to="/login" className="portal-btn primary">
            تسجيل الدخول
          </Link>
        </div>
      </main>
    );
  }

  const togglePref = (id: string) => {
    setPreferredIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await apiRequest('/api/v1/auth/onboarding', {
        method: 'PUT',
        apiBase,
        body: {
          ageGroupId: ageGroupId || null,
          educationLevelId: educationLevelId || null,
          preferredTaxonomyIds: preferredIds,
          uiPrefsJson: { theme: uiTheme, fontScale: uiFont },
        },
      });
      setTheme(uiTheme);
      setFontScale(uiFont);
      await refreshUser();
      showToast('تم حفظ إعدادات القراءة والتخصيص سحابياً');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="portal-main">
      <div className="portal-card" style={{ maxWidth: 740, margin: '12px auto' }}>
        <h1>⚙️ إعدادات المستخدم وتفضيلات القراءة</h1>
        <p>
          الحساب: <strong>{user.fullName}</strong> ({user.email}) — الأدوار:{' '}
          {user.roles.join('، ')}
        </p>

        {error && <div className="portal-error-box">{error}</div>}

        <form className="portal-form" onSubmit={(e) => void handleSave(e)}>
          <div className="portal-field">
            <label htmlFor="settingsAgeGroup">الفئة العمرية</label>
            <select
              id="settingsAgeGroup"
              className="portal-select"
              value={ageGroupId}
              onChange={(e) => setAgeGroupId(e.target.value)}
            >
              <option value="">غير محدد</option>
              {ageGroups.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.labelAr}
                </option>
              ))}
            </select>
          </div>

          <div className="portal-field">
            <label htmlFor="settingsEduLevel">المستوى التعليمي</label>
            <select
              id="settingsEduLevel"
              className="portal-select"
              value={educationLevelId}
              onChange={(e) => setEducationLevelId(e.target.value)}
            >
              <option value="">غير محدد</option>
              {educationLevels.map((lvl) => (
                <option key={lvl.id} value={lvl.id}>
                  {lvl.labelAr}
                </option>
              ))}
            </select>
          </div>

          <div className="portal-field">
            <label>التخصصات وأنواع الكتب المفضلة</label>
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

          <div className="portal-grid">
            <div className="portal-field">
              <label htmlFor="settingsTheme">ثيم القراءة الافتراضي</label>
              <select
                id="settingsTheme"
                className="portal-select"
                value={uiTheme}
                onChange={(e) => setUiTheme(e.target.value as ThemeMode)}
              >
                <option value="sepia">مخطوطة كلاسيكية (Sepia)</option>
                <option value="dark">الوضع الليلي (Dark)</option>
                <option value="light">الوضع النهاري (Light)</option>
              </select>
            </div>

            <div className="portal-field">
              <label htmlFor="settingsFontScale">حجم خط القراءة</label>
              <select
                id="settingsFontScale"
                className="portal-select"
                value={uiFont}
                onChange={(e) => setUiFont(e.target.value as FontScale)}
              >
                <option value="sm">صغير</option>
                <option value="md">متزن</option>
                <option value="lg">كبير</option>
              </select>
            </div>
          </div>

          <button type="submit" className="portal-btn primary" disabled={saving}>
            {saving ? 'جاري التحديث...' : 'حفظ التغييرات'}
          </button>
        </form>
      </div>
    </main>
  );
};
