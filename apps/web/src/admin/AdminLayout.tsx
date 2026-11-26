import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { usePortal } from '../lib/portalContext';
import { CmsAndNewsManager } from './CmsAndNewsManager';
import { TaxonomiesManager } from './TaxonomiesManager';
import { SystemConfigsManager } from './SystemConfigsManager';
import { RbacAndUsersManager } from './RbacAndUsersManager';
import { AuditLogsViewer } from './AuditLogsViewer';

type AdminTabKey = 'cms' | 'taxonomies' | 'configs' | 'rbac' | 'audit';

export const AdminLayout: React.FC = () => {
  const { mode, user, hasPermission } = usePortal();

  const availableTabs = useMemo(() => {
    const tabs: Array<{ key: AdminTabKey; label: string }> = [];
    if (hasPermission('cms.manage') || hasPermission('news.manage')) {
      tabs.push({ key: 'cms', label: '📝 الرئيسية والأخبار (CMS)' });
    }
    if (hasPermission('taxonomies.manage')) {
      tabs.push({ key: 'taxonomies', label: '🏷️ التصنيفات والمستويات' });
    }
    if (hasPermission('configs.manage')) {
      tabs.push({ key: 'configs', label: '🎨 الهوية والتهيئة' });
    }
    if (hasPermission('roles.manage') || hasPermission('users.manage')) {
      tabs.push({ key: 'rbac', label: '🛡️ الأدوار والمستخدمون' });
    }
    if (hasPermission('audit.read')) {
      tabs.push({ key: 'audit', label: '📋 سجل التدقيق' });
    }
    return tabs;
  }, [hasPermission]);

  const [activeTab, setActiveTab] = useState<AdminTabKey | null>(null);
  const effectiveTab =
    activeTab && availableTabs.some((t) => t.key === activeTab)
      ? activeTab
      : availableTabs[0]?.key ?? null;

  if (mode !== 'api') {
    return (
      <main className="portal-main">
        <div className="portal-card">
          <h2>⚙️ لوحة التحكم المركزية</h2>
          <p>تتطلب لوحة التحكم الاتصال بخادم الـ API الحي وقاعدة PostgreSQL.</p>
          <Link to="/" className="portal-btn primary">
            العودة للرئيسية
          </Link>
        </div>
      </main>
    );
  }

  if (!user || availableTabs.length === 0) {
    return (
      <main className="portal-main">
        <div className="portal-card">
          <h2>🚫 لا تملك صلاحية دخول لوحة التحكم</h2>
          <p>يتم إظهار وحدات الإدارة ديناميكياً وفق صلاحيات دورك في قاعدة البيانات.</p>
          <div className="portal-nav">
            {!user && (
              <Link to="/login" className="portal-btn primary">
                تسجيل الدخول
              </Link>
            )}
            <Link to="/" className="portal-btn">
              الرئيسية
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="portal-main">
      <div className="portal-section-title">
        <span>⚙️ لوحة التحكم المركزية المرنة</span>
        <span className="portal-badge">الصلاحيات النشطة: {user.permissions.length}</span>
      </div>

      <div className="admin-layout">
        <aside className="admin-sidebar" aria-label="أقسام الإدارة">
          {availableTabs.map((tab) => (
            <button
              key={tab.key}
              type="button"
              data-admin-tab={tab.key}
              className={`admin-tab${effectiveTab === tab.key ? ' active' : ''}`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </aside>

        <section>
          {effectiveTab === 'cms' && <CmsAndNewsManager />}
          {effectiveTab === 'taxonomies' && <TaxonomiesManager />}
          {effectiveTab === 'configs' && <SystemConfigsManager />}
          {effectiveTab === 'rbac' && <RbacAndUsersManager />}
          {effectiveTab === 'audit' && <AuditLogsViewer />}
        </section>
      </div>
    </main>
  );
};
