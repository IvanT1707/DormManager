import { Navigate, Route, Routes } from 'react-router-dom';
import { AppShell } from './components/AppShell.jsx';
import { Loader } from './components/Ui.jsx';
import { useAuth } from './context/AuthContext.jsx';
import { CommandantDashboard } from './pages/CommandantDashboard.jsx';
import { LoginPage } from './pages/LoginPage.jsx';
import { MaintenanceDashboard } from './pages/MaintenanceDashboard.jsx';
import { ProfileRegistrationPage } from './pages/ProfileRegistrationPage.jsx';
import { StudentDashboard } from './pages/StudentDashboard.jsx';
import { UnsupportedRolePage } from './pages/UnsupportedRolePage.jsx';

function dashboardPath(role) {
  if (role === 'student') {
    return '/student';
  }

  if (role === 'commandant' || role === 'administrator') {
    return '/commandant';
  }

  return role === 'maintenance_staff' ? '/maintenance' : '/portal';
}

function HomeRedirect() {
  const { loading, profile, user } = useAuth();

  if (loading) {
    return <Loader message="Перевіряємо обліковий запис..." />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!profile) {
    return <Navigate to="/register-profile" replace />;
  }

  return <Navigate to={dashboardPath(profile.role)} replace />;
}

function RequireSignedIn({ children }) {
  const { loading, user } = useAuth();

  if (loading) {
    return <Loader message="Перевіряємо авторизацію..." />;
  }

  return user ? children : <Navigate to="/login" replace />;
}

function RequireProfile({ children }) {
  const { loading, profile, user } = useAuth();

  if (loading) {
    return <Loader />;
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return profile ? children : <Navigate to="/register-profile" replace />;
}

function RoleGate({ roles, children }) {
  const { profile } = useAuth();

  if (!roles.includes(profile.role)) {
    return <Navigate to={dashboardPath(profile.role)} replace />;
  }

  return children;
}

export function App() {
  return (
    <Routes>
      <Route path="/" element={<HomeRedirect />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/register-profile"
        element={
          <RequireSignedIn>
            <ProfileRegistrationPage />
          </RequireSignedIn>
        }
      />
      <Route
        element={
          <RequireProfile>
            <AppShell />
          </RequireProfile>
        }
      >
        <Route
          path="/student"
          element={
            <RoleGate roles={['student']}>
              <StudentDashboard />
            </RoleGate>
          }
        />
        <Route
          path="/commandant"
          element={
            <RoleGate roles={['commandant', 'administrator']}>
              <CommandantDashboard />
            </RoleGate>
          }
        />
        <Route
          path="/maintenance"
          element={
            <RoleGate roles={['maintenance_staff']}>
              <MaintenanceDashboard />
            </RoleGate>
          }
        />
        <Route path="/portal" element={<UnsupportedRolePage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
