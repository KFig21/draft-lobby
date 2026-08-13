import { POSITION_COLORS, type Position } from '@draft-lobby/shared';
import ChecklistIcon from '@mui/icons-material/Checklist';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ChevronLeftRoundedIcon from '@mui/icons-material/ChevronLeftRounded';
import ChevronRightRoundedIcon from '@mui/icons-material/ChevronRightRounded';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import BookmarkBorderIcon from '@mui/icons-material/BookmarkBorder';
import TerminalIcon from '@mui/icons-material/Terminal';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildEspnAutofillData,
  copyText,
  groupDraftForEspn,
  type EspnPick,
} from '../../lib/espnExport';
import { buildEspnAutofillScript, buildEspnBookmarklet } from '../../lib/espnAutofillScript';
import type { PickRow, PlayerRow, TeamRow } from '../../lib/types';
import { Modal } from '../Modal/Modal';
import './EspnExportModal.scss';

interface Props {
  teams: TeamRow[];
  picks: PickRow[];
  playersById: Map<string, PlayerRow>;
  /** The viewer's own team — ESPN's first column is usually theirs, so start there. */
  myTeamId?: string | null;
  /** Return to the export menu. */
  onBack?: () => void;
  onClose: () => void;
}

/**
 * Guided "copy-assist" for entering a finished draft into ESPN's *Input Offline
 * Draft Results* page (which has no bulk import). One team (ESPN column) at a
 * time: each pick shows the exact name to paste and a team·position badge so the
 * user clicks the right autocomplete row; the Copy button checks it off and the
 * next pick lights up. See lib/espnExport for the ESPN name normalization.
 */
export function EspnExportModal({ teams, picks, playersById, myTeamId, onBack, onClose }: Props) {
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

  // 'copy' = the guided per-pick checklist; 'auto' = the page-script autofill.
  const [mode, setMode] = useState<'copy' | 'auto'>('copy');
  const autofillData = useMemo(
    () => buildEspnAutofillData(teams, picks, playersById),
    [teams, picks, playersById],
  );
  const [scriptFlash, setScriptFlash] = useState(false);
  const [bmFlash, setBmFlash] = useState(false);

  // The bookmarklet href is a ~10KB `javascript:` URL. React warns on (and may
  // sanitize) `javascript:` hrefs, and pasting one into the address bar is
  // stripped to a search by Chrome — so the reliable install is DRAGGING an
  // anchor to the bookmarks bar. Set the href straight on the DOM node (bypassing
  // React's href handling) and never pass it as a prop, so React can't clobber it.
  const bookmarkletHref = useMemo(() => buildEspnBookmarklet(autofillData), [autofillData]);
  const dragRef = useRef<HTMLAnchorElement>(null);
  // `mode` is a dep: the anchor only exists on the auto tab, so the href must be
  // (re)applied when that tab mounts, not just on first render (when it's absent).
  useEffect(() => {
    if (dragRef.current) dragRef.current.setAttribute('href', bookmarkletHref);
  }, [bookmarkletHref, mode]);

  async function copyScript() {
    if (await copyText(buildEspnAutofillScript(autofillData))) {
      setScriptFlash(true);
      window.setTimeout(() => setScriptFlash(false), 1600);
    }
  }
  async function copyBookmarklet() {
    if (await copyText(buildEspnBookmarklet(autofillData))) {
      setBmFlash(true);
      window.setTimeout(() => setBmFlash(false), 1600);
    }
  }

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
      onBack={onBack}
      onClose={onClose}
    >
      <div className="espn-export__tabs" role="tablist">
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'copy'}
          className={`espn-export__tab${mode === 'copy' ? ' is-active' : ''}`}
          onClick={() => setMode('copy')}
        >
          Guided copy
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'auto'}
          className={`espn-export__tab${mode === 'auto' ? ' is-active' : ''}`}
          onClick={() => setMode('auto')}
        >
          Auto-fill <span className="espn-export__beta-pill">beta</span>
        </button>
      </div>

      {mode === 'copy' ? (
      <>
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
      </>
      ) : (
        <div className="espn-export__auto">
          <p className="espn-export__intro">
            This runs a small script on ESPN's page that <strong>types and selects each pick for
            you</strong> — choose a team, click its Round 1 cell, then <strong>Auto-run team</strong>.
            Your draft data never leaves your browser.
          </p>

          <ol className="espn-export__steps">
            <li>
              <div className="espn-export__step-head">
                <TerminalIcon fontSize="small" />
                <strong>Recommended — paste into the console</strong>
              </div>
              <p>
                On ESPN's <em>Input Offline Draft Results</em> page, open the browser console
                (<kbd>F12</kbd> → Console, or <kbd>⌥⌘I</kbd>), paste, and press Enter. The first
                time, Chrome may ask you to type <code>allow pasting</code>.
              </p>
              <button type="button" className="espn-export__scriptbtn" onClick={copyScript}>
                {scriptFlash ? (
                  <>
                    <CheckRoundedIcon fontSize="inherit" /> Copied script
                  </>
                ) : (
                  <>
                    <ContentCopyOutlinedIcon fontSize="inherit" /> Copy console script
                  </>
                )}
              </button>
            </li>
            <li>
              <div className="espn-export__step-head">
                <BookmarkBorderIcon fontSize="small" />
                <strong>Or a bookmarklet</strong>
              </div>
              <p>
                <strong>Drag</strong> this up to your <em>bookmarks bar</em>, then click it while
                you&rsquo;re on ESPN&rsquo;s page. Don&rsquo;t paste it into the address bar — Chrome
                treats it as a search, not a script.
              </p>
              <div className="espn-export__bm-row">
                <a
                  ref={dragRef}
                  className="espn-export__bm-drag"
                  draggable
                  onClick={(e) => e.preventDefault()}
                >
                  <BookmarkBorderIcon fontSize="inherit" /> Draft Lobby → ESPN
                </a>
                <button
                  type="button"
                  className="espn-export__scriptbtn"
                  onClick={copyBookmarklet}
                  title="Copy the javascript: URL to paste into a new bookmark manually"
                >
                  {bmFlash ? (
                    <>
                      <CheckRoundedIcon fontSize="inherit" /> Copied
                    </>
                  ) : (
                    <>
                      <ContentCopyOutlinedIcon fontSize="inherit" /> Copy instead
                    </>
                  )}
                </button>
              </div>
            </li>
          </ol>

          <div className="espn-export__auto-note">
            A panel appears bottom-right: choose a team, click that team&rsquo;s <strong>Round 1</strong>{' '}
            cell in ESPN, then hit <strong>Auto-run team</strong>. It fills <em>and</em> selects the
            whole column; any pick it can&rsquo;t confidently match is listed so you can finish those
            few by hand (their names are already typed in).
          </div>
          <p className="espn-export__beta">
            Beta — built without access to ESPN&rsquo;s live page, so if it misbehaves the{' '}
            <button type="button" className="espn-export__linklike" onClick={() => setMode('copy')}>
              Guided copy
            </button>{' '}
            tab always works.
          </p>
        </div>
      )}
    </Modal>
  );
}
