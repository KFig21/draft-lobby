import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import './InfoButton.scss';

interface Props {
  /** Fired on click — usually opens an explainer modal/popover. */
  onClick: () => void;
  /** Accessible name, also used as the hover tooltip. */
  label: string;
  /** Optional icon size in px (defaults to the ~1.15rem set in CSS). */
  size?: number;
  /** Extra class for layout tweaks at the call site (e.g. margin). */
  className?: string;
}

/**
 * A small, borderless info (ⓘ) icon button — no chip background, accent-
 * convention hover (mint on dark, teal on light), guarded to real-hover
 * devices so it never sticks after a tap. Sits next to a section heading.
 */
export function InfoButton({ onClick, label, size, className }: Props) {
  return (
    <button
      type="button"
      className={`info-button${className ? ` ${className}` : ''}`}
      onClick={onClick}
      aria-label={label}
      title={label}
      style={size ? { fontSize: `${size}px` } : undefined}
    >
      <InfoOutlinedIcon fontSize="inherit" />
    </button>
  );
}
