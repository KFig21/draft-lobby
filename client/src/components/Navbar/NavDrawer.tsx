import AccountCircleOutlinedIcon from '@mui/icons-material/AccountCircleOutlined';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlined';
import CloseIcon from '@mui/icons-material/Close';
import HomeOutlinedIcon from '@mui/icons-material/HomeOutlined';
import LeaderboardOutlinedIcon from '@mui/icons-material/LeaderboardOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import LoginIcon from '@mui/icons-material/Login';
import NotificationsNoneOutlinedIcon from '@mui/icons-material/NotificationsNoneOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import SettingsOutlinedIcon from '@mui/icons-material/SettingsOutlined';
import SportsFootballIcon from '@mui/icons-material/SportsFootball';
import BedtimeIcon from '@mui/icons-material/Bedtime';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import type { SvgIconComponent } from '@mui/icons-material';
// (sign-out lives in Settings only)
import { defaultAvatar } from '@draft-lobby/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { useNotifications } from '../../notifications/NotificationsContext';
import { useTheme } from '../../theme/ThemeContext';
import { useBodyScrollLock } from '../../lib/useBodyScrollLock';
import { supabase } from '../../supabase';
import { Avatar } from '../Avatar/Avatar';

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
  { to: '/drafts', label: 'My drafts', Icon: ListAltOutlinedIcon },
  { to: '/rankings', label: 'Rankings', Icon: LeaderboardOutlinedIcon },
  { to: '/friends', label: 'Friends', Icon: PeopleAltOutlinedIcon },
  { to: '/notifications', label: 'Notifications', Icon: NotificationsNoneOutlinedIcon },
  { to: '/settings', label: 'Settings', Icon: SettingsOutlinedIcon },
];

/** Curated subset shown as icons in the mobile bottom bar — kept separate
 * from NAV_ITEMS so reordering/extending the full nav list (drawer/sidebar)
 * can't silently change what shows up there. */
export const MOBILE_BOTTOM_ITEMS: NavItem[] = [
  { to: '/home', label: 'Home', Icon: HomeOutlinedIcon, end: true },
  { to: '/lobby/new', label: 'Create', Icon: AddCircleOutlineIcon },
  { to: '/notifications', label: 'Notifications', Icon: NotificationsNoneOutlinedIcon },
  { to: '/profile', label: 'Profile', Icon: AccountCircleOutlinedIcon, end: true },
];

interface NavDrawerProps {
  open: boolean;
  onClose: () => void;
  /** Context-specific links rendered above the standard nav (e.g. "Lobby room"). */
  extraItems?: NavItem[];
  /** Section heading shown above extraItems/extraContent (e.g. "This draft"). */
  extraLabel?: string;
  /** Extra custom content (e.g. a toggle) rendered right after extraItems. */
  extraContent?: ReactNode;
}

interface LiveDraft {
  id: string;
  name: string;
  status: string;
}

// Last-known active drafts per user, cached so reopening the drawer paints them
// INSTANTLY. They used to fetch on every open and load in a beat later, pushing
// the whole nav down mid-tap (a mis-click trap). Module cache covers repeat
// opens in a session; localStorage covers the first open of a new one. The fetch
// still runs and reconciles — usually a no-op, so no shift.
const draftsMemCache = new Map<string, LiveDraft[]>();
const draftsLsKey = (uid: string) => `navDrafts:v1:${uid}`;

function readCachedDrafts(uid: string | undefined): LiveDraft[] {
  if (!uid) return [];
  const mem = draftsMemCache.get(uid);
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(draftsLsKey(uid));
    if (raw) {
      const parsed = JSON.parse(raw) as LiveDraft[];
      draftsMemCache.set(uid, parsed);
      return parsed;
    }
  } catch {
    /* storage disabled / bad JSON — fall through to empty */
  }
  return [];
}

function writeCachedDrafts(uid: string, drafts: LiveDraft[]) {
  draftsMemCache.set(uid, drafts);
  try {
    localStorage.setItem(draftsLsKey(uid), JSON.stringify(drafts));
  } catch {
    /* quota / disabled — the module cache still covers the session */
  }
}

/** Slide-in menu used by the mobile bottom bar and the draft board. */
export function NavDrawer({ open, onClose, extraItems, extraLabel, extraContent }: NavDrawerProps) {
  const { session, profile } = useAuth();
  const { unreadCount } = useNotifications();
  const { theme, cycle } = useTheme();
  const themeMeta = {
    dark: { Icon: DarkModeIcon, label: 'Dark mode' },
    night: { Icon: BedtimeIcon, label: 'Night mode' },
    light: { Icon: LightModeIcon, label: 'Light mode' },
  }[theme];
  const userId = session?.user.id;
  const username =
    profile?.username ??
    (session?.user.user_metadata?.username as string | undefined) ??
    session?.user.email ??
    'drafter';
  // Seed from cache so the drafts are already there when the drawer opens.
  const [liveDrafts, setLiveDrafts] = useState<LiveDraft[]>(() => readCachedDrafts(userId));
  useBodyScrollLock(open);

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
        writeCachedDrafts(userId, []);
        return;
      }
      const { data } = await supabase
        .from('lobbies')
        .select('id, name, status')
        .in('id', ids)
        .in('status', ['SETUP', 'SCHEDULED', 'DRAFTING', 'PAUSED'])
        .order('created_at', { ascending: false });
      const drafts = (data ?? []) as LiveDraft[];
      writeCachedDrafts(userId, drafts);
      if (!cancelled) setLiveDrafts(drafts);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, userId]);

  const isLive = (s: string) => s === 'DRAFTING' || s === 'PAUSED';

  return (
    <div className={`navbar-drawer${open ? ' is-open' : ''}`} onClick={onClose}>
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
        <NavLink to="/profile" className="navbar-drawer__me" onClick={onClose}>
          <Avatar avatar={profile?.avatar ?? defaultAvatar(userId ?? username)} size={36} />
          <span className="navbar-drawer__me-name">{username}</span>
        </NavLink>
        <div className="navbar-drawer__divider" />
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
            {extraLabel && <div className="navbar-drawer__section-label">{extraLabel}</div>}
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
          onClick={cycle}
        >
          <themeMeta.Icon fontSize="small" />
          {themeMeta.label}
        </button>
      </div>
    </div>
  );
}
