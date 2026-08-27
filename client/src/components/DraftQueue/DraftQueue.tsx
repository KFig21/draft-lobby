import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import CloseIcon from '@mui/icons-material/Close';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import SmartToyIcon from '@mui/icons-material/SmartToy';
import { useState } from 'react';
import type { PlayerRow } from '../../lib/types';
import { HoldButton } from '../HoldButton/HoldButton';
import { Modal } from '../Modal/Modal';
import { ToggleSwitch } from '../ToggleSwitch/ToggleSwitch';
import './DraftQueue.scss';

interface Props {
  /** Queued players still on the board, in queue order (top first). */
  players: PlayerRow[];
  statMode: 'proj' | 'prev';
  /** "Auto-draft from queue" toggle — undefined hides the toggle entirely (e.g.
   * a spectator with no team of their own). */
  autopick?: boolean;
  onToggleAutopick?: (on: boolean) => void;
  /** New full order of queued player ids after a drag-reorder. */
  onReorder: (orderedIds: string[]) => void;
  onRemove: (id: string) => void;
  onClear: () => void;
  onOpenDetail: (p: PlayerRow) => void;
  /** Draft actions — omit when the viewer can't pick right now. Tap opens the
   * confirm modal; hold (when provided) drafts instantly for your own slot. */
  onDraftTap?: (p: PlayerRow) => void;
  onDraftHold?: (p: PlayerRow) => void;
  /** Returns a reason string when this player can't be drafted (roster limit),
   * else null/undefined. Disables + explains the Draft button. */
  limitBlock?: (p: PlayerRow) => string | null | undefined;
}

/**
 * The personal draft queue: an opt-in "auto-draft from queue" toggle up top
 * (server-backed — see migration 0048 / draftEngine.choosePlayer), then a
 * drag-to-reorder list of queued players with per-row Draft + remove. Shared by
 * the desktop dashboard's queue pane and the players pool's inline queue.
 */
export function DraftQueue({
  players,
  statMode,
  autopick,
  onToggleAutopick,
  onReorder,
  onRemove,
  onClear,
  onOpenDetail,
  onDraftTap,
  onDraftHold,
  limitBlock,
}: Props) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [showAutopickInfo, setShowAutopickInfo] = useState(false);
  const showAutopick = autopick !== undefined && !!onToggleAutopick;

  // Live reorder: on drag-enter of a target row, splice the dragged id in at the
  // target's index and push the new order up. The dragged id stays put across
  // moves, so successive enters keep working. (Matches the draft-order reorder.)
  function reorderAt(targetId: string) {
    if (!dragId || dragId === targetId) return;
    const ids = players.map((p) => p.id);
    const from = ids.indexOf(dragId);
    const to = ids.indexOf(targetId);
    if (from < 0 || to < 0) return;
    ids.splice(from, 1);
    ids.splice(to, 0, dragId);
    onReorder(ids);
  }

  return (
    <div className="draft-queue">
      <div className="draft-queue__head">
        <span className="draft-queue__head-title">
          Queue <span className="draft-queue__count">{players.length}</span>
        </span>
        {showAutopick && (
          <button
            type="button"
            className={`draft-queue__autobot${autopick ? ' is-on' : ''}`}
            onClick={() => setShowAutopickInfo(true)}
            aria-label="Auto-draft from queue settings"
            title={`Auto-draft from queue: ${autopick ? 'on' : 'off'}`}
          >
            <SmartToyIcon fontSize="inherit" />
          </button>
        )}
        {players.length > 0 && (
          <button
            type="button"
            className="draft-queue__clear"
            onClick={onClear}
            title="Clear the entire queue"
          >
            Clear
          </button>
        )}
      </div>

      {players.length === 0 ? (
        <p className="draft-queue__empty">
          Queue players from the pool to line up your next picks.
        </p>
      ) : (
        <ul className="draft-queue__list">
          {players.map((p) => {
            const posRank = statMode === 'prev' ? p.prev_rank : p.proj_rank;
            const points = statMode === 'prev' ? p.prev_points : p.proj_points;
            const blocked = limitBlock?.(p);
            return (
              <li
                key={p.id}
                className={`draft-queue__row${dragId === p.id ? ' is-dragging' : ''}`}
                draggable
                onDragStart={() => setDragId(p.id)}
                onDragEnter={() => reorderAt(p.id)}
                onDragOver={(e) => e.preventDefault()}
                onDragEnd={() => setDragId(null)}
              >
                <span className="draft-queue__handle" aria-hidden title="Drag to reorder">
                  <DragIndicatorIcon fontSize="inherit" />
                </span>
                <span
                  className="draft-queue__pos"
                  style={{ background: POSITION_COLORS[p.position as Position] }}
                >
                  {p.position}
                  {posRank != null && <span className="draft-queue__pos-rank">{posRank}</span>}
                </span>
                <button
                  type="button"
                  className="draft-queue__main"
                  onClick={() => onOpenDetail(p)}
                >
                  <span className="draft-queue__name">{p.name}</span>
                  <span className="draft-queue__sub">
                    {p.nfl_team}
                    {p.bye_week != null && ` · Bye ${p.bye_week}`}
                    {points != null && ` · ${points.toFixed(1)}`}
                  </span>
                </button>
                {onDraftTap && (
                  <HoldButton
                    className="button button--primary draft-queue__draft"
                    onTap={() => onDraftTap(p)}
                    onHold={onDraftHold ? () => onDraftHold(p) : () => onDraftTap(p)}
                    disabled={!!blocked}
                    title={blocked ?? 'Hold to draft instantly · tap to confirm'}
                    ariaLabel={`Draft ${p.name}`}
                  >
                    Draft
                  </HoldButton>
                )}
                <button
                  type="button"
                  className="draft-queue__remove"
                  onClick={() => onRemove(p.id)}
                  aria-label={`Remove ${p.name} from queue`}
                  title="Remove from queue"
                >
                  <CloseIcon fontSize="inherit" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {showAutopick && showAutopickInfo && (
        <Modal
          title="Auto-draft from queue"
          icon={<SmartToyIcon />}
          onClose={() => setShowAutopickInfo(false)}
        >
          <div className="draft-queue__autobot-modal">
            <p>
              When it’s your pick and your clock runs out — or you’ve switched on auto-draft —
              this drafts the <b>top available player from your queue</b> instead of skipping
              your turn.
            </p>
            <p>
              It runs on the server, so your pick still lands even if your connection drops.
              Drag your queue into the order you want, and the highest one still on the board
              gets picked.
            </p>
            <div className={`draft-queue__autobot-row${autopick ? ' is-on' : ''}`}>
              <span className="draft-queue__autobot-row-text">
                <span className="draft-queue__autobot-row-title">Draft from my queue</span>
                <span className="draft-queue__autobot-row-sub">
                  On a timeout or auto-draft, pick my top queued player instead of skipping.
                </span>
              </span>
              <ToggleSwitch
                checked={!!autopick}
                onChange={(v) => onToggleAutopick?.(v)}
                label="Auto-draft from queue"
              />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
