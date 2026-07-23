import {
  POSITION_COLORS,
  REACTION_EMOJIS,
  containsSlur,
  defaultAvatar,
  type Avatar as AvatarData,
  type LobbyStatus,
  type Position,
} from '@draft-lobby/shared';
import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined';
import CloseIcon from '@mui/icons-material/Close';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import ReplyIcon from '@mui/icons-material/Reply';
import SendIcon from '@mui/icons-material/Send';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { supabase } from '../../supabase';
import { avatarForTeam } from '../../lib/teamAvatar';
import { renderMentionText } from '../../lib/renderMentions';
import type {
  ChatMessageRow,
  ChatReactionRow,
  MemberRow,
  PickRow,
  PlayerRow,
  TeamRow,
} from '../../lib/types';
import { Avatar } from '../Avatar/Avatar';
import { MentionInput } from '../MentionInput/MentionInput';
import { ReactorsModal, type Reactor } from '../ReactorsModal/ReactorsModal';
import './DraftChat.scss';

interface Props {
  lobbyId: string;
  status: LobbyStatus;
  completedAt: string | null;
  /** Commissioner-configured delay (ms) after the draft ends before chat and
   * reactions lock — one combined timer. */
  chatLockMs: number;
  picks: PickRow[];
  teamsById: Map<string, TeamRow>;
  playersById: Map<string, PlayerRow>;
  members: MemberRow[];
  /** When false (e.g. a collapsed mobile drawer), new items are counted as unread. */
  active?: boolean;
  onUnread?: (count: number) => void;
  /** Click a "replied to pick" line to open that pick's detail modal. */
  onOpenPick?: (pick: PickRow) => void;
  /** Scroll to + briefly highlight this message once it's loaded (deep link
   * from a notification for a mention or a reaction on a plain message). */
  focusMessageId?: string | null;
  /** Called once the requested scroll/highlight has been carried out. */
  onFocusHandled?: () => void;
  /** A non-member viewing a public draft's chat — read-only, no compose/react. */
  viewOnly?: boolean;
}

type TargetType = 'MESSAGE' | 'PICK';
interface ReactionEntry {
  counts: Record<string, number>;
  mine: Set<string>;
  /** Who used each emoji (for the hover tooltip + the full reactions modal). */
  reactors: Record<string, Reactor[]>;
}

type Item =
  | {
      type: 'msg';
      id: string;
      at: string;
      userId: string;
      body: string;
      replyToPickId: string | null;
    }
  | { type: 'sys'; id: string; at: string; body: string }
  | { type: 'pick'; id: string; at: string; pick: PickRow }
  | { type: 'reaction'; id: string; at: string; userId: string; emoji: string; pickId: string };

