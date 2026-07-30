import {
  FOOTBALL_CATALOG,
  POSITION_OVERRIDE_SEP,
  ROSTER_SLOTS,
  SCORING_PRESETS,
  SLOT_HINTS,
  SLOT_LABELS,
  formatScoringRule,
  matchPreset,
  roundsForSettings,
  startingSpots,
  type LobbySettings,
  type RosterSlot,
} from '@draft-lobby/shared';
import CheckIcon from '@mui/icons-material/Check';
import LinkIcon from '@mui/icons-material/Link';
import PersonOutlineIcon from '@mui/icons-material/PersonOutlined';
import SaveOutlinedIcon from '@mui/icons-material/SaveOutlined';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { api } from '../../lib/api';
import { clockSummary, formatSeconds } from '../../lib/format';
import type { ProfileMini } from '../../lib/types';
import { supabase } from '../../supabase';
import { Avatar } from '../Avatar/Avatar';
import { Modal } from '../Modal/Modal';
import './LeagueRulesModal.scss';

interface Props {
  settings: LobbySettings;
  /** Seeds the saved/shared name — usually the lobby or league name. */
  defaultName?: string;
  onClose: () => void;
}

/** Read-only breakdown of a league's full rules (overview, lineup, scoring),
 * with actions to save the setup as your own reusable league template and to
 * share it — via an import link or straight to a friend. */
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

  const preset = matchPreset(settings.scoring);
  const scoringLabel = preset ? SCORING_PRESETS[preset].label : 'Custom';

  // Scoring rules grouped the way the catalog groups them (Passing, Rushing,
  // …), in catalog order, including any per-position overrides (e.g. a
  // different rushing-TD value for QBs).
  const scoringGroups = useMemo(() => {
    const rules = settings.scoring;
    const order: string[] = [];
    const byGroup = new Map<string, { label: string; text: string }[]>();
    const push = (group: string, label: string, text: string) => {
      if (!byGroup.has(group)) {
        byGroup.set(group, []);
        order.push(group);
      }
      byGroup.get(group)!.push({ label, text });
    };
    for (const cat of FOOTBALL_CATALOG) {
      const base = rules[cat.key];
      if (base !== undefined) push(cat.group, cat.label, formatScoringRule(cat.key, base));
      for (const pos of cat.overridePositions ?? []) {
        const key = `${cat.key}${POSITION_OVERRIDE_SEP}${pos}`;
        const val = rules[key];
        if (val !== undefined) push(cat.group, `${cat.label} (${pos})`, formatScoringRule(key, val));
      }
    }
    return order.map((group) => ({ group, items: byGroup.get(group)! }));
  }, [settings.scoring]);

  const lineup = useMemo(() => {
    const counts = new Map<RosterSlot, number>();
    for (const r of settings.rosterComposition) counts.set(r.slot, r.count);
    return ROSTER_SLOTS.map((slot) => ({ slot, count: counts.get(slot) ?? 0 })).filter(
      (r) => r.count > 0,
    );
  }, [settings.rosterComposition]);

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

  return (
    <Modal title="League rules" onClose={onClose}>
      <div className="rules-modal">
        {/* Overview */}
        <section className="rules-modal__section">
          <h3>Overview</h3>
          <dl className="rules-modal__grid">
            <div>
              <dt>Teams</dt>
              <dd>{settings.teamCount}</dd>
            </div>
            <div>
              <dt>Draft type</dt>
              <dd>{settings.draftType === 'SNAKE' ? 'Snake' : 'Straight'}</dd>
            </div>
            <div>
              <dt>Rounds</dt>
              <dd>{roundsForSettings(settings)}</dd>
            </div>
            <div>
              <dt>Pick clock</dt>
              <dd>{clockSummary(settings.pickTiers)}</dd>
            </div>
            <div>
              <dt>Scoring</dt>
              <dd>{scoringLabel}</dd>
            </div>
            <div>
              <dt>Keepers</dt>
              <dd>{settings.keepersEnabled ? 'On' : 'Off'}</dd>
            </div>
          </dl>
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
          <h3>
            Starting lineup
            <span className="muted rules-modal__h-sub">
              {startingSpots(settings.rosterComposition)} starters
            </span>
          </h3>
          <ul className="rules-modal__lineup">
            {lineup.map(({ slot, count }) => (
              <li key={slot}>
                <span className="rules-modal__lineup-count">{count}×</span>
                <span className="rules-modal__lineup-label">
                  {SLOT_LABELS[slot]}
                  {SLOT_HINTS[slot] && (
                    <span className="muted rules-modal__lineup-hint"> {SLOT_HINTS[slot]}</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </section>

        {/* Scoring */}
        <section className="rules-modal__section">
          <h3>
            Scoring
            <span className="muted rules-modal__h-sub">{scoringLabel}</span>
          </h3>
          {scoringGroups.map(({ group, items }) => (
            <div className="rules-modal__scoregroup" key={group}>
              <h4>{group}</h4>
              <ul className="rules-modal__scorelist">
                {items.map((it, i) => (
                  <li key={i}>
                    <span>{it.label}</span>
                    <span className="rules-modal__scoreval">{it.text}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>

        {/* Clock tiers (only when there's more than the single catch-all) */}
        {settings.pickTiers.length > 1 && (
          <section className="rules-modal__section">
            <h3>Pick clock by round</h3>
            <ul className="rules-modal__scorelist">
              {settings.pickTiers.map((tier, i) => (
                <li key={i}>
                  <span>
                    {tier.untilRound === null
                      ? 'Remaining rounds'
                      : `Through round ${tier.untilRound}`}
                  </span>
                  <span className="rules-modal__scoreval">{formatSeconds(tier.seconds)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {error && <p className="rules-modal__error">{error}</p>}

        {/* Actions */}
        {userId && (
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
                  <SaveOutlinedIcon fontSize="small" />{' '}
                  {saveState === 'saving' ? 'Saving…' : 'Save ruleset'}
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
        )}

        {friendPickerOpen && (
          <div className="rules-modal__friends">
            {friends.length === 0 ? (
              <p className="muted rules-modal__friends-empty">
                No friends yet — copy the share link instead.
              </p>
            ) : (
              friends.map((f) => {
                const sent = sentIds.has(f.id);
                return (
                  <button
                    key={f.id}
                    type="button"
                    className="rules-modal__friend"
                    onClick={() => sendToFriend(f)}
                    disabled={sent || sendingId === f.id}
                  >
                    {f.avatar && <Avatar avatar={f.avatar} size={24} />}
                    <span className="rules-modal__friend-name">{f.username}</span>
                    {sent ? (
                      <span className="rules-modal__friend-sent">
                        <CheckIcon fontSize="inherit" /> Sent
                      </span>
                    ) : (
                      <span className="muted rules-modal__friend-cta">
                        {sendingId === f.id ? 'Sending…' : 'Send'}
                      </span>
                    )}
                  </button>
                );
              })
            )}
          </div>
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
