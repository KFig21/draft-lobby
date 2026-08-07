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
import BoltIcon from '@mui/icons-material/Bolt';
import EditNoteIcon from '@mui/icons-material/EditNote';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import InfoOutlineIcon from '@mui/icons-material/InfoOutlined';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import ThumbDownAltIcon from '@mui/icons-material/ThumbDownAlt';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { buildLeagueGrade, type LeagueGrade } from '../../lib/draftGradeExport';
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
import './PowerRankingsBoard.scss';

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
  onExportGrades?: () => void;
  /** The league chat, shown in the right pane while the League summary is up. */
  chatPanel?: ReactNode;
}

const posLabel = (p: Position) => (p === 'DEF' ? 'D/ST' : p);

/** Projected points, Futura-italic with a smaller decimal — matches the
 * grade-export PNG cards (see gradesCanvas drawProj). */
function ProjPoints({ value, className }: { value: number; className?: string }) {
  const [int, dec] = value.toFixed(1).split('.');
  return (
    <span className={`prb-proj${className ? ` ${className}` : ''}`}>
      {Number(int).toLocaleString('en-US')}
      <span className="prb-proj__dec">.{dec}</span>
    </span>
  );
}

function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'now';
  const m = s / 60;
  if (m < 60) return `${Math.floor(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h`;
  const d = h / 24;
  if (d < 7) return `${Math.floor(d)}d`;
  const w = d / 7;
  if (w < 5) return `${Math.floor(w)}w`;
  return `${Math.floor(d / 30)}mo`;
}

/**
 * The fullscreen Power Rankings board: a 3-column layout — standings list
 * (left), the selected team's roster breakdown (center), and a peer-grade feed
 * with like/dislike + a docked composer (right). Only used in fullscreen; the
 * windowed/mobile rankings keep the single-column PowerRankingsPanel.
 */
