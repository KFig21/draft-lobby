import {
  POSITIONS,
  POSITION_COLORS,
  ROSTER_SLOTS,
  SCORING_PRESETS,
  SLOT_ELIGIBILITY,
  SLOT_HINTS,
  SLOT_LABELS,
  groupScoringRules,
  isUnlimitedPick,
  matchPreset,
  positionLimitFor,
  roundsForSettings,
  startingSpots,
  type LobbySettings,
  type RosterSlot,
} from '@draft-lobby/shared';
import CheckIcon from '@mui/icons-material/Check';
import GroupsIcon from '@mui/icons-material/Groups';
import LinkIcon from '@mui/icons-material/Link';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined';
import SaveIcon from '@mui/icons-material/Save';
import ScoreboardIcon from '@mui/icons-material/Scoreboard';
import TimerOutlinedIcon from '@mui/icons-material/TimerOutlined';
import TuneIcon from '@mui/icons-material/Tune';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { formatPickClock } from '../../lib/format';
import type { ProfileMini } from '../../lib/types';
import { supabase } from '../../supabase';
import { Avatar } from '../Avatar/Avatar';
import { Modal } from '../Modal/Modal';
import { RulesOverview } from './RulesOverview';
import './LeagueRulesModal.scss';

interface Props {
  settings: LobbySettings;
  /** Seeds the saved/shared name — usually the lobby or league name. */
  defaultName?: string;
  onClose: () => void;
}

// $danger and $accent (variables.scss) — the same red/green already used
// elsewhere in the app — as the two ends of the pick-clock urgency gradient.
const LEAST_TIME_COLOR = { r: 0xf8, g: 0x57, b: 0x7d };
const MOST_TIME_COLOR = { r: 0x3f, g: 0xd6, b: 0xa5 };

/** Linear-interpolate from "little time" (red) to "lots of time" (green). */
function lerpColor(ratio: number): string {
  const r = Math.round(LEAST_TIME_COLOR.r + (MOST_TIME_COLOR.r - LEAST_TIME_COLOR.r) * ratio);
  const g = Math.round(LEAST_TIME_COLOR.g + (MOST_TIME_COLOR.g - LEAST_TIME_COLOR.g) * ratio);
  const b = Math.round(LEAST_TIME_COLOR.b + (MOST_TIME_COLOR.b - LEAST_TIME_COLOR.b) * ratio);
  return `rgb(${r}, ${g}, ${b})`;
}

/** Read-only breakdown of a league's full rules (overview, lineup, scoring),
 * with two independent save/share actions: the *scoring* rules alone (a
 * reusable "scoring format", same entity Settings > Scoring formats manages)
 * from the Scoring section, and the *whole league setup* (team count, lineup,
 * pick clock, keepers, plus this scoring) as its own "league format" at the
 * bottom — they're different reusable things, so they don't share one save
 * button. */
