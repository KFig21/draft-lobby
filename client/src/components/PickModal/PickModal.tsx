import { REACTION_EMOJIS, containsSlur, type Avatar as AvatarData } from '@draft-lobby/shared';
import AddReactionOutlinedIcon from '@mui/icons-material/AddReactionOutlined';
import CloseIcon from '@mui/icons-material/Close';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import SendIcon from '@mui/icons-material/Send';
import UndoIcon from '@mui/icons-material/Undo';
import { useMemo, useRef, useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { renderMentionText } from '../../lib/renderMentions';
import { useModalClose } from '../../lib/useModalClose';
import type { MemberRow, PickRow, PlayerRow, TeamRow } from '../../lib/types';
import { Avatar } from '../Avatar/Avatar';
import type { ReactionEntry } from '../DraftGrid/DraftGrid';
import { MentionInput } from '../MentionInput/MentionInput';
import { PlayerStatBlock } from '../PlayerStatBlock/PlayerStatBlock';
import { ReactorsModal, type Reactor } from '../ReactorsModal/ReactorsModal';
import './PickModal.scss';

export interface PickComment {
  id: string;
  author: string;
  avatar: AvatarData;
  body: string;
  at: string;
  entry: ReactionEntry | undefined;
  /** Who reacted, keyed by emoji (for the hover tooltip + the full-list modal). */
  reactors: Record<string, Reactor[]>;
}

/** Cap the hover tooltip's name list — a draft with dozens of reactors would
 * otherwise blow the tooltip up into an unreadable block. Long-press (or
 * click-and-hold on desktop) still opens the full scrollable list. */
const TIP_CAP = 8;
function tipText(reactors: Reactor[]): string {
  const names = reactors.map((r) => r.username);
  if (names.length <= TIP_CAP) return names.join(', ');
  return `${names.slice(0, TIP_CAP).join(', ')} +${names.length - TIP_CAP} more`;
}

interface Props {
  lobbyId: string;
  pick: PickRow;
  player: PlayerRow;
  team: TeamRow | undefined;
  entry: ReactionEntry | undefined;
  /** Who reacted, keyed by emoji (for the Discord-style tooltip + full-list modal). */
  reactors?: Record<string, Reactor[]>;
  onReact: (emoji: string) => void;
  /** Existing comments on this pick, oldest first. */
  comments: PickComment[];
  onReactComment: (commentId: string, emoji: string) => void;
  members: MemberRow[];
  locked: boolean;
  /** Reactions share the same commissioner-configured lock delay as chat. */
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
  // Set when the "who reacted" icon is clicked — shows the full reactions modal.
  const [reactorsModal, setReactorsModal] = useState<Record<string, Reactor[]> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);

  const memberUsernames = useMemo(
    () => members.map((m) => m.profiles?.username).filter((u): u is string => !!u),
    [members],
  );

  async function submitComment(e: FormEvent) {
    e.preventDefault();
    const body = comment.trim();
    if (!body || locked) return;
    if (containsSlur(body)) {
      setError('That message contains language that isn’t allowed here');
      return;
    }
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
          <PlayerStatBlock player={player} />

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

          {/* Reactions */}
          <div className="pick-modal__section-label">Reactions</div>
          <div className="pick-modal__reactions">
            {REACTION_EMOJIS.map((emoji) => {
              const count = entry?.counts[emoji] ?? 0;
              const mine = entry?.mine.has(emoji) ?? false;
              const names = reactors?.[emoji] ?? [];
              return (
                <ReactionChip
                  key={emoji}
                  className="pick-modal__react"
                  emoji={emoji}
                  count={count}
                  mine={mine}
                  reactors={names}
                  disabled={reactionsLocked}
                  onReact={() => onReact(emoji)}
                />
              );
            })}
            {entry && Object.keys(entry.counts).length > 0 && (
              <button
                type="button"
                className="pick-modal__react-viewall"
                aria-label="See who reacted"
                title="See who reacted"
                onClick={() => setReactorsModal(reactors ?? {})}
              >
                <PeopleAltOutlinedIcon sx={{ fontSize: 16 }} />
              </button>
            )}
          </div>
          {reactionsLocked && (
            <span className="bot-badge bot-badge--warn pick-modal__locked-badge">
              <LockOutlinedIcon fontSize="inherit" /> Reactions are locked for this draft
            </span>
          )}
          {/* Stays pinned above the scrolling comment list below, instead of
              scrolling away with it. */}
          <div className="pick-modal__section-label">
            Comments{comments.length > 0 ? ` (${comments.length})` : ''}
          </div>
        </div>

        {/* Comments — the one part of the modal that scrolls. */}
        <div className="pick-modal__comments">
          {comments.length === 0 ? (
            <p className="muted pick-modal__no-comments">No comments yet.</p>
          ) : (
            comments.map((c) => (
              <div key={c.id} className="pick-modal__comment">
                <Avatar avatar={c.avatar} size={26} />
                <div className="pick-modal__comment-main">
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
                    onShowAllReactions={() => setReactorsModal(c.reactors)}
                  />
                </div>
              </div>
            ))
          )}
        </div>

        {/* Compose — pinned at the bottom, outside the scrolling comments. */}
        <div className="pick-modal__compose-area">
          {locked ? (
            <div className="pick-modal__locked-notice">
              <span className="bot-badge bot-badge--warn">
                <LockOutlinedIcon fontSize="inherit" /> Chat is locked for this draft
              </span>
            </div>
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

      {/* Rendered as a sibling of the card, not a descendant — the card's
          entrance animation leaves a persistent `transform` on it (still
          `translateY(0)` at rest), which would turn it into a containing
          block for this modal's `position: fixed` backdrop and trap it
          inside the card's box instead of covering the viewport. */}
      {reactorsModal && (
        <ReactorsModal reactors={reactorsModal} onClose={() => setReactorsModal(null)} />
      )}
    </div>
  );
}

/** Compact reaction row for a single comment — existing chips + an add button. */
function CommentReactions({
  entry,
  reactors,
  onReact,
  onShowAllReactions,
  disabled,
}: {
  entry: ReactionEntry | undefined;
  reactors: Record<string, Reactor[]>;
  onReact: (emoji: string) => void;
  onShowAllReactions: () => void;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const active = entry ? Object.keys(entry.counts) : [];

  return (
    <div className="pick-modal__comment-react">
      {active.map((e) => (
        <CommentReactionChip
          key={e}
          emoji={e}
          count={entry?.counts[e] ?? 0}
          mine={entry?.mine.has(e) ?? false}
          reactors={reactors[e] ?? []}
          disabled={disabled}
          onReact={() => onReact(e)}
        />
      ))}
      {active.length > 0 && (
        <button
          type="button"
          className="pick-modal__comment-viewall"
          aria-label="See who reacted"
          title="See who reacted"
          onClick={onShowAllReactions}
        >
          <PeopleAltOutlinedIcon sx={{ fontSize: 14 }} />
        </button>
      )}
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

/** A single "Reactions" row chip — tap to toggle your own reaction. Hover
 * shows a quick preview of who reacted; the "people" icon alongside the row
 * opens the full, filterable list (see PickModal's `pick-modal__react-viewall`). */
function ReactionChip({
  className,
  emoji,
  count,
  mine,
  reactors,
  disabled,
  onReact,
}: {
  className: string;
  emoji: string;
  count: number;
  mine: boolean;
  reactors: Reactor[];
  disabled: boolean;
  onReact: () => void;
}) {
  return (
    <button
      className={`${className}${mine ? ' is-mine' : ''}`}
      onClick={onReact}
      disabled={disabled}
    >
      <span>{emoji}</span>
      {count > 0 && <span className={`${className}-count`}>{count}</span>}
      {reactors.length > 0 && (
        <span className={`${className}-tip`} role="tooltip">
          {tipText(reactors)}
        </span>
      )}
    </button>
  );
}

/** Same as ReactionChip, for the compact per-comment reaction row (which
 * always shows a count and has no dedicated count/tip classes). */
function CommentReactionChip({
  emoji,
  count,
  mine,
  reactors,
  disabled,
  onReact,
}: {
  emoji: string;
  count: number;
  mine: boolean;
  reactors: Reactor[];
  disabled: boolean;
  onReact: () => void;
}) {
  return (
    <button
      type="button"
      className={`pick-modal__comment-chip${mine ? ' is-mine' : ''}`}
      onClick={onReact}
      disabled={disabled}
    >
      <span>{emoji}</span>
      <span>{count}</span>
      {reactors.length > 0 && (
        <span className="pick-modal__comment-tip" role="tooltip">
          {tipText(reactors)}
        </span>
      )}
    </button>
  );
}
