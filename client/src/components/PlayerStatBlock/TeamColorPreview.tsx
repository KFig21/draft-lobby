import type { PlayerRow } from '../../lib/types';
import { PlayerHeader } from './PlayerStatBlock';
import './TeamColorPreview.scss';

/** Shows exactly what the "Team colors" setting does to the play/pick
 * modals' team abbreviation — the real PlayerHeader component, not a
 * mockup, so the "off" state is genuinely plain text (no bold, no
 * background) and the "on" state is the genuine colored pill. Reads the
 * setting itself (PlayerHeader calls getTeamColorsEnabled() internally), so
 * it updates live as soon as the toggle above it changes. The parent passes
 * the same sample player shown in the Cell-style preview above it. */
export function TeamColorPreview({ player }: { player: PlayerRow }) {
  return (
    <div className="team-color-preview">
      <PlayerHeader player={player} />
    </div>
  );
}
