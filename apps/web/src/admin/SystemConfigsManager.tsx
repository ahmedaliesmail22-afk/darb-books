import React, { useCallback, useEffect, useState } from 'react';
import { ApiError, apiRequest } from '../lib/apiClient';
import {
  FEATURE_FLAG_LABELS,
  FONT_SCALE_LABELS,
  getRoleDisplayName,
  getSystemConfigCategoryAr,
  getSystemConfigTitleAr,
  ROLE_NAME_LABELS,
  slugifyArabicToSnakeKey,
  SYSTEM_CONFIG_META,
  THEME_LABELS,
  UPLOAD_FORMAT_LABELS,
} from '../lib/arabicLabels';
import { usePortal } from '../lib/portalContext';

interface ConfigRow {
  id: string;
  key: string;
  category: string;
  valueJson: Record<string, unknown>;
  description?: string | null;
  isPublic: boolean;
}

interface ChecklistDraftItem {
  id: string;
  labelAr: string;
  required: boolean;
}

const ALL_UPLOAD_FORMATS = ['zip', 'json', 'md', 'docx', 'epub'] as const;

export const SystemConfigsManager: React.FC = () => {
  const { apiBase, refreshPortal, showToast } = usePortal();
  const [configs, setConfigs] = useState<ConfigRow[]>([]);
  const [selectedKey, setSelectedKey] = useState('branding.portal');
  const [category, setCategory] = useState('branding');
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 1. الهوية البصرية والمظهر
  const [portalTitle, setPortalTitle] = useState('');
  const [cloudLabel, setCloudLabel] = useState('');
  const [logoUrl, setLogoUrl] = useState('./icons/icon-192.png');
  const [primaryColor, setPrimaryColor] = useState('#d4af37');
  const [accentColor, setAccentColor] = useState('#38bdf8');
  const [defaultTheme, setDefaultTheme] = useState('sepia');
  const [defaultFontScale, setDefaultFontScale] = useState('md');

  // 2. سياسة التسجيل والحسابات
  const [regMode, setRegMode] = useState<'instant' | 'email_verification' | 'admin_approval'>('instant');
  const [allowSelfRegistration, setAllowSelfRegistration] = useState(true);
  const [requireOnboarding, setRequireOnboarding] = useState(true);
  const [minPasswordLength, setMinPasswordLength] = useState(8);
  const [defaultRoleCode, setDefaultRoleCode] = useState('LEARNER');

  // 3. مفاتيح الميزات
  const [featureFlags, setFeatureFlags] = useState<Record<string, boolean>>({});

  // 4. قائمة التحقق للمراجعة
  const [checklistItems, setChecklistItems] = useState<ChecklistDraftItem[]>([]);

  // 5. سياسة رفع الملفات
  const [allowedFormats, setAllowedFormats] = useState<string[]>(['zip', 'json', 'md', 'docx', 'epub']);
  const [maxFileSizeMb, setMaxFileSizeMb] = useState(100);

  // 6. القالب القياسي
  const [tplVersion, setTplVersion] = useState('1.1.0');
  const [tplTitle, setTplTitle] = useState('');
  const [tplGuide, setTplGuide] = useState('');

  // 7. سياسة الأمان العمري
  const [strictAgeGating, setStrictAgeGating] = useState(true);
  const [enforceForGuests, setEnforceForGuests] = useState(false);
  const [unratedBookMinAge, setUnratedBookMinAge] = useState(0);

  // احتياطي للإعدادات المخصصة
  const [genericFields, setGenericFields] = useState<Array<{ key: string; value: string }>>([]);

  const hydrateVisualForm = useCallback((row: ConfigRow) => {
    setSelectedKey(row.key);
    setCategory(row.category);
    setIsPublic(row.isPublic);
    const val = (row.valueJson ?? {}) as Record<string, unknown>;

    if (row.key === 'branding.portal') {
      setPortalTitle(typeof val.portalTitle === 'string' ? val.portalTitle : '');
      setCloudLabel(typeof val.cloudLabel === 'string' ? val.cloudLabel : '');
      setLogoUrl(typeof val.logoUrl === 'string' ? val.logoUrl : './icons/icon-192.png');
      setPrimaryColor(typeof val.primaryColor === 'string' ? val.primaryColor : '#d4af37');
      setAccentColor(typeof val.accentColor === 'string' ? val.accentColor : '#38bdf8');
      setDefaultTheme(typeof val.defaultTheme === 'string' ? val.defaultTheme : 'sepia');
      setDefaultFontScale(typeof val.defaultFontScale === 'string' ? val.defaultFontScale : 'md');
      return;
    }

    if (row.key === 'auth.registration_policy') {
      const m = val.mode;
      setRegMode(
        m === 'email_verification' || m === 'admin_approval' ? m : 'instant'
      );
      setAllowSelfRegistration(val.allowSelfRegistration !== false);
      setRequireOnboarding(val.requireOnboarding !== false);
      setMinPasswordLength(typeof val.minPasswordLength === 'number' ? val.minPasswordLength : 8);
      setDefaultRoleCode(typeof val.defaultRoleCode === 'string' ? val.defaultRoleCode : 'LEARNER');
      return;
    }

    if (row.key === 'features.flags') {
      const flagsObj: Record<string, boolean> = {};
      for (const flagKey of Object.keys(FEATURE_FLAG_LABELS)) {
        flagsObj[flagKey] = val[flagKey] !== false;
      }
      for (const [k, v] of Object.entries(val)) {
        if (typeof v === 'boolean') flagsObj[k] = v;
      }
      setFeatureFlags(flagsObj);
      return;
    }

    if (row.key === 'moderation.review_checklist') {
      const items = Array.isArray(val.items) ? (val.items as Array<Record<string, unknown>>) : [];
      setChecklistItems(
        items.map((it, idx) => ({
          id: typeof it.id === 'string' ? it.id : `item_${idx + 1}`,
          labelAr: typeof it.labelAr === 'string' ? it.labelAr : '',
          required: it.required !== false,
        }))
      );
      return;
    }

    if (row.key === 'uploads.policy') {
      const fmts = Array.isArray(val.allowedFormats)
        ? val.allowedFormats.map((f) => String(f))
        : ['zip', 'json', 'md', 'docx', 'epub'];
      setAllowedFormats(fmts);
      setMaxFileSizeMb(typeof val.maxFileSizeMb === 'number' ? val.maxFileSizeMb : 100);
      return;
    }

    if (row.key === 'templates.official_package') {
      setTplVersion(typeof val.version === 'string' ? val.version : '1.1.0');
      setTplTitle(typeof val.title === 'string' ? val.title : '');
      setTplGuide(typeof val.guideMarkdown === 'string' ? val.guideMarkdown : '');
      return;
    }

    if (row.key === 'catalog.age_policy') {
      setStrictAgeGating(val.strictAgeGating !== false);
      setEnforceForGuests(val.enforceForGuests === true);
      setUnratedBookMinAge(typeof val.unratedBookMinAge === 'number' ? val.unratedBookMinAge : 0);
      return;
    }

    setGenericFields(
      Object.entries(val).map(([k, v]) => ({
        key: k,
        value: typeof v === 'string' ? v : JSON.stringify(v),
      }))
    );
  }, []);

  const loadConfigs = useCallback(async () => {
    try {
      const res = await apiRequest<{ items: ConfigRow[] }>('/api/v1/configs', { apiBase });
      setConfigs(res.items);
      const current = res.items.find((c) => c.key === selectedKey) ?? res.items.find((c) => c.key === 'branding.portal') ?? res.items[0];
      if (current) {
        hydrateVisualForm(current);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تحميل الإعدادات');
    }
  }, [apiBase, hydrateVisualForm, selectedKey]);

  useEffect(() => {
    void loadConfigs();
  }, [loadConfigs]);

  const serializeCurrentForm = (): Record<string, unknown> => {
    if (selectedKey === 'branding.portal') {
      return {
        portalTitle: portalTitle.trim(),
        cloudLabel: cloudLabel.trim(),
        logoUrl: logoUrl.trim() || './icons/icon-192.png',
        primaryColor,
        accentColor,
        defaultTheme,
        defaultFontScale,
      };
    }

    if (selectedKey === 'auth.registration_policy') {
      return {
        mode: regMode,
        allowSelfRegistration,
        requireOnboarding,
        minPasswordLength: Math.max(6, Math.min(128, Number(minPasswordLength) || 8)),
        defaultRoleCode: defaultRoleCode || 'LEARNER',
      };
    }

    if (selectedKey === 'features.flags') {
      return { ...featureFlags };
    }

    if (selectedKey === 'moderation.review_checklist') {
      return {
        items: checklistItems
          .filter((it) => it.labelAr.trim())
          .map((it, idx) => ({
            id: it.id.trim() || slugifyArabicToSnakeKey(it.labelAr, `check_${idx + 1}`),
            labelAr: it.labelAr.trim(),
            required: it.required,
          })),
      };
    }

    if (selectedKey === 'uploads.policy') {
      return {
        allowedFormats,
        maxFileSizeMb: Math.max(1, Math.min(500, Number(maxFileSizeMb) || 100)),
      };
    }

    if (selectedKey === 'templates.official_package') {
      return {
        version: tplVersion.trim() || '1.0.0',
        title: tplTitle.trim(),
        guideMarkdown: tplGuide.trim(),
      };
    }

    if (selectedKey === 'catalog.age_policy') {
      return {
        strictAgeGating,
        enforceForGuests,
        unratedBookMinAge: Math.max(0, Number(unratedBookMinAge) || 0),
      };
    }

    const out: Record<string, unknown> = {};
    for (const pair of genericFields) {
      const k = pair.key.trim();
      if (!k) continue;
      const v = pair.value.trim();
      if (v === 'true') out[k] = true;
      else if (v === 'false') out[k] = false;
      else if (/^-?\d+(\.\d+)?$/.test(v)) out[k] = Number(v);
      else out[k] = v;
    }
    return out;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const payloadValue = serializeCurrentForm();
      await apiRequest(`/api/v1/configs/${encodeURIComponent(selectedKey)}`, {
        method: 'PUT',
        apiBase,
        body: {
          category,
          isPublic,
          valueJson: payloadValue,
        },
      });
      showToast(`تم حفظ «${getSystemConfigTitleAr(selectedKey)}» وتطبيقه على المنصة فوراً`);
      await loadConfigs();
      await refreshPortal();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر حفظ الإعداد');
    }
  };

  const meta = SYSTEM_CONFIG_META[selectedKey];

  return (
    <div className="portal-card">
      <h3>🎨 نظام التهيئة والهوية البصرية وسياسات المنصة</h3>
      {error && <div className="portal-error-box">{error}</div>}

      <div className="portal-chips">
        {configs.map((c) => (
          <button
            key={c.key}
            type="button"
            data-config-key={c.key}
            className={`portal-chip${selectedKey === c.key ? ' selected' : ''}`}
            onClick={() => {
              setError(null);
              hydrateVisualForm(c);
            }}
          >
            {getSystemConfigTitleAr(c.key)}
          </button>
        ))}
      </div>

      {meta && (
        <p style={{ marginTop: 4, color: 'var(--portal-muted)' }}>{meta.descriptionAr}</p>
      )}

      <form className="portal-form" style={{ marginTop: 10 }} onSubmit={(e) => void handleSave(e)}>
        {selectedKey === 'branding.portal' && (
          <div className="portal-repeater-card">
            <div className="portal-grid">
              <div className="portal-field">
                <label>اسم المنصة</label>
                <input
                  className="portal-input"
                  value={portalTitle}
                  onChange={(e) => setPortalTitle(e.target.value)}
                  required
                />
              </div>
              <div className="portal-field">
                <label>وصف المنظومة</label>
                <input
                  className="portal-input"
                  value={cloudLabel}
                  onChange={(e) => setCloudLabel(e.target.value)}
                  required
                />
              </div>
            </div>

            <div className="portal-field">
              <label>مسار الشعار</label>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <input
                  className="portal-input"
                  dir="ltr"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                />
                {logoUrl && (
                  <img
                    src={logoUrl}
                    alt="معاينة الشعار"
                    style={{ width: 38, height: 38, borderRadius: 8, objectFit: 'cover' }}
                    onError={(e) => (e.currentTarget.style.display = 'none')}
                  />
                )}
              </div>
            </div>

            <div className="portal-grid">
              <div className="portal-field">
                <label>اللون الأساسي للمنصة</label>
                <div className="portal-color-row">
                  <input
                    type="color"
                    className="portal-color-input"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                  />
                  <input
                    className="portal-input"
                    dir="ltr"
                    value={primaryColor}
                    onChange={(e) => setPrimaryColor(e.target.value)}
                  />
                </div>
              </div>
              <div className="portal-field">
                <label>اللون الثانوي المميز</label>
                <div className="portal-color-row">
                  <input
                    type="color"
                    className="portal-color-input"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                  />
                  <input
                    className="portal-input"
                    dir="ltr"
                    value={accentColor}
                    onChange={(e) => setAccentColor(e.target.value)}
                  />
                </div>
              </div>
            </div>

            <div className="portal-grid">
              <div className="portal-field">
                <label>الثيم الافتراضي للزوار</label>
                <select
                  className="portal-select"
                  value={defaultTheme}
                  onChange={(e) => setDefaultTheme(e.target.value)}
                >
                  {Object.entries(THEME_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
              <div className="portal-field">
                <label>حجم الخط الافتراضي</label>
                <select
                  className="portal-select"
                  value={defaultFontScale}
                  onChange={(e) => setDefaultFontScale(e.target.value)}
                >
                  {Object.entries(FONT_SCALE_LABELS).map(([k, lbl]) => (
                    <option key={k} value={k}>
                      {lbl}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {selectedKey === 'auth.registration_policy' && (
          <div className="portal-repeater-card">
            <div className="portal-field">
              <label>آلية تفعيل الحسابات الجديدة</label>
              <div className="portal-radio-group">
                {(
                  [
                    ['instant', 'تفعيل فوري مباشرة بعد التسجيل'],
                    ['email_verification', 'التحقق عبر البريد الإلكتروني أولاً'],
                    ['admin_approval', 'بانتظار موافقة الإدارة المسبقة'],
                  ] as const
                ).map(([value, label]) => (
                  <label
                    key={value}
                    className={`portal-radio-option${regMode === value ? ' selected' : ''}`}
                  >
                    <input
                      type="radio"
                      name="registrationMode"
                      checked={regMode === value}
                      onChange={() => setRegMode(value)}
                    />
                    <span>{label}</span>
                  </label>
                ))}
              </div>
            </div>

            <label className="portal-toggle-row">
              <span>السماح بإنشاء الحسابات الذاتية من واجهة التسجيل</span>
              <span className="portal-switch">
                <input
                  type="checkbox"
                  checked={allowSelfRegistration}
                  onChange={(e) => setAllowSelfRegistration(e.target.checked)}
                />
                <span className="portal-switch-slider" />
              </span>
            </label>

            <label className="portal-toggle-row">
              <span>إلزام المستخدم باستكمال التهيئة التعليمية عند أول دخول</span>
              <span className="portal-switch">
                <input
                  type="checkbox"
                  checked={requireOnboarding}
                  onChange={(e) => setRequireOnboarding(e.target.checked)}
                />
                <span className="portal-switch-slider" />
              </span>
            </label>

            <div className="portal-grid">
              <div className="portal-field">
                <label>الحد الأدنى لطول كلمة المرور (عدد الأحرف)</label>
                <input
                  type="number"
                  min={6}
                  max={128}
                  className="portal-input"
                  value={minPasswordLength}
                  onChange={(e) => setMinPasswordLength(Number(e.target.value))}
                />
              </div>
              <div className="portal-field">
                <label>الدور الافتراضي للمسجلين الجدد</label>
                <select
                  className="portal-select"
                  value={defaultRoleCode}
                  onChange={(e) => setDefaultRoleCode(e.target.value)}
                >
                  {Object.keys(ROLE_NAME_LABELS).map((code) => (
                    <option key={code} value={code}>
                      {getRoleDisplayName(code)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {selectedKey === 'features.flags' && (
          <div className="portal-repeater-card">
            {Object.entries(featureFlags).map(([flagKey, enabled]) => (
              <label key={flagKey} className="portal-toggle-row">
                <span>{FEATURE_FLAG_LABELS[flagKey] ?? flagKey}</span>
                <span className="portal-switch">
                  <input
                    type="checkbox"
                    checked={enabled}
                    onChange={(e) =>
                      setFeatureFlags((prev) => ({ ...prev, [flagKey]: e.target.checked }))
                    }
                  />
                  <span className="portal-switch-slider" />
                </span>
              </label>
            ))}
          </div>
        )}

        {selectedKey === 'moderation.review_checklist' && (
          <div className="portal-repeater-card">
            <div className="portal-section-title" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: '1rem' }}>بنود قائمة التحقق للمراجعة ({checklistItems.length})</span>
              <button
                type="button"
                className="portal-btn"
                onClick={() =>
                  setChecklistItems((prev) => [
                    ...prev,
                    { id: `check_${Date.now().toString(36)}`, labelAr: '', required: true },
                  ])
                }
              >
                ➕ إضافة بند مراجعة
              </button>
            </div>
            {checklistItems.map((chk, idx) => (
              <div
                key={chk.id + idx}
                style={{
                  border: '1px solid var(--portal-border)',
                  borderRadius: 10,
                  padding: 10,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                }}
              >
                <div className="portal-field">
                  <label>نص بند المراجعة #{idx + 1}</label>
                  <input
                    className="portal-input"
                    value={chk.labelAr}
                    placeholder="اكتب معيار الفحص المعروض للمراجع العلمي..."
                    onChange={(e) =>
                      setChecklistItems((prev) =>
                        prev.map((row, i) =>
                          i === idx ? { ...row, labelAr: e.target.value } : row
                        )
                      )
                    }
                    required
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={chk.required}
                      onChange={(e) =>
                        setChecklistItems((prev) =>
                          prev.map((row, i) =>
                            i === idx ? { ...row, required: e.target.checked } : row
                          )
                        )
                      }
                    />
                    <span>{chk.required ? 'بند إلزامي للاعتماد' : 'بند اختياري إرشادي'}</span>
                  </label>
                  <button
                    type="button"
                    className="portal-btn danger"
                    onClick={() =>
                      setChecklistItems((prev) => prev.filter((_, i) => i !== idx))
                    }
                  >
                    حذف البند
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {selectedKey === 'uploads.policy' && (
          <div className="portal-repeater-card">
            <div className="portal-field">
              <label>الصيغ المسموح برفعها في بوابة المؤلف</label>
              <div className="portal-chips">
                {ALL_UPLOAD_FORMATS.map((fmt) => {
                  const checked = allowedFormats.includes(fmt);
                  return (
                    <button
                      key={fmt}
                      type="button"
                      className={`portal-chip${checked ? ' selected' : ''}`}
                      onClick={() =>
                        setAllowedFormats((prev) =>
                          prev.includes(fmt) ? prev.filter((x) => x !== fmt) : [...prev, fmt]
                        )
                      }
                    >
                      {checked ? '✓ ' : ''}
                      {UPLOAD_FORMAT_LABELS[fmt] ?? fmt}
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="portal-field" style={{ maxWidth: 280 }}>
              <label>الحد الأقصى لحجم الملف (ميجابايت)</label>
              <input
                type="number"
                min={1}
                max={500}
                className="portal-input"
                value={maxFileSizeMb}
                onChange={(e) => setMaxFileSizeMb(Number(e.target.value))}
              />
            </div>
          </div>
        )}

        {selectedKey === 'templates.official_package' && (
          <div className="portal-repeater-card">
            <div className="portal-grid">
              <div className="portal-field">
                <label>رقم إصدار القالب الرسمي</label>
                <input
                  className="portal-input"
                  dir="ltr"
                  value={tplVersion}
                  onChange={(e) => setTplVersion(e.target.value)}
                  required
                />
              </div>
              <div className="portal-field">
                <label>عنوان القالب الرسمي</label>
                <input
                  className="portal-input"
                  value={tplTitle}
                  onChange={(e) => setTplTitle(e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="portal-field">
              <label>إرشادات المؤلفين المرفقة مع القالب</label>
              <textarea
                rows={4}
                className="portal-textarea"
                value={tplGuide}
                onChange={(e) => setTplGuide(e.target.value)}
              />
            </div>
          </div>
        )}

        {selectedKey === 'catalog.age_policy' && (
          <div className="portal-repeater-card">
            <label className="portal-toggle-row">
              <span>تفعيل التصفية العمرية الصارمة على الكتب في المكتبة</span>
              <span className="portal-switch">
                <input
                  type="checkbox"
                  checked={strictAgeGating}
                  onChange={(e) => setStrictAgeGating(e.target.checked)}
                />
                <span className="portal-switch-slider" />
              </span>
            </label>
            <label className="portal-toggle-row">
              <span>تطبيق القيود العمرية أيضاً على الزوار غير المسجلين</span>
              <span className="portal-switch">
                <input
                  type="checkbox"
                  checked={enforceForGuests}
                  onChange={(e) => setEnforceForGuests(e.target.checked)}
                />
                <span className="portal-switch-slider" />
              </span>
            </label>
            <div className="portal-field" style={{ maxWidth: 280 }}>
              <label>الحد الأدنى للعمر للكتب غير المصنفة (سنوات)</label>
              <input
                type="number"
                min={0}
                className="portal-input"
                value={unratedBookMinAge}
                onChange={(e) => setUnratedBookMinAge(Number(e.target.value))}
              />
            </div>
          </div>
        )}

        {!SYSTEM_CONFIG_META[selectedKey] && (
          <div className="portal-repeater-card">
            <div className="portal-section-title" style={{ marginBottom: 4 }}>
              <span style={{ fontSize: '0.95rem' }}>خصائص الإعداد ({genericFields.length})</span>
              <button
                type="button"
                className="portal-btn"
                onClick={() => setGenericFields((prev) => [...prev, { key: '', value: '' }])}
              >
                ➕ إضافة حقل
              </button>
            </div>
            {genericFields.map((pair, idx) => (
              <div key={idx} className="portal-grid" style={{ alignItems: 'end' }}>
                <div className="portal-field">
                  <label>اسم الخاصية</label>
                  <input
                    className="portal-input"
                    value={pair.key}
                    onChange={(e) =>
                      setGenericFields((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, key: e.target.value } : row))
                      )
                    }
                  />
                </div>
                <div className="portal-field">
                  <label>القيمة</label>
                  <input
                    className="portal-input"
                    value={pair.value}
                    onChange={(e) =>
                      setGenericFields((prev) =>
                        prev.map((row, i) => (i === idx ? { ...row, value: e.target.value } : row))
                      )
                    }
                  />
                </div>
                <button
                  type="button"
                  className="portal-btn danger"
                  onClick={() => setGenericFields((prev) => prev.filter((_, i) => i !== idx))}
                >
                  حذف
                </button>
              </div>
            ))}
          </div>
        )}

        <details className="portal-advanced-details">
          <summary>إعدادات تقنية متقدمة</summary>
          <div className="portal-grid">
            <div className="portal-field">
              <label>المفتاح التقني للإعداد</label>
              <input
                className="portal-input"
                dir="ltr"
                value={selectedKey}
                onChange={(e) => setSelectedKey(e.target.value)}
                required
              />
            </div>
            <div className="portal-field">
              <label>التصنيف ({getSystemConfigCategoryAr(category)})</label>
              <input
                className="portal-input"
                dir="ltr"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                required
              />
            </div>
          </div>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
            <input
              type="checkbox"
              checked={isPublic}
              onChange={(e) => setIsPublic(e.target.checked)}
            />
            <span>إتاحة هذا الإعداد للواجهة العامة قبل تسجيل الدخول</span>
          </label>
        </details>

        <button type="submit" className="portal-btn primary">
          💾 حفظ التهيئة وتطبيقها فوراً
        </button>
      </form>
    </div>
  );
};
