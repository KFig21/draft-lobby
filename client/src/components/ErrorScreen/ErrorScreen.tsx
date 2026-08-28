import WarningAmberRoundedIcon from '@mui/icons-material/WarningAmberRounded';
import './ErrorScreen.scss';

interface Props {
  title?: string;
  message?: string;
  /** Shown alongside "Back to home" when there's something retryable. */
  onRetry?: () => void;
}

/** Generic full-page error state: message + a way back to solid ground. */
export function ErrorScreen({
  title = 'Something went wrong',
  message = 'Try heading back home and starting again.',
  onRetry,
}: Props) {
  return (
    <div className="error-screen">
      <div className="error-screen__card">
        <span className="error-screen__badge" aria-hidden>
          <WarningAmberRoundedIcon />
        </span>
        <h1 className="error-screen__title">{title}</h1>
        <p className="muted error-screen__message">{message}</p>
        <div className="error-screen__actions">
          {onRetry && (
            <button className="button" onClick={onRetry}>
              Try again
            </button>
          )}
          {/* Deliberately a HARD navigation, not the SPA `navigate('/home')`.
              When this renders inside a tripped ErrorBoundary, the boundary has
              replaced the whole tree and only clears when location.pathname
              actually changes — so an in-app navigate to /home from a crash that
              happened ON /home does nothing at all. A full reload rebuilds the
              app from scratch, guaranteeing an escape from any wedged state. */}
          <button
            className="button button--primary"
            onClick={() => window.location.assign('/home')}
          >
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}
