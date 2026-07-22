import { POSITION_COLORS, REACTION_EMOJIS, type Position } from '@draft-lobby/shared';
import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import UndoIcon from '@mui/icons-material/Undo';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { renderMentionText } from '../../lib/renderMentions';
import { useModalClose } from '../../lib/useModalClose';
import type { MemberRow, PickRow, PlayerRow, TeamRow } from '../../lib/types';
import type { ReactionEntry } from '../DraftGrid/DraftGrid';
import { MentionInput } from '../MentionInput/MentionInput';
import './PickModal.scss';

export interface PickComment {
  id: string;
  author: string;
  body: string;
  at: string;
  mine: boolean;
  entry: ReactionEntry | undefined;
  /** Usernames that reacted, keyed by emoji (for the hover tooltip). */
  reactors: Record<string, string[]>;
}

interface Props {
  lobbyId: string;
  pick: PickRow;
  player: PlayerRow;
  team: TeamRow | undefined;
  entry: ReactionEntry | undefined;
  /** Usernames that reacted, keyed by emoji (for the Discord-style tooltip). */
  reactors?: Record<string, string[]>;
  onReact: (emoji: string) => void;
  /** Existing comments on this pick, oldest first. */
  comments: PickComment[];
  onReactComment: (commentId: string, emoji: string) => void;
  members: MemberRow[];
  locked: boolean;
  /** Emoji reactions lock much later than chat (REACTION_LOCK_MS post-draft). */
  reactionsLocked?: boolean;
  onClose: () => void;
  /** Commissioner-only: offers "Roll back to this pick" when provided. */
  isCommish?: boolean;
  onRollbackTo?: () => void;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function PickModal({
  lobbyId,
  pick,
  player,
  team,
  entry,
  reactors,
  onReact,
  comments,
  onReactComment,
  members,
  locked,
  reactionsLocked = false,
  onClose,
  isCommish = false,
  onRollbackTo,
}: Props) {
  const { closing, requestClose } = useModalClose(onClose);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

  const hasPrev = player.prev_points != null || player.prev_rank != null;
  const memberUsernames = useMemo(
    () => members.map((m) => m.profiles?.username).filter((u): u is string => !!u),
    [members],
  );

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    const body = comment.trim();
    if (!body || locked) return;
    setPosting(true);
    setError(null);
    try {
      await api(`/lobbies/${lobbyId}/pick-comment`, {
        method: 'POST',
        body: { pickId: pick.id, body },
      });
      setComment('');
      setSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to comment');
    } finally {
      setPosting(false);
    }
  }

  const pos = player.position as Position;

