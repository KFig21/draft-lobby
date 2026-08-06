import {
  MAX_PICK_SECONDS,
  MIN_PICK_SECONDS,
  ROSTER_SLOTS,
  SCORING_PRESETS,
  SLOT_HINTS,
  SLOT_LABELS,
  SLOT_MAX,
  DEFAULT_BOT_PICK_SECONDS,
  MATCH_ROUND_PICK_SECONDS,
  UNLIMITED_PICK_SECONDS,
  matchPreset,
  rosterSize,
  startingSpots,
  type LobbySettings,
  type PickTier,
  type RosterSlot,
  type ScoringRules,
  type SettingsGroup,
} from '@draft-lobby/shared';
import AddIcon from '@mui/icons-material/Add';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import RemoveIcon from '@mui/icons-material/Remove';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatPickClock, formatSeconds } from '../../lib/format';
import { supabase } from '../../supabase';
import { ScoringRulesModal } from '../LeagueRulesModal/ScoringRulesModal';
import { Modal } from '../Modal/Modal';
import { ToggleSwitch } from '../ToggleSwitch/ToggleSwitch';
import {
  ScoringFormatCreatorPage,
  type SavedScoringFormat,
} from '../../pages/ScoringFormatCreator/ScoringFormatCreatorPage';
// The wizard/lineup/timer-tiers class styles this markup uses live in the lobby
// wizard's stylesheet. Import it here so the fields are styled wherever the
// component is used (the wizards, and now the settings-editor modal), not only
// on pages that happen to import that sheet themselves.
import '../../pages/LobbyWizard/LobbyWizardPage.scss';

interface ScoringFormatRow {
  id: string;
  name: string;
  rules: ScoringRules;
}

const SECONDS_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240, 300, UNLIMITED_PICK_SECONDS];
const BOT_SPEED_OPTIONS = [3, 5, 10, 15, 30, MATCH_ROUND_PICK_SECONDS, UNLIMITED_PICK_SECONDS];

/** Bot-speed option label — the two sentinels read as words, not clocks. */
function botSpeedLabel(seconds: number): string {
  if (seconds === MATCH_ROUND_PICK_SECONDS) return 'Match round clock';
  return formatPickClock(seconds);
}

interface Props {
  settings: LobbySettings;
  onChange: (next: LobbySettings) => void;
  /** Optional field (e.g. league name) rendered at the top of the Basics section. */
  nameField?: ReactNode;
  /** When set (the settings editor), only these groups' inputs are enabled; the
   * rest render disabled with a "locked" note. Omit (the wizards) = all editable. */
  editableGroups?: Set<SettingsGroup>;
}

/** A disabled-when-locked section wrapper: <fieldset disabled> natively greys
 * out and disables every control inside (inputs, selects, buttons, the toggle),
 * with a short note explaining why. */
function SettingsGroupFieldset({
  editable,
  children,
}: {
  editable: boolean;
  children: ReactNode;
}) {
  return (
    <>
      {/* Note sits outside the <fieldset> so the disabled-dimming doesn't wash
          out the badge — it's the one thing that should stay legible. */}
      {!editable && (
        <p className="wizard__locked-note">
          <span className="bot-badge bot-badge--warn">
            <LockOutlinedIcon fontSize="inherit" /> Locked once the draft is under way
          </span>
        </p>
      )}
      <fieldset className="wizard__fieldset" disabled={!editable}>
        {children}
      </fieldset>
    </>
  );
}

/**
 * The editable league-parameter sections (lineup, pick clock, scoring, extras)
 * shared by the League wizard and the Lobby creator. Renders as a set of
 * `.wizard__section` blocks; the host supplies the surrounding form + name.
 */
