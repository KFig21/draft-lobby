import { randomAvatar, type Avatar as AvatarData } from '@draft-lobby/shared';
import TuneIcon from '@mui/icons-material/Tune';
import { useState } from 'react';
import { AvatarEditor } from '../../components/AvatarEditor/AvatarEditor';
import { DraftCellStylePicker } from '../../components/DraftGrid/DraftCellStylePicker';
import { randomSamplePlayer } from '../../components/DraftGrid/samplePlayers';
import { PlayerCardStylePicker } from '../../components/PlayerCard/PlayerCardStylePicker';
import type { DraftCellStyle } from '../../lib/draftCellStyle';
import type { PlayerCardStyle } from '../../lib/playerCardStyle';
// Pull in the real onboarding stylesheet so these previews are pixel-accurate.
import '../Onboarding/OnboardingPage.scss';
import './OnboardingLab.scss';

/**
 * TEMPORARY style lab (no prod nav — reach it at /onboarding-lab). Renders the
 * real onboarding markup + components so the CURRENT look and a PROPOSED restyle
 * (window radius + header pill, mirroring the auth screens) sit side by side.
 * Remove the route + this folder once the styling is decided.
 */
function ProfileCard({ proposed }: { proposed: boolean }) {
  const [avatar, setAvatar] = useState<AvatarData>(() => randomAvatar());
  const [cell, setCell] = useState<DraftCellStyle>('default');
  const [card, setCard] = useState<PlayerCardStyle>('comfy');
  const [player] = useState(randomSamplePlayer);
  return (
    <div className={`onboarding onb-lab__mount${proposed ? ' onboarding--proposed' : ''}`}>
      <div className="onboarding__card">
        <div className="onboarding__progress" aria-hidden>
          <span className="onboarding__dot is-done" />
          <span className="onboarding__dot" />
          <span className="onboarding__dot" />
          <span className="onboarding__dot" />
        </div>
        <div className="onboarding__body">
          <header className="onboarding__head">
            <h1>Set up your profile</h1>
            <p className="onboarding__lead">
              This is how you'll show up in lobbies, chat and on the board.
            </p>
          </header>

          <section className="onboarding__field">
            <h2>Your avatar</h2>
            <AvatarEditor value={avatar} onChange={setAvatar} />
          </section>

          <section className="onboarding__field">
            <label className="field">
              <span>Username</span>
              <input defaultValue="KFig21" autoComplete="off" />
            </label>
            <span className="onboarding__hint onboarding__hint--available">✓ Available</span>
          </section>

          <section className="onboarding__field">
            <h2>Theme</h2>
            <div className="segmented onboarding__theme">
              <button type="button" className="segmented__opt segmented__opt--on">
                🌙 Dark
              </button>
              <button type="button" className="segmented__opt">🌑 Night</button>
              <button type="button" className="segmented__opt">☀️ Light</button>
            </div>
          </section>

          <section className="onboarding__field">
            <h2>Draft board cell style</h2>
            <p className="onboarding__sublead">How a drafted pick looks on the board.</p>
            <DraftCellStylePicker
              value={cell}
              onChange={setCell}
              showReactions={false}
              player={player}
            />
          </section>

          <section className="onboarding__field">
            <h2>Player card style</h2>
            <p className="onboarding__sublead">Row density in the draft pool's player list.</p>
            <PlayerCardStylePicker value={card} onChange={setCard} player={player} />
          </section>

          <div className="onboarding__actions">
            <button type="button" className="button button--primary onboarding__next">
              Continue
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function TourCard({ proposed }: { proposed: boolean }) {
  return (
    <div className={`onboarding onb-lab__mount${proposed ? ' onboarding--proposed' : ''}`}>
      <div className="onboarding__card">
        <button type="button" className="onboarding__skip">
          Skip tour
        </button>
        <div className="onboarding__progress" aria-hidden>
          <span className="onboarding__dot is-done" />
          <span className="onboarding__dot is-done" />
          <span className="onboarding__dot" />
          <span className="onboarding__dot" />
        </div>
        <div className="onboarding__body onboarding__body--tour">
          <span className="onboarding__icon-wrap">
            <TuneIcon className="onboarding__icon" />
          </span>
          <h1>Rulesets &amp; league sets</h1>
          <div className="onboarding__prose">
            <p>
              A <strong>ruleset</strong> is your scoring format — PPR, half-PPR, or any custom
              point values you set. A <strong>league set</strong> bundles a ruleset with roster
              slots, team count and draft type so you can spin up the same league again in one
              click.
            </p>
            <p>
              Build and tweak them in <strong>Settings</strong>, and <strong>share</strong> either
              one with a link — leaguemates import it instantly, no re-typing.
            </p>
            <p className="onboarding__note">
              Everything the app ranks — the <strong>Rankings</strong> page and the player pool
              inside a draft room — reflects the ruleset in play, so projections and value always
              match how <em>your</em> league scores.
            </p>
          </div>
          <div className="onboarding__actions">
            <button type="button" className="button">
              Back
            </button>
            <button type="button" className="button button--primary">
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function OnboardingLab() {
  return (
    <div className="onb-lab">
      <header className="onb-lab__head">
        <h1>Onboarding style lab</h1>
        <p>
          Left = current · Right = proposed (24px window radius + a per-theme header pill on the
          profile step; tour steps keep their centered icon + title). Temporary — /onboarding-lab.
        </p>
      </header>
      <div className="onb-lab__grid">
        <div className="onb-lab__col">
          <span className="onb-lab__tag">Current</span>
          <ProfileCard proposed={false} />
          <TourCard proposed={false} />
        </div>
        <div className="onb-lab__col">
          <span className="onb-lab__tag">Proposed</span>
          <ProfileCard proposed />
          <TourCard proposed />
        </div>
      </div>
    </div>
  );
}
