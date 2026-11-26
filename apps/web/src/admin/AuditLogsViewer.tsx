import React, { useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../lib/apiClient';
import { usePortal } from '../lib/portalContext';
import type { AuditLogDto } from '../lib/types';

export const AuditLogsViewer: React.FC = () => {
  const { apiBase } = usePortal();
  const [logs, setLogs] = useState<AuditLogDto[]>([]);
  const [actionFilter, setActionFilter] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (actionFilter.trim()) params.set('action', actionFilter.trim());
      const res = await apiRequest<{ logs: AuditLogDto[] }>(
        `/api/v1/audit-logs?${params.toString()}`,
        { apiBase }
      );
      setLogs(res.logs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل سجل التدقيق');
    }
  }, [apiBase, actionFilter]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  return (
    <div className="portal-card">
      <div className="portal-section-title">
        <span>📋 سجل التدقيق الأمني والتعديلات (`audit_logs`)</span>
        <input
          className="portal-input"
          style={{ width: 220 }}
          dir="ltr"
          placeholder="تصفية حسب action..."
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
        />
      </div>

      {error && <div className="portal-error-box">{error}</div>}

      <div className="portal-table-wrap">
        <table className="portal-table">
          <thead>
            <tr>
              <th>التوقيت</th>
              <th>الفاعل</th>
              <th>الإجراء</th>
              <th>الهدف</th>
              <th>التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id}>
                <td style={{ whiteSpace: 'nowrap' }}>
                  {new Date(log.createdAt).toLocaleString('ar-SA')}
                </td>
                <td>{log.actor ? `${log.actor.fullName} (${log.actor.email})` : 'النظام'}</td>
                <td><code>{log.action}</code></td>
                <td><code>{log.targetType}:{log.targetId}</code></td>
                <td dir="ltr" style={{ maxWidth: 260, overflowWrap: 'anywhere', fontSize: '0.78rem' }}>
                  {JSON.stringify(log.metadataJson)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};
