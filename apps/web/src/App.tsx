import React from 'react';
import { HashRouter, Route, Routes, useLocation } from 'react-router-dom';
import { PortalProvider, usePortal } from './lib/portalContext';
import { PortalHeader } from './components/PortalHeader';
import { HomePage } from './pages/HomePage';
import { LibraryPage } from './pages/LibraryPage';
import { ReaderPage } from './pages/ReaderPage';
import { LoginPage, RegisterPage } from './pages/AuthPages';
import { OnboardingPage } from './pages/OnboardingPage';
import { ProfileSettingsPage } from './pages/ProfileSettingsPage';
import { GuideAndNewsPage } from './pages/GuideAndNewsPage';
import { AdminLayout } from './admin/AdminLayout';
import { AuthorPortalPage } from './pages/AuthorPortalPage';
import { ModerationPortalPage } from './pages/ModerationPortalPage';

const AppRoutes: React.FC = () => {
  const { toastMessage } = usePortal();
  const location = useLocation();

  const query = new URLSearchParams(window.location.search);
  const legacyEdition = query.get('edition');
  const legacySpreadRaw = query.get('spread');
  const legacySpread = legacySpreadRaw ? parseInt(legacySpreadRaw, 10) : 0;

  // الحفاظ التام على الروابط المباشرة القديمة ?edition=...&spread=... وإعادة توجيه /engine/
  const isRootWithLegacyQuery =
    Boolean(legacyEdition) && (location.pathname === '/' || location.pathname === '');
  const isReaderRoute = location.pathname.startsWith('/read') || isRootWithLegacyQuery;

  return (
    <div className={isReaderRoute ? 'reader-root-wrap' : 'portal-shell'}>
      {!isReaderRoute && <PortalHeader />}

      <Routes>
        <Route
          path="/"
          element={
            isRootWithLegacyQuery && legacyEdition ? (
              <ReaderPage
                fallbackEdition={legacyEdition}
                fallbackSpread={Number.isFinite(legacySpread) ? legacySpread : 0}
              />
            ) : (
              <HomePage />
            )
          }
        />
        <Route path="/library" element={<LibraryPage />} />
        <Route path="/read" element={<ReaderPage />} />
        <Route path="/read/:slug" element={<ReaderPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/onboarding" element={<OnboardingPage />} />
        <Route path="/settings" element={<ProfileSettingsPage />} />
        <Route path="/guide" element={<GuideAndNewsPage />} />
        <Route path="/author" element={<AuthorPortalPage />} />
        <Route path="/review" element={<ModerationPortalPage />} />
        <Route path="/admin" element={<AdminLayout />} />
      </Routes>

      {!isReaderRoute && toastMessage && (
        <div className="toast-banner show" role="status" aria-live="polite">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

export const App: React.FC = () => {
  return (
    <HashRouter>
      <PortalProvider>
        <AppRoutes />
      </PortalProvider>
    </HashRouter>
  );
};
