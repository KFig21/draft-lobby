import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { Loader } from '../../components/Loader/Loader';
import { supabase } from '../../supabase';
import './AuthPage.scss';

/**
 * Landing page for the password-reset email link. Supabase's recovery link
 * carries tokens in the URL hash; the shared client (detectSessionInUrl)
 * adopts them into a session before this renders, surfaced here as
 * useAuth().session. With that session in hand we can updateUser({ password });
 * without it the link was invalid or has expired.
 */
export function ResetPasswordPage() {
  const { session, loading } = useAuth();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (error) {
      setError(error.message);
      return;
    }
    setDone(true);
  }

  if (loading) {
    return (
      <main className="auth">
        <div className="loading">
          <Loader />
        </div>
      </main>
    );
  }

  // No recovery session → the link was bad or has expired.
  if (!session) {
    return (
      <main className="auth">
        <div className="auth__card auth__card--notice">
          <h1>Link expired</h1>
          <p className="auth__lead">
            This password-reset link is invalid or has expired. Request a new one
            and try again.
          </p>
          <Link className="button button--primary" to="/auth">
            Back to sign in
          </Link>
        </div>
      </main>
    );
  }

  if (done) {
    return (
      <main className="auth">
        <div className="auth__card auth__card--notice">
          <h1>Password updated</h1>
          <p className="auth__lead">Your password has been changed.</p>
          <button
            type="button"
            className="button button--primary"
            onClick={() => navigate('/home')}
          >
            Continue
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="auth">
      <form className="auth__card" onSubmit={handleSubmit}>
        <h1>Set a new password</h1>

        <label className="field">
          <span>New password</span>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
          <span className="auth__hint">At least 8 characters</span>
        </label>

        <label className="field">
          <span>Confirm password</span>
          <input
            type="password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={8}
            autoComplete="new-password"
          />
        </label>

        {error && <p className="auth__error">{error}</p>}

        <button className="button button--primary" disabled={busy}>
          {busy ? '…' : 'Update password'}
        </button>
      </form>
    </main>
  );
}
