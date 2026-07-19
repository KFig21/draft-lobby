import { Link } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import './HomePage.scss';

export function HomePage() {
  const { session } = useAuth();
  const username =
    (session?.user.user_metadata?.username as string | undefined) ??
    session?.user.email ??
    'drafter';

  return (
    <main className="home">
      <header className="home__header">
        <h1>Welcome, {username}</h1>
        <div className="home__header-actions">
          <Link className="button" to="/settings">
            Settings
          </Link>
        </div>
      </header>

      <div className="home__actions">
        <Link className="card card--action" to="/lobby/new">
          <h2>Create a lobby</h2>
          <p>Set up a draft with custom league parameters.</p>
        </Link>
        <Link className="card card--action" to="/lobby/join">
          <h2>Join a lobby</h2>
          <p>Enter a lobby ID and password to join a draft.</p>
        </Link>
        <Link className="card card--action" to="/profile">
          <h2>My drafts</h2>
          <p>Review your active and past drafts.</p>
        </Link>
      </div>
    </main>
  );
}
