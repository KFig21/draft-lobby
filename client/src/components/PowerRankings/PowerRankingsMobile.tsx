import {
  DRAFT_GRADES,
  DRAFT_GRADE_COLORS,
  POSITIONS,
  POSITION_COLORS,
  SLOT_LABELS,
  containsSlur,
  draftablePositions,
  type DraftGrade,
  type LobbySettings,
  type Position,
} from '@draft-lobby/shared';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import EditNoteIcon from '@mui/icons-material/EditNote';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import InfoOutlineIcon from '@mui/icons-material/InfoOutlined';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import ThumbDownAltIcon from '@mui/icons-material/ThumbDownAlt';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { buildLeagueGrade } from '../../lib/draftGradeExport';
import { buildLineup, computePowerRankings } from '../../lib/powerRankings';
import { avatarForTeam } from '../../lib/teamAvatar';
import type {
  DraftCrownVoteRow,
  DraftGradeReactionRow,
  DraftGradeRow,
  MemberRow,
  PickRow,
  PlayerRow,
  TeamRow,
} from '../../lib/types';
import { Avatar } from '../Avatar/Avatar';
import { GradeBadge } from '../GradeBadge/GradeBadge';
import { Modal } from '../Modal/Modal';
import { LeagueSummaryPane } from './LeagueSummaryPane';
import { ProjPoints, ordinal, posLabel, rankGradeColor, timeAgo } from './prHelpers';
import './PowerRankingsMobile.scss';

interface Props {
  lobbyName: string;
  season: number;
  teams: TeamRow[];
  members: MemberRow[];
  picks: PickRow[];
  playersById: Map<string, PlayerRow>;
  settings: LobbySettings;
  myTeamId: string | null;
  myUserId: string | undefined;
  crownVotes: DraftCrownVoteRow[];
  grades: DraftGradeRow[];
  gradeReactions: DraftGradeReactionRow[];
  locked: boolean;
  canVote: boolean;
  canGrade: boolean;
  onVote: (teamId: string) => void;
  onGrade: (teamId: string, grade: DraftGrade, comment: string) => void;
  onReact: (teamId: string, raterId: string, value: 1 | -1 | 0) => void;
  onPickClick?: (pick: PickRow) => void;
}

/**
 * The mobile Power Rankings — the phone counterpart to the fullscreen
 * {@link PowerRankingsBoard}, folding the same feature set into a single-column
 * flow: a segmented `League ↔ Standings` control, then a pushed per-team screen
 * with `Breakdown · Roster · Grades` sub-tabs. The League tab reuses the shared
 * {@link LeagueSummaryPane}; the team screen carries the metrics, position
 * analysis, roster, and the peer-grade feed + composer.
 */
