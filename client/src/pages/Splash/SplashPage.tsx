import { Link } from 'react-router-dom';
import './SplashPage.scss';

export function SplashPage() {
  return (
    <main className="splash">
      <h1 className="splash__title">Draft Lobby</h1>
      <p className="splash__tagline">
        Run your fantasy football draft — live, custom, and in your control.
      </p>
      <div className="splash__actions">
        <Link className="button button--primary" to="/auth">
          Get started
        </Link>
      </div>
    </main>
  );
}
