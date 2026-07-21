import { POSITION_COLORS, REACTION_EMOJIS, type Position } from '@draft-lobby/shared';
import CloseIcon from '@mui/icons-material/Close';
import SendIcon from '@mui/icons-material/Send';
import { useState, type FormEvent } from 'react';
import { api } from '../../lib/api';
import { useModalClose } from '../../lib/useModalClose';
import type { PickRow, PlayerRow, TeamRow } from '../../lib/types';
import type { ReactionEntry } from '../DraftGrid/DraftGrid';
import './PickModal.scss';

interface Props {
  lobbyId: string;
  pick: PickRow;
  player: PlayerRow;
  team: TeamRow | undefined;
  entry: ReactionEntry | undefined;
  /** Usernames that reacted, keyed by emoji (for the Discord-style tooltip). */
  reactors?: Record<string, string[]>;
  onReact: (emoji: string) => void;
  locked: boolean;
  onClose: () => void;
}

export function PickModal({
  lobbyId,
  pick,
  player,
  team,
  entry,
  reactors,
  onReact,
  locked,
  onClose,
}: Props) {
  const { closing, requestClose } = useModalClose(onClose);
  const [comment, setComment] = useState('');
  const [posting, setPosting] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasPrev = player.prev_points != null || player.prev_rank != null;

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

        {/* Comment → chat */}
        <div className="pick-modal__section-label">Comment on this pick</div>
        {locked ? (
          <p className="muted">🔒 Chat is locked for this draft.</p>
        ) : (
          <form className="pick-modal__comment" onSubmit={submitComment}>
            <input
              value={comment}
              onChange={(e) => {
                setComment(e.target.value);
                setSent(false);
              }}
              placeholder="Say something about this pick…"
              maxLength={1000}
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
  );
}
