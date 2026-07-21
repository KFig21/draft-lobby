import { useNavigate } from 'react-router-dom';
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
  const navigate = useNavigate();
  return (
    <div className="error-screen">
      <div className="error-screen__card">
        <span className="error-screen__icon" aria-hidden>
          ⚠️
        </span>
        <h1>{title}</h1>
        <p className="muted">{message}</p>
        <div className="error-screen__actions">
          {onRetry && (
            <button className="button" onClick={onRetry}>
              Try again
            </button>
          )}
          <button className="button button--primary" onClick={() => navigate('/home')}>
            Back to home
          </button>
        </div>
      </div>
    </div>
  );
}
