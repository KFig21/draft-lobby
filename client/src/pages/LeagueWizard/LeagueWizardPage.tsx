import {
  DEFAULT_LOBBY_SETTINGS,
  MAX_PICK_SECONDS,
  MIN_PICK_SECONDS,
  ROSTER_SLOTS,
  SCORING_PRESETS,
  SLOT_HINTS,
  SLOT_LABELS,
  SLOT_MAX,
  lobbySettingsSchema,
  matchPreset,
  rosterSize,
  startingSpots,
  type LobbySettings,
  type PickTier,
  type RosterSlot,
  type ScoringRules,
} from '@draft-lobby/shared';
import RemoveIcon from '@mui/icons-material/Remove';
import AddIcon from '@mui/icons-material/Add';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Modal } from '../../components/Modal/Modal';
import {
  ScoringFormatCreatorPage,
  type SavedScoringFormat,
} from '../ScoringFormatCreator/ScoringFormatCreatorPage';
import { useAuth } from '../../auth/AuthContext';
import { formatSeconds } from '../../lib/format';
import { supabase } from '../../supabase';
import '../LobbyWizard/LobbyWizardPage.scss';

interface ScoringFormatRow {
  id: string;
  name: string;
  rules: ScoringRules;
}

const SECONDS_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240, 300];

