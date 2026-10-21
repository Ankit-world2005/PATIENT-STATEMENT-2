import { Navigate, Route, Routes, useParams } from 'react-router';
import { Layout } from './components/Layout.jsx';
import { RequireAuth } from './components/RequireAuth.jsx';
import { useAuth } from './lib/auth.jsx';
import { landingPath } from './lib/format.js';
import { AuditLogPage } from './pages/admin/AuditLogPage.jsx';
import { AdminHome, ClinicDetailPage, ClinicFormPage, ClinicsPage } from './pages/admin/ClinicPages.jsx';
import { InviteUserPage, UserDetailPage, UsersPage } from './pages/admin/UserPages.jsx';
import { AuthenticatorPage } from './pages/auth/AuthenticatorPage.jsx';
import { LoginPage } from './pages/auth/LoginPage.jsx';
import { AcceptInvitePage, ForgotPasswordPage, ResetPasswordPage } from './pages/auth/PasswordPages.jsx';
import { VerifyPage } from './pages/auth/VerifyPage.jsx';
import { ClinicHome } from './pages/clinic/ClinicHome.jsx';
import { NotFoundPage } from './pages/NotFoundPage.jsx';
import { DashboardPage } from './pages/specialist/DashboardPage.jsx';
import { ImportNewPage, ImportPreviewPage, ImportResultPage } from './pages/specialist/ImportPages.jsx';
import { UploadPage } from './pages/specialist/UploadPage.jsx';
import { StatementDetailPage } from './pages/statements/StatementDetailPage.jsx';
import { StatementListPage } from './pages/statements/StatementListPage.jsx';
import { StatementPrintPage } from './pages/statements/StatementPrintPage.jsx';

function Landing() {
  const { user } = useAuth();
  return <Navigate to={landingPath(user)} replace />;
}

// A fresh list (and search box) per clinic.
function StaffStatementList() {
  const { clinicId } = useParams();
  return <StatementListPage key={clinicId} />;
}

// Screen IDs follow DOCS/03-app-flow.md.
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/login/verify" element={<VerifyPage />} />
        <Route path="/password/forgot" element={<ForgotPasswordPage />} />
        <Route path="/password/reset/:token" element={<ResetPasswordPage />} />
        <Route path="/invite/:token" element={<AcceptInvitePage />} />

        <Route element={<RequireAuth />}>
          <Route path="/" element={<Landing />} />
          <Route path="/account/authenticator" element={<AuthenticatorPage />} />
          <Route path="/statements/:id" element={<StatementDetailPage />} />
          <Route path="/statements/:id/print" element={<StatementPrintPage />} />
        </Route>

        <Route element={<RequireAuth roles={['clinic_user']} />}>
          <Route path="/home" element={<ClinicHome />} />
          <Route path="/statements" element={<StatementListPage />} />
        </Route>

        <Route element={<RequireAuth roles={['specialist']} />}>
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/statements/upload" element={<UploadPage />} />
          <Route path="/imports/new" element={<ImportNewPage />} />
          <Route path="/imports/:id/preview" element={<ImportPreviewPage />} />
          <Route path="/imports/:id" element={<ImportResultPage />} />
        </Route>

        <Route element={<RequireAuth roles={['specialist', 'admin']} />}>
          <Route path="/clinics/:clinicId/statements" element={<StaffStatementList />} />
        </Route>

        <Route element={<RequireAuth roles={['admin']} />}>
          <Route path="/admin" element={<AdminHome />} />
          <Route path="/manage/clinics" element={<ClinicsPage />} />
          <Route path="/manage/clinics/new" element={<ClinicFormPage />} />
          <Route path="/manage/clinics/:id" element={<ClinicDetailPage />} />
          <Route path="/manage/clinics/:id/edit" element={<ClinicFormPage />} />
          <Route path="/manage/users" element={<UsersPage />} />
          <Route path="/manage/users/invite" element={<InviteUserPage />} />
          <Route path="/manage/users/:id" element={<UserDetailPage />} />
          <Route path="/manage/audit" element={<AuditLogPage />} />
        </Route>

        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
