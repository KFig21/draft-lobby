import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import ChecklistIcon from '@mui/icons-material/Checklist';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import { useMemo, useState } from 'react';
import { copyText, groupDraftForEspn, type EspnPick } from '../../lib/espnExport';
import type { PickRow, PlayerRow, TeamRow } from '../../lib/types';
import { Modal } from '../Modal/Modal';
import './EspnExportModal.scss';

interface Props {
  teams: TeamRow[];
  picks: PickRow[];
  playersById: Map<string, PlayerRow>;
  /** The viewer's own team — ESPN's first column is usually theirs, so start there. */
  myTeamId?: string | null;
  onClose: () => void;
}

/**
 * Guided "copy-assist" for entering a finished draft into ESPN's *Input Offline
 * Draft Results* page (which has no bulk import). One team (ESPN column) at a
 * time: each pick shows the exact name to paste and a team·position badge so the
 * user clicks the right autocomplete row; the Copy button checks it off and the
 * next pick lights up. See lib/espnExport for the ESPN name normalization.
 */
export function EspnExportModal({ teams, picks, playersById, myTeamId, onClose }: Props) {
  const grouped = useMemo(
    () => groupDraftForEspn(teams, picks, playersById),
    [teams, picks, playersById],
  );

  const [teamIdx, setTeamIdx] = useState(() => {
    const mine = grouped.findIndex((t) => t.id === myTeamId);
    return mine >= 0 ? mine : 0;
  });
  // Overall pick numbers already copied (persists as the user moves between teams).
  const [copied, setCopied] = useState<Set<number>>(new Set());
  // The pick whose Copy button is flashing "Copied" right now (transient).
  const [flash, setFlash] = useState<number | null>(null);
  const [allFlash, setAllFlash] = useState(false);

  const team = grouped[teamIdx];
  if (!team) return null;

  const copiedInTeam = team.picks.filter((p) => copied.has(p.overall)).length;
  const currentOverall = team.picks.find((p) => !copied.has(p.overall))?.overall ?? null;
  const teamDone = team.picks.length > 0 && copiedInTeam === team.picks.length;
  const isLastTeam = teamIdx === grouped.length - 1;

  async function copyPick(p: EspnPick) {
    const ok = await copyText(p.espnName);
    if (!ok) return;
    setCopied((prev) => new Set(prev).add(p.overall));
    setFlash(p.overall);
    window.setTimeout(() => setFlash((f) => (f === p.overall ? null : f)), 1200);
  }

  async function copyAll() {
    const ok = await copyText(team.picks.map((p) => p.espnName).join('\n'));
    if (!ok) return;
    setAllFlash(true);
    window.setTimeout(() => setAllFlash(false), 1400);
  }

  return (
    <Modal
      title="Enter results in ESPN"
      icon={<ChecklistIcon fontSize="small" />}
      wide
      className="espn-export"
      onClose={onClose}
    >
      <p className="espn-export__intro">
        ESPN's <em>Input Offline Draft Results</em> page has no bulk import, so enter one team
        per column. For each pick: <strong>Copy</strong> the name here, paste it into the ESPN
        cell, then click the row that matches the <strong>team &amp; position</strong> shown
        beside it.
      </p>

      <div className="espn-export__teambar">
        <button
          type="button"
          className="espn-export__step"
          disabled={teamIdx === 0}
          onClick={() => setTeamIdx((i) => Math.max(0, i - 1))}
          aria-label="Previous team"
        >
          <ChevronLeftRoundedIcon />
        </button>
        <label className="espn-export__teamsel">
          <span className="espn-export__teamsel-cap">Team {teamIdx + 1} of {grouped.length} · pick the one matching your ESPN column</span>
          <select value={teamIdx} onChange={(e) => setTeamIdx(Number(e.target.value))}>
            {grouped.map((t, i) => (
              <option key={t.id} value={i}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          className="espn-export__step"
          disabled={isLastTeam}
          onClick={() => setTeamIdx((i) => Math.min(grouped.length - 1, i + 1))}
          aria-label="Next team"
        >
          <ChevronRightRoundedIcon />
        </button>
      </div>

      <div className="espn-export__meta">
        <span className={`espn-export__count${teamDone ? ' is-done' : ''}`}>
          {copiedInTeam} / {team.picks.length} copied
        </span>
        <button type="button" className="espn-export__copyall" onClick={copyAll}>
          {allFlash ? (
            <>
              <CheckRoundedIcon fontSize="inherit" /> Copied list
            </>
          ) : (
            <>
              <ContentCopyOutlinedIcon fontSize="inherit" /> Copy all names
            </>
          )}
        </button>
      </div>

      <ol className="espn-export__list">
        {team.picks.map((p) => {
          const isCopied = copied.has(p.overall);
          const isCurrent = p.overall === currentOverall;
          const color = POSITION_COLORS[p.position as Position] ?? 'var(--text-muted)';
          return (
            <li
              key={p.overall}
              className={`espn-export__row${isCopied ? ' is-copied' : ''}${
                isCurrent ? ' is-current' : ''
              }`}
            >
              <span className="espn-export__round">R{p.round}</span>
              <span className="espn-export__name">{p.espnName || '—'}</span>
              {p.nflTeam && (
                <span className="espn-export__badge" style={{ ['--pos' as string]: color }}>
                  {p.nflTeam} · {p.position === 'DEF' ? 'D/ST' : p.position}
                </span>
              )}
              <button
                type="button"
                className="espn-export__copy"
                onClick={() => copyPick(p)}
                disabled={!p.espnName}
              >
                {flash === p.overall ? (
                  <>
                    <CheckRoundedIcon fontSize="inherit" /> Copied
                  </>
                ) : isCopied ? (
                  <>
                    <CheckRoundedIcon fontSize="inherit" /> Again
                  </>
                ) : (
                  <>
                    <ContentCopyOutlinedIcon fontSize="inherit" /> Copy
                  </>
                )}
              </button>
            </li>
          );
        })}
      </ol>

      {teamDone && (
        <div className="espn-export__complete">
          <CheckCircleRoundedIcon fontSize="small" />
          <span>
            All {team.picks.length} picks copied for <strong>{team.name}</strong>.
          </span>
          {isLastTeam ? (
            <span className="espn-export__alldone">That&rsquo;s every team.</span>
          ) : (
            <button
              type="button"
              className="button button--primary espn-export__nextteam"
              onClick={() => setTeamIdx((i) => Math.min(grouped.length - 1, i + 1))}
            >
              Next team
              <ChevronRightRoundedIcon fontSize="small" />
            </button>
          )}
        </div>
      )}
    </Modal>
  );
}
