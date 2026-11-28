import React from 'react';
import { Link } from 'react-router-dom';

const LegalNav: React.FC<{ active: 'privacy' | 'usage' | 'terms' }> = ({ active }) => (
  <div className="portal-chips" style={{ marginBottom: 16 }}>
    <Link to="/privacy" className={`portal-chip${active === 'privacy' ? ' selected' : ''}`}>
      🔒 سياسة الخصوصية
    </Link>
    <Link to="/usage" className={`portal-chip${active === 'usage' ? ' selected' : ''}`}>
      📘 سياسة الاستخدام
    </Link>
    <Link to="/terms" className={`portal-chip${active === 'terms' ? ' selected' : ''}`}>
      ⚖️ الشروط والأحكام
    </Link>
  </div>
);

export const PrivacyPolicyPage: React.FC = () => {
  return (
    <main className="portal-main">
      <div className="portal-card" style={{ maxWidth: 860, margin: '0 auto' }}>
        <LegalNav active="privacy" />
        <h1>🔒 سياسة الخصوصية وحماية البيانات</h1>
        <p className="portal-muted">آخر تحديث: نوفمبر 2026 — منصة وتطبيق درب للكتب التفاعلية</p>

        <section className="portal-section">
          <h2>1. البيانات التي نجمعها</h2>
          <p>
            نجمع الحد الأدنى من البيانات اللازمة لتشغيل حسابك وتجربة القراءة المخصّصة فقط:
            الاسم الكامل، البريد الإلكتروني، الفئة العمرية، المستوى التعليمي، التخصصات المفضلة،
            وتقدم القراءة والإشارات المرجعية للكتب التي تقرؤها.
          </p>
        </section>

        <section className="portal-section">
          <h2>2. التخزين المحلي والعمل دون اتصال</h2>
          <p>
            عند استخدام تطبيق الأندرويد أو تفعيل الحفظ للقراءة دون إنترنت، يتم حفظ نسخ الكتب وتقدمك
            محلياً على جهازك داخل قاعدة البيانات المحلية ومخزن التطبيق فقط، وتتم مزامنتها تلقائياً
            مع الخادم الآمن عند توفر الاتصال بالإنترنت.
          </p>
        </section>

        <section className="portal-section">
          <h2>3. مشاركة البيانات وحمايتها</h2>
          <p>
            لا نبيع بياناتك الشخصية ولا نشاركها مع أي جهات تسويقية أو إعلانية. تُشفّر كلمات
            المرور بخوارزميات آمنة وتُحمى الجلسات برموز موثقة.
          </p>
        </section>

        <section className="portal-section">
          <h2>4. حقوقك وحذف الحساب والبيانات</h2>
          <p>
            يمكنك في أي وقت تعديل تفضيلاتك أو حذف حسابك وجميع بياناتك الشخصية نهائياً عبر صفحة{' '}
            <Link to="/settings">إعدادات الحساب والملف</Link> من خلال زر «حذف حسابي وبياناتي
            نهائياً»، حيث تُزال بيانات الحساب وجلساته وتُمسح البيانات المحلية فورياً.
          </p>
        </section>

        <div className="portal-nav" style={{ marginTop: 12 }}>
          <Link to="/" className="portal-btn">
            🏠 العودة للرئيسية
          </Link>
          <Link to="/library" className="portal-btn primary">
            📚 تصفح المكتبة
          </Link>
        </div>
      </div>
    </main>
  );
};

