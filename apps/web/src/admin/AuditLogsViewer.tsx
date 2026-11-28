import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { normalizeArabic } from '@darb/book-schema';
import { ApiError, apiRequest } from '../lib/apiClient';
import {
  canBrowserShareFiles,
  exportAuditLogsToExcel,
  exportAuditLogsToPdf,
  shareOrDownloadExportFile,
} from '../lib/auditExport';
import { formatAuditLogEntry, type FormattedAuditEntry } from '../lib/arabicLabels';
import { usePortal } from '../lib/portalContext';
import type { AuditLogDto } from '../lib/types';

export const AuditLogsViewer: React.FC = () => {
  const { apiBase, showToast } = usePortal();
  const [logs, setLogs] = useState<AuditLogDto[]>([]);
  const [searchText, setSearchText] = useState('');
  const [selectedEntry, setSelectedEntry] = useState<FormattedAuditEntry | null>(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [exportingFormat, setExportingFormat] = useState<'xlsx' | 'pdf' | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadLogs = useCallback(async () => {
    try {
      const res = await apiRequest<{ logs: AuditLogDto[] }>('/api/v1/audit-logs?limit=250', {
        apiBase,
      });
      setLogs(res.logs);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل سجل التدقيق');
    }
  }, [apiBase]);

  useEffect(() => {
    void loadLogs();
  }, [loadLogs]);

  const formattedEntries = useMemo(() => logs.map(formatAuditLogEntry), [logs]);

  const filteredEntries = useMemo(() => {
    const q = searchText.trim();
    if (!q) return formattedEntries;
    const normQ = normalizeArabic(q);
    return formattedEntries.filter((entry) => {
      const haystack = normalizeArabic(
        `${entry.timestampText} ${entry.actorName} ${entry.actionAr} ${entry.targetAr} ${entry.detailsSentence} ${entry.raw.action} ${entry.raw.targetType}`
      );
      return haystack.includes(normQ);
    });
  }, [formattedEntries, searchText]);

  const handleExport = async (format: 'xlsx' | 'pdf') => {
    setExportingFormat(format);
    setError(null);
    try {
      const payload =
        format === 'xlsx'
          ? await exportAuditLogsToExcel(filteredEntries, { filterText: searchText.trim() })
          : await exportAuditLogsToPdf(filteredEntries, { filterText: searchText.trim() });

      const outcome = await shareOrDownloadExportFile(payload, {
        title: 'تقرير سجل التدقيق — منصة درب',
        text: `سجل التدقيق (${filteredEntries.length} سجل)`,
      });
      showToast(
        outcome === 'shared'
          ? `تم حفظ الملف «${payload.fileName}» وفتح نافذة المشاركة بنجاح`
          : `تم تنزيل الملف «${payload.fileName}» إلى جهازك بنجاح`
      );
      setShowExportModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'تعذر تصدير سجل التدقيق');
    } finally {
      setExportingFormat(null);
    }
  };

  return (
    <div className="portal-card">
      <div className="portal-section-title" style={{ flexWrap: 'wrap' }}>
        <span>📋 سجل التدقيق الأمني والإداري ({filteredEntries.length})</span>
        <div className="portal-nav">
          <input
            type="search"
            className="portal-input"
            style={{ width: 270 }}
            placeholder="ابحث بالفاعل أو الإجراء أو الهدف..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            data-testid="auditSearchInput"
          />
          <button
            type="button"
            className="portal-btn accent"
            onClick={() => setShowExportModal(true)}
            data-testid="auditExportShareBtn"
          >
            📤 تصدير ومشاركة
          </button>
          <button type="button" className="portal-btn" onClick={() => void loadLogs()}>
            🔄 تحديث
          </button>
        </div>
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
            {filteredEntries.length === 0 ? (
              <tr>
                <td colSpan={5} style={{ textAlign: 'center', color: 'var(--portal-muted)' }}>
                  لا توجد سجلات مطابقة لمعايير البحث الحالية.
                </td>
              </tr>
            ) : (
              filteredEntries.map((entry) => (
                <tr key={entry.id} data-testid={`auditRow-${entry.id}`}>
                  <td style={{ whiteSpace: 'nowrap' }}>{entry.timestampText}</td>
                  <td>{entry.actorName}</td>
                  <td>{entry.actionAr}</td>
                  <td>{entry.targetAr}</td>
                  <td>
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: 10,
                        flexWrap: 'wrap',
                      }}
                    >
                      <span style={{ lineHeight: 1.6 }}>{entry.detailsSentence}</span>
                      <button
                        type="button"
                        className="portal-btn"
                        data-testid={`auditDetailsBtn-${entry.id}`}
                        onClick={() => setSelectedEntry(entry)}
                      >
                        🔍 تفاصيل أكثر
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* نافذة تفاصيل الحدث المنبثقة */}
      {selectedEntry && (
        <div
          className="portal-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auditDetailsModalTitle"
          onClick={() => setSelectedEntry(null)}
        >
          <div className="portal-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="portal-section-title" style={{ marginBottom: 4 }}>
              <span id="auditDetailsModalTitle">🔍 التفاصيل الكاملة للحدث</span>
              <button
                type="button"
                className="portal-btn danger"
                onClick={() => setSelectedEntry(null)}
              >
                إغلاق
              </button>
            </div>

            <div className="portal-repeater-card">
              <div>
                <strong>الملخص:</strong> {selectedEntry.detailsSentence}
              </div>
              <div className="portal-grid">
                <div>
                  <strong>التوقيت:</strong> {selectedEntry.timestampText}
                </div>
                <div>
                  <strong>الفاعل:</strong> {selectedEntry.actorName}
                </div>
                <div>
                  <strong>البريد الإلكتروني:</strong>{' '}
                  <span dir="ltr">{selectedEntry.actorEmail}</span>
                </div>
                <div>
                  <strong>عنوان الاتصال:</strong>{' '}
                  <span dir="ltr">{selectedEntry.ipAddress}</span>
                </div>
                <div>
                  <strong>الإجراء:</strong> {selectedEntry.actionAr}
                </div>
                <div>
                  <strong>الهدف:</strong> {selectedEntry.targetAr}
                </div>
              </div>
            </div>

            <div className="portal-repeater-card">
              <strong>البيانات والمعرّفات التقنية المرفقة:</strong>
              <div style={{ fontSize: '0.85rem', color: 'var(--portal-muted)' }}>
                رمز الإجراء: <code dir="ltr">{selectedEntry.raw.action}</code> • نوع الكيان:{' '}
                <code dir="ltr">{selectedEntry.raw.targetType}</code> • المعرّف:{' '}
                <code dir="ltr">{selectedEntry.raw.targetId}</code>
              </div>
              <pre
                dir="ltr"
                style={{
                  margin: 0,
                  padding: 12,
                  borderRadius: 10,
                  background: 'rgba(15, 23, 42, 0.48)',
                  color: '#e2e8f0',
                  overflowX: 'auto',
                  fontSize: '0.82rem',
                  lineHeight: 1.5,
                }}
              >
                {JSON.stringify(selectedEntry.raw.metadataJson, null, 2)}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* نافذة التصدير والمشاركة */}
      {showExportModal && (
        <div
          className="portal-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="auditExportModalTitle"
          onClick={() => setShowExportModal(false)}
        >
          <div className="portal-modal-card" style={{ width: 'min(540px, 100%)' }} onClick={(e) => e.stopPropagation()}>
            <div className="portal-section-title" style={{ marginBottom: 4 }}>
              <span id="auditExportModalTitle">📤 تصدير ومشاركة سجل التدقيق</span>
              <button
                type="button"
                className="portal-btn"
                onClick={() => setShowExportModal(false)}
              >
                إغلاق
              </button>
            </div>

            <p style={{ margin: 0, color: 'var(--portal-muted)' }}>
              سيتم تصدير {filteredEntries.length} سجل
              {searchText.trim() ? ` مطابقة لبحث «${searchText.trim()}»` : ' من القائمة المعروضة حالياً'}.
              عند التصدير يُحفظ الملف تلقائياً على جهازك وتُفتح نافذة المشاركة في المتصفح إذا كان جهازك يدعم مشاركة الملفات.
            </p>

            <div className="portal-repeater-card">
              <button
                type="button"
                className="portal-btn primary"
                disabled={exportingFormat !== null}
                onClick={() => void handleExport('xlsx')}
                data-testid="exportExcelBtn"
              >
                {exportingFormat === 'xlsx'
                  ? '⏳ جاري تجهيز ملف إكسل...'
                  : '📊 تصدير ومشاركة ملف إكسل (XLSX)'}
              </button>
              <button
                type="button"
                className="portal-btn accent"
                disabled={exportingFormat !== null}
                onClick={() => void handleExport('pdf')}
                data-testid="exportPdfBtn"
              >
                {exportingFormat === 'pdf'
                  ? '⏳ جاري رسم وتجهيز التقرير...'
                  : '📄 تصدير ومشاركة مستند PDF عربي'}
              </button>
              <div style={{ fontSize: '0.82rem', color: 'var(--portal-muted)' }}>
                حالة واجهة المشاركة في هذا المتصفح:{' '}
                {canBrowserShareFiles('test.pdf', 'application/pdf')
                  ? 'مدعومة (تنزيل تلقائي + نافذة مشاركة)'
                  : 'غير مفعّلة في هذا المتصفح (سيتم الحفظ والتنزيل مباشرة)'}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
