import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlined';
import CloseIcon from '@mui/icons-material/Close';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import LoginIcon from '@mui/icons-material/Login';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SportsFootballIcon from '@mui/icons-material/SportsFootball';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import type { SvgIconComponent } from '@mui/icons-material';
// (sign-out lives in Settings only)
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useNotifications } from '../../notifications/NotificationsContext';
import { useTheme } from '../../theme/ThemeContext';
import { supabase } from '../../supabase';

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
  { to: '/friends', label: 'Friends', Icon: PeopleAltOutlinedIcon },
  { to: '/notifications', label: 'Notifications', Icon: NotificationsNoneOutlinedIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsOutlinedIcon },
];

interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Context-specific links rendered above the standard nav (e.g. "Lobby room"). */
  extraItems?: NavItem[];
  /** Extra custom content (e.g. a toggle) rendered right after extraItems. */
  extraContent?: ReactNode;
}

interface LiveDraft {
  id: string;
  name: string;
  status: string;
}

/** Slide-in menu used by the mobile bottom bar and the draft board. */
export function NavDrawer({ open, onClose, extraItems, extraContent }: NavDrawerProps) {
  const { session } = useAuth();
  const { unreadCount } = useNotifications();
  const { theme, toggle } = useTheme();
  const userId = session?.user.id;
  const [liveDrafts, setLiveDrafts] = useState<LiveDraft[]>([]);

  // Surface the user's active drafts (pre-draft and in-progress) at the top.
  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    void (async () => {
      const { data: mem } = await supabase
        .from('lobby_members')
        .select('lobby_id')
        .eq('user_id', userId);
      const ids = (mem ?? []).map((m) => m.lobby_id);
      if (ids.length === 0) {
        if (!cancelled) setLiveDrafts([]);
        return;
      }
      const { data } = await supabase
        .from('lobbies')
        .select('id, name, status')
        .in('id', ids)
        .in('status', ['SETUP', 'SCHEDULED', 'DRAFTING', 'PAUSED'])
        .order('created_at', { ascending: false });
      if (!cancelled) setLiveDrafts((data ?? []) as LiveDraft[]);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  if (!open) return null;

  const isLive = (s: string) => s === 'DRAFTING' || s === 'PAUSED';

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
        {liveDrafts.length > 0 && (
          <>
            <div className="navbar-drawer__section-label">Your drafts</div>
            {liveDrafts.map((d) => (
              <NavLink
                key={d.id}
                to={isLive(d.status) ? `/lobby/${d.id}/draft` : `/lobby/${d.id}`}
                className="navbar-drawer__link navbar-drawer__live"
                onClick={onClose}
              >
                <span
                  className={`navbar-drawer__live-dot${
                    isLive(d.status) ? '' : ' navbar-drawer__live-dot--idle'
                  }`}
                />
                <span className="navbar-drawer__live-name">{d.name}</span>
                {d.status === 'PAUSED' && (
                  <span className="navbar-drawer__live-tag">Paused</span>
                )}
                {!isLive(d.status) && (
                  <span className="navbar-drawer__live-tag navbar-drawer__live-tag--setup">
                    Lobby
                  </span>
                )}
              </NavLink>
            ))}
            <div className="navbar-drawer__divider" />
          </>
        )}
        {((extraItems && extraItems.length > 0) || extraContent) && (
          <>
            {extraItems?.map(({ to, label, Icon, end }) => (
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
            {extraContent}
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
            {to === '/notifications' && unreadCount > 0 && (
              <span className="navbar__badge">{unreadCount}</span>
            )}
          </NavLink>
        ))}
        <button
          type="button"
          className="navbar-drawer__link navbar-drawer__theme"
          onClick={toggle}
        >
          {theme === 'dark' ? (
            <LightModeIcon fontSize="small" />
          ) : (
            <DarkModeIcon fontSize="small" />
          )}
          {theme === 'dark' ? 'Light mode' : 'Dark mode'}
        </button>
      </div>
    </div>
  );
}
