import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutlined';
import ListAltOutlinedIcon from '@mui/icons-material/ListAltOutlined';
import LoginIcon from '@mui/icons-material/Login';
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
      </header>

      <div className="home__actions">
        <Link className="card card--action" to="/lobby/new">
          <span className="card--action__icon">
            <AddCircleOutlineIcon />
          </span>
          <h2>Create a lobby</h2>
          <p>Set up a draft with custom league parameters.</p>
        </Link>
        <Link className="card card--action" to="/lobby/join">
          <span className="card--action__icon">
            <LoginIcon />
          </span>
          <h2>Join a lobby</h2>
          <p>Enter a lobby ID and password to join a draft.</p>
        </Link>
        <Link className="card card--action" to="/profile">
          <span className="card--action__icon">
            <ListAltOutlinedIcon />
          </span>
          <h2>My drafts</h2>
          <p>Review your active and past drafts.</p>
        </Link>
      </div>
    </main>
  );
}