export function LeagueWizardPage() {
  const params = useParams<{ id?: string }>();
  const editId = params.id;
  const navigate = useNavigate();
  const { session } = useAuth();
  const userId = session?.user.id;

  const [settings, setSettings] = useState<LobbySettings>({
    ...DEFAULT_LOBBY_SETTINGS,
    name: '',
  });
  const [scoringFormats, setScoringFormats] = useState<ScoringFormatRow[]>([]);
  const [showScoringModal, setShowScoringModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase
      .from('scoring_formats')
      .select('id, name, rules')
      .order('created_at')
      .then(({ data }) => data && setScoringFormats(data as ScoringFormatRow[]));
  }, []);

  // Edit mode: hydrate from the existing league.
  useEffect(() => {
    if (!editId) return;
    void supabase
      .from('league_templates')
      .select('settings')
      .eq('id', editId)
      .single()
      .then(({ data }) => {
        if (data?.settings) setSettings(data.settings as LobbySettings);
      });
  }, [editId]);

  function set<K extends keyof LobbySettings>(key: K, value: LobbySettings[K]) {
    setSettings((s) => ({ ...s, [key]: value }));
  }

  const rosterMap = useMemo(() => {
    const m = new Map<RosterSlot, number>();
    for (const r of settings.rosterComposition) m.set(r.slot, r.count);
    return m;
  }, [settings.rosterComposition]);

  const rounds = rosterSize(settings.rosterComposition);

  function setSlotCount(slot: RosterSlot, count: number) {
    setSettings((s) => ({
      ...s,
      rosterComposition: s.rosterComposition.some((r) => r.slot === slot)
        ? s.rosterComposition.map((r) => (r.slot === slot ? { ...r, count } : r))
        : [...s.rosterComposition, { slot, count }],
    }));
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
  const scoringLabel = useMemo(() => {
    const preset = matchPreset(settings.scoring);
    if (preset) return SCORING_PRESETS[preset].label;
    const json = JSON.stringify(settings.scoring);
    const fmt = scoringFormats.find((f) => JSON.stringify(f.rules) === json);
    return fmt ? fmt.name : 'Custom';
  }, [settings.scoring, scoringFormats]);
  function onScoringSaved(fmt: SavedScoringFormat) {
    setScoringFormats((prev) => [
      ...prev.filter((f) => f.id !== fmt.id),
      { id: fmt.id, name: fmt.name, rules: fmt.rules },
    ]);
    set('scoring', fmt.rules);
    setShowScoringModal(false);
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const cleaned: LobbySettings = {
      ...settings,
      scheduledStart: null, // per-lobby, not part of a reusable league
      rosterComposition: settings.rosterComposition.filter((r) => r.count > 0),
      pickTiers: normalizeTiers(settings.pickTiers, rounds),
    };
    const parsed = lobbySettingsSchema.safeParse(cleaned);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Please check your settings');
      return;
    }
    setSaving(true);
    const row = { user_id: userId, name: parsed.data.name, settings: parsed.data };
    const query = editId
      ? supabase.from('league_templates').update(row).eq('id', editId)
      : supabase.from('league_templates').insert(row);
    const { error } = await query;
    setSaving(false);
    if (error) {
      setError(error.message);
      return;
    }
    navigate('/settings');
  }

  return (
    <main className="wizard">
      <header className="wizard__header">
        <button className="back-link" onClick={() => navigate('/settings')}>
          ← Settings
        </button>
        <h1>{editId ? 'Edit league' : 'New league'}</h1>
      </header>

      <form className="wizard__form" onSubmit={handleSubmit}>
        <section className="wizard__section">
          <h2>Basics</h2>
          <label className="field">
            <span>League name</span>
            <input
              value={settings.name}
              onChange={(e) => set('name', e.target.value)}
              placeholder='e.g. "PEFFL"'
              maxLength={60}
              required
            />
          </label>
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
                onChange={(e) =>
                  set('draftType', e.target.value as LobbySettings['draftType'])
                }
              >
                <option value="SNAKE">Snake</option>
                <option value="STRAIGHT">Straight</option>
              </select>
            </label>
          </div>
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
        </section>

        {/* Pick clock */}
        <section className="wizard__section">
          <h2>Pick clock</h2>
          <p className="muted">
            Set the clock by round. Limits: {formatSeconds(MIN_PICK_SECONDS)}–
            {formatSeconds(MAX_PICK_SECONDS)}.
          </p>
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
                        {formatSeconds(s)}
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
          <label className="field">
            <span>
              Timeout allowance{' '}
              <em className="muted">(missed clocks before auto-pick; blank = unlimited)</em>
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
        </section>

        {/* Scoring */}
        <section className="wizard__section">
          <div className="wizard__section-head">
            <h2>Scoring format</h2>
            <span className="scoring-badge">🎯 {scoringLabel}</span>
          </div>
          <select
            className="wizard__scoring-select"
            value={currentScoringChoice}
            onChange={(e) => setScoringByChoice(e.target.value)}
          >
            <optgroup label="Presets">
              {(Object.keys(SCORING_PRESETS) as (keyof typeof SCORING_PRESETS)[]).map(
                (p) => (
                  <option key={p} value={`preset:${p}`}>
                    {SCORING_PRESETS[p].label}
                  </option>
                ),
              )}
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
        </section>

        {/* Extras */}
        <section className="wizard__section">
          <h2>Extras</h2>
          <label className="toggle">
            <input
              type="checkbox"
              checked={settings.keepersEnabled}
              onChange={(e) => set('keepersEnabled', e.target.checked)}
            />
            <span>Enable keepers</span>
          </label>
        </section>

        {error && <p className="wizard__error">{error}</p>}

        <div className="wizard__submit-row">
          <button className="button button--primary" disabled={saving}>
            {saving ? 'Saving…' : editId ? 'Save changes' : 'Save league'}
          </button>
        </div>
      </form>

      {showScoringModal && (
        <Modal title="New scoring format" wide onClose={() => setShowScoringModal(false)}>
          <ScoringFormatCreatorPage embedded onSaved={onScoringSaved} />
        </Modal>
      )}
    </main>
  );
}

/** Clean up user-entered tiers: clamp/sort boundaries, dedupe, ensure a catch-all. */
function normalizeTiers(tiers: PickTier[], rounds: number): PickTier[] {
  const bounded = tiers
    .filter((t) => t.untilRound !== null)
    .map((t) => ({
      untilRound: Math.min(Math.max(1, t.untilRound as number), Math.max(1, rounds - 1)),
      seconds: t.seconds,
    }))
    .sort((a, b) => (a.untilRound as number) - (b.untilRound as number));
  const seen = new Set<number>();
  const deduped: PickTier[] = [];
  for (let i = bounded.length - 1; i >= 0; i--) {
    const r = bounded[i].untilRound as number;
    if (!seen.has(r)) {
      seen.add(r);
      deduped.unshift(bounded[i]);
    }
  }
  const catchAll = tiers.find((t) => t.untilRound === null) ?? {
    untilRound: null,
    seconds: 60,
  };
  return [...deduped, catchAll];
}
