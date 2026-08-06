import { useEffect, useMemo, useRef, useState } from 'react';
import type { LobbySettings } from '@draft-lobby/shared';
import { Modal } from '../Modal/Modal';
import { buildLeagueGrade } from '../../lib/draftGradeExport';
import { renderGradeCards, type GradeCard } from '../../lib/gradesCanvas';
import { downloadCanvasPng } from '../../lib/exportDraft';
import type {
  DraftCrownVoteRow,
  DraftGradeRow,
  MemberRow,
  PickRow,
  PlayerRow,
  TeamRow,
} from '../../lib/types';
import './GradeExportModal.scss';

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
  onClose: () => void;
}

/** Mounts a rendered <canvas> into the DOM and scales it to fit its column. */
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
  return <div className="grade-export__canvas" ref={ref} />;
}

export function GradeExportModal(props: Props) {
  const { lobbyName, season, teams, members, picks, playersById, settings, crownVotes, grades, onClose } =
    props;
  const [mode, setMode] = useState<'single' | 'full'>('single');
  const [busy, setBusy] = useState(false);

  const model = useMemo(
    () => buildLeagueGrade({ lobbyName, season, teams, members, picks, playersById, settings, crownVotes, grades }),
    [lobbyName, season, teams, members, picks, playersById, settings, crownVotes, grades],
  );

  // Render only the active mode's cards (the full breakdown is N+1 canvases).
  const cards: GradeCard[] = useMemo(() => renderGradeCards(model, mode), [model, mode]);

  async function downloadOne(card: GradeCard) {
    await downloadCanvasPng(card.canvas, card.key);
  }

  async function downloadAll() {
    setBusy(true);
    try {
      for (const card of cards) {
        await downloadCanvasPng(card.canvas, card.key);
        // Space out the clicks so browsers don't collapse them into one.
        await new Promise((r) => setTimeout(r, 180));
      }
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <div className="grade-export__foot">
      <span className="muted">
        {mode === 'single' ? '1 image' : `${cards.length} images`} · portrait, phone-sized
      </span>
      <button type="button" className="button button--primary" onClick={downloadAll} disabled={busy}>
        {busy ? 'Downloading…' : mode === 'single' ? 'Download image' : 'Download all'}
      </button>
    </div>
  );

  return (
    <Modal title="Share draft grades" onClose={onClose} wide footer={footer}>
      <div className="grade-export">
        <div className="segmented grade-export__tabs">
          <button
            type="button"
            className={`segmented__opt${mode === 'single' ? ' segmented__opt--on' : ''}`}
            onClick={() => setMode('single')}
          >
            Single page
          </button>
          <button
            type="button"
            className={`segmented__opt${mode === 'full' ? ' segmented__opt--on' : ''}`}
            onClick={() => setMode('full')}
          >
            Full breakdown
          </button>
        </div>
        <p className="grade-export__hint muted">
          {mode === 'single'
            ? 'Every team on one image — the quick share for the group chat.'
            : 'A league cover page, then one page per team. Save them all or just the one you want.'}
        </p>

        <div className={`grade-export__grid${mode === 'single' ? ' grade-export__grid--single' : ''}`}>
          {cards.map((card) => (
            <div className="grade-export__item" key={card.key}>
              <CanvasPreview canvas={card.canvas} />
              <button type="button" className="grade-export__dl" onClick={() => downloadOne(card)}>
                {card.label}
              </button>
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}