export function DraftChat({
  lobbyId,
  status,
  completedAt,
  chatLockMs,
  picks,
  teamsById,
  playersById,
  members,
  active = true,
  onUnread,
  onOpenPick,
  focusMessageId,
  onFocusHandled,
  viewOnly = false,
}: Props) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const lastSeenRef = useRef(0);
  const initedRef = useRef(false);

  const [messages, setMessages] = useState<ChatMessageRow[]>([]);
  const [reactions, setReactions] = useState<ChatReactionRow[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [atBottom, setAtBottom] = useState(true);
  // Set when the user hits "reply" on a pick line — the next send posts as a
  // pick comment instead of a plain message.
  const [replyTarget, setReplyTarget] = useState<PickRow | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composeRef = useRef<HTMLInputElement>(null);
  const atBottomRef = useRef(true);

  function onScroll() {
    const el = scrollRef.current;
    if (!el) return;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    atBottomRef.current = near;
    setAtBottom(near);
  }
  function jumpToLive() {
    atBottomRef.current = true;
    setAtBottom(true);
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }

  // ── Load + realtime ──
  useEffect(() => {
    void supabase
      .from('chat_messages')
      .select('*')
      .eq('lobby_id', lobbyId)
      .order('created_at')
      .then(({ data }) => setMessages((data ?? []) as ChatMessageRow[]));
    const loadReactions = () =>
      supabase
        .from('chat_reactions')
        .select('*')
        .eq('lobby_id', lobbyId)
        .then(({ data }) => setReactions((data ?? []) as ChatReactionRow[]));
    void loadReactions();

    const channel = supabase
      .channel(`chat:${lobbyId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'chat_messages', filter: `lobby_id=eq.${lobbyId}` },
        (payload) => setMessages((prev) => [...prev, payload.new as ChatMessageRow]),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'chat_reactions', filter: `lobby_id=eq.${lobbyId}` },
        () => void loadReactions(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [lobbyId]);

  const picksById = useMemo(() => {
    const m = new Map<string, PickRow>();
    for (const p of picks) m.set(p.id, p);
    return m;
  }, [picks]);

  const userMap = useMemo(() => {
    const m = new Map<string, { username: string; avatar: AvatarData | null }>();
    for (const mem of members) {
      m.set(mem.user_id, {
        username: mem.profiles?.username ?? 'Player',
        avatar: mem.profiles?.avatar ?? null,
      });
    }
    return m;
  }, [members]);

  const memberUsernames = useMemo(
    () => members.map((m) => m.profiles?.username).filter((u): u is string => !!u),
    [members],
  );

  // Merge chat + picks into one time-ordered timeline.
  const items = useMemo<Item[]>(() => {
    const out: Item[] = [];
    for (const m of messages) {
      out.push(
        m.kind === 'SYSTEM'
          ? { type: 'sys', id: m.id, at: m.created_at, body: m.body }
          : {
              type: 'msg',
              id: m.id,
              at: m.created_at,
              userId: m.user_id,
              body: m.body,
              replyToPickId: m.reply_to_pick_id,
            },
      );
    }
    for (const p of picks) out.push({ type: 'pick', id: p.id, at: p.picked_at, pick: p });
    // A small "so-and-so reacted to that pick" line — like a reply, but for
    // reactions on picks specifically (not messages/comments).
    for (const r of reactions) {
      if (r.target_type !== 'PICK') continue;
      out.push({
        type: 'reaction',
        id: r.id,
        at: r.created_at,
        userId: r.user_id,
        emoji: r.emoji,
        pickId: r.target_id,
      });
    }
    out.sort((a, b) => a.at.localeCompare(b.at));
    return out;
  }, [messages, picks, reactions]);

  const [highlightId, setHighlightId] = useState<string | null>(null);
  // Set when the "who reacted" icon is clicked — shows the full reactions modal.
  const [reactorsModal, setReactorsModal] = useState<Record<string, Reactor[]> | null>(null);

  // Deep-link from a notification: once the target message has loaded, scroll
  // to it and flash-highlight it (mentions, or a reaction on a plain message).
  useEffect(() => {
    if (!focusMessageId) return;
    if (!items.some((it) => it.id === focusMessageId)) return; // still loading
    const targetId = focusMessageId;
    const t = window.setTimeout(() => {
      document
        .getElementById(`chat-msg-${targetId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setHighlightId(targetId);
      onFocusHandled?.();
      window.setTimeout(() => setHighlightId((h) => (h === targetId ? null : h)), 2200);
    }, 60);
    return () => window.clearTimeout(t);
  }, [focusMessageId, items, onFocusHandled]);

  const reactionsByTarget = useMemo(() => {
    const m = new Map<string, ReactionEntry>();
    for (const r of reactions) {
      const key = `${r.target_type}:${r.target_id}`;
      const entry = m.get(key) ?? { counts: {}, mine: new Set<string>(), reactors: {} };
      entry.counts[r.emoji] = (entry.counts[r.emoji] ?? 0) + 1;
      if (r.user_id === userId) entry.mine.add(r.emoji);
      (entry.reactors[r.emoji] ??= []).push({
        userId: r.user_id,
        username: userMap.get(r.user_id)?.username ?? 'Someone',
        avatar: userMap.get(r.user_id)?.avatar ?? null,
      });
      m.set(key, entry);
    }
    return m;
  }, [reactions, userId, userMap]);

  // ── Lock: chatLockMs after the draft ends — chat and reactions share it ──
  const lastPickAt = picks.reduce((max, p) => (p.picked_at > max ? p.picked_at : max), '');
  const endedAt = status === 'COMPLETE' ? completedAt ?? (lastPickAt || null) : null;
  const lockAtMs = endedAt ? new Date(endedAt).getTime() + chatLockMs : null;
  const locked = viewOnly || (!!lockAtMs && nowMs >= lockAtMs);
  const reactionsLocked = locked;
  useEffect(() => {
    if (lockAtMs == null || lockAtMs <= Date.now()) return;
    const t = setTimeout(() => setNowMs(Date.now()), lockAtMs - Date.now() + 500);
    return () => clearTimeout(t);
  }, [lockAtMs]);

  // Keep pinned to the newest item — but only if the reader is already at the
  // bottom, so scrolling up to read history isn't yanked back down.
  useEffect(() => {
    if (atBottomRef.current) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [items.length]);

  // When the drawer (re)opens, jump to the newest message.
  useEffect(() => {
    if (active) {
      atBottomRef.current = true;
      setAtBottom(true);
      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: 'end' }));
    }
  }, [active]);

  // Report unread count while inactive (mobile drawer collapsed).
  useEffect(() => {
    if (!initedRef.current) {
      if (items.length === 0) return; // wait for the initial load to settle
      initedRef.current = true;
      lastSeenRef.current = items.length;
      onUnread?.(0);
      return;
    }
    if (active) {
      lastSeenRef.current = items.length;
      onUnread?.(0);
    } else {
      onUnread?.(Math.max(0, items.length - lastSeenRef.current));
    }
  }, [items.length, active, onUnread]);

  async function send(e: FormEvent) {
    e.preventDefault();
    const body = draft.trim();
    if (!body || locked) return;
    if (containsSlur(body)) {
      setError('That message contains language that isn’t allowed here');
      return;
    }
    setSending(true);
    setError(null);
    try {
      if (replyTarget) {
        await api(`/lobbies/${lobbyId}/pick-comment`, {
          method: 'POST',
          body: { pickId: replyTarget.id, body },
        });
      } else {
        await api(`/lobbies/${lobbyId}/chat`, { method: 'POST', body: { body } });
      }
      setDraft('');
      setReplyTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  async function react(targetType: TargetType, targetId: string, emoji: string) {
    if (reactionsLocked) return;
    try {
      await api(`/lobbies/${lobbyId}/chat-react`, {
        method: 'POST',
        body: { targetType, targetId, emoji },
      });
    } catch {
      /* realtime will reconcile; ignore transient errors */
    }
  }

  return (
    <div className="chat">
      <div className="chat__scroll" ref={scrollRef} onScroll={onScroll}>
        {items.length === 0 && (
          <p className="muted chat__empty">No messages yet. Say something!</p>
        )}
        {items.map((it) => {
          if (it.type === 'sys') {
            return (
              <div
                key={it.id}
                className={`chat__system${it.body.startsWith('↩️') ? ' chat__system--danger' : ''}`}
              >
                {it.body}
              </div>
            );
          }
          if (it.type === 'reaction') {
            const pick = picksById.get(it.pickId);
            if (!pick) return null; // pick not loaded yet
            const team = teamsById.get(pick.team_id);
            const player = playersById.get(pick.player_id);
            const u = userMap.get(it.userId);
            const label = (
              <>
                <strong>{u?.username ?? 'Someone'}</strong> {it.emoji}&rsquo;d to{' '}
                <strong>{team?.name ?? 'a team'}</strong>
                {player ? ` — ${player.name}` : ''}
                <span className="muted"> · Pick {pick.overall}</span>
              </>
            );
            return (
              <div key={it.id} className="chat__reaction">
                <Avatar avatar={u?.avatar ?? defaultAvatar(it.userId)} size={20} />
                {onOpenPick ? (
                  <button
                    type="button"
                    className="chat__reaction-text chat__reaction-text--link"
                    onClick={() => onOpenPick(pick)}
                  >
                    {label}
                  </button>
                ) : (
                  <span className="chat__reaction-text">{label}</span>
                )}
                <span className="chat__msg-time">{formatTime(it.at)}</span>
              </div>
            );
          }
          if (it.type === 'pick') {
            const { pick } = it;
            const team = teamsById.get(pick.team_id);
            const player = playersById.get(pick.player_id);
            const pickMainContent = (
              <>
                {team && (
                  <span className="chat__pick-avatar">
                    <Avatar avatar={avatarForTeam(team, members)} size={20} />
                  </span>
                )}
                <span className="chat__pick-text">
                  <strong>{team?.name ?? 'A team'}</strong>
                  <span>drafted</span>
                  {player && (
                    <span
                      className="chat__pick-pos"
                      style={{ background: POSITION_COLORS[player.position as Position] }}
                    >
                      {player.position}
                    </span>
                  )}
                  <strong>{player?.name ?? 'a player'}</strong>
                  <span className="muted">· Pick {pick.overall}</span>
                </span>
              </>
            );
            return (
              <div key={it.id} className="chat__pick">
                {onOpenPick ? (
                  <button
                    type="button"
                    className="chat__pick-main chat__pick-main--link"
                    onClick={() => onOpenPick(pick)}
                  >
                    {pickMainContent}
                  </button>
                ) : (
                  <div className="chat__pick-main">{pickMainContent}</div>
                )}
                <div className="chat__pick-actions">
                  <ReactionBar
                    entry={reactionsByTarget.get(`PICK:${pick.id}`)}
                    onReact={(emoji) => react('PICK', pick.id, emoji)}
                    onShowAllReactions={() =>
                      setReactorsModal(reactionsByTarget.get(`PICK:${pick.id}`)?.reactors ?? {})
                    }
                    disabled={reactionsLocked}
                  />
                  {!locked && (
                    <button
                      type="button"
                      className="chat__reply-btn"
                      aria-label={`Reply to ${team?.name ?? 'this'} pick`}
                      title="Reply"
                      onClick={() => {
                        setReplyTarget(pick);
                        composeRef.current?.focus();
                      }}
                    >
                      <ReplyIcon sx={{ fontSize: 16 }} />
                    </button>
                  )}
                </div>
              </div>
            );
          }
          const u = userMap.get(it.userId);
          const mine = it.userId === userId;
          const repliedPick = it.replyToPickId ? picksById.get(it.replyToPickId) : null;
          const repliedPlayer = repliedPick
            ? playersById.get(repliedPick.player_id)
            : null;
          return (
            <div
              key={it.id}
              id={`chat-msg-${it.id}`}
              className={`chat__msg${mine ? ' chat__msg--mine' : ''}${
                highlightId === it.id ? ' chat__msg--focused' : ''
              }`}
            >
              <Avatar avatar={u?.avatar ?? defaultAvatar(it.userId)} size={28} />
              <div className="chat__msg-body">
                <div className="chat__msg-head">
                  <span className="chat__msg-name">{u?.username ?? 'Player'}</span>
                  <span className="chat__msg-time">{formatTime(it.at)}</span>
                </div>
                {repliedPick &&
                  (onOpenPick ? (
                    <button
                      type="button"
                      className="chat__reply chat__reply--link"
                      onClick={() => onOpenPick(repliedPick)}
                    >
                      ↩ replied to{' '}
                      <strong>
                        {teamsById.get(repliedPick.team_id)?.name ?? 'a team'}
                      </strong>
                      {repliedPlayer ? ` — ${repliedPlayer.name}` : ''}
                      <span className="muted"> · Pick {repliedPick.overall}</span>
                    </button>
                  ) : (
                    <div className="chat__reply">
                      ↩ replied to{' '}
                      <strong>
                        {teamsById.get(repliedPick.team_id)?.name ?? 'a team'}
                      </strong>
                      {repliedPlayer ? ` — ${repliedPlayer.name}` : ''}
                      <span className="muted"> · Pick {repliedPick.overall}</span>
                    </div>
                  ))}
                <div className="chat__msg-text">{renderMentionText(it.body, memberUsernames)}</div>
                <ReactionBar
                  entry={reactionsByTarget.get(`MESSAGE:${it.id}`)}
                  onReact={(emoji) => react('MESSAGE', it.id, emoji)}
                  onShowAllReactions={() =>
                    setReactorsModal(reactionsByTarget.get(`MESSAGE:${it.id}`)?.reactors ?? {})
                  }
                  disabled={reactionsLocked}
                />
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {!atBottom && (
        <button type="button" className="chat__jump" onClick={jumpToLive}>
          ↓ Scroll to live
        </button>
      )}

      {error && <p className="chat__error">{error}</p>}

      {locked ? (
        <div className="chat__locked">
          {viewOnly ? (
            '👀 View only — chat is private to lobby members.'
          ) : (
            <span className="bot-badge bot-badge--warn">
              <LockOutlinedIcon fontSize="inherit" /> Chat is locked for this draft
            </span>
          )}
        </div>
      ) : (
        <>
          {replyTarget && (
            <div className="chat__reply-banner">
              <span>
                Replying to{' '}
                <strong>{teamsById.get(replyTarget.team_id)?.name ?? 'a team'}</strong>
                {(() => {
                  const p = playersById.get(replyTarget.player_id);
                  return p ? ` — ${p.name}` : '';
                })()}
              </span>
              <button
                type="button"
                aria-label="Cancel reply"
                onClick={() => setReplyTarget(null)}
              >
                <CloseIcon sx={{ fontSize: 14 }} />
              </button>
            </div>
          )}
          <form className="chat__compose" onSubmit={send}>
            <MentionInput
              value={draft}
              onChange={setDraft}
              members={members}
              placeholder={replyTarget ? 'Reply…' : 'Message…'}
              maxLength={1000}
              inputRef={composeRef}
            />
            <button
              className="chat__send"
              disabled={sending || !draft.trim()}
              aria-label="Send"
            >
              <SendIcon fontSize="small" />
            </button>
          </form>
        </>
      )}

      {reactorsModal && (
        <ReactorsModal reactors={reactorsModal} onClose={() => setReactorsModal(null)} />
      )}
    </div>
  );
}

function ReactionBar({
  entry,
  onReact,
  onShowAllReactions,
  disabled = false,
}: {
  entry: ReactionEntry | undefined;
  onReact: (emoji: string) => void;
  onShowAllReactions: () => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = entry ? Object.keys(entry.counts) : [];

  return (
    <div className="chat-react">
      {active.map((e) => {
        const names = (entry?.reactors[e] ?? []).map((r) => r.username);
        return (
          <button
            key={e}
            className={`chat-react__chip${entry?.mine.has(e) ? ' is-mine' : ''}`}
            onClick={() => onReact(e)}
            disabled={disabled}
          >
            <span>{e}</span>
            <span className="chat-react__count">{entry?.counts[e]}</span>
            {names.length > 0 && (
              <span className="chat-react__tip" role="tooltip">
                {tipText(names)}
              </span>
            )}
          </button>
        );
      })}
      {active.length > 0 && (
        <button
          type="button"
          className="chat-react__viewall"
          aria-label="See who reacted"
          title="See who reacted"
          onClick={onShowAllReactions}
        >
          <PeopleAltOutlinedIcon sx={{ fontSize: 15 }} />
        </button>
      )}
      {!disabled && (
        <button
          className="chat-react__add"
          onClick={() => setOpen((o) => !o)}
          aria-label="Add reaction"
        >
          <AddReactionOutlinedIcon sx={{ fontSize: 16 }} />
        </button>
      )}
      {open && (
        <div className="chat-react__palette">
          {REACTION_EMOJIS.map((e) => (
            <button
              key={e}
              onClick={() => {
                onReact(e);
                setOpen(false);
              }}
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Cap the hover tooltip's name list — a draft with dozens of reactors would
// otherwise blow it up into an unreadable block. The "see who reacted" icon
// still opens the full scrollable list, filterable by emoji.
const TIP_CAP = 8;
function tipText(names: string[]): string {
  if (names.length <= TIP_CAP) return names.join(', ');
  return `${names.slice(0, TIP_CAP).join(', ')} +${names.length - TIP_CAP} more`;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