export function PowerRankingsMobile({
  lobbyName,
  season,
  teams,
  members,
  picks,
  playersById,
  settings,
  myTeamId,
  myUserId,
  crownVotes,
  grades,
  gradeReactions,
  locked,
  canVote,
  canGrade,
  onVote,
  onGrade,
  onReact,
  onPickClick,
}: Props) {
  const [view, setView] = useState<'league' | 'standings'>('standings');
  const [openTeamId, setOpenTeamId] = useState<string | null>(null);
  // Drives the slide-in class independently of `openTeamId` so the screen can
  // mount off-screen, then animate in (and stay mounted through the slide-out).
  const [screenOpen, setScreenOpen] = useState(false);
  const [teamTab, setTeamTab] = useState<'breakdown' | 'roster' | 'grades'>('breakdown');
  const [showHelp, setShowHelp] = useState(false);
  const [showPeerHelp, setShowPeerHelp] = useState(false);

  const rankings = useMemo(
    () => computePowerRankings(teams, picks, playersById, settings),
    [teams, picks, playersById, settings],
  );
  const avgPts = rankings.length
    ? rankings.reduce((s, r) => s + r.starterPoints, 0) / rankings.length
    : 0;

  const leagueGrade = useMemo(
    () =>
      buildLeagueGrade({
        lobbyName,
        season,
        teams,
        members,
        picks,
        playersById,
        settings,
        crownVotes,
        grades,
      }),
    [lobbyName, season, teams, members, picks, playersById, settings, crownVotes, grades],
  );

  const usernameById = useMemo(() => {
    const m = new Map<string, string>();
    for (const mem of members) m.set(mem.user_id, mem.profiles?.username ?? 'Player');
    return m;
  }, [members]);

  const voteCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const v of crownVotes) m.set(v.team_id, (m.get(v.team_id) ?? 0) + 1);
    return m;
  }, [crownVotes]);
  const myVoteTeamId = crownVotes.find((v) => v.voter_id === myUserId)?.team_id ?? null;

  const posByTeam = useMemo(() => {
    const m = new Map<string, Record<Position, number>>();
    for (const t of teams) m.set(t.id, { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 });
    for (const p of picks) {
      const pos = playersById.get(p.player_id)?.position as Position | undefined;
      const rec = m.get(p.team_id);
      if (pos && rec) rec[pos] += 1;
    }
    return m;
  }, [teams, picks, playersById]);
  const draftablePos = useMemo(
    () => POSITIONS.filter((p) => draftablePositions(settings.rosterComposition).has(p)),
    [settings.rosterComposition],
  );

  const reactionIndex = useMemo(() => {
    const m = new Map<string, { up: number; down: number; mine: number }>();
    for (const r of gradeReactions) {
      const key = `${r.team_id}:${r.grade_rater_id}`;
      const cur = m.get(key) ?? { up: 0, down: 0, mine: 0 };
      if (r.value === 1) cur.up += 1;
      else if (r.value === -1) cur.down += 1;
      if (r.reactor_id === myUserId) cur.mine = r.value;
      m.set(key, cur);
    }
    return m;
  }, [gradeReactions, myUserId]);

  // Composer, reseeded whenever the open team changes (a realtime refresh must
  // not clobber what the user is typing).
  const myGrade =
    grades.find((g) => g.team_id === openTeamId && g.rater_id === myUserId) ?? null;
  const [pendingGrade, setPendingGrade] = useState<DraftGrade>('B');
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  useEffect(() => {
    setPendingGrade(myGrade?.grade ?? 'B');
    setComment(myGrade?.comment ?? '');
    setCommentError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openTeamId]);

  const openTeam = (id: string) => {
    setTeamTab('breakdown');
    setOpenTeamId(id);
    // Mount at the off-screen position, then flip on the next frame so the CSS
    // slide-in transition actually runs.
    requestAnimationFrame(() => setScreenOpen(true));
  };
  const closeTeam = () => {
    setScreenOpen(false);
    // Keep the outgoing screen mounted through the slide-out, then unmount.
    window.setTimeout(() => setOpenTeamId(null), 300);
  };
  // Stepping between teams keeps the screen open and the active sub-tab.
  const stepTeam = (dir: 1 | -1) => {
    const cur = rankings.find((r) => r.team.id === openTeamId);
    if (!cur) return;
    const next = rankings.find((r) => r.rank === cur.rank + dir);
    if (next) setOpenTeamId(next.team.id);
  };

  const selected = rankings.find((r) => r.team.id === openTeamId) ?? null;

  const submitGrade = () => {
    if (!openTeamId) return;
    const body = comment.trim();
    if (containsSlur(body)) {
      setCommentError('That comment contains language that isn’t allowed here');
      return;
    }
    setCommentError(null);
    onGrade(openTeamId, pendingGrade, body || 'No notes');
  };

  if (rankings.length === 0) {
    return <div className="prm prm--empty">No teams to rank yet.</div>;
  }

  // ── Standings row ──────────────────────────────────────────────────
  const standings = (
    <div className="prm__list">
      {rankings.map((r) => {
        const t = r.team;
        const owner = t.owner_id ? usernameById.get(t.owner_id) : null;
        const crowns = voteCounts.get(t.id) ?? 0;
        return (
          <button
            key={t.id}
            type="button"
            className={`prm-rank${t.id === myTeamId ? ' is-mine' : ''}`}
            onClick={() => openTeam(t.id)}
          >
            <span className={`prm-rank__medal${r.rank <= 3 ? ` m${r.rank}` : ''}`}>{r.rank}</span>
            <Avatar avatar={avatarForTeam(t, members)} size={38} />
            <span className="prm-rank__mid">
              <span className="prm-rank__line">
                <span className="prm-rank__name">{t.name}</span>
                {owner && <span className="prm-rank__owner">@{owner}</span>}
                {crowns > 0 && (
                  <span className="prm-rank__crown">
                    <EmojiEventsIcon fontSize="inherit" /> {crowns}
                  </span>
                )}
              </span>
              <span className="prm-rank__meta">
                <span className="prm-rank__bar">
                  <i style={{ width: `${10 + 85 * r.strength}%`, background: DRAFT_GRADE_COLORS[r.grade] }} />
                </span>
                <span className="prm-rank__pts">
                  <b>{r.starterPoints.toFixed(1)}</b> proj
                </span>
              </span>
            </span>
            <GradeBadge grade={r.grade} size={30} />
            <ChevronRightIcon className="prm-rank__chev" fontSize="inherit" />
          </button>
        );
      })}
    </div>
  );

  return (
    <>
      <div className="prm">
        <div className="prm__top">
          <div className="prm__title">
            <TrendingUpIcon className="prm__title-icon" fontSize="inherit" />
            <h2>Power Rankings</h2>
            <button
              type="button"
              className="prm__help"
              onClick={() => setShowHelp(true)}
              aria-label="How grades work"
            >
              <InfoOutlineIcon fontSize="inherit" />
            </button>
          </div>
        </div>

        <div className="prm__seg" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={view === 'league'}
            className={view === 'league' ? 'is-on' : ''}
            onClick={() => setView('league')}
          >
            <EmojiEventsIcon fontSize="inherit" /> League
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === 'standings'}
            className={view === 'standings' ? 'is-on' : ''}
            onClick={() => setView('standings')}
          >
            <TrendingUpIcon fontSize="inherit" /> Standings
          </button>
        </div>

        <div className="prm__scroll">
          {view === 'league' ? (
            <div className="prm__pad">
              <LeagueSummaryPane model={leagueGrade} compact />
            </div>
          ) : (
            standings
          )}
        </div>

        {/* Pushed per-team screen ─────────────────────────────────── */}
        <div className={`prm-team-screen${screenOpen ? ' is-open' : ''}`}>
          {openTeamId && selected && (
            <TeamScreen
              selected={selected}
              members={members}
              picks={picks}
              playersById={playersById}
              settings={settings}
              leagueGrade={leagueGrade}
              teamCount={teams.length}
              rankCount={rankings.length}
              avgPts={avgPts}
              posCounts={posByTeam.get(selected.team.id) ?? { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 }}
              draftablePos={draftablePos}
              usernameById={usernameById}
              crowns={voteCounts.get(selected.team.id) ?? 0}
              feed={grades
                .filter((g) => g.team_id === selected.team.id)
                .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))}
              reactionIndex={reactionIndex}
              myUserId={myUserId}
              myTeamId={myTeamId}
              myVoteTeamId={myVoteTeamId}
              myGrade={myGrade}
              locked={locked}
              canVote={canVote}
              canGrade={canGrade}
              teamTab={teamTab}
              setTeamTab={setTeamTab}
              pendingGrade={pendingGrade}
              setPendingGrade={setPendingGrade}
              comment={comment}
              setComment={setComment}
              commentError={commentError}
              setCommentError={setCommentError}
              onSubmitGrade={submitGrade}
              onVote={onVote}
              onReact={onReact}
              onPickClick={onPickClick}
              onPeerHelp={() => setShowPeerHelp(true)}
              onBack={closeTeam}
              onStep={stepTeam}
            />
          )}
        </div>
      </div>

      {showHelp && (
        <Modal
          title="How grades are calculated"
          icon={<TrendingUpIcon fontSize="inherit" />}
          onClose={() => setShowHelp(false)}
        >
          <div className="prb-help">
            <p>
              Every team is ranked by the projected points of its <b>optimal starting lineup</b> —
              the best players it drafted, slotted into the league’s starting positions (flex and
              superflex included), bench excluded.
            </p>
            <p>
              Those totals are put on a sliding scale: the highest earns <b>A+</b>, the lowest{' '}
              <b>F</b>, and everyone else lands in between based on how their total compares.
            </p>
            <p>
              The <b>peer grades</b> and <b>crown votes</b> are separate — the league’s own opinion,
              shown alongside the projected grade, and they can (and often will) disagree with it.
            </p>
          </div>
        </Modal>
      )}
      {showPeerHelp && (
        <Modal
          title="Peer grades & crowns"
          icon={<EditNoteIcon fontSize="inherit" />}
          onClose={() => setShowPeerHelp(false)}
        >
          <div className="prb-help">
            <p>
              This is the league’s own take on the selected roster. Anyone in the league can leave a{' '}
              <b>letter grade</b> with a short note, and every grade shows up in this feed.
            </p>
            <p>
              React to a grade with a <b>thumbs up or down</b> — the net score floats the takes the
              league agrees with to the top of mind. You can’t react to your own grade.
            </p>
            <p>
              Each player also gets one <b>crown vote</b> for the roster they think won the draft.
              These are all separate from the projected <b>App grade</b> — the human opinion next to
              the math.
            </p>
            <p>
              Grading, reacting, and crowning <b>lock 24 hours</b> after the draft ends.
            </p>
          </div>
        </Modal>
      )}
    </>
  );
}