export function PowerRankingsBoard({
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
  onExportGrades,
  chatPanel,
}: Props) {
  // Defaults to the league summary; picking a team drops into that team's
  // roster breakdown + peer feed.
  const [view, setView] = useState<'league' | 'team'>('league');

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

  // Position counts per team (all drafted players) + the league max per slot,
  // so each position bar runs 0 → the most anyone took at that position.
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
  // Only the positions this league actually rosters — a no-kicker / no-defense
  // league shouldn't show an all-zero K or D/ST pill.
  const draftablePos = useMemo(
    () => POSITIONS.filter((p) => draftablePositions(settings.rosterComposition).has(p)),
    [settings.rosterComposition],
  );

  // Up/down tallies + my own reaction, keyed by "teamId:graderId".
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

  // Selection: prefer the viewer's own team, fall back to #1. Derived so it
  // stays valid if teams change; clicks update the underlying state.
  const [picked, setPicked] = useState<string | null>(myTeamId ?? null);
  const [showHelp, setShowHelp] = useState(false);
  const [showPeerHelp, setShowPeerHelp] = useState(false);
  const selectedId =
    picked && rankings.some((r) => r.team.id === picked)
      ? picked
      : rankings[0]?.team.id ?? null;
  const selected = rankings.find((r) => r.team.id === selectedId) ?? null;

  const myGrade =
    grades.find((g) => g.team_id === selectedId && g.rater_id === myUserId) ?? null;

  // Composer, seeded from an existing grade — reseed only when the selection
  // changes, so a realtime refresh doesn't clobber what the user is typing.
  const [pendingGrade, setPendingGrade] = useState<DraftGrade>('B');
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  useEffect(() => {
    setPendingGrade(myGrade?.grade ?? 'B');
    setComment(myGrade?.comment ?? '');
    setCommentError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  if (!selected || !selectedId) {
    return <div className="prb prb--empty">No teams to rank yet.</div>;
  }

  const lineup = buildLineup(selectedId, picks, playersById, settings);
  const rosterRows = [...lineup.starters, ...lineup.bench];
  const posCounts = posByTeam.get(selectedId) ?? { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  const delta = selected.starterPoints - avgPts;
  const isSelf = selectedId === myTeamId;
  const selCrowns = voteCounts.get(selectedId) ?? 0;

  // Bye-week exposure across the whole roster.
  const byeMap = new Map<number, PlayerRow[]>();
  for (const row of rosterRows) {
    if (!row.player || row.player.bye_week == null) continue;
    const list = byeMap.get(row.player.bye_week);
    if (list) list.push(row.player);
    else byeMap.set(row.player.bye_week, [row.player]);
  }
  const byes = [...byeMap.entries()].sort(([a], [b]) => a - b);

  // Peer grades for the selected roster, newest first.
  const feed = grades
    .filter((g) => g.team_id === selectedId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

  const submitGrade = () => {
    const body = comment.trim();
    if (containsSlur(body)) {
      setCommentError('That comment contains language that isn’t allowed here');
      return;
    }
    setCommentError(null);
    onGrade(selectedId, pendingGrade, body || 'No notes');
  };

  const lineupRow = (row: (typeof rosterRows)[number], i: number) => {
    const p = row.player;
    const inner = (
      <>
        <span className="prb-slot__lab">{SLOT_LABELS[row.slot]}</span>
        {p ? (
          <>
            <span className="prb-slot__player">
              <span
                className="prb-slot__pos"
                style={{ background: POSITION_COLORS[p.position as Position] }}
              >
                {posLabel(p.position as Position)}
              </span>
              <span className="prb-slot__nm">
                <span className="prb-slot__name">
                  {p.name}
                  {row.pick?.is_keeper && <span className="prb-slot__keeper">K</span>}
                </span>
                <span className="prb-slot__team">
                  {p.position === 'DEF' ? `${p.nfl_team} D/ST` : p.nfl_team}
                </span>
              </span>
            </span>
            <span className="prb-slot__pp">
              <ProjPoints value={p.proj_points ?? 0} />
              <small> pts</small>
            </span>
          </>
        ) : (
          <>
            <span className="prb-slot__player prb-slot__player--empty">Empty</span>
            <span className="prb-slot__pp">—</span>
          </>
        )}
      </>
    );
    return row.pick && onPickClick ? (
      <li key={i}>
        <button type="button" className="prb-slot prb-slot--link" onClick={() => onPickClick(row.pick!)}>
          {inner}
        </button>
      </li>
    ) : (
      <li key={i} className="prb-slot">
        {inner}
      </li>
    );
  };

  return (
    <>
    <div className="prb">
      {/* ── LEFT: standings ─────────────────────────────── */}
      <div className="prb__col prb__col--left">
        <div className="prb__header">
          <div className="prb__header-title">
            <TrendingUpIcon className="prb__header-icon" fontSize="inherit" />
            <h2>Power Rankings</h2>
            <button
              type="button"
              className="prb__help"
              onClick={() => setShowHelp(true)}
              aria-label="How grades work"
              title="How grades work"
            >
              <InfoOutlineIcon fontSize="inherit" />
            </button>
          </div>
          {onExportGrades && (
            <button type="button" className="prb__share" onClick={onExportGrades}>
              <FileDownloadOutlinedIcon fontSize="inherit" /> Share
            </button>
          )}
        </div>
        <div className="prb__scroll">
          <button
            type="button"
            className={`prb-summary-btn${view === 'league' ? ' is-on' : ''}`}
            onClick={() => setView('league')}
          >
            <EmojiEventsIcon fontSize="inherit" /> League summary
          </button>
          {rankings.map((r) => {
            const t = r.team;
            const owner = t.owner_id ? usernameById.get(t.owner_id) : null;
            const crowns = voteCounts.get(t.id) ?? 0;
            return (
              <button
                key={t.id}
                type="button"
                className={`prb-rank${
                  t.id === selectedId && view === 'team' ? ' is-active' : ''
                }${t.id === myTeamId ? ' is-mine' : ''}`}
                onClick={() => {
                  setPicked(t.id);
                  setView('team');
                }}
              >
                <span
                  className={`prb-rank__medal${r.rank <= 3 ? ` m${r.rank}` : ''}`}
                >
                  {r.rank}
                </span>
                <Avatar avatar={avatarForTeam(t, members)} size={34} />
                <span className="prb-rank__mid">
                  <span className="prb-rank__line">
                    <span className="prb-rank__name">{t.name}</span>
                    {owner && <span className="prb-rank__owner">@{owner}</span>}
                    {crowns > 0 && (
                      <span className="prb-rank__crown">
                        <EmojiEventsIcon fontSize="inherit" /> {crowns}
                      </span>
                    )}
                  </span>
                  <span className="prb-rank__meta">
                    <span className="prb-rank__bar">
                      <i
                        style={{
                          width: `${10 + 85 * r.strength}%`,
                          background: DRAFT_GRADE_COLORS[r.grade],
                        }}
                      />
                    </span>
                    <span className="prb-rank__pts">
                      <b>{r.starterPoints.toFixed(1)}</b> proj
                    </span>
                  </span>
                </span>
                <GradeBadge grade={r.grade} size={30} />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CENTER: league summary, or the selected team's roster ── */}
      <div className="prb__col prb__col--center">
        <div className="prb__scroll">
          {view === 'team' ? (
          <div className="prb-team">
          <div className="prb-head">
            <Avatar avatar={avatarForTeam(selected.team, members)} size={50} />
            <div className="prb-head__id">
              <div className="prb-head__name">{selected.team.name}</div>
              {selected.team.owner_id && (
                <div className="prb-head__owner">@{usernameById.get(selected.team.owner_id)}</div>
              )}
            </div>
          </div>

          <div className="prb-metrics">
            <div className="prb-metric">
              <span className="prb-metric__lab">LEAGUE RANK</span>
              <span className="prb-metric__val">
                #{selected.rank} <small>of {rankings.length}</small>
              </span>
            </div>
            <div className="prb-metric">
              <span className="prb-metric__lab">PROJ STARTER PTS</span>
              <span className="prb-metric__stack">
                <span
                  className="prb-metric__val prb-metric__val--proj"
                  style={{ ['--grade']: DRAFT_GRADE_COLORS[selected.grade] } as CSSProperties}
                >
                  <ProjPoints value={selected.starterPoints} />
                </span>
                <span className={`prb-metric__delta ${delta >= 0 ? 'pos' : 'neg'}`}>
                  {delta >= 0 ? '+' : '−'}
                  {Math.abs(delta).toFixed(1)}
                  <small>vs avg</small>
                </span>
              </span>
            </div>
            <div className="prb-metric">
              <span className="prb-metric__lab">APP GRADE</span>
              <span className="prb-metric__val">
                <GradeBadge grade={selected.grade} size={30} />
              </span>
            </div>
            <div className="prb-metric">
              <span className="prb-metric__lab">CROWN VOTES</span>
              <span className="prb-metric__val prb-metric__val--crown">
                <EmojiEventsIcon fontSize="inherit" />
                {selCrowns}
              </span>
            </div>
          </div>

          <section className="prb-sec">
            <h4 className="prb-sec__title prb-sec__title--pos">Position breakdown</h4>
            <div className="prb-posbreak">
              {draftablePos.map((pos) => (
                <span
                  key={pos}
                  className="prb-poschip"
                  style={{ ['--pos']: POSITION_COLORS[pos] } as CSSProperties}
                >
                  <span className="prb-poschip__pos">{posLabel(pos)}</span>
                  <span className="prb-poschip__n">{posCounts[pos]}</span>
                </span>
              ))}
            </div>
          </section>

          <section className="prb-sec">
            <h4 className="prb-sec__title">Starting lineup</h4>
            <ul className="prb-slots">{lineup.starters.map((r, i) => lineupRow(r, i))}</ul>
          </section>

          {lineup.bench.length > 0 && (
            <section className="prb-sec">
              <h4 className="prb-sec__title prb-sec__title--bench">Bench</h4>
              <ul className="prb-slots">
                {lineup.bench.map((r, i) => lineupRow(r, lineup.starters.length + i))}
              </ul>
            </section>
          )}

          {byes.length > 0 && (
            <section className="prb-sec">
              <h4 className="prb-sec__title prb-sec__title--bye">Bye week breakdown</h4>
              <ul className="prb-byes">
                {byes.map(([week, players]) => (
                  <li
                    key={week}
                    className={`prb-bye${players.length > 1 ? ' is-stacked' : ''}`}
                  >
                    <span className="prb-bye__wk">Wk {week}</span>
                    <span className="prb-bye__n">{players.length}</span>
                    <span className="prb-bye__players">
                      {players.map((p) => (
                        <span key={p.id} className="prb-bye__p">
                          <span
                            className="prb-bye__d"
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
          ) : (
            <LeagueSummaryPane model={leagueGrade} />
          )}
        </div>
      </div>

      {/* ── RIGHT: peer-grade feed, or the league chat in summary view ── */}
      <div className="prb__col prb__col--right">
        {view === 'league' && chatPanel ? (
          <div className="prb__chat">{chatPanel}</div>
        ) : (
          <>
        <div className="prb__header">
          <div className="prb__header-title">
            <EditNoteIcon className="prb__header-icon" fontSize="inherit" />
            <h2>Peer grades</h2>
            <button
              type="button"
              className="prb__help"
              onClick={() => setShowPeerHelp(true)}
              aria-label="How peer grades work"
              title="How peer grades work"
            >
              <InfoOutlineIcon fontSize="inherit" />
            </button>
          </div>
        </div>
        <div className="prb__scroll prb-feed">
          {feed.length === 0 ? (
            <p className="prb-feed__empty">No peer grades on this roster yet.</p>
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
                <div key={g.rater_id} className={`prb-card${isOwn ? ' is-you' : ''}`}>
                  <GradeBadge grade={g.grade} size={34} />
                  <div className="prb-card__body">
                    <div className="prb-card__meta">
                      <span className="prb-card__author">
                        @{usernameById.get(g.rater_id) ?? 'Player'}
                      </span>
                      {isOwn && <span className="prb-card__you">YOU</span>}
                      <span className="prb-card__time">{timeAgo(g.created_at)}</span>
                    </div>
                    <div className="prb-card__comment">{g.comment}</div>
                    <div className="prb-card__actions">
                      <button
                        type="button"
                        className={`prb-react up${rx.mine === 1 ? ' is-on' : ''}`}
                        disabled={!canReact}
                        onClick={() => onReact(g.team_id, g.rater_id, rx.mine === 1 ? 0 : 1)}
                      >
                        <ThumbUpAltIcon fontSize="inherit" /> {rx.up}
                      </button>
                      <button
                        type="button"
                        className={`prb-react down${rx.mine === -1 ? ' is-on' : ''}`}
                        disabled={!canReact}
                        onClick={() => onReact(g.team_id, g.rater_id, rx.mine === -1 ? 0 : -1)}
                      >
                        <ThumbDownAltIcon fontSize="inherit" /> {rx.down}
                      </button>
                      {rx.up + rx.down > 0 && (
                        <span className="prb-card__net">
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
        </div>

        <div className="prb__dock">
          {isSelf ? (
            <p className="prb-note">
              This is your team — the league grades you, not the other way around.
            </p>
          ) : locked ? (
            <p className="prb-note">
              <LockOutlinedIcon fontSize="inherit" /> Voting and grading closed 24h after the draft
              ended.
            </p>
          ) : canVote || canGrade ? (
            <div className="prb-composer">
              <div className="prb-composer__title">
                Grade this roster{' '}
                {myUserId && <span className="who">as @{usernameById.get(myUserId)}</span>}
              </div>
              {canVote && (
                <button
                  type="button"
                  className={`prb-crown-btn${myVoteTeamId === selectedId ? ' is-on' : ''}`}
                  onClick={() => onVote(selectedId)}
                >
                  <EmojiEventsIcon fontSize="inherit" />
                  {myVoteTeamId === selectedId ? 'Crowned this roster' : 'Crown this roster'}
                </button>
              )}
              {canGrade && (
                <>
                  <div className="prb-pills">
                    {DRAFT_GRADES.map((g) => (
                      <button
                        key={g}
                        type="button"
                        className={`prb-pill${pendingGrade === g ? ' is-on' : ''}`}
                        style={pendingGrade === g ? { background: DRAFT_GRADE_COLORS[g] } : undefined}
                        onClick={() => setPendingGrade(g)}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                  <div className="prb-composer__input">
                    <textarea
                      value={comment}
                      maxLength={140}
                      placeholder="Say something about this roster…"
                      onChange={(e) => {
                        setComment(e.target.value.slice(0, 140));
                        if (commentError) setCommentError(null);
                      }}
                    />
                    <button type="button" className="prb-post-btn" onClick={submitGrade}>
                      {myGrade ? 'Update' : 'Post'}
                    </button>
                  </div>
                  {commentError && <p className="prb-composer__error">{commentError}</p>}
                </>
              )}
            </div>
          ) : null}
        </div>
          </>
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
            These are all separate from the projected <b>App grade</b> in the middle — the human
            opinion next to the math.
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

/** DOM version of the grade-export "league cover" card — podium (2·1·3),
 * top/avg/low projections, steal + biggest reach, and a projected-points-by-team
 * bar chart (lowest → highest, each bar topped by the team's avatar). */
function LeagueSummaryPane({ model }: { model: LeagueGrade }) {
  const podium = [model.teams[1], model.teams[0], model.teams[2]]; // 2 · 1 · 3
  // teamCards come in rank order (highest projection first); reverse for the
  // lowest→highest bar chart. Scale bars across the min→max spread (not from 0)
  // so the tight point range still reads as distinct heights.
  const projTeams = [...model.teams].reverse();
  const projMin = Math.min(...projTeams.map((t) => t.starterPoints));
  const projSpan = Math.max(1, Math.max(...projTeams.map((t) => t.starterPoints)) - projMin);
  // Worst bye weeks: bars run in week order (left → right); the bar height still
  // shows who's hit hardest. Scale from zero since counts are small integers.
  const maxBye = Math.max(1, ...model.byeClashes.map((b) => b.count));
  const hasByes = model.byeClashes.some((b) => b.count > 0);
  const byesByWeek = [...model.byeClashes].sort(
    (a, b) => (a.worstWeek ?? Infinity) - (b.worstWeek ?? Infinity),
  );
  const proj = (label: string, value: number, color: string, name?: string) => (
    <div className="prb-sum__projbox">
      <span className="prb-sum__projlab">{label}</span>
      <span className="prb-sum__projval" style={{ ['--c']: color } as CSSProperties}>
        <ProjPoints value={value} />
      </span>
      {name && <span className="prb-sum__projsub">{name}</span>}
    </div>
  );
  return (
    <div className="prb-sum">
      <div className="prb-sum__head">
        <div className="prb-sum__eyebrow">{model.season} SEASON</div>
        <h2 className="prb-sum__name">{model.lobbyName}</h2>
        <div className="prb-sum__meta">
          {model.teamCount} teams · {model.scoringLabel} · {model.draftTypeLabel} · {model.rounds}{' '}
          rounds
        </div>
      </div>

      <div className="prb-sum__podium">
        {podium.map((card, i) =>
          card ? (
            <div key={card.team.id} className={`prb-sum__pod${i === 1 ? ' is-champ' : ''}`}>
              {i === 1 && <EmojiEventsIcon className="prb-sum__crown" />}
              <Avatar avatar={card.avatar} size={i === 1 ? 76 : 60} />
              <div className="prb-sum__pod-name">{card.team.name}</div>
              <div className="prb-sum__pod-owner">{card.ownerLabel}</div>
              <GradeBadge grade={card.grade} size={26} />
              <div className="prb-sum__pod-rank">#{card.rank}</div>
            </div>
          ) : null,
        )}
      </div>

      <div className="prb-sum__proj">
        {proj('TOP PROJECTION', model.topProjection, '#3fd6a5', model.topProjName)}
        {proj('AVG PROJECTION', model.avgProjection, '#f6a642')}
        {proj('LOW PROJECTION', model.lowProjection, '#f8577d', model.lowProjName)}
      </div>

      {(model.leagueSteal || model.leagueReach) && (
        <div className="prb-sum__callouts">
          {model.leagueSteal && (
            <div className="prb-sum__callout prb-sum__callout--steal">
              <div className="prb-sum__callout-lab">
                <BoltIcon fontSize="inherit" /> STEAL OF THE DRAFT
              </div>
              <div className="prb-sum__callout-main">
                {model.leagueSteal.player.name} · {model.leagueSteal.player.position}
              </div>
              <div className="prb-sum__callout-sub">
                R{model.leagueSteal.round} to {model.leagueSteal.team.name} — +
                {Math.max(0, model.leagueSteal.valueRounds)} rds of value
              </div>
            </div>
          )}
          {model.leagueReach && (
            <div className="prb-sum__callout prb-sum__callout--reach">
              <div className="prb-sum__callout-lab">
                <TrendingUpIcon fontSize="inherit" /> BIGGEST REACH
              </div>
              <div className="prb-sum__callout-main">
                {model.leagueReach.player.name} · {model.leagueReach.player.position}
              </div>
              <div className="prb-sum__callout-sub">
                R{model.leagueReach.round} by {model.leagueReach.team.name} —{' '}
                {Math.abs(Math.min(0, model.leagueReach.valueRounds))} rds early
              </div>
            </div>
          )}
        </div>
      )}

      {hasByes && (
        <div className="prb-sum__byes">
          <div className="prb-sum__dist-lab prb-sum__dist-lab--bye">WORST BYE WEEKS</div>
          <div className="prb-sum__byebars">
            {byesByWeek.map((b) => (
              <div key={b.team.id} className="prb-sum__byecol" title={b.team.name}>
                <span className="prb-sum__byen">{b.count}</span>
                <Avatar avatar={b.avatar} size={24} />
                <span
                  className="prb-sum__byebar"
                  style={{ height: `${Math.max(6, Math.round((b.count / maxBye) * 60))}px` }}
                />
                <span className="prb-sum__byewk">{b.worstWeek ? `Wk ${b.worstWeek}` : '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="prb-sum__dist">
        <div className="prb-sum__dist-lab">PROJECTED POINTS BY TEAM</div>
        <div className="prb-sum__ppbars">
          {projTeams.map((t) => (
            <div key={t.team.id} className="prb-sum__ppcol" title={t.team.name}>
              <Avatar avatar={t.avatar} size={24} />
              <span
                className="prb-sum__ppbar"
                style={{
                  height: `${14 + Math.round(((t.starterPoints - projMin) / projSpan) * 78)}px`,
                  background: DRAFT_GRADE_COLORS[t.grade],
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
