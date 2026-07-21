import { defaultAvatar } from '@draft-lobby/shared';
import SportsFootballIcon from '@mui/icons-material/SportsFootball';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useNotifications } from '../../notifications/NotificationsContext';
import { Avatar } from '../Avatar/Avatar';
import { ThemeToggle } from '../ThemeToggle/ThemeToggle';
import { NAV_ITEMS } from './NavDrawer';
import './Sidebar.scss';

/** Desktop-only left navigation rail (Twitter-style). Hidden on mobile. */
export function Sidebar() {
  const { session, profile } = useAuth();
  const { unreadCount } = useNotifications();
  const userId = session?.user.id ?? '';
  const username =
    profile?.username ??
    (session?.user.user_metadata?.username as string | undefined) ??
    session?.user.email ??
    'me';

  return (
    <aside className="sidebar">
      <NavLink to="/home" className="sidebar__brand">
        <SportsFootballIcon />
        <span>Draft Lobby</span>
      </NavLink>

      <nav className="sidebar__nav">
        {NAV_ITEMS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `sidebar__link${isActive ? ' sidebar__link--active' : ''}`
            }
          >
            <span className="sidebar__link-icon">
              <Icon />
              {to === '/notifications' && unreadCount > 0 && (
                <span className="sidebar__badge">{unreadCount}</span>
              )}
            </span>
            <span className="sidebar__label">{label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar__footer">
        <NavLink to="/settings" className="sidebar__me">
          <Avatar avatar={profile?.avatar ?? defaultAvatar(userId)} size={36} />
          <span className="sidebar__me-name">{username}</span>
        </NavLink>
        <ThemeToggle className="sidebar__iconbtn" />
      </div>
    </aside>
  );
}