// ── Per-team screen ──────────────────────────────────────────────────
type Ranking = ReturnType<typeof computePowerRankings>[number];

function TeamScreen({
  selected,
  members,
  picks,
  playersById,
  settings,
  leagueGrade,
  teamCount,
  rankCount,
  avgPts,
  posCounts,
  draftablePos,
  usernameById,
  crowns,
  feed,
  reactionIndex,
  myUserId,
  myTeamId,
  myVoteTeamId,
  myGrade,
  locked,
  canVote,
  canGrade,
  teamTab,
  setTeamTab,
  pendingGrade,
  setPendingGrade,
  comment,
  setComment,
  commentError,
  setCommentError,
  onSubmitGrade,
  onVote,
  onReact,
  onPickClick,
  onPeerHelp,
  onBack,
  onStep,
}: {
  selected: Ranking;
  members: MemberRow[];
  picks: PickRow[];
  playersById: Map<string, PlayerRow>;
  settings: LobbySettings;
  leagueGrade: ReturnType<typeof buildLeagueGrade>;
  teamCount: number;
  rankCount: number;
  avgPts: number;
  posCounts: Record<Position, number>;
  draftablePos: Position[];
  usernameById: Map<string, string>;
  crowns: number;
  feed: DraftGradeRow[];
  reactionIndex: Map<string, { up: number; down: number; mine: number }>;
  myUserId: string | undefined;
  myTeamId: string | null;
  myVoteTeamId: string | null;
  myGrade: DraftGradeRow | null;
  locked: boolean;
  canVote: boolean;
  canGrade: boolean;
  teamTab: 'breakdown' | 'roster' | 'grades';
  setTeamTab: (t: 'breakdown' | 'roster' | 'grades') => void;
  pendingGrade: DraftGrade;
  setPendingGrade: (g: DraftGrade) => void;
  comment: string;
  setComment: (c: string) => void;
  commentError: string | null;
  setCommentError: (e: string | null) => void;
  onSubmitGrade: () => void;
  onVote: (teamId: string) => void;
  onReact: (teamId: string, raterId: string, value: 1 | -1 | 0) => void;
  onPickClick?: (pick: PickRow) => void;
  onPeerHelp: () => void;
  onBack: () => void;
  onStep: (dir: 1 | -1) => void;
}) {
  const teamId = selected.team.id;
  const lineup = buildLineup(teamId, picks, playersById, settings, { fillPlaceholders: true });
  const delta = selected.starterPoints - avgPts;
  const isSelf = teamId === myTeamId;

  // Bye-week exposure across the whole roster.
  const rosterRows = [...lineup.starters, ...lineup.bench];
  // Actual picks only — placeholders aren't the team's players.
  const byeMap = new Map<number, PlayerRow[]>();
  for (const row of rosterRows) {
    if (!row.player || row.placeholder || row.player.bye_week == null) continue;
    const list = byeMap.get(row.player.bye_week);
    if (list) list.push(row.player);
    else byeMap.set(row.player.bye_week, [row.player]);
  }
  const byes = [...byeMap.entries()].sort(([a], [b]) => a - b);

  const lineupRow = (row: (typeof rosterRows)[number], i: number) => {
    const p = row.player;
    const inner = (
      <>
        <span className="prm-slot__lab">{SLOT_LABELS[row.slot]}</span>
        {p ? (
          <>
            <span className="prm-slot__player">
              <span
                className="prm-slot__pos"
                style={{ background: POSITION_COLORS[p.position as Position] }}
              >
                {posLabel(p.position as Position)}
              </span>
              <span className="prm-slot__nm">
                <span className="prm-slot__name">
                  {p.name}
                  {row.pick?.is_keeper && <span className="prm-slot__keeper">K</span>}
                  {row.placeholder && (
                    <span className="prm-slot__ph" title="Best available — this slot wasn’t drafted">
                      FA
                    </span>
                  )}
                </span>
                <span className="prm-slot__team">
                  {row.placeholder
                    ? 'Best available'
                    : p.position === 'DEF'
                      ? `${p.nfl_team} D/ST`
                      : p.nfl_team}
                </span>
              </span>
            </span>
            <span className="prm-slot__pp">
              <ProjPoints value={p.proj_points ?? 0} />
              <small> pts</small>
            </span>
          </>
        ) : (
          <>
            <span className="prm-slot__player prm-slot__player--empty">Empty</span>
            <span className="prm-slot__pp">—</span>
          </>
        )}
      </>
    );
    return row.pick && onPickClick ? (
      <li key={i}>
        <button type="button" className="prm-slot prm-slot--link" onClick={() => onPickClick(row.pick!)}>
          {inner}
        </button>
      </li>
    ) : (
      <li key={i} className={`prm-slot${row.placeholder ? ' prm-slot--ph' : ''}`}>
        {inner}
      </li>
    );
  };

  return (
    <>
      <div className="prm-team__top">
        <button type="button" className="prm-team__back" onClick={onBack}>
          <ArrowBackIcon fontSize="inherit" /> Back
        </button>
        <span className="prm-team__pos">
          {ordinal(selected.rank)} of {rankCount}
        </span>
        <span className="prm-team__switch">
          <button
            type="button"
            aria-label="Higher-ranked team"
            disabled={selected.rank <= 1}
            onClick={() => onStep(-1)}
          >
            <KeyboardArrowUpIcon fontSize="inherit" />
          </button>
          <button
            type="button"
            aria-label="Lower-ranked team"
            disabled={selected.rank >= rankCount}
            onClick={() => onStep(1)}
          >
            <KeyboardArrowDownIcon fontSize="inherit" />
          </button>
        </span>
      </div>

      <div className="prm-team__body">
        <div className="prm-head">
          <Avatar avatar={avatarForTeam(selected.team, members)} size={50} />
          <div className="prm-head__id">
            <div className="prm-head__name">{selected.team.name}</div>
            {selected.team.owner_id && (
              <div className="prm-head__owner">@{usernameById.get(selected.team.owner_id)}</div>
            )}
          </div>
        </div>

        <div className="prm-metrics">
          <div className="prm-metric">
            <span className="prm-metric__lab">LEAGUE RANK</span>
            <span
              className="prm-metric__val prm-metric__val--grade"
              style={{ ['--grade']: DRAFT_GRADE_COLORS[selected.grade] } as CSSProperties}
            >
              #{selected.rank} <small>of {rankCount}</small>
            </span>
          </div>
          <div className="prm-metric">
            <span className="prm-metric__lab">PROJ POINTS</span>
            <span className="prm-metric__stack">
              <span className="prm-metric__val">
                <ProjPoints value={selected.starterPoints} />
              </span>
              <span className={`prm-metric__delta ${delta >= 0 ? 'pos' : 'neg'}`}>
                {delta >= 0 ? '+' : '−'}
                {Math.abs(delta).toFixed(1)}
                <small>vs avg</small>
              </span>
            </span>
          </div>
          <div className="prm-metric">
            <span className="prm-metric__lab">APP GRADE</span>
            <span className="prm-metric__val">
              <GradeBadge grade={selected.grade} size={30} />
            </span>
          </div>
          <div className="prm-metric">
            <span className="prm-metric__lab">CROWN VOTES</span>
            <span className="prm-metric__val prm-metric__val--crown">
              <EmojiEventsIcon fontSize="inherit" />
              {crowns}
            </span>
          </div>
        </div>

        <div className="prm-subtabs">
          {(['breakdown', 'roster', 'grades'] as const).map((t) => (
            <button
              key={t}
              type="button"
              className={teamTab === t ? 'is-on' : ''}
              onClick={() => setTeamTab(t)}
            >
              {t === 'breakdown' ? 'Breakdown' : t === 'roster' ? 'Roster' : 'Grades'}
            </button>
          ))}
        </div>

        {teamTab === 'breakdown' && (
          <div className="prm-pane">
            <section className="prm-sec">
              <h4 className="prm-sec__title prm-sec__title--pos">Position breakdown</h4>
              <div className="prm-posbreak">
                {draftablePos.map((pos) => (
                  <span
                    key={pos}
                    className="prm-poschip"
                    style={{ ['--pos']: POSITION_COLORS[pos] } as CSSProperties}
                  >
                    <span className="prm-poschip__pos">{posLabel(pos)}</span>
                    <span className="prm-poschip__n">{posCounts[pos]}</span>
                  </span>
                ))}
              </div>
            </section>

            <section className="prm-sec">
              <h4 className="prm-sec__title">Position analysis</h4>
              <div className="prm-posrank">
                {leagueGrade.slots.map((slot) => {
                  const stat = leagueGrade.slotStats.get(teamId)?.get(slot);
                  const rank = stat?.rank ?? teamCount;
                  const color = rankGradeColor(rank, teamCount);
                  const fill = ((teamCount - rank + 1) / teamCount) * 100;
                  return (
                    <div
                      key={slot}
                      className="prm-posrank__row"
                      title={`${(stat?.total ?? 0).toFixed(1)} starter proj pts`}
                    >
                      <span className="prm-posrank__pos">{SLOT_LABELS[slot]}</span>
                      <span className="prm-posrank__track">
                        <span className="prm-posrank__fill" style={{ width: `${fill}%`, background: color }} />
                      </span>
                      <span
                        className="prm-posrank__rank"
                        style={{ ['--grade']: color } as CSSProperties}
                      >
                        {ordinal(rank)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            {byes.length > 0 && (
              <section className="prm-sec">
                <h4 className="prm-sec__title prm-sec__title--bye">Bye week breakdown</h4>
                <ul className="prm-byes">
                  {byes.map(([week, players]) => (
                    <li key={week} className={`prm-bye${players.length > 1 ? ' is-stacked' : ''}`}>
                      <span className="prm-bye__wk">Wk {week}</span>
                      <span className="prm-bye__n">{players.length}</span>
                      <span className="prm-bye__players">
                        {players.map((p) => (
                          <span key={p.id} className="prm-bye__p">
                            <span
                              className="prm-bye__d"
                              style={{ background: POSITION_COLORS[p.position as Position] }}
                            />
                            {p.name}
                          </span>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}

        {teamTab === 'roster' && (
          <div className="prm-pane">
            <section className="prm-sec">
              <h4 className="prm-sec__title">Starting lineup</h4>
              <ul className="prm-slots">{lineup.starters.map((r, i) => lineupRow(r, i))}</ul>
            </section>
            {lineup.bench.length > 0 && (
              <section className="prm-sec">
                <h4 className="prm-sec__title prm-sec__title--bench">Bench</h4>
                <ul className="prm-slots">
                  {lineup.bench.map((r, i) => lineupRow(r, lineup.starters.length + i))}
                </ul>
              </section>
            )}
          </div>
        )}

        {teamTab === 'grades' && (
          <div className="prm-pane">
            <section className="prm-sec">
              <h4 className="prm-sec__title prm-sec__title--peer">
                Peer grades
                <button type="button" className="prm-sec__help" onClick={onPeerHelp} aria-label="How peer grades work">
                  <InfoOutlineIcon fontSize="inherit" />
                </button>
              </h4>
              {feed.length === 0 ? (
                <p className="prm-feed__empty">No peer grades on this roster yet.</p>
              ) : (
                feed.map((g) => {
                  const rx = reactionIndex.get(`${g.team_id}:${g.rater_id}`) ?? {
                    up: 0,
                    down: 0,
                    mine: 0,
                  };
                  const isOwn = g.rater_id === myUserId;
                  const canReact = canGrade && !locked && !isOwn;
                  const net = rx.up - rx.down;
                  return (
                    <div key={g.rater_id} className={`prm-card${isOwn ? ' is-you' : ''}`}>
                      <GradeBadge grade={g.grade} size={32} />
                      <div className="prm-card__body">
                        <div className="prm-card__meta">
                          <span className="prm-card__author">
                            @{usernameById.get(g.rater_id) ?? 'Player'}
                          </span>
                          {isOwn && <span className="prm-card__you">YOU</span>}
                          <span className="prm-card__time">{timeAgo(g.created_at)}</span>
                        </div>
                        <div className="prm-card__comment">{g.comment}</div>
                        <div className="prm-card__actions">
                          <button
                            type="button"
                            className={`prm-react up${rx.mine === 1 ? ' is-on' : ''}`}
                            disabled={!canReact}
                            onClick={() => onReact(g.team_id, g.rater_id, rx.mine === 1 ? 0 : 1)}
                          >
                            <ThumbUpAltIcon fontSize="inherit" /> {rx.up}
                          </button>
                          <button
                            type="button"
                            className={`prm-react down${rx.mine === -1 ? ' is-on' : ''}`}
                            disabled={!canReact}
                            onClick={() => onReact(g.team_id, g.rater_id, rx.mine === -1 ? 0 : -1)}
                          >
                            <ThumbDownAltIcon fontSize="inherit" /> {rx.down}
                          </button>
                          {rx.up + rx.down > 0 && (
                            <span className="prm-card__net">
                              {net > 0 ? '+' : ''}
                              {net} net
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </section>

            <div className="prm-dock">
              {isSelf ? (
                <p className="prm-note">
                  This is your team — the league grades you, not the other way around.
                </p>
              ) : locked ? (
                <p className="prm-note">
                  <LockOutlinedIcon fontSize="inherit" /> Voting and grading closed 24h after the
                  draft ended.
                </p>
              ) : canVote || canGrade ? (
                <div className="prm-composer">
                  <div className="prm-composer__title">Grade this roster</div>
                  {canVote && (
                    <button
                      type="button"
                      className={`prm-crown-btn${myVoteTeamId === teamId ? ' is-on' : ''}`}
                      onClick={() => onVote(teamId)}
                    >
                      <EmojiEventsIcon fontSize="inherit" />
                      {myVoteTeamId === teamId ? 'Crowned this roster' : 'Crown this roster'}
                    </button>
                  )}
                  {canGrade && (
                    <>
                      <div className="prm-pills">
                        {DRAFT_GRADES.map((g) => (
                          <button
                            key={g}
                            type="button"
                            className={`prm-pill${pendingGrade === g ? ' is-on' : ''}`}
                            style={pendingGrade === g ? { background: DRAFT_GRADE_COLORS[g] } : undefined}
                            onClick={() => setPendingGrade(g)}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                      <div className="prm-composer__input">
                        <textarea
                          value={comment}
                          maxLength={140}
                          placeholder="Say something about this roster…"
                          onChange={(e) => {
                            setComment(e.target.value.slice(0, 140));
                            if (commentError) setCommentError(null);
                          }}
                        />
                        <button type="button" className="prm-post-btn" onClick={onSubmitGrade}>
                          {myGrade ? 'Update' : 'Post'}
                        </button>
                      </div>
                      {commentError && <p className="prm-composer__error">{commentError}</p>}
                    </>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
