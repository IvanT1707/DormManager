import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { NotificationCenter } from './NotificationCenter.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { roleLabel } from '../lib/format.js';

function homePath(role) {
  if (role === 'student') {
    return '/student';
  }

  if (role === 'commandant' || role === 'administrator') {
    return '/commandant';
  }

  return role === 'maintenance_staff' ? '/maintenance' : '/portal';
}

export function AppShell() {
  const { logout, profile } = useAuth();
  const navigate = useNavigate();

  async function signOut() {
    await logout();
    navigate('/login');
  }

  return (
    <div className="application">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">DM</span>
          <div>
            <strong>DormManager</strong>
            <small>Система управління гуртожитком</small>
          </div>
        </div>
        <nav className="topbar-nav" aria-label="Головна навігація">
          <NavLink to={homePath(profile.role)}>Робоча панель</NavLink>
        </nav>
        <div className="profile-menu">
          <NotificationCenter />
          <div>
            <strong>{profile.fullName}</strong>
            <small>{roleLabel(profile.role)}</small>
          </div>
          <button className="button button-quiet" type="button" onClick={signOut}>
            Вийти
          </button>
        </div>
      </header>
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
}
