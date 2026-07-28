import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import './ChampionBadge.scss';

/** Small trophy badge marking a user/team as last season's defending
 * champion — reused everywhere a name shows up (roster, chat, column
 * headers, reactions, toasts) so it isn't a one-off inline emoji. */
export function ChampionBadge({ size = 14 }: { size?: number }) {
  return (
    <span className="champion-badge" title="Defending champion" aria-label="Defending champion">
      <EmojiEventsIcon sx={{ fontSize: size }} />
    </span>
  );
}
