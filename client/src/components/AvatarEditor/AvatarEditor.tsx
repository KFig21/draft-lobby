import {
  AVATAR_BG_COLORS,
  AVATAR_EMOJI_CHOICES,
  AVATAR_SHAPES,
  type Avatar as AvatarData,
} from '@draft-lobby/shared';
import type { EmojiClickData, Theme } from 'emoji-picker-react';
import { Suspense, lazy, useState } from 'react';
import { Avatar } from '../Avatar/Avatar';
import './AvatarEditor.scss';

// Keep the ~600 kB emoji dataset out of the main bundle — only Settings uses it.
const EmojiPicker = lazy(() => import('emoji-picker-react'));

interface Props {
  value: AvatarData;
  onChange: (next: AvatarData) => void;
}

const SHAPE_LABEL: Record<(typeof AVATAR_SHAPES)[number], string> = {
  circle: 'Circle',
  rounded: 'Rounded',
  square: 'Square',
};

export function AvatarEditor({ value, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const set = (patch: Partial<AvatarData>) => onChange({ ...value, ...patch });

  return (
    <div className="avatar-editor">
      <div className="avatar-editor__preview">
        <Avatar avatar={value} size={96} />
      </div>

      {/* Emoji — quick picks + full picker */}
      <span className="avatar-editor__label">Emoji</span>
      <div className="avatar-editor__grid">
        {AVATAR_EMOJI_CHOICES.map((e) => (
          <button
            type="button"
            key={e}
            className={`avatar-editor__cell${
              value.emoji === e ? ' avatar-editor__cell--active' : ''
            }`}
            onClick={() => set({ emoji: e })}
          >
            <span className="avatar-editor__emoji">{e}</span>
          </button>
        ))}
        <button
          type="button"
          className="avatar-editor__cell avatar-editor__cell--more"
          onClick={() => setPickerOpen((o) => !o)}
          aria-expanded={pickerOpen}
        >
          {pickerOpen ? '×' : '＋'}
        </button>
      </div>

      {pickerOpen && (
        <div className="avatar-editor__picker">
          <Suspense fallback={<p className="muted">Loading emoji…</p>}>
            <EmojiPicker
              theme={'dark' as Theme}
              lazyLoadEmojis
              width="100%"
              height={360}
              previewConfig={{ showPreview: false }}
              onEmojiClick={(data: EmojiClickData) => {
                set({ emoji: data.emoji });
                setPickerOpen(false);
              }}
            />
          </Suspense>
        </div>
      )}

      {/* Background */}
      <span className="avatar-editor__label">Background</span>
      <div className="avatar-editor__colors">
        {AVATAR_BG_COLORS.map((c) => (
          <button
            type="button"
            key={c}
            className={`avatar-editor__swatch${
              value.bgColor.toLowerCase() === c.toLowerCase()
                ? ' avatar-editor__swatch--active'
                : ''
            }`}
            style={{ background: c }}
            onClick={() => set({ bgColor: c })}
            aria-label={c}
          />
        ))}
        <input
          type="color"
          className="avatar-editor__native"
          value={value.bgColor}
          onChange={(e) => set({ bgColor: e.target.value })}
          aria-label="Custom color"
        />
      </div>

      {/* Shape */}
      <span className="avatar-editor__label">Shape</span>
      <div className="avatar-editor__shapes">
        {AVATAR_SHAPES.map((shape) => (
          <button
            type="button"
            key={shape}
            className={`avatar-editor__shape${
              value.shape === shape ? ' avatar-editor__shape--active' : ''
            }`}
            onClick={() => set({ shape })}
          >
            <Avatar avatar={{ ...value, shape }} size={36} />
            {SHAPE_LABEL[shape]}
          </button>
        ))}
      </div>
    </div>
  );
}
