import CheckRoundedIcon from '@mui/icons-material/CheckRounded';
import ContentCopyOutlinedIcon from '@mui/icons-material/ContentCopyOutlined';
import DataObjectOutlinedIcon from '@mui/icons-material/DataObjectOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import InsertDriveFileOutlinedIcon from '@mui/icons-material/InsertDriveFileOutlined';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import { useMemo, useState, type ReactNode } from 'react';
import { copyText } from '../../lib/clipboard';
import {
  buildDraftExport,
  downloadDraftExport,
  type ExportFormat,
  type ExportOptions,
} from '../../lib/exportDraft';
import { Modal } from '../Modal/Modal';
import './DataExportModal.scss';

const META: Record<ExportFormat, { label: string; icon: ReactNode; blurb: string }> = {
  csv: {
    label: 'CSV',
    icon: <InsertDriveFileOutlinedIcon fontSize="small" />,
    blurb: 'Teams stacked top to bottom — opens directly in Excel or Sheets.',
  },
  xls: {
    label: 'Excel',
    icon: <TableChartOutlinedIcon fontSize="small" />,
    blurb: 'Teams side by side as a real spreadsheet (.xls).',
  },
  json: {
    label: 'JSON',
    icon: <DataObjectOutlinedIcon fontSize="small" />,
    blurb: 'One object per team — for feeding into scripts and tools.',
  },
};

interface Props {
  format: ExportFormat;
  opts: ExportOptions;
  /** Return to the export menu. */
  onBack: () => void;
  onClose: () => void;
}

/**
 * Preview a CSV / Excel / JSON draft export before doing anything with it: shows
 * the file's contents and lets the user copy the text or download the file (or
 * go back to the export menu). Replaces the old straight-to-download behavior.
 */
export function DataExportModal({ format, opts, onBack, onClose }: Props) {
  const built = useMemo(() => buildDraftExport(format, opts), [format, opts]);
  const [copied, setCopied] = useState(false);
  const meta = META[format];

  async function copy() {
    if (await copyText(built.content)) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    }
  }

  const footer = (
    <div className="data-export__actions">
      <button type="button" className="button" onClick={copy}>
        {copied ? (
          <>
            <CheckRoundedIcon fontSize="small" /> Copied
          </>
        ) : (
          <>
            <ContentCopyOutlinedIcon fontSize="small" /> Copy
          </>
        )}
      </button>
      <button
        type="button"
        className="button button--primary"
        onClick={() => downloadDraftExport(built)}
      >
        <DownloadOutlinedIcon fontSize="small" /> Download
      </button>
    </div>
  );

  return (
    <Modal
      title={`${meta.label} export`}
      icon={meta.icon}
      onBack={onBack}
      onClose={onClose}
      wide
      className="data-export"
      footer={footer}
    >
      <p className="data-export__blurb">{meta.blurb}</p>
      <pre className="data-export__preview">{built.content}</pre>
    </Modal>
  );
}