export function LeagueRulesModal({ settings, defaultName, onClose }: Props) {
  const { session } = useAuth();
  const userId = session?.user.id;

  const shareName = (defaultName?.trim() || settings.name || 'Shared league').slice(0, 60);

  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [linkState, setLinkState] = useState<'idle' | 'working' | 'copied'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [friendPickerOpen, setFriendPickerOpen] = useState(false);
  const [friends, setFriends] = useState<ProfileMini[]>([]);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [sentIds, setSentIds] = useState<Set<string>>(new Set());

  // Scoring-only save/share — mirrors the league-level state above but posts
  // kind:'SCORING'/settings.scoring into scoring_formats instead of
  // kind:'LEAGUE'/settings into league_templates. Same `friends` list.
  const [scoreSaveState, setScoreSaveState] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [scoreLinkState, setScoreLinkState] = useState<'idle' | 'working' | 'copied'>('idle');
  const [scoreError, setScoreError] = useState<string | null>(null);
  const [scoreFriendPickerOpen, setScoreFriendPickerOpen] = useState(false);
  const [scoreSendingId, setScoreSendingId] = useState<string | null>(null);
  const [scoreSentIds, setScoreSentIds] = useState<Set<string>>(new Set());

  const preset = matchPreset(settings.scoring);
  const scoringLabel = preset ? SCORING_PRESETS[preset].label : 'Custom';

  const totalRounds = roundsForSettings(settings);

  // Each tier's actual round span ("Rounds 4 → 9") plus a red→green color by
  // how much time it gives relative to the league's other tiers — more time
  // reads as calmer (accent), less as more urgent ($danger).
  const tierRanges = useMemo(() => {
    // Rank by time relative to the other *finite* tiers; an unlimited tier is
    // the calmest (most time), so it always maps to the top of the range.
    const finite = settings.pickTiers.map((t) => t.seconds).filter((s) => !isUnlimitedPick(s));
    const min = finite.length ? Math.min(...finite) : 0;
    const max = finite.length ? Math.max(...finite) : 0;
    let start = 1;
    return settings.pickTiers.map((tier) => {
      const end = tier.untilRound ?? totalRounds;
      const ratio = isUnlimitedPick(tier.seconds)
        ? 1
        : max === min
          ? 0.5
          : (tier.seconds - min) / (max - min);
      const range = { start, end, seconds: tier.seconds, color: lerpColor(ratio) };
      start = end + 1;
      return range;
    });
  }, [settings.pickTiers, totalRounds]);

  // Scoring rules grouped the way the catalog groups them (Passing, Rushing,
  // …), in catalog order, including any per-position overrides (e.g. a
  // different rushing-TD value for QBs).
  const scoringGroups = useMemo(() => groupScoringRules(settings.scoring), [settings.scoring]);

  // Bench is called out separately in the section header ("9 Starters · 5
  // Bench") rather than as its own pill — it's not a "position", so it never
  // fit the colored-chip treatment the other slots get.
  const benchCount =
    settings.rosterComposition.find((r) => r.slot === 'BENCH')?.count ?? 0;

  const lineup = useMemo(() => {
    const counts = new Map<RosterSlot, number>();
    for (const r of settings.rosterComposition) counts.set(r.slot, r.count);
    return ROSTER_SLOTS.filter((slot) => slot !== 'BENCH')
      .map((slot) => ({ slot, count: counts.get(slot) ?? 0 }))
      .filter((r) => r.count > 0);
  }, [settings.rosterComposition]);

  // Per-position min/max, only for positions carrying a real limit — the
  // section hides entirely when a league sets none.
  const positionLimitRows = useMemo(
    () =>
      POSITIONS.map((pos) => ({ pos, ...positionLimitFor(settings.positionLimits, pos) }))
        .filter((l) => l.min > 0 || l.max != null)
        .map((l) => ({
          pos: l.pos,
          text:
            l.min > 0 && l.max != null
              ? `${l.min}–${l.max}`
              : l.min > 0
                ? `min ${l.min}`
                : `max ${l.max}`,
        })),
    [settings.positionLimits],
  );

  useEffect(() => {
    if (!userId) return;
    void supabase
      .from('friendships')
      .select(
        'requester_id, addressee_id, requester:requester_id ( id, username, avatar ), addressee:addressee_id ( id, username, avatar )',
      )
      .eq('status', 'ACCEPTED')
      .then(({ data }) => {
        const list = ((data ?? []) as unknown as FriendshipJoin[])
          .map((f) => (f.requester_id === userId ? f.addressee : f.requester))
          .filter((p): p is ProfileMini => !!p);
        setFriends(list);
      });
  }, [userId]);

  async function saveRuleset() {
    if (!userId) return;
    setSaveState('saving');
    setError(null);
    const { error: err } = await supabase
      .from('league_templates')
      .insert({ user_id: userId, name: shareName, settings });
    if (err) {
      setError(err.message);
      setSaveState('idle');
    } else {
      setSaveState('saved');
    }
  }

  async function copyLink() {
    setLinkState('working');
    setError(null);
    try {
      const { id } = await api<{ id: string }>('/rulesets/share', {
        method: 'POST',
        body: { kind: 'LEAGUE', name: shareName, payload: settings },
      });
      await navigator.clipboard.writeText(`${window.location.origin}/import/ruleset/${id}`);
      setLinkState('copied');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create share link');
      setLinkState('idle');
    }
  }

  async function sendToFriend(friend: ProfileMini) {
    setSendingId(friend.id);
    setError(null);
    try {
      await api('/rulesets/share', {
        method: 'POST',
        body: { kind: 'LEAGUE', name: shareName, payload: settings, toUserId: friend.id },
      });
      setSentIds((prev) => new Set(prev).add(friend.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setSendingId(null);
    }
  }

  async function saveScoringFormat() {
    if (!userId) return;
    setScoreSaveState('saving');
    setScoreError(null);
    const { error: err } = await supabase
      .from('scoring_formats')
      .insert({ user_id: userId, name: shareName, rules: settings.scoring });
    if (err) {
      setScoreError(err.message);
      setScoreSaveState('idle');
    } else {
      setScoreSaveState('saved');
    }
  }

  async function copyScoringLink() {
    setScoreLinkState('working');
    setScoreError(null);
    try {
      const { id } = await api<{ id: string }>('/rulesets/share', {
        method: 'POST',
        body: { kind: 'SCORING', name: shareName, payload: settings.scoring },
      });
      await navigator.clipboard.writeText(`${window.location.origin}/import/ruleset/${id}`);
      setScoreLinkState('copied');
    } catch (err) {
      setScoreError(err instanceof Error ? err.message : 'Failed to create share link');
      setScoreLinkState('idle');
    }
  }

  async function sendScoringToFriend(friend: ProfileMini) {
    setScoreSendingId(friend.id);
    setScoreError(null);
    try {
      await api('/rulesets/share', {
        method: 'POST',
        body: { kind: 'SCORING', name: shareName, payload: settings.scoring, toUserId: friend.id },
      });
      setScoreSentIds((prev) => new Set(prev).add(friend.id));
    } catch (err) {
      setScoreError(err instanceof Error ? err.message : 'Failed to send');
    } finally {
      setScoreSendingId(null);
    }
  }

  // Shared between the league-level and scoring-only friend pickers below —
  // same list, different sent/sending state and send handler.
  function renderFriendPicker(
    sent: Set<string>,
    sending: string | null,
    onSend: (friend: ProfileMini) => void,
  ) {
    if (friends.length === 0) {
      return (
        <p className="muted rules-modal__friends-empty">
          No friends yet — copy the share link instead.
        </p>
      );
    }
    return friends.map((f) => {
      const wasSent = sent.has(f.id);
      return (
        <button
          key={f.id}
          type="button"
          className="rules-modal__friend"
          onClick={() => onSend(f)}
          disabled={wasSent || sending === f.id}
        >
          {f.avatar && <Avatar avatar={f.avatar} size={24} />}
          <span className="rules-modal__friend-name">{f.username}</span>
          {wasSent ? (
            <span className="rules-modal__friend-sent">
              <CheckIcon fontSize="inherit" /> Sent
            </span>
          ) : (
            <span className="muted rules-modal__friend-cta">
              {sending === f.id ? 'Sending…' : 'Send'}
            </span>
          )}
        </button>
      );
    });
  }

  return (
    <Modal title="League rules" onClose={onClose} wide>
      <div className="rules-modal">
        {/* Overview */}
        <section className="rules-modal__section">
          <RulesOverview settings={settings} />
          {settings.allowSkips && (
            <p className="rules-modal__note muted">
              Teams that run out of time are skipped, not auto-picked
              {settings.timeoutAllowance != null
                ? ` (up to ${settings.timeoutAllowance} before auto-pick)`
                : ''}
              .
            </p>
          )}
        </section>

        {/* Starting lineup */}
        <section className="rules-modal__section">
          <h3 className="rules-modal__h3">
            <GroupsIcon fontSize="small" className="rules-modal__h-icon" />
            Starting lineup
            <span className="muted rules-modal__h-sub">
              {startingSpots(settings.rosterComposition)} Starters · {benchCount} Bench
            </span>
          </h3>
          <ul className="rules-modal__lineup">
            {lineup.map(({ slot, count }) => {
              const eligible = SLOT_ELIGIBILITY[slot];
              // Pure-position slots (QB/RB/WR/TE/K/DEF) get that position's
              // color; flexible slots (FLEX/OP) show a dot per eligible
              // position. Bench is excluded from `lineup` entirely (called
              // out in the header instead), so every slot here is one or the
              // other.
              const single = eligible.length === 1 ? eligible[0] : null;
              const showDots = !single;
              return (
                <li
                  key={slot}
                  className={`rules-modal__slot${single ? '' : ' rules-modal__slot--flex'}`}
                  title={SLOT_HINTS[slot]}
                >
                  <span
                    className="rules-modal__slot-badge"
                    style={single ? { background: POSITION_COLORS[single] } : undefined}
                  >
                    {SLOT_LABELS[slot]}
                  </span>
                  {showDots && (
                    <span className="rules-modal__slot-dots">
                      {eligible.map((p) => (
                        <span
                          key={p}
                          className="rules-modal__slot-dot"
                          style={{ background: POSITION_COLORS[p] }}
                        />
                      ))}
                    </span>
                  )}
                  <span className="rules-modal__slot-count">×{count}</span>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Position limits (only when the league sets any) */}
        {positionLimitRows.length > 0 && (
          <section className="rules-modal__section">
            <h3 className="rules-modal__h3">
              <TuneIcon fontSize="small" className="rules-modal__h-icon" />
              Position limits
              <span className="muted rules-modal__h-sub">min–max per team</span>
            </h3>
            <ul className="rules-modal__lineup">
              {positionLimitRows.map(({ pos, text }) => (
                <li key={pos} className="rules-modal__slot">
                  <span
                    className="rules-modal__slot-badge"
                    style={{ background: POSITION_COLORS[pos] }}
                  >
                    {SLOT_LABELS[pos]}
                  </span>
                  <span className="rules-modal__slot-count">{text}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Scoring */}
        <section className="rules-modal__section">
          <h3 className="rules-modal__h3">
            <ScoreboardIcon fontSize="small" className="rules-modal__h-icon" />
            Scoring
            <span className="rules-modal__preset-badge">{scoringLabel}</span>
          </h3>
          <div className="rules-modal__scoring-grid">
            {scoringGroups.map(({ group, items }) => (
              <div className="rules-modal__scoregroup" key={group}>
                <h4>{group}</h4>
                <div className="rules-modal__scoregroup-body">
                  <ul className="rules-modal__scorelist">
                    {items.map((it, i) => (
                      <li key={i}>
                        <span className="rules-modal__scorelabel">{it.label}</span>
                        <span className="rules-modal__scoreval">{it.text}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
          {/* Save/share JUST this scoring format — separate from the whole
              league setup below, since scoring formats are their own
              reusable entity (Settings > Scoring formats). Hidden when this
              is an unmodified preset — saving/sharing a stock PPR/Standard/
              Half-PPR format back to yourself (or a friend, who already has
              the same preset picker) has no value. */}
          {userId && !preset && (
            <div className="rules-modal__section-actions">
              <p className="muted rules-modal__section-actions-caption">
                Save or share just this scoring format
              </p>
              <div className="rules-modal__actions">
                <button
                  type="button"
                  className="button"
                  onClick={saveScoringFormat}
                  disabled={scoreSaveState !== 'idle'}
                >
                  {scoreSaveState === 'saved' ? (
                    <>
                      <CheckIcon fontSize="small" /> Saved
                    </>
                  ) : (
                    <>
                      <SaveIcon fontSize="small" />{' '}
                      {scoreSaveState === 'saving' ? 'Saving…' : 'Save format'}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={copyScoringLink}
                  disabled={scoreLinkState === 'working'}
                >
                  {scoreLinkState === 'copied' ? (
                    <>
                      <CheckIcon fontSize="small" /> Link copied
                    </>
                  ) : (
                    <>
                      <LinkIcon fontSize="small" />{' '}
                      {scoreLinkState === 'working' ? 'Creating…' : 'Copy link'}
                    </>
                  )}
                </button>
                <button
                  type="button"
                  className="button"
                  onClick={() => setScoreFriendPickerOpen((o) => !o)}
                  aria-expanded={scoreFriendPickerOpen}
                >
                  <PersonOutlineIcon fontSize="small" /> Send to a friend
                </button>
              </div>
              {scoreError && <p className="rules-modal__error">{scoreError}</p>}
              {scoreFriendPickerOpen && (
                <div className="rules-modal__friends">
                  {renderFriendPicker(scoreSentIds, scoreSendingId, sendScoringToFriend)}
                </div>
              )}
            </div>
          )}
        </section>

        {/* Clock tiers (only when there's more than the single catch-all) */}
        {settings.pickTiers.length > 1 && (
          <section className="rules-modal__section">
            <h3 className="rules-modal__h3">
              <TimerOutlinedIcon fontSize="small" className="rules-modal__h-icon" />
              Pick clock by round
            </h3>
            <div className="rules-modal__scoregroup">
              <div className="rules-modal__scoregroup-body">
                <ul className="rules-modal__scorelist">
                  {tierRanges.map((range, i) => (
                    <li key={i}>
                      <span className="rules-modal__scorelabel">
                        {range.start === range.end
                          ? `Round ${range.start}`
                          : `Rounds ${range.start} → ${range.end}`}
                      </span>
                      <span className="rules-modal__scoreval" style={{ color: range.color }}>
                        {formatPickClock(range.seconds)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </section>
        )}

        {/* Save/share the WHOLE league setup (team count, lineup, pick clock,
            keepers, plus this scoring) as its own reusable league format —
            separate from the scoring-only action above. */}
        {userId && (
          <section className="rules-modal__section">
            <h3 className="rules-modal__h3">
              <SaveIcon fontSize="small" className="rules-modal__h-icon" />
              Save &amp; share this league
            </h3>
            <p className="muted rules-modal__section-actions-caption">
              Also saves the scoring above — custom or preset — as part of this league.
            </p>
            <div className="rules-modal__actions">
              <button
                type="button"
                className="button"
                onClick={saveRuleset}
                disabled={saveState !== 'idle'}
              >
                {saveState === 'saved' ? (
                  <>
                    <CheckIcon fontSize="small" /> Saved to your leagues
                  </>
                ) : (
                  <>
                    <SaveIcon fontSize="small" />{' '}
                    {saveState === 'saving' ? 'Saving…' : 'Save format'}
                  </>
                )}
              </button>
              <button
                type="button"
                className="button"
                onClick={copyLink}
                disabled={linkState === 'working'}
              >
                {linkState === 'copied' ? (
                  <>
                    <CheckIcon fontSize="small" /> Link copied
                  </>
                ) : (
                  <>
                    <LinkIcon fontSize="small" />{' '}
                    {linkState === 'working' ? 'Creating…' : 'Copy share link'}
                  </>
                )}
              </button>
              <button
                type="button"
                className="button"
                onClick={() => setFriendPickerOpen((o) => !o)}
                aria-expanded={friendPickerOpen}
              >
                <PersonOutlineIcon fontSize="small" /> Send to a friend
              </button>
            </div>
            {error && <p className="rules-modal__error">{error}</p>}
            {friendPickerOpen && (
              <div className="rules-modal__friends">
                {renderFriendPicker(sentIds, sendingId, sendToFriend)}
              </div>
            )}
          </section>
        )}
      </div>
    </Modal>
  );
}

interface FriendshipJoin {
  requester_id: string;
  addressee_id: string;
  requester: ProfileMini | null;
  addressee: ProfileMini | null;
}
