import MenuIcon from '@mui/icons-material/Menu';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useNotifications } from '../../notifications/NotificationsContext';
import { NAV_ITEMS, NavDrawer } from './NavDrawer';
import './Navbar.scss';

// Bottom bar shows the top actions; the rest live behind the menu drawer.
const BOTTOM = NAV_ITEMS.slice(0, 4);

/** Mobile-only bottom bar + slide-in menu. Desktop uses the Sidebar. */
export function Navbar() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { unreadCount } = useNotifications();

  return (
    <>
      {/* Mobile bottom bar */}
      <nav className="navbar-bottom">
        {BOTTOM.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `navbar-bottom__item${isActive ? ' is-active' : ''}`
            }
          >
            <Icon fontSize="small" />
            <span>{label}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className="navbar-bottom__item"
          onClick={() => setDrawerOpen(true)}
          aria-label="Open menu"
        >
          <span className="navbar__link-icon">
            <MenuIcon fontSize="small" />
            {unreadCount > 0 && <span className="navbar__badge navbar__badge--dot" />}
          </span>
          <span>Menu</span>
        </button>
      </nav>

      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
