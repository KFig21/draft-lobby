import MenuIcon from '@mui/icons-material/Menu';
import SportsFootballIcon from '@mui/icons-material/SportsFootball';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { NAV_ITEMS, NavDrawer } from './NavDrawer';
import './Navbar.scss';

// Bottom bar shows the top actions; the rest live behind the menu drawer.
const BOTTOM = NAV_ITEMS.slice(0, 4);

export function Navbar() {
  const [drawerOpen, setDrawerOpen] = useState(false);

  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `navbar__link${isActive ? ' navbar__link--active' : ''}`;

  return (
    <>
      {/* Desktop top bar */}
      <header className="navbar">
        <NavLink to="/home" className="navbar__brand">
          <SportsFootballIcon fontSize="small" />
          <span>Draft Lobby</span>
        </NavLink>
        <nav className="navbar__links">
          {NAV_ITEMS.map(({ to, label, Icon, end }) => (
            <NavLink key={to} to={to} end={end} className={linkClass}>
              <Icon fontSize="small" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

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
          <MenuIcon fontSize="small" />
          <span>Menu</span>
        </button>
      </nav>

      <NavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </>
  );
}
