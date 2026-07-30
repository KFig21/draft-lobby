import MenuIcon from '@mui/icons-material/Menu';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useNotifications } from '../../notifications/NotificationsContext';
import { MOBILE_BOTTOM_ITEMS, NavDrawer } from './NavDrawer';
import './Navbar.scss';

/** Mobile-only bottom bar + slide-in menu. Desktop uses the Sidebar. */
export function Navbar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { unreadCount } = useNotifications();

  return (
    <>
      {/* Mobile bottom bar — icon-only, labels live in the drawer instead. */}
      <nav className="navbar-bottom">
        {MOBILE_BOTTOM_ITEMS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            aria-label={label}
            className={({ isActive }) =>
              `navbar-bottom__item${isActive ? ' is-active' : ''}`
            }
          >
            {to === '/notifications' && unreadCount > 0 ? (
              <span className="navbar__link-icon">
                <Icon />
                <span className="navbar__badge navbar__badge--dot" />
              </span>
            ) : (
              <Icon />
            )}
          </NavLink>
        ))}
        <button
          type="button"
          className="navbar-bottom__item"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <MenuIcon />
        </button>
      </nav>

      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
