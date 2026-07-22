import { REACTION_EMOJIS, defaultAvatar, type Avatar as AvatarData } from '@draft-lobby/shared';
import { useMemo, useState } from 'react';
import { useModalClose } from '../../lib/useModalClose';
import { Avatar } from '../Avatar/Avatar';
import './ReactorsModal.scss';

export interface Reactor {
  userId: string;
  username: string;
  avatar: AvatarData | null;
}

interface Props {
  /** Every reactor, keyed by emoji. */
  reactors: Record<string, Reactor[]>;
  onClose: () => void;
}

/** Full "who reacted" list across every emoji, filterable down to one. */
export function ReactorsModal({ reactors, onClose }: Props) {
  const { closing, requestClose } = useModalClose(onClose);
  const [filter, setFilter] = useState<string | null>(null);

  const emojis = useMemo(
    () => REACTION_EMOJIS.filter((e) => (reactors[e]?.length ?? 0) > 0),
    [reactors],
  );
  const total = emojis.reduce((sum, e) => sum + (reactors[e]?.length ?? 0), 0);
  const rows = useMemo(() => {
    const list = filter ? [filter] : emojis;
    return list.flatMap((e) => (reactors[e] ?? []).map((r) => ({ ...r, emoji: e })));
  }, [filter, emojis, reactors]);

  return (
    <div
      className={`reactors-modal__backdrop modal-anim-backdrop${closing ? ' is-closing' : ''}`}
      // Stop here — this can be nested inside another modal (e.g. PickModal),
      // and letting the click bubble would close that one too.
      onClick={(e) => {
        e.stopPropagation();
        requestClose();
      }}
    >
      <div
        className={`reactors-modal modal-anim-card${closing ? ' is-closing' : ''}`}
        role="dialog"
        aria-label="Reactions"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="reactors-modal__title">Reactions</h3>

        <div className="reactors-modal__filters">
          <button
            type="button"
            className={`reactors-modal__filter${filter === null ? ' is-active' : ''}`}
            onClick={() => setFilter(null)}
          >
            All <span>{total}</span>
          </button>
          {emojis.map((e) => (
            <button
              key={e}
              type="button"
              className={`reactors-modal__filter${filter === e ? ' is-active' : ''}`}
              onClick={() => setFilter(e)}
            >
              {e} <span>{reactors[e]?.length ?? 0}</span>
            </button>
          ))}
        </div>

        <ul className="reactors-modal__list">
          {rows.map((r, i) => (
            <li key={`${r.emoji}-${r.userId}-${i}`} className="reactors-modal__row">
              <Avatar avatar={r.avatar ?? defaultAvatar(r.userId)} size={26} />
              <span className="reactors-modal__row-name">{r.username}</span>
              <span className="reactors-modal__row-emoji">{r.emoji}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
