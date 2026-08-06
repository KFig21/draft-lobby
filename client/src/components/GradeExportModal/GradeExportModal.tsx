import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import FileDownloadOutlinedIcon from '@mui/icons-material/FileDownloadOutlined';
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
  // The card shown full-size in the lightbox (as an <img> so it can be
  // long-pressed → Save Image on mobile, or screenshotted).
  const [enlarged, setEnlarged] = useState<GradeCard | null>(null);

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
        {mode === 'single' ? '1 image' : `${cards.length} images`}
      </span>
      <button type="button" className="button button--primary" onClick={downloadAll} disabled={busy}>
        <FileDownloadOutlinedIcon fontSize="inherit" />
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
            ? 'Every team on one image — the quick share for the group chat. Tap a card to enlarge it.'
            : 'A league cover page, then one page per team. Tap a card to enlarge, then save or screenshot it.'}
        </p>

        <div className={`grade-export__grid${mode === 'single' ? ' grade-export__grid--single' : ''}`}>
          {cards.map((card) => (
            <div className="grade-export__item" key={card.key}>
              <button
                type="button"
                className="grade-export__preview"
                onClick={() => setEnlarged(card)}
                title="Tap to enlarge"
              >
                <CanvasPreview canvas={card.canvas} />
              </button>
              <button type="button" className="grade-export__dl" onClick={() => downloadOne(card)}>
                {card.label}
              </button>
            </div>
          ))}
        </div>
      </div>

      {enlarged &&
        createPortal(
          <div className="grade-lightbox" onClick={() => setEnlarged(null)}>
            <img
              className="grade-lightbox__img"
              src={enlarged.canvas.toDataURL('image/png')}
              alt={enlarged.label}
              onClick={(e) => e.stopPropagation()}
            />
            <p className="grade-lightbox__hint">
              Long-press to save the image, or screenshot it · tap outside to close
            </p>
          </div>,
          document.body,
        )}
    </Modal>
  );
}
