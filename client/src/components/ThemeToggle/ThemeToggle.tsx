import BedtimeIcon from '@mui/icons-material/Bedtime';
import DarkModeIcon from '@mui/icons-material/DarkMode';
import LightModeIcon from '@mui/icons-material/LightMode';
import { useTheme, type Theme } from '../../theme/ThemeContext';

// Current-theme icon + the theme tapping cycles to next (matches CYCLE in
// ThemeContext: dark → night → light → dark). Night gets the filled crescent to
// read distinctly from dark's outlined moon.
const META: Record<Theme, { Icon: typeof DarkModeIcon; label: string; next: string }> = {
  dark: { Icon: DarkModeIcon, label: 'Dark', next: 'Night' },
  night: { Icon: BedtimeIcon, label: 'Night', next: 'Light' },
  light: { Icon: LightModeIcon, label: 'Light', next: 'Dark' },
};

/** Cycles the app through dark → night → light. Shows the current theme. */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, cycle } = useTheme();
  const { Icon, label, next } = META[theme];
  return (
    <button
      type="button"
      className={className}
      onClick={cycle}
      aria-label={`Theme: ${label}. Switch to ${next}`}
      title={`${label} — tap for ${next}`}
    >
      <Icon fontSize="small" />
    </button>
  );
}
