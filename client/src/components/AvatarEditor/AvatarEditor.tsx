import {
  AVATAR_BG_COLORS,
  AVATAR_EMOJI_CHOICES,
  AVATAR_SHAPES,
  randomEmoji,
  randomVividColor,
  type Avatar as AvatarData,
} from '@draft-lobby/shared';
import AddIcon from '@mui/icons-material/Add';
import CasinoIcon from '@mui/icons-material/Casino';
import CloseIcon from '@mui/icons-material/Close';
import PaletteIcon from '@mui/icons-material/Palette';
import type { EmojiClickData, Theme } from 'emoji-picker-react';
import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { Avatar } from '../Avatar/Avatar';
import './AvatarEditor.scss';

// Keep the ~600 kB emoji dataset out of the main bundle — only Settings uses it.
const EmojiPicker = lazy(() => import('emoji-picker-react'));

// Quick-pick tiles kept to two tidy rows (＋ picker + 12 + shuffle die = 14 =
// 7×2). The full emoji library is a tap away behind the picker.
const QUICK_EMOJI = AVATAR_EMOJI_CHOICES.slice(0, 12);

interface Props {
  value: AvatarData;
  onChange: (next: AvatarData) => void;
}

const SHAPE_LABEL: Record<(typeof AVATAR_SHAPES)[number], string> = {
  circle: 'Circle',
  rounded: 'Rounded',
  square: 'Square',
};

const sameAvatar = (a: AvatarData, b: AvatarData) =>
  a.emoji === b.emoji && a.bgColor === b.bgColor && a.shape === b.shape;

export function AvatarEditor({ value, onChange }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const set = (patch: Partial<AvatarData>) => onChange({ ...value, ...patch });

  // Desktop (≥1100px, mirrors $bp-lg) shows a larger preview. Same matchMedia
  // pattern the lobby room uses to switch its two-pane layout.
  const [isDesktop, setIsDesktop] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(min-width: 1100px)').matches,
  );
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1100px)');
    const onChange = () => setIsDesktop(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Mobile: fit as many fixed-size emoji tiles as the space beside the preview
  // allows, in two neat rows — rather than cramming a fixed count and squishing.
  // We measure the grid's width and pick the column count; the visible emoji
  // count follows (＋ picker + N + shuffle die = cols × 2).
  const gridRef = useRef<HTMLDivElement>(null);
  const [mobileCols, setMobileCols] = useState(6);
  useEffect(() => {
    if (isDesktop) return;
    const el = gridRef.current;
    if (!el) return;
    const CELL = 44;
    const GAP = 4; // matches $space * 0.5
    const measure = () => {
      const w = el.clientWidth;
      if (w > 0) {
        // Cap at 9 so two rows never exceed the emoji pool (9 × 2 = 18 = 16 + ＋ + die).
        setMobileCols(Math.max(3, Math.min(9, Math.floor((w + GAP) / (CELL + GAP)))));
      }
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [isDesktop]);

  // Desktop keeps the fixed 12 (two rows of 7); mobile fills two rows of the
  // measured column count.
  const emojiTiles = isDesktop
    ? QUICK_EMOJI
    : AVATAR_EMOJI_CHOICES.slice(0, mobileCols * 2 - 2);

  // Roll a fresh avatar — the same generators the per-section dice use, so the
  // button matches them: emoji at the 40% preset / 60% anything split, a random
  // vivid color, and a random shape. Re-roll on the rare exact match so the
  // button always visibly changes something.
  const randomize = () => {
    let next: AvatarData;
    do {
      next = {
        emoji: randomEmoji(),
        bgColor: randomVividColor(),
        shape: AVATAR_SHAPES[Math.floor(Math.random() * AVATAR_SHAPES.length)],
      };
    } while (sameAvatar(next, value));
    onChange(next);
  };

  return (
    <div className="avatar-editor">
      <div className="avatar-editor__preview">
        <Avatar avatar={value} size={isDesktop ? 120 : 72} />
        <button
          type="button"
          className="avatar-editor__randomize"
          onClick={randomize}
        >
          <CasinoIcon fontSize="small" />
          Randomize
        </button>
      </div>

      {/* Emoji — picker (first) · quick picks · shuffle die (last) */}
      <div className="avatar-editor__row avatar-editor__row--emoji">
        <span className="avatar-editor__label">Emoji</span>
        <div
          className="avatar-editor__grid"
          ref={gridRef}
          style={
            isDesktop ? undefined : { gridTemplateColumns: `repeat(${mobileCols}, 1fr)` }
          }
        >
          <button
            type="button"
            className="avatar-editor__cell avatar-editor__cell--action"
            onClick={() => setPickerOpen((o) => !o)}
            aria-expanded={pickerOpen}
            aria-label={pickerOpen ? 'Close emoji picker' : 'More emoji'}
          >
            {pickerOpen ? <CloseIcon fontSize="small" /> : <AddIcon fontSize="small" />}
          </button>
          {emojiTiles.map((e) => (
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
            className="avatar-editor__cell avatar-editor__cell--action"
            onClick={() => set({ emoji: randomEmoji(value.emoji) })}
            aria-label="Random emoji"
          >
            <CasinoIcon fontSize="small" />
          </button>
        </div>
      </div>

      {/* Color — custom picker (first) · swatches · shuffle die (last) */}
      <div className="avatar-editor__row avatar-editor__row--bg">
        <span className="avatar-editor__label">Color</span>
        <div className="avatar-editor__colors">
          <label
            className="avatar-editor__swatch avatar-editor__swatch--pick"
            title="Custom color"
          >
            <PaletteIcon fontSize="small" />
            <input
              type="color"
              className="avatar-editor__native"
              value={value.bgColor}
              onChange={(e) => set({ bgColor: e.target.value })}
              aria-label="Custom color"
            />
          </label>
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
          <button
            type="button"
            className="avatar-editor__swatch avatar-editor__swatch--pick"
            onClick={() => set({ bgColor: randomVividColor(value.bgColor) })}
            aria-label="Random color"
          >
            <CasinoIcon fontSize="small" />
          </button>
        </div>
      </div>

      {/* Shape — a plain swatch in the chosen color (the preview shows the emoji) */}
      <div className="avatar-editor__row avatar-editor__row--shape">
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
              <span
                className={`avatar-editor__shape-swatch avatar-editor__shape-swatch--${shape}`}
                style={{ background: value.bgColor }}
              />
              {SHAPE_LABEL[shape]}
            </button>
          ))}
        </div>
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
    </div>
  );
}
