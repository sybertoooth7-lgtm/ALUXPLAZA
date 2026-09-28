import { lazy, Suspense } from 'react';
import { Routes, Route, useLocation } from 'react-router';
import ErrorBoundary from './components/ErrorBoundary';
import RouteFallback from './components/RouteFallback';

// Route-level code splitting. These were 31 static imports, so every visitor
// downloaded all 31 pages before rendering anything — including the admin
// panels, the gsap animation code behind the marketing pages, and the client
// auth forms, none of which a given visitor uses. That put the whole app in a
// single ~670 kB chunk, which is what tripped the build's chunk-size warning.
//
// Splitting matters most for the admin area: /admin/* is behind authentication
// and ClientLogin/ClientSignup are never needed by an already-signed-in client,
// so that code no longer ships to visitors who can't reach it. The landing page
// is the one route that stays eagerly imported, because it is the entry point
// for the majority of traffic and deferring it would only add a round trip to
// the first paint.
import HomePage from './pages/HomePage';
const ClientLogin = lazy(() => import('./pages/ClientLogin'));
const ClientSignup = lazy(() => import('./pages/ClientSignup'));
const ClientDashboard = lazy(() => import('./pages/ClientDashboard'));
const AdminLogin = lazy(() => import('./pages/AdminLogin'));
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const AdminSubmissions = lazy(() => import('./pages/AdminSubmissions'));
const AdminSecurity = lazy(() => import('./pages/AdminSecurity'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const VerifyScore = lazy(() => import('./pages/VerifyScore'));
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'));
const TermsOfService = lazy(() => import('./pages/TermsOfService'));
const SecurityPolicy = lazy(() => import('./pages/SecurityPolicy'));
const CompliancePage = lazy(() => import('./pages/CompliancePage'));
const AboutPage = lazy(() => import('./pages/AboutPage'));
const AILabPage = lazy(() => import('./pages/AILabPage'));
const CareersPage = lazy(() => import('./pages/CareersPage'));
const BlogPage = lazy(() => import('./pages/BlogPage'));
const PressPage = lazy(() => import('./pages/PressPage'));
const ServicesPage = lazy(() => import('./pages/ServicesPage'));
const IncidentResponsePage = lazy(() => import('./pages/IncidentResponsePage'));
const VulnerabilityAssessmentPage = lazy(() => import('./pages/VulnerabilityAssessmentPage'));
const ComplianceReadinessPage = lazy(() => import('./pages/ComplianceReadinessPage'));
const DataProtectionAuditPage = lazy(() => import('./pages/DataProtectionAuditPage'));
const NetworkHardeningPage = lazy(() => import('./pages/NetworkHardeningPage'));
const NotFound = lazy(() => import('./pages/NotFound'));

function App() {
  // Keying the boundary by pathname means React unmounts and remounts it
  // fresh on every route change — without this, catching one render error
  // would permanently wedge the whole app into showing the fallback for
  // every page visited afterward, since class component state (hasError)
  // doesn't reset itself.
  const location = useLocation();

  return (
    <ErrorBoundary key={location.pathname}>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/client/login" element={<ClientLogin />} />
          <Route path="/client/signup" element={<ClientSignup />} />
          <Route path="/client/forgot-password" element={<ForgotPassword />} />
          <Route path="/client/reset-password/:token" element={<ResetPassword />} />
          <Route path="/client/dashboard" element={<ClientDashboard />} />
          <Route path="/client/verify-email/:token" element={<VerifyEmail />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route path="/admin/dashboard" element={<AdminDashboard />} />
          <Route path="/admin/users" element={<AdminUsers />} />
          <Route path="/admin/submissions" element={<AdminSubmissions />} />
          <Route path="/admin/security" element={<AdminSecurity />} />
          <Route path="/verify/:token" element={<VerifyScore />} />
          <Route path="/privacy-policy" element={<PrivacyPolicy />} />
          <Route path="/terms-of-service" element={<TermsOfService />} />
          <Route path="/security" element={<SecurityPolicy />} />
          <Route path="/compliance" element={<CompliancePage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/ai-lab" element={<AILabPage />} />
          <Route path="/careers" element={<CareersPage />} />
          <Route path="/blog" element={<BlogPage />} />
          <Route path="/press" element={<PressPage />} />
          <Route path="/services" element={<ServicesPage />} />
          <Route path="/services/incident-response" element={<IncidentResponsePage />} />
          <Route
            path="/services/vulnerability-assessment"
            element={<VulnerabilityAssessmentPage />}
          />
          <Route path="/services/compliance-readiness" element={<ComplianceReadinessPage />} />
          <Route path="/services/data-protection-audit" element={<DataProtectionAuditPage />} />
          <Route path="/services/network-hardening" element={<NetworkHardeningPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Suspense>
    </ErrorBoundary>
  );
}

export default App;
