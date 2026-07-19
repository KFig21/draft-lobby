import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlined';
import CloseIcon from '@mui/icons-material/Close';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import LoginIcon from '@mui/icons-material/Login';
import LogoutIcon from '@mui/icons-material/Logout';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SportsFootballIcon from '@mui/icons-material/SportsFootball';
import type { SvgIconComponent } from '@mui/icons-material';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';

export interface NavItem {
  to: string;
  label: string;
  Icon: SvgIconComponent;
  end?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { to: '/home', label: 'Home', Icon: HomeOutlinedIcon, end: true },
  { to: '/lobby/new', label: 'Create', Icon: AddCircleOutlineIcon },
  { to: '/lobby/join', label: 'Join', Icon: LoginIcon },
  { to: '/profile', label: 'My drafts', Icon: ListAltOutlinedIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsOutlinedIcon },
];

interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Context-specific links rendered above the standard nav (e.g. "Lobby room"). */
  extraItems?: NavItem[];
}

/** Slide-in menu used by the mobile bottom bar and the draft board. */
export function NavDrawer({ open, onClose, extraItems }: NavDrawerProps) {
  const { signOut } = useAuth();
  if (!open) return null;

  return (
    <div className="navbar-drawer" onClick={onClose}>
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
            onClick={onClose}
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>
        {extraItems && extraItems.length > 0 && (
          <>
            {extraItems.map(({ to, label, Icon, end }) => (
              <NavLink
                key={to}
                to={to}
                end={end}
                className={({ isActive }) =>
                  `navbar-drawer__link${isActive ? ' is-active' : ''}`
                }
                onClick={onClose}
              >
                <Icon fontSize="small" />
                {label}
              </NavLink>
            ))}
            <div className="navbar-drawer__divider" />
          </>
        )}
        {NAV_ITEMS.map(({ to, label, Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `navbar-drawer__link${isActive ? ' is-active' : ''}`
            }
            onClick={onClose}
          >
            <Icon fontSize="small" />
            {label}
          </NavLink>
        ))}
        <button
          type="button"
          className="navbar-drawer__link navbar-drawer__signout"
          onClick={() => {
            onClose();
            void signOut();
          }}
        >
          <LogoutIcon fontSize="small" />
          Sign out
        </button>
      </div>
    </div>
  );
}
