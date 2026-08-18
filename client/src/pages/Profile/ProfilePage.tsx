import {
  POSITION_COLORS,
  SCORING_PRESETS,
  defaultAvatar,
  matchPreset,
  type Avatar as AvatarData,
  type LobbySettings,
  type Position,
} from '@draft-lobby/shared';
import ChatBubbleOutlineIcon from '@mui/icons-material/ChatBubbleOutlined';
import CheckCircleOutlinedIcon from '@mui/icons-material/CheckCircleOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import LayersOutlinedIcon from '@mui/icons-material/LayersOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import SportsFootballIcon from '@mui/icons-material/SportsFootball';
import SportsFootballOutlinedIcon from '@mui/icons-material/SportsFootballOutlined';
import TouchAppOutlinedIcon from '@mui/icons-material/TouchAppOutlined';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Avatar } from '../../components/Avatar/Avatar';
import { Loader } from '../../components/Loader/Loader';
import { ProfileLink } from '../../components/ProfileLink/ProfileLink';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { useInfiniteScroll } from '../../lib/useInfiniteScroll';
import './ProfilePage.scss';

// ── Public profile bundle (server: /api/users/:id/profile) ──
interface ProfileData {
  id: string;
  username: string;
  avatar: AvatarData | null;
  createdAt: string;
}
interface MostPicked {
  playerId: string;
  name: string;
  position: string;
  nflTeam: string;
  count: number;
}
interface ProfileStats {
  totalDrafts: number;
  liveDrafts: number;
  mockDrafts: number;
  completedDrafts: number;
  totalPicks: number;
  mostPicked: MostPicked[];
}
interface FriendMini {
  id: string;
  username: string;
  avatar: AvatarData | null;
}
interface PublicDraft {
  id: string;
  name: string;
  status: string;
  settings: LobbySettings;
  createdAt: string;
}
type ProfileTab = 'stats' | 'activity' | 'drafts' | 'friends';
interface ActivityItem {
  id: string;
  kind:
    | 'DRAFT_COMPLETED'
    | 'OPEN_LOBBY_CREATED'
    | 'PICK_REACTION'
    | 'MESSAGE_REACTION'
    | 'PICK_COMMENT';
  createdAt: string;
  lobbyId: string | null;
  lobbyName: string | null;
  emoji?: string;
  player?: { name: string; position: string; nflTeam: string };
  commentBody?: string;
}

function timeAgo(iso: string): string {
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  return days < 7 ? `${days}d` : new Date(iso).toLocaleDateString();
}

