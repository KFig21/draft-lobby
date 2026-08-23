import { defaultAvatar, type CopyLobbyInclude } from '@draft-lobby/shared';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddAltOutlined';
import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { copyLobby, reinviteToLobby, type CopyLobbyResult } from '../../lib/lobbyCopy';
import { useModalClose } from '../../lib/useModalClose';
import type { LobbyRow } from '../../lib/types';
import { Avatar } from '../Avatar/Avatar';
import './CopyDraftModal.scss';

interface Props {
  /** The draft being copied — only its id, name, and settings are read. */
  source: Pick<LobbyRow, 'id' | 'name' | 'settings'>;
  onClose: () => void;
}

type IncludeKey = keyof CopyLobbyInclude;

interface ToggleDef {
  key: IncludeKey;
  label: string;
  desc: string;
  /** Requires team names + league setup to be on (keeper toggles). */
  gated?: boolean;
}

const CORE_TOGGLES: ToggleDef[] = [
  { key: 'leagueSetup', label: 'League setup', desc: 'Team count, roster spots, snake/straight' },
  { key: 'scoring', label: 'Scoring rules', desc: 'Points settings and projections' },
  { key: 'timers', label: 'Pick timers & skips', desc: 'Per-round clock and skip rules' },
  { key: 'teamNames', label: 'Team names & order', desc: 'Recreate each seat (owners cleared)' },
];

const KEEPER_TOGGLES: ToggleDef[] = [
  { key: 'keeperLists', label: 'Keeper candidate lists', desc: 'Offered pools owners choose from', gated: true },
  { key: 'keeperPicks', label: 'Assigned keepers', desc: 'Already-kept players, pre-locked on the board', gated: true },
];

/**
 * Duplicate an existing draft into a fresh lobby. The commissioner picks which
 * parts carry over (settings sections, team names, keepers); regular picks are
 * never copied. The main use is spinning up a mock to prep for a real league —
 * so it defaults to MOCK mode. After creating, it offers to re-invite the
 * original members (nobody is auto-added).
 */