export const UsagePolicyPage: React.FC = () => {
  return (
    <main className="portal-main">
      <div className="portal-card" style={{ maxWidth: 860, margin: '0 auto' }}>
        <LegalNav active="usage" />
        <h1>📘 سياسة الاستخدام والمحتوى التعليمي</h1>
        <p className="portal-muted">آخر تحديث: نوفمبر 2026 — منصة وتطبيق درب للكتب التفاعلية</p>

        <section className="portal-section">
          <h2>1. الغرض التعليمي المشروع</h2>
          <p>
            صُممت منصة درب لتقديم كتب تفاعلية ثلاثية الأبعاد، ومواد صوتية ومرئية، واختبارات وتجارب
            تعليمية لخدمة القراء والطلاب والباحثين والمؤلفين في بيئة آمنة ومنضبطة.
          </p>
        </section>

        <section className="portal-section">
          <h2>2. ضوابط الأمان العمري وتصنيف المحتوى</h2>
          <p>
            تُصنّف الكتب حسب الفئة العمرية والمستوى التعليمي والتخصص. تلتزم المنصة بحجب أي محتوى
            يتجاوز الفئة العمرية المحددة في ملف المستخدم لحماية الناشئة والأطفال.
          </p>
        </section>

        <section className="portal-section">
          <h2>3. واجبات المؤلفين والناشرين</h2>
          <p>
            يلتزم كل مؤلف برفع أعمال يملك حقوقها الفكرية أو يملك تصريحاً صريحاً بنشرها، وتخضع
            الإصدارات لمراجعة علمية وتقنية قبل اعتماد نشرها في المكتبة العامة.
          </p>
        </section>

        <section className="portal-section">
          <h2>4. الاستخدام المحظور</h2>
          <p>
            يُمنع إعادة توزيع الكتب المحفوظة للقراءة دون إنترنت خارج التطبيق لأغراض تجارية، أو محاولة
            تفكيك الحزم والبيانات أو التحايل على صلاحيات الوصول والمراجعة.
          </p>
        </section>

        <div className="portal-nav" style={{ marginTop: 12 }}>
          <Link to="/" className="portal-btn">
            🏠 العودة للرئيسية
          </Link>
          <Link to="/terms" className="portal-btn primary">
            ⚖️ الاطلاع على الشروط والأحكام
          </Link>
        </div>
      </div>
    </main>
  );
};

export const TermsPage: React.FC = () => {
  return (
    <main className="portal-main">
      <div className="portal-card" style={{ maxWidth: 860, margin: '0 auto' }}>
        <LegalNav active="terms" />
        <h1>⚖️ الشروط والأحكام</h1>
        <p className="portal-muted">آخر تحديث: نوفمبر 2026 — منصة وتطبيق درب للكتب التفاعلية</p>

        <section className="portal-section">
          <h2>1. القبول والأهلية</h2>
          <p>
            باستخدامك لمنصة درب على الويب أو عبر تطبيق الأندرويد، فإنك توافق على الالتزام بهذه الشروط
            والأحكام وبسياسة الخصوصية وسياسة الاستخدام المعتمدة.
          </p>
        </section>

        <section className="portal-section">
          <h2>2. مسؤولية الحساب</h2>
          <p>
            أنت مسؤول عن سرية بيانات دخولك وكافة الأنشطة المنفذة عبر حسابك. يحق للإدارة تعليق أي
            حساب يخالف قواعد النشر أو يسيء استخدام البوابة.
          </p>
        </section>

        <section className="portal-section">
          <h2>3. الملكية الفكرية</h2>
          <p>
            تظل جميع الحقوق الأدبية والعلمية للمؤلفين والمنصة محفوظة. يتيح التطبيق حفظ نسخة للقراءة
            الشخصية دون اتصال داخل جهازك فقط ولا ينقل ملكية المصنفات الرقمية.
          </p>
        </section>

        <section className="portal-section">
          <h2>4. التحديثات وإنهاء الحساب</h2>
          <p>
            يجوز تحديث الميزات والسياسات بما يخدم استقرار الخدمة وأمان المستخدمين، كما يمكنك إنهاء
            علاقتك بالخدمة وحذف حسابك مباشرة من إعدادات الحساب في أي وقت.
          </p>
        </section>

        <div className="portal-nav" style={{ marginTop: 12 }}>
          <Link to="/" className="portal-btn">
            🏠 العودة للرئيسية
          </Link>
          <Link to="/privacy" className="portal-btn primary">
            🔒 سياسة الخصوصية
          </Link>
        </div>
      </div>
    </main>
  );
};
