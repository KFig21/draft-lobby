import {
  USERNAME_MAX_LEN,
  USERNAME_MIN_LEN,
  defaultAvatar,
  type Avatar as AvatarData,
} from '@draft-lobby/shared';
import { useEffect, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { AvatarEditor } from '../../components/AvatarEditor/AvatarEditor';
import { DraftCellStylePicker } from '../../components/DraftGrid/DraftCellStylePicker';
import { randomSamplePlayer } from '../../components/DraftGrid/samplePlayers';
import { PlayerCardStylePicker } from '../../components/PlayerCard/PlayerCardStylePicker';
import {
  getDraftCellStyle,
  setDraftCellStyle,
  type DraftCellStyle,
} from '../../lib/draftCellStyle';
import {
  getPlayerCardStyle,
  setPlayerCardStyle,
  type PlayerCardStyle,
} from '../../lib/playerCardStyle';
import { supabase } from '../../supabase';
import { useTheme } from '../../theme/ThemeContext';
import './OnboardingPage.scss';

type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'short';

// The skippable guided-tour steps (everything after the mandatory profile
// step). Kept declarative so the flow is just "profile, then these".
interface TourStep {
  emoji: string;
  title: string;
  body: ReactNode;
}

const TOUR: TourStep[] = [
  {
    emoji: '📊',
    title: 'Rulesets & league sets',
    body: (
      <>
        <p>
          A <strong>ruleset</strong> is your scoring format — PPR, half-PPR, or
          any custom point values you set. A <strong>league set</strong> bundles
          a ruleset with roster slots, team count and draft type so you can spin
          up the same league again in one click.
        </p>
        <p>
          Build and tweak them in <strong>Settings</strong>, and{' '}
          <strong>share</strong> either one with a link — leaguemates import it
          instantly, no re-typing.
        </p>
        <p className="onboarding__note">
          Everything the app ranks — the <strong>Rankings</strong> page and the
          player pool inside a draft room — reflects the ruleset in play, so
          projections and value always match how <em>your</em> league scores.
        </p>
      </>
    ),
  },
  {
    emoji: '🤝',
    title: 'Friends',
    body: (
      <>
        <p>
          Find people from <strong>Friends</strong> and send a request, or open
          someone's profile from any draft, chat, or lobby and add them there.
        </p>
        <p>
          Friends make it quick to fill a lobby, and you'll see their public
          drafts and activity on their profile.
        </p>
        <p className="onboarding__note">
          Coming soon: invite anyone with a text link — if they don't have an
          account yet, they'll be walked through signing up and friended
          automatically.
        </p>
      </>
    ),
  },
  {
    emoji: '🏈',
    title: 'Join or create a lobby',
    body: (
      <>
        <p>
          <strong>Join</strong> a lobby with the code or invite link a
          commissioner shares with you — enter it under{' '}
          <strong>Join a lobby</strong> and claim your seat.
        </p>
        <p>
          <strong>Create</strong> one yourself from{' '}
          <strong>New lobby</strong>: pick a league set (or a preset), set your
          team count and draft type, and invite the room. You're the
          commissioner, so you control the clock, keepers and settings.
        </p>
        <p className="onboarding__note">
          That's the tour — everything here lives in the nav, and you can revisit
          any setting whenever you like.
        </p>
      </>
    ),
  },
];

export function OnboardingPage() {
  const { session, profile, refreshProfile } = useAuth();
  const { theme, toggle } = useTheme();
  const navigate = useNavigate();
  const userId = session?.user.id;

  const [step, setStep] = useState(0); // 0 = profile; 1..N = tour
  const [seeded, setSeeded] = useState(false);
  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState<AvatarData>(() =>
    defaultAvatar(userId ?? 'seed'),
  );
  const [cellStyle, setCellStyle] = useState<DraftCellStyle>(getDraftCellStyle);
  const [cardStyle, setCardStyle] = useState<PlayerCardStyle>(getPlayerCardStyle);
  const [samplePlayer] = useState(randomSamplePlayer);
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const [saving, setSaving] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const trimmed = username.trim();
  const totalSteps = 1 + TOUR.length;

  // Seed username/avatar from the profile once it loads (username was chosen at
  // signup; here it's pre-filled and editable).
  useEffect(() => {
    if (profile && !seeded) {
      setUsername(profile.username ?? '');
      if (profile.avatar) setAvatar(profile.avatar);
      setSeeded(true);
    }
  }, [profile, seeded]);

  // Live availability, excluding the user's own current username.
  useEffect(() => {
    if (step !== 0) return;
    if (trimmed.length === 0) {
      setUsernameStatus('idle');
      return;
    }
    if (trimmed.length < USERNAME_MIN_LEN) {
      setUsernameStatus('short');
      return;
    }
    if (
      profile?.username &&
      trimmed.toLowerCase() === profile.username.toLowerCase()
    ) {
      setUsernameStatus('available');
      return;
    }
    setUsernameStatus('checking');
    let cancelled = false;
    const t = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id')
        .ilike('username', trimmed)
        .neq('id', userId ?? '')
        .maybeSingle();
      if (cancelled) return;
      setUsernameStatus(data ? 'taken' : 'available');
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [trimmed, profile, userId, step]);

  function updateCellStyle(style: DraftCellStyle) {
    setDraftCellStyle(style);
    setCellStyle(style);
  }
  function updateCardStyle(style: PlayerCardStyle) {
    setPlayerCardStyle(style);
    setCardStyle(style);
  }

  async function saveProfile(): Promise<boolean> {
    if (!userId) return false;
    setError(null);
    if (trimmed.length < USERNAME_MIN_LEN) {
      setError(`Username must be at least ${USERNAME_MIN_LEN} characters`);
      return false;
    }
    if (usernameStatus === 'taken') {
      setError('That username is already taken');
      return false;
    }
    setSaving(true);
    const { error } = await supabase
      .from('profiles')
      .update({ username: trimmed, avatar })
      .eq('id', userId);
    if (error) {
      setSaving(false);
      setError(error.code === '23505' ? 'That username is already taken' : error.message);
      return false;
    }
    // Keep auth metadata in sync so headers/greetings reflect the name.
    await supabase.auth.updateUser({ data: { username: trimmed } });
    await refreshProfile();
    setSaving(false);
    return true;
  }

  /** Stamp onboarded_at and leave the flow. Called by Finish and Skip tour. */
  async function finish() {
    if (!userId) return;
    setFinishing(true);
    await supabase
      .from('profiles')
      .update({ onboarded_at: new Date().toISOString() })
      .eq('id', userId);
    await refreshProfile();
    navigate('/home', { replace: true });
  }

  async function handleContinue() {
    if (await saveProfile()) setStep(1);
  }

  const canContinue =
    !saving && usernameStatus === 'available' && trimmed.length >= USERNAME_MIN_LEN;

  return (
    <main className="onboarding">
      <div className="onboarding__card">
        <div className="onboarding__progress" aria-hidden>
          {Array.from({ length: totalSteps }).map((_, i) => (
            <span
              key={i}
              className={`onboarding__dot${i <= step ? ' is-done' : ''}`}
            />
          ))}
        </div>

        {step === 0 ? (
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
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  minLength={USERNAME_MIN_LEN}
                  maxLength={USERNAME_MAX_LEN}
                  required
                  autoComplete="username"
                />
                <span className={`onboarding__hint onboarding__hint--${usernameStatus}`}>
                  {usernameStatus === 'checking' && 'Checking availability…'}
                  {usernameStatus === 'available' && '✓ Available'}
                  {usernameStatus === 'taken' && 'That username is taken'}
                  {usernameStatus === 'short' &&
                    `At least ${USERNAME_MIN_LEN} characters`}
                </span>
              </label>
            </section>

            <section className="onboarding__field">
              <h2>Theme</h2>
              <div className="segmented onboarding__theme">
                <button
                  type="button"
                  className={`segmented__opt${theme === 'dark' ? ' segmented__opt--on' : ''}`}
                  onClick={() => theme !== 'dark' && toggle()}
                >
                  🌙 Dark
                </button>
                <button
                  type="button"
                  className={`segmented__opt${theme === 'light' ? ' segmented__opt--on' : ''}`}
                  onClick={() => theme !== 'light' && toggle()}
                >
                  ☀️ Light
                </button>
              </div>
            </section>

            <section className="onboarding__field">
              <h2>Draft board cell style</h2>
              <p className="onboarding__sublead">How a drafted pick looks on the board.</p>
              <DraftCellStylePicker
                value={cellStyle}
                onChange={updateCellStyle}
                showReactions={false}
                player={samplePlayer}
              />
            </section>

            <section className="onboarding__field">
              <h2>Player card style</h2>
              <p className="onboarding__sublead">Row density in the draft pool's player list.</p>
              <PlayerCardStylePicker
                value={cardStyle}
                onChange={updateCardStyle}
                player={samplePlayer}
              />
            </section>

            {error && <p className="onboarding__error">{error}</p>}

            <div className="onboarding__actions">
              <button
                type="button"
                className="button button--primary onboarding__next"
                onClick={handleContinue}
                disabled={!canContinue}
              >
                {saving ? 'Saving…' : 'Continue'}
              </button>
            </div>
          </div>
        ) : (
          <TourStepView
            step={TOUR[step - 1]}
            index={step - 1}
            count={TOUR.length}
            finishing={finishing}
            onBack={() => setStep(step - 1)}
            onNext={() => {
              if (step - 1 < TOUR.length - 1) setStep(step + 1);
              else void finish();
            }}
            onSkip={() => void finish()}
          />
        )}
      </div>
    </main>
  );
}

function TourStepView({
  step,
  index,
  count,
  finishing,
  onBack,
  onNext,
  onSkip,
}: {
  step: TourStep;
  index: number;
  count: number;
  finishing: boolean;
  onBack: () => void;
  onNext: () => void;
  onSkip: () => void;
}) {
  const isLast = index === count - 1;
  return (
    <div className="onboarding__body onboarding__body--tour">
      <button type="button" className="onboarding__skip" onClick={onSkip}>
        Skip tour
      </button>
      <div className="onboarding__emoji" aria-hidden>
        {step.emoji}
      </div>
      <h1>{step.title}</h1>
      <div className="onboarding__prose">{step.body}</div>
      <div className="onboarding__actions">
        <button type="button" className="button onboarding__back" onClick={onBack}>
          Back
        </button>
        <button
          type="button"
          className="button button--primary onboarding__next"
          onClick={onNext}
          disabled={finishing}
        >
          {isLast ? (finishing ? 'Finishing…' : 'Finish') : 'Next'}
        </button>
      </div>
    </div>
  );
}
