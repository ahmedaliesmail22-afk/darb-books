import React, { useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../lib/apiClient';
import { usePortal } from '../lib/portalContext';
import type { AdminUserDto, PermissionDto, RoleDto } from '../lib/types';

export const RbacAndUsersManager: React.FC = () => {
  const { apiBase, hasPermission, showToast } = usePortal();
  const canRoles = hasPermission('roles.manage');
  const canUsers = hasPermission('users.manage');

  const [permissions, setPermissions] = useState<PermissionDto[]>([]);
  const [roles, setRoles] = useState<RoleDto[]>([]);
  const [users, setUsers] = useState<AdminUserDto[]>([]);

  const [newRoleCode, setNewRoleCode] = useState('');
  const [newRoleNameAr, setNewRoleNameAr] = useState('');
  const [newRolePerms, setNewRolePerms] = useState<string[]>(['books.read']);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    try {
      if (canRoles) {
        const [pRes, rRes] = await Promise.all([
          apiRequest<{ permissions: PermissionDto[] }>('/api/v1/rbac/permissions', { apiBase }),
          apiRequest<{ roles: RoleDto[] }>('/api/v1/rbac/roles', { apiBase }),
        ]);
        setPermissions(pRes.permissions);
        setRoles(rRes.roles);
      }
      if (canUsers || canRoles) {
        const uRes = await apiRequest<{ users: AdminUserDto[] }>('/api/v1/users', { apiBase });
        setUsers(uRes.users);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل الأدوار والمستخدمين');
    }
  }, [apiBase, canRoles, canUsers]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const toggleNewPerm = (code: string) => {
    setNewRolePerms((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code]
    );
  };

  const handleCreateRole = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await apiRequest('/api/v1/rbac/roles', {
        method: 'POST',
        apiBase,
        body: {
          code: newRoleCode.trim().toUpperCase(),
          nameAr: newRoleNameAr.trim(),
          permissionCodes: newRolePerms,
        },
      });
      showToast('تم إنشاء الدور المخصص بنجاح');
      setNewRoleCode('');
      setNewRoleNameAr('');
      setNewRolePerms(['books.read']);
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إنشاء الدور');
    }
  };

  const handleDeleteRole = async (id: string) => {
    try {
      await apiRequest(`/api/v1/rbac/roles/${id}`, { method: 'DELETE', apiBase });
      showToast('تم حذف الدور المخصص');
      await loadAll();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حذف الدور');
    }
  };

  const handleAssignUserRole = async (userId: string, roleCode: string) => {
    await apiRequest(`/api/v1/rbac/users/${userId}/roles`, {
      method: 'PUT',
      apiBase,
      body: { roleCodes: [roleCode] },
    });
    showToast('تم تحديث دور المستخدم');
    await loadAll();
  };

  const handleUpdateUserStatus = async (
    userId: string,
    status: AdminUserDto['status']
  ) => {
    await apiRequest(`/api/v1/users/${userId}/status`, {
      method: 'PATCH',
      apiBase,
      body: { status },
    });
    showToast('تم تحديث حالة المستخدم');
    await loadAll();
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {error && <div className="portal-error-box">{error}</div>}

      {canRoles && (
        <>
          <div className="portal-card">
            <h3>➕ إنشاء دور مخصص جديد (`Dynamic RBAC`)</h3>
            <form className="portal-form" onSubmit={(e) => void handleCreateRole(e)}>
              <div className="portal-grid">
                <div className="portal-field">
                  <label>رمز الدور (حروف إنجليزية كبيرة و _)</label>
                  <input
                    className="portal-input"
                    dir="ltr"
                    placeholder="SCHOOL_CURATOR"
                    value={newRoleCode}
                    onChange={(e) => setNewRoleCode(e.target.value)}
                    required
                  />
                </div>
                <div className="portal-field">
                  <label>اسم الدور بالعربية</label>
                  <input
                    className="portal-input"
                    placeholder="مشرف المحتوى المدرسي"
                    value={newRoleNameAr}
                    onChange={(e) => setNewRoleNameAr(e.target.value)}
                    required
                  />
                </div>
              </div>

              <div className="portal-field">
                <label>الصلاحيات الدقيقة المرتبطة</label>
                <div className="portal-chips">
                  {permissions.map((p) => {
                    const selected = newRolePerms.includes(p.code);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className={`portal-chip${selected ? ' selected' : ''}`}
                        onClick={() => toggleNewPerm(p.code)}
                      >
                        {selected ? '✓ ' : ''}
                        {p.labelAr} ({p.code})
                      </button>
                    );
                  })}
                </div>
              </div>

              <button type="submit" className="portal-btn primary">
                إنشاء الدور المخصص
              </button>
            </form>
          </div>

          <div className="portal-card">
            <h3>🛡️ الأدوار والصلاحيات ({roles.length})</h3>
            <div className="portal-table-wrap">
              <table className="portal-table">
                <thead>
                  <tr>
                    <th>الرمز</th>
                    <th>الاسم</th>
                    <th>الصلاحيات</th>
                    <th>النوع</th>
                    <th>إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {roles.map((r) => (
                    <tr key={r.id}>
                      <td><code>{r.code}</code></td>
                      <td>{r.nameAr}</td>
                      <td>{r.permissions.map((p) => p.code).join('، ')}</td>
                      <td>{r.isSystem ? 'نظامي' : 'مخصص'}</td>
                      <td>
                        {!r.isSystem && (
                          <button
                            type="button"
                            className="portal-btn danger"
                            onClick={() => void handleDeleteRole(r.id)}
                          >
                            حذف
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {(canUsers || canRoles) && (
        <div className="portal-card">
          <h3>👥 إدارة المستخدمين ({users.length})</h3>
          <div className="portal-table-wrap">
            <table className="portal-table">
              <thead>
                <tr>
                  <th>الاسم والبريد</th>
                  <th>الحالة</th>
                  <th>الدور</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id}>
                    <td>
                      <strong>{u.fullName}</strong>
                      <div style={{ fontSize: '0.82rem', color: 'var(--portal-muted)' }}>{u.email}</div>
                    </td>
                    <td>
                      {canUsers ? (
                        <select
                          className="portal-select"
                          value={u.status}
                          onChange={(e) =>
                            void handleUpdateUserStatus(u.id, e.target.value as AdminUserDto['status'])
                          }
                        >
                          <option value="ACTIVE">ACTIVE</option>
                          <option value="PENDING_APPROVAL">PENDING_APPROVAL</option>
                          <option value="PENDING_VERIFICATION">PENDING_VERIFICATION</option>
                          <option value="SUSPENDED">SUSPENDED</option>
                        </select>
                      ) : (
                        u.status
                      )}
                    </td>
                    <td>
                      {canRoles && roles.length > 0 ? (
                        <select
                          className="portal-select"
                          value={u.roles[0]?.code ?? ''}
                          onChange={(e) => void handleAssignUserRole(u.id, e.target.value)}
                        >
                          {roles.map((r) => (
                            <option key={r.id} value={r.code}>
                              {r.nameAr} ({r.code})
                            </option>
                          ))}
                        </select>
                      ) : (
                        u.roles.map((r) => r.nameAr).join('، ')
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