  return (
    <div
      className={`pick-modal__backdrop modal-anim-backdrop${closing ? ' is-closing' : ''}`}
      onClick={requestClose}
    >
      <div
        className={`pick-modal modal-anim-card${closing ? ' is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={`${player.name} pick details`}
      >
        <button className="pick-modal__close" aria-label="Close" onClick={requestClose}>
          <CloseIcon fontSize="small" />
        </button>

        {/* Player data + reactions stay pinned; only the comments below scroll. */}
        <div className="pick-modal__top">
          <header className="pick-modal__head">
            <span
              className="pick-modal__pos"
              style={{ background: POSITION_COLORS[pos] }}
            >
              {player.position}
            </span>
            <div className="pick-modal__title">
              <h3>{player.name}</h3>
              <span className="muted">
                {player.nfl_team}
                {player.bye_week ? ` · Bye ${player.bye_week}` : ''}
                {player.injury_status && player.injury_status !== 'ACTIVE'
                  ? ` · ${player.injury_status}`
                  : ''}
              </span>
            </div>
          </header>

          <div className="pick-modal__drafted">
            <strong>{team?.name ?? 'A team'}</strong> · Round {pick.round} · Pick{' '}
            {pick.overall} overall
            {pick.is_auto_pick && <span className="pick-modal__auto"> · auto</span>}
          </div>

          {isCommish && onRollbackTo && (
            <button
              type="button"
              className="pick-modal__rollback"
              onClick={onRollbackTo}
            >
              <UndoIcon fontSize="small" /> Roll back to this pick
            </button>
          )}

          {/* Stats */}
          <div className="pick-modal__stats">
            <div className="pick-modal__stat">
              <span className="pick-modal__stat-label">Projected</span>
              <span className="pick-modal__stat-value">
                {player.proj_points != null ? player.proj_points.toFixed(1) : '—'}
              </span>
            </div>
            <div className="pick-modal__stat">
              <span className="pick-modal__stat-label">ADP</span>
              <span className="pick-modal__stat-value">
                {player.adp != null ? player.adp.toFixed(1) : '—'}
              </span>
            </div>
            <div className="pick-modal__stat">
              <span className="pick-modal__stat-label">Last yr pts</span>
              <span className="pick-modal__stat-value">
                {player.prev_points != null ? player.prev_points.toFixed(1) : '—'}
              </span>
            </div>
            <div className="pick-modal__stat">
              <span className="pick-modal__stat-label">Last yr rank</span>
              <span className="pick-modal__stat-value">
                {player.prev_rank != null ? `#${player.prev_rank}` : '—'}
              </span>
            </div>
          </div>
          {!hasPrev && (
            <p className="pick-modal__note muted">
              Full prior-season stats aren’t loaded yet.
            </p>
          )}

          {/* Reactions */}
          <div className="pick-modal__section-label">Reactions</div>
          <div className="pick-modal__reactions">
            {REACTION_EMOJIS.map((emoji) => {
              const count = entry?.counts[emoji] ?? 0;
              const mine = entry?.mine.has(emoji) ?? false;
              const names = reactors?.[emoji] ?? [];
              return (
                <button
                  key={emoji}
                  className={`pick-modal__react${mine ? ' is-mine' : ''}`}
                  onClick={() => onReact(emoji)}
                  disabled={reactionsLocked}
                >
                  <span>{emoji}</span>
                  {count > 0 && <span className="pick-modal__react-count">{count}</span>}
                  {names.length > 0 && (
                    <span className="pick-modal__react-tip" role="tooltip">
                      {names.join(', ')}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          {reactionsLocked && (
            <p className="pick-modal__note muted">🔒 Reactions are locked for this draft.</p>
          )}
        </div>

        {/* Comments — the one part of the modal that scrolls. */}
        <div className="pick-modal__comments">
          <div className="pick-modal__section-label">
            Comments{comments.length > 0 ? ` (${comments.length})` : ''}
          </div>
          {comments.length === 0 ? (
            <p className="muted pick-modal__no-comments">No comments yet.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className={`pick-modal__comment${c.mine ? ' is-mine' : ''}`}>
                <div className="pick-modal__comment-head">
                  <span className="pick-modal__comment-author">{c.author}</span>
                  <span className="pick-modal__comment-time">{formatTime(c.at)}</span>
                </div>
                <p className="pick-modal__comment-body">
                  {renderMentionText(c.body, memberUsernames)}
                </p>
                <CommentReactions
                  entry={c.entry}
                  reactors={c.reactors}
                  disabled={reactionsLocked}
                  onReact={(emoji) => onReactComment(c.id, emoji)}
                />
              </div>
            ))
          )}
        </div>

        {/* Compose — pinned at the bottom, outside the scrolling comments. */}
        <div className="pick-modal__compose-area">
          {locked ? (
            <p className="muted">🔒 Chat is locked for this draft.</p>
          ) : (
            <form className="pick-modal__comment-form" onSubmit={submitComment}>
              <MentionInput
                value={comment}
                onChange={(v) => {
                  setComment(v);
                  setSent(false);
                }}
                members={members}
                placeholder="Say something about this pick…"
                maxLength={1000}
                inputRef={commentInputRef}
              />
              <button
                className="pick-modal__send"
                disabled={posting || !comment.trim()}
                aria-label="Post comment"
              >
                <SendIcon fontSize="small" />
              </button>
            </form>
          )}
          {sent && <p className="pick-modal__sent">Posted to chat ↗</p>}
          {error && <p className="pick-modal__error">{error}</p>}
        </div>
      </div>
    </div>
  );
}

/** Compact reaction row for a single comment — existing chips + an add button. */
function CommentReactions({
  entry,
  reactors,
  onReact,
  disabled,
}: {
  entry: ReactionEntry | undefined;
  reactors: Record<string, string[]>;
  onReact: (emoji: string) => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = entry ? Object.keys(entry.counts) : [];

  return (
    <div className="pick-modal__comment-react">
      {active.map((e) => {
        const names = reactors[e] ?? [];
        return (
          <button
            key={e}
            type="button"
            className={`pick-modal__comment-chip${entry?.mine.has(e) ? ' is-mine' : ''}`}
            onClick={() => onReact(e)}
            disabled={disabled}
          >
            <span>{e}</span>
            <span>{entry?.counts[e]}</span>
            {names.length > 0 && (
              <span className="pick-modal__comment-tip" role="tooltip">
                {names.join(', ')}
              </span>
            )}
          </button>
        );
      })}
      {!disabled && (
        <div className="pick-modal__comment-add">
          <button
            type="button"
            className="pick-modal__comment-add-btn"
            aria-label="Add reaction"
            onClick={() => setOpen((o) => !o)}
          >
            <AddReactionOutlinedIcon sx={{ fontSize: 14 }} />
          </button>
          {open && (
            <div className="pick-modal__comment-palette">
              {REACTION_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
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
      )}
    </div>
  );
}
