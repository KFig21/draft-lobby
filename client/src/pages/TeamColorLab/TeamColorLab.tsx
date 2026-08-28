import { useMemo, useState } from 'react';
import { NFL_TEAM_COLORS, type TeamColors } from '../../lib/nflTeamColors';
import './TeamColorLab.scss';

// Full names, only for labels + the generated trailing comments.
const TEAM_NAMES: Record<string, string> = {
  ARI: 'Cardinals',
  ATL: 'Falcons',
  BAL: 'Ravens',
  BUF: 'Bills',
  CAR: 'Panthers',
  CHI: 'Bears',
  CIN: 'Bengals',
  CLE: 'Browns',
  DAL: 'Cowboys',
  DEN: 'Broncos',
  DET: 'Lions',
  GB: 'Packers',
  HOU: 'Texans',
  IND: 'Colts',
  JAX: 'Jaguars',
  KC: 'Chiefs',
  LAC: 'Chargers',
  LAR: 'Rams',
  LV: 'Raiders',
  MIA: 'Dolphins',
  MIN: 'Vikings',
  NE: 'Patriots',
  NO: 'Saints',
  NYG: 'Giants',
  NYJ: 'Jets',
  PHI: 'Eagles',
  PIT: 'Steelers',
  SEA: 'Seahawks',
  SF: '49ers',
  TB: 'Buccaneers',
  TEN: 'Titans',
  WAS: 'Commanders',
};

/** ARCHIVED (no route): an editor for the NFL_TEAM_COLORS chip palette. Tweak
 * each team's bg/text live, then copy the generated map back into
 * lib/nflTeamColors.ts. Kept for future tuning — to re-enable, add a lazy import
 * + a `<Route path="/team-colors" element={<TeamColorLab />} />` in App.tsx. */
export function TeamColorLab() {
  const [colors, setColors] = useState<Record<string, TeamColors>>(() =>
    Object.fromEntries(Object.entries(NFL_TEAM_COLORS).map(([k, v]) => [k, { ...v }])),
  );
  const [copied, setCopied] = useState(false);

  const set = (abbr: string, key: keyof TeamColors, value: string) => {
    setColors((prev) => ({ ...prev, [abbr]: { ...prev[abbr], [key]: value } }));
  };

  const output = useMemo(
    () =>
      'export const NFL_TEAM_COLORS: Record<string, TeamColors> = {\n' +
      Object.entries(colors)
        .map(
          ([abbr, c]) =>
            `  ${abbr}: { bg: '${c.bg}', text: '${c.text}' }, // ${TEAM_NAMES[abbr] ?? ''}`,
        )
        .join('\n') +
      '\n};',
    [colors],
  );

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(output);
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* clipboard blocked — the textarea is selectable as a fallback */
    }
  };

  const reset = () =>
    setColors(Object.fromEntries(Object.entries(NFL_TEAM_COLORS).map(([k, v]) => [k, { ...v }])));

  return (
    <div className="tcl">
      <header className="tcl__head">
        <div>
          <h1>NFL team chips</h1>
          <p className="muted">
            Temporary tuner for <code>NFL_TEAM_COLORS</code>. Edit each team's background and text,
            then copy the map into <code>lib/nflTeamColors.ts</code>.
          </p>
        </div>
        <button type="button" className="button" onClick={reset}>
          Reset to saved
        </button>
      </header>

      <div className="tcl__body">
        <div className="tcl__grid">
          {Object.entries(colors).map(([abbr, c]) => (
            <div className="tcl__card" key={abbr}>
              {/* Chip previewed on both grounds, since the modals it lives in can
                  be either theme. */}
              <div className="tcl__previews">
                <span className="tcl__ground tcl__ground--dark">
                  <span className="tcl__chip" style={{ background: c.bg, color: c.text }}>
                    {abbr}
                  </span>
                </span>
                <span className="tcl__ground tcl__ground--light">
                  <span className="tcl__chip" style={{ background: c.bg, color: c.text }}>
                    {abbr}
                  </span>
                </span>
              </div>
              <div className="tcl__name">{TEAM_NAMES[abbr] ?? abbr}</div>
              {(['bg', 'text'] as const).map((key) => (
                <label className="tcl__row" key={key}>
                  <span className="tcl__row-label">{key}</span>
                  <input
                    type="color"
                    className="tcl__swatch"
                    value={c[key]}
                    onChange={(e) => set(abbr, key, e.target.value)}
                  />
                  <input
                    type="text"
                    className="tcl__hex"
                    value={c[key]}
                    spellCheck={false}
                    onChange={(e) => set(abbr, key, e.target.value)}
                  />
                </label>
              ))}
            </div>
          ))}
        </div>

        <aside className="tcl__out">
          <div className="tcl__out-head">
            <span className="tcl__out-title">nflTeamColors.ts</span>
            <button type="button" className="button button--primary button--sm" onClick={copy}>
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
          <textarea className="tcl__code" readOnly value={output} spellCheck={false} />
        </aside>
      </div>
    </div>
  );
}