export function LeagueSettingsFields({ settings, onChange, nameField, editableGroups }: Props) {
  const [scoringFormats, setScoringFormats] = useState<ScoringFormatRow[]>([]);
  const [showScoringModal, setShowScoringModal] = useState(false);
  const [showScoringInfo, setShowScoringInfo] = useState(false);

  // No `editableGroups` (the wizards) = everything editable.
  const canEdit = (group: SettingsGroup) => !editableGroups || editableGroups.has(group);

  useEffect(() => {
    void supabase
      .from('scoring_formats')
      .select('id, name, rules')
      .order('created_at')
      .then(({ data }) => data && setScoringFormats(data as ScoringFormatRow[]));
  }, []);

  function set<K extends keyof LobbySettings>(key: K, value: LobbySettings[K]) {
    onChange({ ...settings, [key]: value });
  }

  const rosterMap = useMemo(() => {
    const m = new Map<RosterSlot, number>();
    for (const r of settings.rosterComposition) m.set(r.slot, r.count);
    return m;
  }, [settings.rosterComposition]);

  const rounds = rosterSize(settings.rosterComposition);

  function setSlotCount(slot: RosterSlot, count: number) {
    onChange({
      ...settings,
      rosterComposition: settings.rosterComposition.some((r) => r.slot === slot)
        ? settings.rosterComposition.map((r) => (r.slot === slot ? { ...r, count } : r))
        : [...settings.rosterComposition, { slot, count }],
    });
  }
  function stepSlot(slot: RosterSlot, delta: number) {
    const current = rosterMap.get(slot) ?? 0;
    setSlotCount(slot, Math.max(0, Math.min(SLOT_MAX[slot], current + delta)));
  }

  // ── Pick-timer tiers ──
  const setTiers = (tiers: PickTier[]) => set('pickTiers', tiers);
  const updateTier = (i: number, patch: Partial<PickTier>) =>
    setTiers(settings.pickTiers.map((t, idx) => (idx === i ? { ...t, ...patch } : t)));
  function addTier() {
    const tiers = settings.pickTiers;
    const catchAllIdx = tiers.findIndex((t) => t.untilRound === null);
    const prev = catchAllIdx > 0 ? (tiers[catchAllIdx - 1].untilRound ?? 0) : 0;
    const next = [...tiers];
    next.splice(Math.max(0, catchAllIdx), 0, {
      untilRound: Math.min(prev + 3, Math.max(1, rounds - 1)),
      seconds: 60,
    });
    setTiers(next);
  }
  const removeTier = (i: number) =>
    setTiers(settings.pickTiers.filter((_, idx) => idx !== i));

  // ── Scoring ──
  function setScoringByChoice(choice: string) {
    const [kind, key] = choice.split(':');
    if (kind === 'preset' && key in SCORING_PRESETS) {
      set('scoring', SCORING_PRESETS[key as keyof typeof SCORING_PRESETS].rules);
    } else if (kind === 'format') {
      const fmt = scoringFormats.find((f) => f.id === key);
      if (fmt) set('scoring', fmt.rules);
    }
  }
  const currentScoringChoice = useMemo(() => {
    const preset = matchPreset(settings.scoring);
    if (preset) return `preset:${preset}`;
    const json = JSON.stringify(settings.scoring);
    const fmt = scoringFormats.find((f) => JSON.stringify(f.rules) === json);
    return fmt ? `format:${fmt.id}` : 'custom';
  }, [settings.scoring, scoringFormats]);
  // Name shown in the scoring-details modal badge for a saved (non-preset)
  // format; presets label themselves via matchPreset inside the modal.
  const scoringName = useMemo(() => {
    if (!currentScoringChoice.startsWith('format:')) return undefined;
    const id = currentScoringChoice.slice('format:'.length);
    return scoringFormats.find((f) => f.id === id)?.name;
  }, [currentScoringChoice, scoringFormats]);
  function onScoringSaved(fmt: SavedScoringFormat) {
    setScoringFormats((prev) => [
      ...prev.filter((f) => f.id !== fmt.id),
      { id: fmt.id, name: fmt.name, rules: fmt.rules },
    ]);
    set('scoring', fmt.rules);
    setShowScoringModal(false);
  }

  return (
    <>
      {/* Basics */}
      <section className="wizard__section">
        <h2>Basics</h2>
        {nameField}
        <SettingsGroupFieldset editable={canEdit('structural')}>
          <div className="wizard__grid wizard__grid--2">
            <label className="field">
              <span>Teams</span>
              <select
                value={settings.teamCount}
                onChange={(e) => set('teamCount', Number(e.target.value))}
              >
                {Array.from({ length: 31 }, (_, i) => i + 2).map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Draft type</span>
              <select
                value={settings.draftType}
                onChange={(e) => set('draftType', e.target.value as LobbySettings['draftType'])}
              >
                <option value="SNAKE">Snake</option>
                <option value="STRAIGHT">Straight</option>
              </select>
            </label>
          </div>
          <div className="wizard__toggle-row">
            <span>Enable keepers</span>
            <ToggleSwitch
              label="Enable keepers"
              checked={settings.keepersEnabled}
              onChange={(checked) => set('keepersEnabled', checked)}
            />
          </div>
        </SettingsGroupFieldset>
      </section>

      {/* Scoring */}
      <section className="wizard__section">
        <div className="wizard__section-head">
          <h2>Scoring format</h2>
          <button
            type="button"
            className="wizard__info-btn"
            onClick={() => setShowScoringInfo(true)}
            aria-label="View scoring details"
            title="View scoring details"
          >
            <InfoOutlinedIcon fontSize="small" />
          </button>
        </div>
        <SettingsGroupFieldset editable={canEdit('scoring')}>
          <select
            className="wizard__scoring-select"
            value={currentScoringChoice}
            onChange={(e) => setScoringByChoice(e.target.value)}
          >
            <optgroup label="Presets">
              {(Object.keys(SCORING_PRESETS) as (keyof typeof SCORING_PRESETS)[]).map((p) => (
                <option key={p} value={`preset:${p}`}>
                  {SCORING_PRESETS[p].label}
                </option>
              ))}
            </optgroup>
            {scoringFormats.length > 0 && (
              <optgroup label="Your saved formats">
                {scoringFormats.map((f) => (
                  <option key={f.id} value={`format:${f.id}`}>
                    {f.name} (custom)
                  </option>
                ))}
              </optgroup>
            )}
            {currentScoringChoice === 'custom' && <option value="custom">Custom</option>}
          </select>
          <button
            type="button"
            className="wizard__link"
            onClick={() => setShowScoringModal(true)}
          >
            + Create a custom scoring format
          </button>
        </SettingsGroupFieldset>
      </section>

      {/* Lineup */}
      <section className="wizard__section">
        <div className="wizard__section-head">
          <h2>Starting lineup</h2>
          <span className="muted">
            {startingSpots(settings.rosterComposition)} starters · {rounds} roster ·{' '}
            {rounds} rounds
          </span>
        </div>
        <SettingsGroupFieldset editable={canEdit('structural')}>
          <div className="lineup">
            {ROSTER_SLOTS.map((slot) => {
              const count = rosterMap.get(slot) ?? 0;
              return (
                <div className="lineup__slot" key={slot}>
                  <span className="lineup__label">
                    {SLOT_LABELS[slot]}
                    {SLOT_HINTS[slot] && (
                      <span className="lineup__hint">{SLOT_HINTS[slot]}</span>
                    )}
                  </span>
                  <div className="lineup__stepper">
                    <button
                      type="button"
                      className="lineup__step"
                      aria-label={`Fewer ${SLOT_LABELS[slot]}`}
                      disabled={count === 0}
                      onClick={() => stepSlot(slot, -1)}
                    >
                      <RemoveIcon fontSize="small" />
                    </button>
                    <span className="lineup__count">{count}</span>
                    <button
                      type="button"
                      className="lineup__step"
                      aria-label={`More ${SLOT_LABELS[slot]}`}
                      disabled={count >= SLOT_MAX[slot]}
                      onClick={() => stepSlot(slot, 1)}
                    >
                      <AddIcon fontSize="small" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </SettingsGroupFieldset>
      </section>

      {/* Pick clock */}
      <section className="wizard__section">
        <h2>Pick clock</h2>
        <p className="muted">
          Set the clock by round. Limits: {formatSeconds(MIN_PICK_SECONDS)}–
          {formatSeconds(MAX_PICK_SECONDS)}.
        </p>
        <SettingsGroupFieldset editable={canEdit('behavioral')}>
        <div className="timer-tiers">
          {settings.pickTiers.map((tier, i) => {
            const isCatchAll = tier.untilRound === null;
            return (
              <div className="timer-tiers__row" key={i}>
                <div className="timer-tiers__range">
                  {isCatchAll ? (
                    <span className="timer-tiers__label">Remaining rounds</span>
                  ) : (
                    <span className="timer-tiers__label">
                      Through round
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, rounds - 1)}
                        value={tier.untilRound ?? 1}
                        onChange={(e) =>
                          updateTier(i, { untilRound: Number(e.target.value) })
                        }
                      />
                    </span>
                  )}
                </div>
                <select
                  className="timer-tiers__seconds"
                  value={tier.seconds}
                  onChange={(e) => updateTier(i, { seconds: Number(e.target.value) })}
                >
                  {SECONDS_OPTIONS.map((s) => (
                    <option key={s} value={s}>
                      {formatPickClock(s)}
                    </option>
                  ))}
                </select>
                {!isCatchAll && (
                  <button
                    type="button"
                    className="timer-tiers__remove"
                    onClick={() => removeTier(i)}
                    aria-label="Remove tier"
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button type="button" className="button timer-tiers__add" onClick={addTier}>
          + Add a tier
        </button>
        <label className="toggle">
          <input
            type="checkbox"
            checked={settings.allowSkips}
            onChange={(e) => set('allowSkips', e.target.checked)}
          />
          <span>
            Skip on timeout{' '}
            <em className="muted">
              (a team that runs out of time is skipped, not auto-picked — they can still pick
              afterward)
            </em>
          </span>
        </label>
        <label className="field">
          <span>
            {settings.allowSkips ? 'Skip allowance' : 'Timeout allowance'}{' '}
            <em className="muted">
              ({settings.allowSkips ? 'skips' : 'missed clocks'} before auto-pick; blank ={' '}
              unlimited)
            </em>
          </span>
          <input
            type="number"
            min={0}
            value={settings.timeoutAllowance ?? ''}
            onChange={(e) =>
              set('timeoutAllowance', e.target.value === '' ? null : Number(e.target.value))
            }
            placeholder="Unlimited"
          />
        </label>
        <label className="field">
          <span>
            Bot pick speed{' '}
            <em className="muted">
              (how fast bots draft; capped by the round clock. Match round clock
              = bots get the same time as humans — handy for stand-in seats you
              draft for. No limit = bots never auto-pick, so you draft for every
              team yourself)
            </em>
          </span>
          <select
            value={settings.botPickSeconds ?? DEFAULT_BOT_PICK_SECONDS}
            onChange={(e) => set('botPickSeconds', Number(e.target.value))}
          >
            {BOT_SPEED_OPTIONS.map((s) => (
              <option key={s} value={s}>
                {botSpeedLabel(s)}
              </option>
            ))}
          </select>
        </label>
        </SettingsGroupFieldset>
      </section>

      {showScoringModal && (
        <Modal title="New scoring format" wide onClose={() => setShowScoringModal(false)}>
          <ScoringFormatCreatorPage embedded onSaved={onScoringSaved} />
        </Modal>
      )}

      {showScoringInfo && (
        <ScoringRulesModal
          rules={settings.scoring}
          name={scoringName}
          onClose={() => setShowScoringInfo(false)}
        />
      )}
    </>
  );
}

// Moved to @draft-lobby/shared so the server can normalize tiers too; re-exported
// here for existing importers (the wizards).
export { normalizeTiers } from '@draft-lobby/shared';
