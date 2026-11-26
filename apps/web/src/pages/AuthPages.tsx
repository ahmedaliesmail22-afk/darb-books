import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ApiError, apiRequest, setStoredTokens } from '../lib/apiClient';
import { usePortal } from '../lib/portalContext';

export const LoginPage: React.FC = () => {
  const { mode, apiBase, refreshUser, showToast } = usePortal();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (mode === 'static') {
    return (
      <main className="portal-main">
        <div className="portal-card" style={{ maxWidth: 520, margin: '24px auto' }}>
          <h2>🔐 تسجيل الدخول يتطلب خادم API</h2>
          <p>تعمل البوابة حالياً في وضع العرض الثابت. يمكنك تصفح الكتب في المكتبة مباشرةً دون تسجيل.</p>
          <Link to="/library" className="portal-btn primary">
            📚 الانتقال إلى المكتبة
          </Link>
        </div>
      </main>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        accessToken: string;
        refreshToken: string;
        user: { onboardingCompleted: boolean };
      }>('/api/v1/auth/login', {
        method: 'POST',
        apiBase,
        body: { email, password },
        skipRefresh: true,
      });

      setStoredTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
      const loadedUser = await refreshUser();
      showToast('أهلاً بك مجدداً في منظومة درب');

      if (loadedUser && !loadedUser.profile?.onboardingCompleted) {
        navigate('/onboarding');
      } else {
        navigate('/library');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر تسجيل الدخول');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="portal-main">
      <div className="portal-card" style={{ maxWidth: 480, margin: '24px auto' }}>
        <h2>🔐 تسجيل الدخول</h2>
        {error && <div className="portal-error-box">{error}</div>}
        <form className="portal-form" onSubmit={(e) => void handleSubmit(e)}>
          <div className="portal-field">
            <label htmlFor="loginEmail">البريد الإلكتروني</label>
            <input
              id="loginEmail"
              className="portal-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="portal-field">
            <label htmlFor="loginPassword">كلمة المرور</label>
            <input
              id="loginPassword"
              className="portal-input"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button type="submit" className="portal-btn primary" disabled={submitting}>
            {submitting ? 'جاري التحقق...' : 'دخول'}
          </button>
        </form>
        <p>
          ليس لديك حساب؟ <Link to="/register">أنشئ حساباً جديداً</Link>
        </p>
      </div>
    </main>
  );
};

export const RegisterPage: React.FC = () => {
  const { mode, apiBase, configs, refreshUser, showToast } = usePortal();
  const navigate = useNavigate();

  const regPolicy = (configs['auth.registration_policy'] as Record<string, unknown> | undefined) ?? {};
  const allowSelfRegistration = regPolicy.allowSelfRegistration !== false;
  const minPasswordLen =
    typeof regPolicy.minPasswordLength === 'number' ? regPolicy.minPasswordLength : 8;

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [verifyToken, setVerifyToken] = useState('');
  const [pendingMode, setPendingMode] = useState<'none' | 'email' | 'approval'>('none');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (mode === 'static') {
    return (
      <main className="portal-main">
        <div className="portal-card" style={{ maxWidth: 520, margin: '24px auto' }}>
          <h2>✨ التسجيل متاح عند الاتصال بالخادم الخلفي</h2>
          <Link to="/library" className="portal-btn primary">
            📚 تصفح المكتبة
          </Link>
        </div>
      </main>
    );
  }

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiRequest<{
        accessToken?: string;
        refreshToken?: string;
        verificationRequired?: boolean;
        approvalRequired?: boolean;
        devVerificationToken?: string;
      }>('/api/v1/auth/register', {
        method: 'POST',
        apiBase,
        body: { fullName, email, password },
        skipRefresh: true,
      });

      if (res.verificationRequired) {
        setPendingMode('email');
        if (res.devVerificationToken) setVerifyToken(res.devVerificationToken);
        return;
      }
      if (res.approvalRequired) {
        setPendingMode('approval');
        return;
      }
      if (res.accessToken) {
        setStoredTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
        await refreshUser();
        showToast('تم إنشاء الحساب بنجاح! اختر ملفك التعليمي الآن');
        navigate('/onboarding');
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذر إنشاء الحساب');
    } finally {
      setSubmitting(false);
    }
  };

  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const res = await apiRequest<{ accessToken: string; refreshToken: string }>(
        '/api/v1/auth/verify-email',
        {
          method: 'POST',
          apiBase,
          body: { token: verifyToken },
          skipRefresh: true,
        }
      );
      setStoredTokens({ accessToken: res.accessToken, refreshToken: res.refreshToken });
      await refreshUser();
      showToast('تم تأكيد البريد الإلكتروني بنجاح');
      navigate('/onboarding');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'رمز التحقق غير صالح');
    }
  };

  if (pendingMode === 'approval') {
    return (
      <main className="portal-main">
        <div className="portal-card" style={{ maxWidth: 500, margin: '24px auto' }}>
          <h2>⏳ الحساب بانتظار اعتماد الإدارة</h2>
          <p>تم استلام طلب تسجيلك وفق سياسة المنصة الحالية، وسيتم تفعيل حسابك فور مراجعته.</p>
          <Link to="/" className="portal-btn">
            العودة للرئيسية
          </Link>
        </div>
      </main>
    );
  }

  if (pendingMode === 'email') {
    return (
      <main className="portal-main">
        <div className="portal-card" style={{ maxWidth: 500, margin: '24px auto' }}>
          <h2>📧 تأكيد البريد الإلكتروني</h2>
          {error && <div className="portal-error-box">{error}</div>}
          <form className="portal-form" onSubmit={(e) => void handleVerifyEmail(e)}>
            <div className="portal-field">
              <label htmlFor="verifyTokenInput">رمز التحقق</label>
              <input
                id="verifyTokenInput"
                className="portal-input"
                value={verifyToken}
                onChange={(e) => setVerifyToken(e.target.value)}
                required
              />
            </div>
            <button type="submit" className="portal-btn primary">
              تأكيد الحساب
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="portal-main">
      <div className="portal-card" style={{ maxWidth: 500, margin: '24px auto' }}>
        <h2>✨ إنشاء حساب جديد</h2>
        {!allowSelfRegistration && (
          <div className="portal-error-box">التسجيل الذاتي مغلق حالياً وفق إعدادات الإدارة.</div>
        )}
        {error && <div className="portal-error-box">{error}</div>}
        <form className="portal-form" onSubmit={(e) => void handleRegister(e)}>
          <div className="portal-field">
            <label htmlFor="regName">الاسم الكامل</label>
            <input
              id="regName"
              className="portal-input"
              required
              minLength={2}
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>
          <div className="portal-field">
            <label htmlFor="regEmail">البريد الإلكتروني</label>
            <input
              id="regEmail"
              className="portal-input"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="portal-field">
            <label htmlFor="regPass">كلمة المرور (على الأقل {minPasswordLen} أحرف)</label>
            <input
              id="regPass"
              className="portal-input"
              type="password"
              required
              minLength={minPasswordLen}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <button
            type="submit"
            className="portal-btn primary"
            disabled={submitting || !allowSelfRegistration}
          >
            {submitting ? 'جاري التسجيل...' : 'تسجيل الحساب'}
          </button>
        </form>
      </div>
    </main>
  );
};
