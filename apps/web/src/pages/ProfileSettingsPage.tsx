import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { FontScale, ThemeMode } from '@darb/book-schema';
import { ApiError, apiRequest, setStoredTokens } from '../lib/apiClient';
import { getRoleDisplayName, THEME_LABELS } from '../lib/arabicLabels';
import { localDatabase } from '../lib/offline/localDatabase';
import { syncManager } from '../lib/offline/syncManager';
import { usePortal } from '../lib/portalContext';

export const ProfileSettingsPage: React.FC = () => {
  const {
    mode,
    apiBase,
    user,
    taxonomies,
    theme,
    fontScale,
    syncStatus,
    setTheme,
    setFontScale,
    refreshUser,
    refreshPortal,
    showToast,
  } = usePortal();
  const navigate = useNavigate();

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

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [deletingAccount, setDeletingAccount] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!user) {
    return (
      <main className="portal-main">
        <div className="portal-card" style={{ maxWidth: 520, margin: '24px auto' }}>
          <h2>⚙️ إعدادات الحساب</h2>
          <p>يرجى تسجيل الدخول مع الاتصال بالخادم الحي لتخصيص ملفك وحفظ التفضيلات سحابياً.</p>
          <div className="portal-nav">
            <Link to="/login" className="portal-btn primary">
              تسجيل الدخول
            </Link>
            <Link to="/privacy" className="portal-btn">
              🔒 سياسة الخصوصية
            </Link>
          </div>
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
      const res = await syncManager.syncProfileSettings({
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
      if (!res.queued) {
        await refreshUser();
        showToast('تم حفظ إعدادات القراءة والتخصيص سحابياً');
      } else {
        showToast('تم حفظ الإعدادات محلياً وستتم مزامنتها فور عودة الاتصال');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode !== 'api' || !syncStatus.online || apiBase === null) {
      setDeleteError('يتطلب حذف الحساب اتصالاً نشطاً بالخادم لتأكيد الإزالة النهائية.');
      return;
    }
    setDeletingAccount(true);
    setDeleteError(null);
    try {
      await apiRequest('/api/v1/auth/me', {
        method: 'DELETE',
        apiBase,
        body: deletePassword ? { password: deletePassword } : {},
      });
      setStoredTokens(null);
      await localDatabase.clearAllAccountState();
      await syncManager.refreshPendingCount();
      await refreshPortal();
      setShowDeleteModal(false);
      showToast('تم حذف حسابك وجميع بياناتك الشخصية نهائياً');
      navigate('/');
    } catch (err) {
      setDeleteError(err instanceof ApiError ? err.message : 'تعذر تنفيذ طلب حذف الحساب حالياً');
    } finally {
      setDeletingAccount(false);
    }
  };

  return (
    <main className="portal-main">
      <div className="portal-card" style={{ maxWidth: 740, margin: '12px auto' }}>
        <h1>⚙️ إعدادات المستخدم وتفضيلات القراءة</h1>
        <p>
          الحساب: <strong>{user.fullName}</strong> ({user.email}) — الأدوار:{' '}
          {user.roles.map((r) => getRoleDisplayName(r)).join('، ')}
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
                <option value="sepia">{THEME_LABELS.sepia}</option>
                <option value="dark">{THEME_LABELS.dark}</option>
                <option value="light">{THEME_LABELS.light}</option>
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

      <div
        className="portal-card"
        style={{
          maxWidth: 740,
          margin: '18px auto',
          borderColor: 'rgba(239, 68, 68, 0.45)',
        }}
      >
        <h2>🛡️ إدارة البيانات وحذف الحساب نهائياً</h2>
        <p className="portal-muted">
          وفق سياسة الخصوصية ومتطلبات المتاجر، يمكنك حذف حسابك وملفك الشخصي وتقدم القراءة وسجلات
          الدخول المرتبطة به نهائياً من الخادم ومن مخزن هذا الجهاز.
        </p>
        <div className="portal-nav">
          <button
            type="button"
            className="portal-btn danger"
            data-testid="openDeleteAccountBtn"
            onClick={() => {
              setDeleteError(null);
              setDeletePassword('');
              setShowDeleteModal(true);
            }}
          >
            🗑️ حذف حسابي وبياناتي نهائياً
          </button>
          <Link to="/privacy" className="portal-btn">
            🔒 مراجعة سياسة الخصوصية
          </Link>
        </div>
      </div>

      {showDeleteModal && (
        <div className="portal-modal-backdrop" role="dialog" aria-modal="true">
          <div className="portal-modal-card" data-testid="deleteAccountModal">
            <h3>⚠️ تأكيد الحذف النهائي للحساب</h3>
            <p>
              سيؤدي هذا الإجراء إلى إزالة حسابك (<strong>{user.email}</strong>) وتفضيلاتك وتقدم
              القراءة بشكل نهائي لا يمكن التراجع عنه.
            </p>
            {deleteError && <div className="portal-error-box">{deleteError}</div>}
            <form className="portal-form" onSubmit={(e) => void handleConfirmDeleteAccount(e)}>
              <div className="portal-field">
                <label htmlFor="deleteConfirmPass">
                  أدخل كلمة المرور لتأكيد هويتك (اختياري أثناء الجلسة النشطة)
                </label>
                <input
                  id="deleteConfirmPass"
                  type="password"
                  className="portal-input"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  placeholder="كلمة مرور الحساب"
                />
              </div>
              <div className="portal-nav">
                <button
                  type="submit"
                  className="portal-btn danger"
                  data-testid="confirmDeleteAccountBtn"
                  disabled={deletingAccount}
                >
                  {deletingAccount ? 'جاري حذف الحساب...' : 'تأكيد الحذف النهائي'}
                </button>
                <button
                  type="button"
                  className="portal-btn"
                  onClick={() => setShowDeleteModal(false)}
                  disabled={deletingAccount}
                >
                  إلغاء
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
};