function memberSince(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

const PROFILE_TABS: ProfileTab[] = ['stats', 'activity', 'drafts', 'friends'];

export function ProfilePage() {
  const { userId: routeUserId } = useParams();
  const [searchParams] = useSearchParams();
  const { session, profile: authProfile } = useAuth();
  const myUserId = session?.user.id;
  const targetId = routeUserId ?? myUserId;
  const isSelf = !!targetId && targetId === myUserId;
  // Supports deep-linking directly to a tab, e.g. ?tab=friends.
  const requestedTab = searchParams.get('tab');
  const initialTab: ProfileTab =
    requestedTab && (PROFILE_TABS as string[]).includes(requestedTab)
      ? (requestedTab as ProfileTab)
      : 'stats';
  // Own username/avatar are already known from AuthContext, independent of
  // this page's own fetch below — used as the header's fallback so your own
  // profile still shows an identity even if the stats/activity request fails.
  const selfUsername =
    authProfile?.username ??
    (session?.user.user_metadata?.username as string | undefined) ??
    session?.user.email ??
    'drafter';

  // ── Public profile bundle (header + stats + activity) ──
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [stats, setStats] = useState<ProfileStats | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileError, setProfileError] = useState(false);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [activityMore, setActivityMore] = useState(false);
  const [activityHasMore, setActivityHasMore] = useState(false);
  const activityCursor = useRef<string | null>(null);

  useEffect(() => {
    if (!targetId) return;
    setProfileLoading(true);
    setProfileError(false);
    void api<{
      profile: ProfileData;
      stats: ProfileStats;
      items: ActivityItem[];
      nextCursor: string | null;
      hasMore: boolean;
    }>(`/users/${targetId}/profile`)
      .then(({ profile, stats, items, nextCursor, hasMore }) => {
        setProfile(profile);
        setStats(stats);
        setActivity(items);
        activityCursor.current = nextCursor;
        setActivityHasMore(hasMore);
      })
      .catch(() => setProfileError(true))
      .finally(() => setProfileLoading(false));
  }, [targetId]);

  const loadMoreActivity = useCallback(() => {
    if (!targetId || !activityCursor.current) return;
    setActivityMore(true);
    void api<{ items: ActivityItem[]; nextCursor: string | null; hasMore: boolean }>(
      `/users/${targetId}/activity?before=${encodeURIComponent(activityCursor.current)}`,
    )
      .then(({ items, nextCursor, hasMore }) => {
        setActivity((prev) => [...prev, ...items]);
        activityCursor.current = nextCursor;
        setActivityHasMore(hasMore);
      })
      .catch(() => {})
      .finally(() => setActivityMore(false));
  }, [targetId]);

  const activitySentinel = useInfiniteScroll(loadMoreActivity, {
    hasMore: activityHasMore,
    loading: activityMore,
  });

  // ── Friends / Drafts tabs — lazy-loaded read-only lists, only fetched once
  // the tab is actually opened (rather than bundled into the initial fetch). ──
  const [tab, setTab] = useState<ProfileTab>(initialTab);
  const [friends, setFriends] = useState<FriendMini[] | null>(null);
  const [friendsLoading, setFriendsLoading] = useState(false);
  const [publicDrafts, setPublicDrafts] = useState<PublicDraft[] | null>(null);
  const [draftsLoading, setDraftsLoading] = useState(false);

  // Reset per-profile state when navigating from one user's profile to
  // another (route param changes but the component stays mounted) — but not
  // on the very first render, which would otherwise stomp the ?tab= param above.
  const prevTargetId = useRef(targetId);
  useEffect(() => {
    if (prevTargetId.current === targetId) return;
    prevTargetId.current = targetId;
    setTab('stats');
    setFriends(null);
    setPublicDrafts(null);
  }, [targetId]);

  useEffect(() => {
    if (tab !== 'friends' || friends !== null || !targetId) return;
    setFriendsLoading(true);
    void api<{ friends: FriendMini[] }>(`/users/${targetId}/friends`)
      .then(({ friends }) => setFriends(friends))
      .catch(() => setFriends([]))
      .finally(() => setFriendsLoading(false));
  }, [tab, targetId, friends]);

  useEffect(() => {
    if (tab !== 'drafts' || publicDrafts !== null || !targetId) return;
    setDraftsLoading(true);
    void api<{ drafts: PublicDraft[] }>(`/users/${targetId}/drafts`)
      .then(({ drafts }) => setPublicDrafts(drafts))
      .catch(() => setPublicDrafts([]))
      .finally(() => setDraftsLoading(false));
  }, [tab, targetId, publicDrafts]);

  const username = profile?.username ?? (isSelf ? selfUsername : '…');
  const avatarData =
    profile?.avatar ?? (isSelf ? authProfile?.avatar : null) ?? defaultAvatar(targetId ?? username);

  const tabs: { key: ProfileTab; label: string }[] = [
    { key: 'stats', label: 'Stats' },
    { key: 'activity', label: 'Activity' },
    { key: 'drafts', label: 'Drafts' },
    { key: 'friends', label: 'Friends' },
  ];

  return (
    <main className="profile">
      <header className="profile__header">
        <div className="profile__identity">
          <Avatar avatar={avatarData} size={48} />
          <div className="profile__identity-text">
            <h1>{username}</h1>
            {profile && (
              <span className="muted">Member since {memberSince(profile.createdAt)}</span>
            )}
          </div>
        </div>
      </header>

      <div className="segmented profile__tabs">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`segmented__opt${tab === t.key ? ' segmented__opt--on' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'stats' &&
        (profileError ? (
          <p className="muted profile__missing">This profile could not be loaded.</p>
        ) : stats ? (
          <ProfileStatsBlock stats={stats} />
        ) : (
          <div className="section-loading">
            <Loader label="Loading stats…" />
          </div>
        ))}

      {tab === 'activity' && (
        <section className="profile__section">
          {profileError ? (
            <p className="muted profile__missing">This profile could not be loaded.</p>
          ) : profileLoading ? (
            <div className="section-loading section-loading--inline">
              <Loader label="Loading activity…" />
            </div>
          ) : activity.length === 0 ? (
            <p className="muted">
              {isSelf ? 'No public activity yet.' : 'Nothing to show here yet.'}
            </p>
          ) : (
            <>
              <ul className="activity-feed">
                {activity.map((item) => (
                  <ActivityRow key={item.id} item={item} />
                ))}
              </ul>
              {activityHasMore && <div ref={activitySentinel} className="activity-feed__sentinel" />}
              {activityMore && (
                <div className="section-loading section-loading--inline">
                  <Loader label="Loading…" />
                </div>
              )}
            </>
          )}
        </section>
      )}

      {tab === 'drafts' && (
        <section className="profile__section">
          {draftsLoading ? (
            <div className="section-loading section-loading--inline">
              <Loader label="Loading drafts…" />
            </div>
          ) : !publicDrafts || publicDrafts.length === 0 ? (
            <p className="muted">
              {isSelf ? "You don't have any public drafts yet." : 'No public drafts to show.'}
            </p>
          ) : (
            <ul className="draft-list">
              {publicDrafts.map((d) => (
                <PublicDraftRow key={d.id} draft={d} />
              ))}
            </ul>
          )}
        </section>
      )}

      {tab === 'friends' && (
        <section className="profile__section">
          {friendsLoading ? (
            <div className="section-loading section-loading--inline">
              <Loader label="Loading friends…" />
            </div>
          ) : !friends || friends.length === 0 ? (
            <p className="muted">
              {isSelf ? "You haven't added any friends yet." : 'No friends to show.'}
            </p>
          ) : (
            <ul className="friend-list">
              {friends.map((f) => (
                <li key={f.id} className="friend-list__row">
                  <ProfileLink userId={f.id}>
                    <Avatar avatar={f.avatar ?? defaultAvatar(f.id)} size={36} />
                  </ProfileLink>
                  <ProfileLink userId={f.id} className="friend-list__name">
                    {f.username}
                  </ProfileLink>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}

function ProfileStatsBlock({ stats }: { stats: ProfileStats }) {
  return (
    <section className="profile__section">
      <div className="profile-stats">
        <div className="profile-stat">
          <span className="profile-stat__value">{stats.totalDrafts}</span>
          <span className="profile-stat__label">
            <LayersOutlinedIcon className="profile-stat__icon" fontSize="inherit" />
            Drafts
          </span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat__value">{stats.liveDrafts}</span>
          <span className="profile-stat__label">
            <SportsFootballOutlinedIcon className="profile-stat__icon" fontSize="inherit" />
            Live
          </span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat__value">{stats.mockDrafts}</span>
          <span className="profile-stat__label">
            <SmartToyOutlinedIcon className="profile-stat__icon" fontSize="inherit" />
            Mock
          </span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat__value">{stats.completedDrafts}</span>
          <span className="profile-stat__label">
            <CheckCircleOutlinedIcon className="profile-stat__icon" fontSize="inherit" />
            Completed
          </span>
        </div>
        <div className="profile-stat">
          <span className="profile-stat__value">{stats.totalPicks}</span>
          <span className="profile-stat__label">
            <TouchAppOutlinedIcon className="profile-stat__icon" fontSize="inherit" />
            Picks made
          </span>
        </div>
      </div>

      {stats.mostPicked.length > 0 && (
        <div className="most-picked">
          <h3 className="most-picked__title">Most-drafted players</h3>
          <ul className="most-picked__list">
            {stats.mostPicked.map((p) => (
              <li key={p.playerId} className="most-picked__row">
                <span
                  className="most-picked__pos"
                  style={{ background: POSITION_COLORS[p.position as Position] }}
                >
                  {p.position === 'DEF' ? 'D/ST' : p.position}
                </span>
                <span className="most-picked__name">{p.name}</span>
                <span className="most-picked__team muted">{p.nflTeam}</span>
                <span className="most-picked__count">×{p.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ActivityRow({ item }: { item: ActivityItem }) {
  let icon: ReactNode;
  let text: ReactNode;
  switch (item.kind) {
    case 'DRAFT_COMPLETED':
      icon = <EmojiEventsOutlinedIcon fontSize="small" />;
      text = <>Completed a draft</>;
      break;
    case 'OPEN_LOBBY_CREATED':
      icon = <SportsFootballIcon fontSize="small" />;
      text = <>Opened a lobby</>;
      break;
    case 'PICK_REACTION':
      icon = <span className="activity-row__emoji">{item.emoji}</span>;
      text = item.player ? (
        <>
          Reacted to <strong>{item.player.name}</strong>'s pick
        </>
      ) : (
        <>Reacted to a pick</>
      );
      break;
    case 'MESSAGE_REACTION':
      icon = <span className="activity-row__emoji">{item.emoji}</span>;
      text = <>Reacted to a message</>;
      break;
    case 'PICK_COMMENT':
      icon = <ChatBubbleOutlineIcon fontSize="small" />;
      text = item.player ? (
        <>
          Commented on <strong>{item.player.name}</strong>'s pick
        </>
      ) : (
        <>Commented on a pick</>
      );
      break;
  }

  const to =
    item.lobbyId && item.kind === 'OPEN_LOBBY_CREATED'
      ? `/lobby/${item.lobbyId}`
      : item.lobbyId
        ? `/lobby/${item.lobbyId}/draft`
        : null;

  const body = (
    <>
      <span className="activity-row__icon">{icon}</span>
      <span className="activity-row__body">
        <span className="activity-row__text">{text}</span>
        <span className="activity-row__meta muted">
          {item.lobbyName && <span className="activity-row__lobby">{item.lobbyName}</span>}
          <span className="activity-row__time">{timeAgo(item.createdAt)}</span>
        </span>
        {item.commentBody && (
          <span className="activity-row__quote">“{item.commentBody}”</span>
        )}
      </span>
    </>
  );

  return (
    <li className="activity-row">
      {to ? (
        <Link to={to} className="activity-row__link">
          {body}
        </Link>
      ) : (
        <div className="activity-row__link activity-row__link--static">{body}</div>
      )}
    </li>
  );
}

function PublicDraftRow({ draft }: { draft: PublicDraft }) {
  const { settings } = draft;
  const live = draft.status === 'DRAFTING' || draft.status === 'COMPLETE';
  const to = live ? `/lobby/${draft.id}/draft` : `/lobby/${draft.id}`;
  const preset = matchPreset(settings.scoring);
  return (
    <li className="draft-list__item">
      <Link to={to} className="draft-list__row">
        <div className="draft-list__main">
          <div className="draft-list__name-row">
            <span className="draft-list__name">{draft.name}</span>
            <span className="draft-list__badge">
              {settings.draftMode === 'MOCK' ? '🤖 Mock' : '🏈 Live'}
            </span>
            <span className="draft-list__badge">
              {settings.visibility === 'OPEN' ? '🌐 Open' : '🔒 Private'}
            </span>
          </div>
          <span className="muted">
            {settings.teamCount} teams · {settings.draftType === 'SNAKE' ? 'Snake' : 'Straight'}
            {' · '}
            {preset ? SCORING_PRESETS[preset].label : 'Custom scoring'} ·{' '}
            {new Date(draft.createdAt).toLocaleDateString()}
          </span>
        </div>
        <span className={`status-pill status-pill--${draft.status.toLowerCase()}`}>
          {draft.status}
        </span>
      </Link>
    </li>
  );
}
