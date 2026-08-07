import type { LobbySettings } from '@draft-lobby/shared';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { buildLeagueGrade } from '../../lib/draftGradeExport';
import { downloadCanvasPng } from '../../lib/exportDraft';
import { buildLineup } from '../../lib/powerRankings';
import { renderRosterCard } from '../../lib/rosterCanvas';
import type {
  DraftCrownVoteRow,
  DraftGradeRow,
  MemberRow,
  PickRow,
  PlayerRow,
  TeamRow,
} from '../../lib/types';
import { Modal } from '../Modal/Modal';
import './RosterExportModal.scss';

interface Props {
  lobbyName: string;
  season: number;
  teams: TeamRow[];
  members: MemberRow[];
  picks: PickRow[];
  playersById: Map<string, PlayerRow>;
  settings: LobbySettings;
  crownVotes: DraftCrownVoteRow[];
  grades: DraftGradeRow[];
  /** The viewer's team — the default roster shown. */
  myTeamId: string | null;
  onClose: () => void;
}

function slug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'roster';
}

/** Mounts a rendered <canvas> and scales it to fit its column. */
function CanvasPreview({ canvas }: { canvas: HTMLCanvasElement }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    canvas.style.width = '100%';
    canvas.style.height = 'auto';
    canvas.style.display = 'block';
    el.appendChild(canvas);
    return () => {
      if (canvas.parentNode === el) el.removeChild(canvas);
    };
  }, [canvas]);
  return <div className="roster-export__canvas" ref={ref} />;
}

/**
 * A clean single-roster PNG export. Pick any team (defaults to the viewer's),
 * preview the deterministic canvas card, and download it. Sibling to the
 * GradeExportModal — both reached from the unified Export menu.
 */
export function RosterExportModal({
  lobbyName,
  season,
  teams,
  members,
  picks,
  playersById,
  settings,
  crownVotes,
  grades,
  myTeamId,
  onClose,
}: Props) {
  const model = useMemo(
    () => buildLeagueGrade({ lobbyName, season, teams, members, picks, playersById, settings, crownVotes, grades }),
    [lobbyName, season, teams, members, picks, playersById, settings, crownVotes, grades],
  );

  const [selectedId, setSelectedId] = useState<string>(myTeamId ?? model.teams[0]?.team.id ?? '');
  const card = model.teams.find((c) => c.team.id === selectedId) ?? model.teams[0] ?? null;
  const [enlarged, setEnlarged] = useState(false);

  const canvas = useMemo(() => {
    if (!card) return null;
    const { starters, bench, starterPoints } = buildLineup(card.team.id, picks, playersById, settings);
    return renderRosterCard({
      teamName: card.team.name,
      ownerName: card.ownerLabel,
      avatar: card.avatar,
      starters,
      bench,
      starterPoints,
      lobbyName,
      season,
      meta: `${model.scoringLabel} · ${model.draftTypeLabel}`,
      rank: card.rank,
      teamCount: model.teamCount,
      grade: card.grade,
    });
  }, [card, picks, playersById, settings, lobbyName, season, model]);

  const footer = (
    <div className="roster-export__foot">
      <span className="muted">1 image</span>
      <button
        type="button"
        className="button button--primary"
        disabled={!canvas || !card}
        onClick={() => canvas && card && downloadCanvasPng(canvas, `${slug(card.team.name)}-roster`)}
      >
        <FileDownloadOutlinedIcon fontSize="inherit" /> Download image
      </button>
    </div>
  );

  return (
    <Modal title="Share a roster" onClose={onClose} footer={footer}>
      <div className="roster-export">
        {model.teams.length > 1 && (
          <label className="roster-export__pick">
            <span>Team</span>
            <select value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
              {model.teams.map((c) => (
                <option key={c.team.id} value={c.team.id}>
                  {c.team.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {canvas ? (
          <button
            type="button"
            className="roster-export__preview"
            onClick={() => setEnlarged(true)}
            title="Tap to enlarge"
          >
            <CanvasPreview canvas={canvas} />
          </button>
        ) : (
          <p className="roster-export__empty muted">No roster to show for this team yet.</p>
        )}
        <p className="roster-export__hint muted">Tap the card to enlarge, then long-press to save — or use Download below.</p>
      </div>

      {enlarged &&
        canvas &&
        createPortal(
          <div className="roster-lightbox" onClick={() => setEnlarged(false)}>
            <img
              className="roster-lightbox__img"
              src={canvas.toDataURL('image/png')}
              alt="Roster card"
              onClick={(e) => e.stopPropagation()}
            />
            <p className="roster-lightbox__hint">Long-press to save the image · tap outside to close</p>
          </div>,
          document.body,
        )}
    </Modal>
  );
}