export function CopyDraftModal({ source, onClose }: Props) {
  const { closing, requestClose } = useModalClose(onClose);
  const navigate = useNavigate();

  const showKeepers = source.settings.keepersEnabled;

  const [name, setName] = useState(`Copy of ${source.name}`.slice(0, 60));
  const [draftMode, setDraftMode] = useState<'LIVE' | 'MOCK'>('MOCK');
  const [include, setInclude] = useState<CopyLobbyInclude>({
    leagueSetup: true,
    scoring: true,
    timers: true,
    teamNames: true,
    keeperLists: showKeepers,
    keeperPicks: showKeepers,
  });
  // Turn every carried-over seat the copier doesn't own into a bot (a
  // ready-to-run solo mock) rather than an empty seat to re-invite.
  const [fillBots, setFillBots] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CopyLobbyResult | null>(null);

  // Re-invite step state.
  const [invited, setInvited] = useState<Set<string>>(new Set());
  const [invitingId, setInvitingId] = useState<string | null>(null);

  // Keepers can only map to copied seats with a matching format.
  const keeperGate = include.teamNames && include.leagueSetup;

  function toggle(key: IncludeKey) {
    setInclude((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  async function submit() {
    if (!name.trim()) {
      setError('Give the copy a name');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await copyLobby(source.id, {
        name: name.trim(),
        draftMode,
        include: {
          leagueSetup: include.leagueSetup,
          scoring: include.scoring,
          timers: include.timers,
          teamNames: include.teamNames,
          keeperLists: keeperGate && include.keeperLists,
          keeperPicks: keeperGate && include.keeperPicks,
        },
        // Only meaningful when seats are recreated (teamNames on).
        fillBots: include.teamNames && fillBots,
      });
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not copy the draft');
    } finally {
      setBusy(false);
    }
  }

  async function invite(userId: string) {
    if (!result) return;
    setInvitingId(userId);
    setError(null);
    try {
      await reinviteToLobby(result.lobby.id, userId);
      setInvited((s) => new Set(s).add(userId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the invite');
    } finally {
      setInvitingId(null);
    }
  }

  function goToDraft() {
    if (!result) return;
    navigate(`/lobby/${result.lobby.id}`);
  }

  function renderToggle(t: ToggleDef) {
    const gatedOff = t.gated && !keeperGate;
    const checked = gatedOff ? false : include[t.key];
    return (
      <label key={t.key} className={`copy-draft__toggle${gatedOff ? ' is-disabled' : ''}`}>
        <input
          type="checkbox"
          checked={checked}
          disabled={gatedOff}
          onChange={() => toggle(t.key)}
        />
        <span className="copy-draft__toggle-text">
          <span className="copy-draft__toggle-label">{t.label}</span>
          <span className="copy-draft__toggle-desc">
            {gatedOff ? 'Needs team names + league setup' : t.desc}
          </span>
        </span>
      </label>
    );
  }

  // Portaled to <body>: the My Drafts page sits inside the app layout, whose
  // content column establishes a containing block, so a plain fixed-position
  // backdrop would only cover that column (not the sidebar). Body-level escapes it.
  return createPortal(
    <div
      className={`copy-draft__backdrop modal-anim-backdrop${closing ? ' is-closing' : ''}`}
      onClick={requestClose}
    >
      <div
        className={`copy-draft modal-anim-card${closing ? ' is-closing' : ''}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Copy draft"
      >
        <button className="copy-draft__close" aria-label="Close" onClick={requestClose}>
          <CloseIcon fontSize="small" />
        </button>

        {result ? (
          // ── Step 2: created + re-invite ──
          <>
            <h2 className="copy-draft__title">
              <CheckCircleIcon fontSize="small" /> Draft created
            </h2>
            <p className="copy-draft__intro">
              <strong>{result.lobby.name}</strong> is ready. Invite anyone from the original draft,
              or jump straight in — empty seats fill with bots in a mock.
            </p>

            {result.members.length > 0 && (
              <>
                <h3 className="copy-draft__subhead">Re-invite members</h3>
                <ul className="copy-draft__members">
                  {result.members.map((m) => {
                    const done = invited.has(m.userId);
                    return (
                      <li key={m.userId} className="copy-draft__member">
                        <Avatar avatar={m.avatar ?? defaultAvatar(m.userId)} size={28} />
                        <span className="copy-draft__member-name">{m.username ?? 'Player'}</span>
                        <button
                          type="button"
                          className="copy-draft__invite-btn"
                          onClick={() => invite(m.userId)}
                          disabled={done || invitingId === m.userId}
                        >
                          {done ? (
                            <>
                              <CheckCircleIcon sx={{ fontSize: 16 }} /> Invited
                            </>
                          ) : (
                            <>
                              <PersonAddOutlinedIcon sx={{ fontSize: 16 }} />{' '}
                              {invitingId === m.userId ? 'Inviting…' : 'Invite'}
                            </>
                          )}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}

            {error && <p className="copy-draft__error">{error}</p>}

            <button className="button button--primary copy-draft__go" onClick={goToDraft}>
              Go to draft
            </button>
          </>
        ) : (
          // ── Step 1: configure the copy ──
          <>
            <h2 className="copy-draft__title">
              <ContentCopyIcon fontSize="small" /> Copy draft
            </h2>
            <p className="copy-draft__intro">
              Duplicate <strong>{source.name}</strong> into a new draft. Pick what carries over —
              the picks themselves never do.
            </p>

            <label className="copy-draft__field">
              <span>Name</span>
              <input
                type="text"
                value={name}
                maxLength={40}
                onChange={(e) => setName(e.target.value)}
              />
            </label>

            <div className="copy-draft__field">
              <span>Draft mode</span>
              <div className="copy-draft__seg" role="group" aria-label="Draft mode">
                <button
                  type="button"
                  className={`copy-draft__seg-btn${draftMode === 'MOCK' ? ' is-active' : ''}`}
                  onClick={() => setDraftMode('MOCK')}
                >
                  Mock
                </button>
                <button
                  type="button"
                  className={`copy-draft__seg-btn${draftMode === 'LIVE' ? ' is-active' : ''}`}
                  onClick={() => setDraftMode('LIVE')}
                >
                  Live
                </button>
              </div>
              <span className="copy-draft__seg-hint">
                {draftMode === 'MOCK'
                  ? 'Practice draft — empty seats fill with bots, kept off friends’ feeds.'
                  : 'A real league draft.'}
              </span>
            </div>

            <h3 className="copy-draft__subhead">Copy over</h3>
            <div className="copy-draft__toggles">
              {CORE_TOGGLES.map(renderToggle)}
              {showKeepers && KEEPER_TOGGLES.map(renderToggle)}
            </div>

            {include.teamNames && (
              <>
                <h3 className="copy-draft__subhead">Seats</h3>
                <div className="copy-draft__toggles">
                  <label className="copy-draft__toggle">
                    <input
                      type="checkbox"
                      checked={fillBots}
                      onChange={() => setFillBots((v) => !v)}
                    />
                    <span className="copy-draft__toggle-text">
                      <span className="copy-draft__toggle-label">
                        Replace the other players with bots
                      </span>
                      <span className="copy-draft__toggle-desc">
                        Turn every seat but yours into a bot now — a solo mock you
                        can start right away. Off keeps them open to re-invite.
                      </span>
                    </span>
                  </label>
                </div>
              </>
            )}

            {error && <p className="copy-draft__error">{error}</p>}

            <button
              className="button button--primary copy-draft__go"
              onClick={submit}
              disabled={busy}
            >
              {busy ? 'Copying…' : 'Copy draft'}
            </button>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
