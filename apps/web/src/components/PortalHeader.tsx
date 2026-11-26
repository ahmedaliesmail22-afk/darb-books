import React from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { usePortal } from '../lib/portalContext';
import type { ThemeMode } from '@darb/book-schema';

const ADMIN_PERMISSIONS = [
  'cms.manage',
  'news.manage',
  'taxonomies.manage',
  'configs.manage',
  'roles.manage',
  'users.manage',
  'audit.read',
];

export const PortalHeader: React.FC = () => {
  const {
    mode,
    configs,
    user,
    theme,
    setTheme,
    logout,
    hasPermission,
    showToast,
  } = usePortal();
  const navigate = useNavigate();

  const branding = (configs['branding.portal'] as Record<string, unknown> | undefined) ?? {};
  const portalTitle =
    typeof branding.portalTitle === 'string'
      ? branding.portalTitle
      : 'بوابة درب للكتب التفاعلية';
  const logoUrl = typeof branding.logoUrl === 'string' ? branding.logoUrl : './icons/icon-192.png';

  const canAccessAdmin = ADMIN_PERMISSIONS.some((p) => hasPermission(p));

  const cycleTheme = () => {
    const order: ThemeMode[] = ['sepia', 'dark', 'light'];
    const next = order[(order.indexOf(theme) + 1) % order.length];
    setTheme(next);
  };

  const themeIcon = theme === 'sepia' ? '📜' : theme === 'dark' ? '🌙' : '☀️';

  const handleLogout = async () => {
    await logout();
    showToast('تم تسجيل الخروج بنجاح');
    navigate('/');
  };

  return (
    <header className="portal-header">
      <Link to="/" className="portal-brand">
        <img src={logoUrl} alt="" onError={(e) => ((e.currentTarget.style.display = 'none'))} />
        <span>{portalTitle}</span>
      </Link>

      <nav className="portal-nav" aria-label="التنقل الرئيسي">
        <NavLink to="/" end>
          🏠 الرئيسية
        </NavLink>
        <NavLink to="/library">📚 المكتبة</NavLink>
        <NavLink to="/guide">📰 الأخبار والدليل</NavLink>

        {canAccessAdmin && (
          <NavLink to="/admin" data-testid="navAdminLink">
            ⚙️ لوحة التحكم
          </NavLink>
        )}

        {mode === 'api' && !user && (
          <>
            <NavLink to="/login">🔐 دخول</NavLink>
            <NavLink to="/register">✨ تسجيل</NavLink>
          </>
        )}

        {user && (
          <>
            <NavLink to="/settings">👤 {user.fullName}</NavLink>
            <button type="button" className="portal-btn danger" onClick={() => void handleLogout()}>
              خروج
            </button>
          </>
        )}

        <button
          type="button"
          className="portal-btn"
          onClick={cycleTheme}
          title="تبديل الثيم (مخطوطة / ليلي / فاتح)"
          aria-label="تبديل الثيم"
        >
          {themeIcon}
        </button>

        <span className="portal-mode-pill" title="حالة الاتصال بالخادم">
          {mode === 'api' ? '🟢 API حي' : '📦 عرض ثابت'}
        </span>
      </nav>
    </header>
  );
};
