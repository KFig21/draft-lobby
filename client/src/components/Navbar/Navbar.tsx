import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlined';
import CloseIcon from '@mui/icons-material/Close';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import MenuIcon from '@mui/icons-material/Menu';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SportsFootballIcon from '@mui/icons-material/SportsFootball';
import type { SvgIconComponent } from '@mui/icons-material';
import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import './Navbar.scss';

interface NavItem {
  to: string;
  label: string;
  Icon: SvgIconComponent;
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/home', label: 'Home', Icon: HomeOutlinedIcon, end: true },
  { to: '/lobby/new', label: 'Create', Icon: AddCircleOutlineIcon },
  { to: '/lobby/join', label: 'Join', Icon: LoginIcon },
  { to: '/profile', label: 'My drafts', Icon: ListAltOutlinedIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsOutlinedIcon },
];

// Bottom bar shows the top actions; the rest live behind the menu drawer.
const BOTTOM = NAV.slice(0, 4);

export function Navbar() {
  const { signOut } = useAuth();
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
          {NAV.map(({ to, label, Icon, end }) => (
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

      {/* Mobile drawer */}
      {drawerOpen && (
        <div className="navbar-drawer" onClick={() => setDrawerOpen(false)}>
          <div
            className="navbar-drawer__panel"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-label="Menu"
          >
            <div className="navbar-drawer__head">
              <span className="navbar-drawer__title">
                <SportsFootballIcon fontSize="small" />
                Draft Lobby
              </span>
              <button
                type="button"
                className="navbar-drawer__close"
                aria-label="Close menu"
                onClick={() => setDrawerOpen(false)}
              >
                <CloseIcon fontSize="small" />
              </button>
            </div>
            {NAV.map(({ to, label, Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `navbar-drawer__link${isActive ? ' is-active' : ''}`
                }
                onClick={() => setDrawerOpen(false)}
              >
                <Icon fontSize="small" />
                {label}
              </NavLink>
            ))}
            <button
              type="button"
              className="navbar-drawer__link navbar-drawer__signout"
              onClick={() => {
                setDrawerOpen(false);
                void signOut();
              }}
            >
              <LogoutIcon fontSize="small" />
              Sign out
            </button>
          </div>
        </div>
      )}
    </>
  );
}
