import {
  CHAT_LOCK_MS,
  POSITION_COLORS,
  REACTION_EMOJIS,
  defaultAvatar,
  type Avatar as AvatarData,
  type LobbyStatus,
  type Position,
} from '@draft-lobby/shared';
import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined';
import SendIcon from '@mui/icons-material/Send';
import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { supabase } from '../../supabase';
import type {
  ChatMessageRow,
  ChatReactionRow,
  MemberRow,
  PickRow,
  PlayerRow,
  TeamRow,
} from '../../lib/types';
import { Avatar } from '../Avatar/Avatar';
import './DraftChat.scss';

interface Props {
  lobbyId: string;
  status: LobbyStatus;
  completedAt: string | null;
  picks: PickRow[];
  teamsById: Map<string, TeamRow>;
  playersById: Map<string, PlayerRow>;
  members: MemberRow[];
  /** When false (e.g. a collapsed mobile drawer), new items are counted as unread. */
  active?: boolean;
  onUnread?: (count: number) => void;
}

type TargetType = 'MESSAGE' | 'PICK';
interface ReactionEntry {
  counts: Record<string, number>;
  mine: Set<string>;
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
  | { type: 'pick'; id: string; at: string; pick: PickRow };

export function DraftChat({
  lobbyId,
  status,
  completedAt,
  picks,
  teamsById,
  playersById,
  members,
  active = true,
  onUnread,
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
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
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
    out.sort((a, b) => a.at.localeCompare(b.at));
    return out;
  }, [messages, picks]);

  const reactionsByTarget = useMemo(() => {
    const m = new Map<string, ReactionEntry>();
    for (const r of reactions) {
      const key = `${r.target_type}:${r.target_id}`;
      const entry = m.get(key) ?? { counts: {}, mine: new Set<string>() };
      entry.counts[r.emoji] = (entry.counts[r.emoji] ?? 0) + 1;
      if (r.user_id === userId) entry.mine.add(r.emoji);
      m.set(key, entry);
    }
    return m;
  }, [reactions, userId]);

  // ── Lock: CHAT_LOCK_MS after the draft ends ──
  const lastPickAt = picks.reduce((max, p) => (p.picked_at > max ? p.picked_at : max), '');
  const endedAt = status === 'COMPLETE' ? completedAt ?? (lastPickAt || null) : null;
  const lockAtMs = endedAt ? new Date(endedAt).getTime() + CHAT_LOCK_MS : null;
  const locked = !!lockAtMs && nowMs >= lockAtMs;
  useEffect(() => {
    if (!lockAtMs) return;
    const remaining = lockAtMs - Date.now();
    if (remaining <= 0) return;
    const t = setTimeout(() => setNowMs(Date.now()), remaining + 500);
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
    setSending(true);
    setError(null);
    try {
      await api(`/lobbies/${lobbyId}/chat`, { method: 'POST', body: { body } });
      setDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSending(false);
    }
  }

  async function react(targetType: TargetType, targetId: string, emoji: string) {
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
              <div key={it.id} className="chat__system">
                {it.body}
              </div>
            );
          }
          if (it.type === 'pick') {
            const { pick } = it;
            const team = teamsById.get(pick.team_id);
            const player = playersById.get(pick.player_id);
            return (
              <div key={it.id} className="chat__pick">
                <div className="chat__pick-main">
                  {player && (
                    <span
                      className="chat__pick-pos"
                      style={{ background: POSITION_COLORS[player.position as Position] }}
                    >
                      {player.position}
                    </span>
                  )}
                  <span className="chat__pick-text">
                    <strong>{team?.name ?? 'A team'}</strong> drafted{' '}
                    <strong>{player?.name ?? 'a player'}</strong>
                    <span className="muted"> · Pick {pick.overall}</span>
                  </span>
                </div>
                <ReactionBar
                  entry={reactionsByTarget.get(`PICK:${pick.id}`)}
                  onReact={(emoji) => react('PICK', pick.id, emoji)}
                />
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
            <div key={it.id} className={`chat__msg${mine ? ' chat__msg--mine' : ''}`}>
              <Avatar avatar={u?.avatar ?? defaultAvatar(it.userId)} size={28} />
              <div className="chat__msg-body">
                <div className="chat__msg-head">
                  <span className="chat__msg-name">{u?.username ?? 'Player'}</span>
                  <span className="chat__msg-time">{formatTime(it.at)}</span>
                </div>
                {repliedPick && (
                  <div className="chat__reply">
                    ↩ replied to{' '}
                    <strong>
                      {teamsById.get(repliedPick.team_id)?.name ?? 'a team'}
                    </strong>
                    {repliedPlayer ? ` — ${repliedPlayer.name}` : ''}
                    <span className="muted"> · Pick {repliedPick.overall}</span>
                  </div>
                )}
                <div className="chat__msg-text">{it.body}</div>
                <ReactionBar
                  entry={reactionsByTarget.get(`MESSAGE:${it.id}`)}
                  onReact={(emoji) => react('MESSAGE', it.id, emoji)}
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
        <div className="chat__locked">🔒 Chat is locked for this draft.</div>
      ) : (
        <form className="chat__compose" onSubmit={send}>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Message…"
            maxLength={1000}
          />
          <button
            className="chat__send"
            disabled={sending || !draft.trim()}
            aria-label="Send"
          >
            <SendIcon fontSize="small" />
          </button>
        </form>
      )}
    </div>
  );
}

function ReactionBar({
  entry,
  onReact,
}: {
  entry: ReactionEntry | undefined;
  onReact: (emoji: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const active = entry ? Object.keys(entry.counts) : [];

  return (
    <div className="chat-react">
      {active.map((e) => (
        <button
          key={e}
          className={`chat-react__chip${entry?.mine.has(e) ? ' is-mine' : ''}`}
          onClick={() => onReact(e)}
        >
          <span>{e}</span>
          <span className="chat-react__count">{entry?.counts[e]}</span>
        </button>
      ))}
      <button
        className="chat-react__add"
        onClick={() => setOpen((o) => !o)}
        aria-label="Add reaction"
      >
        <AddReactionOutlinedIcon sx={{ fontSize: 16 }} />
      </button>
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

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}
