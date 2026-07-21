import { defaultAvatar } from '@draft-lobby/shared';
import {
  useMemo,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type RefObject,
} from 'react';
import type { MemberRow } from '../../lib/types';
import { Avatar } from '../Avatar/Avatar';
import './MentionInput.scss';

interface Props {
  value: string;
  onChange: (value: string) => void;
  members: MemberRow[];
  placeholder?: string;
  maxLength?: number;
  disabled?: boolean;
  inputRef?: RefObject<HTMLInputElement>;
}

interface MentionState {
  start: number;
  query: string;
}

/** Where the "@token" ending at `caret` starts, or null if there isn't one. */
function findMentionToken(text: string, caret: number): MentionState | null {
  const uptoCaret = text.slice(0, caret);
  const atIdx = uptoCaret.lastIndexOf('@');
  if (atIdx === -1) return null;
  const before = atIdx === 0 ? '' : uptoCaret[atIdx - 1];
  if (before && !/\s/.test(before)) return null; // '@' must start a token
  const token = uptoCaret.slice(atIdx + 1);
  if (/\s/.test(token)) return null; // caret has moved past the token
  return { start: atIdx, query: token };
}

/** A single-line input with "@username" autocomplete against lobby members. */
export function MentionInput({
  value,
  onChange,
  members,
  placeholder,
  maxLength,
  disabled,
  inputRef,
}: Props) {
  const [mention, setMention] = useState<MentionState | null>(null);
  const [highlighted, setHighlighted] = useState(0);

  const matches = useMemo(() => {
    if (mention == null) return [];
    const q = mention.query.toLowerCase();
    return members
      .filter((m) => (m.profiles?.username ?? '').toLowerCase().startsWith(q))
      .slice(0, 6);
  }, [mention, members]);

  function updateMention(next: MentionState | null) {
    setMention(next);
    setHighlighted(0);
  }

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const next = e.target.value;
    onChange(next);
    const caret = e.target.selectionStart ?? next.length;
    updateMention(findMentionToken(next, caret));
  }

  function pickMember(username: string) {
    if (!mention) return;
    const el = inputRef?.current;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, mention.start);
    const after = value.slice(caret);
    const next = `${before}@${username} ${after}`;
    onChange(next);
    updateMention(null);
    requestAnimationFrame(() => {
      const pos = `${before}@${username} `.length;
      el?.focus();
      el?.setSelectionRange(pos, pos);
    });
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (mention == null || matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlighted((i) => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlighted((i) => (i - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      const m = matches[highlighted];
      if (m) pickMember(m.profiles?.username ?? 'Player');
    } else if (e.key === 'Escape') {
      updateMention(null);
    }
  }

  return (
    <div className="mention-input">
      <input
        ref={inputRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onBlur={() => setTimeout(() => updateMention(null), 120)}
        placeholder={placeholder}
        maxLength={maxLength}
        disabled={disabled}
      />
      {mention != null && matches.length > 0 && (
        <div className="mention-input__dropdown">
          {matches.map((m, i) => {
            const uname = m.profiles?.username ?? 'Player';
            return (
              <button
                type="button"
                key={m.user_id}
                className={`mention-input__opt${i === highlighted ? ' is-active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlighted(i)}
                onClick={() => pickMember(uname)}
              >
                <Avatar avatar={m.profiles?.avatar ?? defaultAvatar(m.user_id)} size={20} />
                {uname}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
