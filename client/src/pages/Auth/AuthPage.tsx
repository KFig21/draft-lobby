import {
  USERNAME_MAX_LEN,
  USERNAME_MIN_LEN,
} from '@draft-lobby/shared';
import { useEffect, useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../../supabase';
import { api } from '../../lib/api';
import { isUsernameAvailable } from '../../lib/username';
import './AuthPage.scss';

type Mode = 'signin' | 'signup' | 'forgot';
type UsernameStatus = 'idle' | 'checking' | 'available' | 'taken' | 'short';

export function AuthPage() {
  const [searchParams] = useSearchParams();
  // A friend-invite CTA links here with ?mode=signup to open on the sign-up tab.
  const [mode, setMode] = useState<Mode>(
    searchParams.get('mode') === 'signup' ? 'signup' : 'signin',
  );
  const [identifier, setIdentifier] = useState(''); // email or username (sign in / forgot)
  const [email, setEmail] = useState(''); // sign up
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // After a successful signup we don't have a session (email confirmation is
  // required) — show a "check your inbox" panel instead of navigating.
  const [pendingEmail, setPendingEmail] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  // After a password-reset request, show a generic confirmation (no account
  // enumeration — same stance as the login endpoint).
  const [forgotSent, setForgotSent] = useState(false);
  // Live username availability for signup.
  const [usernameStatus, setUsernameStatus] = useState<UsernameStatus>('idle');
  const navigate = useNavigate();

  const trimmedUsername = username.trim();

  // Debounced availability check — profiles are client-readable (RLS), so we
  // can look up an exact, case-insensitive match directly without a server
  // round-trip. This is a courtesy pre-check; the DB unique constraint is the
  // real gate at submit time.
  useEffect(() => {
    if (mode !== 'signup') return;
    if (trimmedUsername.length === 0) {
      setUsernameStatus('idle');
      return;
    }
    if (trimmedUsername.length < USERNAME_MIN_LEN) {
      setUsernameStatus('short');
      return;
    }
    setUsernameStatus('checking');
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const available = await isUsernameAvailable(trimmedUsername);
        if (!cancelled) setUsernameStatus(available ? 'available' : 'taken');
      } catch {
        // Network/validation hiccup — don't block signup on the pre-check;
        // the DB unique constraint is still the real gate at submit time.
        if (!cancelled) setUsernameStatus('idle');
      }
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [trimmedUsername, mode]);

  function switchMode(next: Mode) {
    setMode(next);
    setError(null);
    setForgotSent(false);
    setUsernameStatus('idle');
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    // Validate at submit time rather than disabling the button — a disabled
    // submit is skipped in the tab order and undiscoverable to keyboard users.
    if (mode === 'signup') {
      if (usernameStatus === 'taken') {
        setError('That username is already taken');
        return;
      }
      if (trimmedUsername.length < USERNAME_MIN_LEN) {
        setError(`Username must be at least ${USERNAME_MIN_LEN} characters`);
        return;
      }
      if (password.length < 8) {
        setError('Password must be at least 8 characters');
        return;
      }
    }

    setBusy(true);
    try {
      if (mode === 'signup') {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username: trimmedUsername },
            emailRedirectTo: `${window.location.origin}/auth`,
          },
        });
        if (error) throw error;
        // With email confirmation on, Supabase deliberately hides "this email
        // is already registered" behind a fake success — but the returned user
        // has an empty `identities` array in that case. Detect it so we can
        // send them to sign in instead of showing a check-inbox panel for an
        // email that will never receive one.
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          setError('An account with that email already exists — try signing in.');
          return;
        }
        // Confirmation required: no session yet. Show the check-inbox panel.
        if (!data.session) {
          setPendingEmail(email);
          return;
        }
        navigate('/home');
      } else if (mode === 'forgot') {
        // Server resolves username-or-email and always replies the same way.
        await api('/auth/forgot', { method: 'POST', body: { identifier } });
        setForgotSent(true);
      } else {
        // Resolve email-or-username server-side, then adopt the returned session.
        const { access_token, refresh_token } = await api<{
          access_token: string;
          refresh_token: string;
        }>('/auth/login', { method: 'POST', body: { identifier, password } });
        const { error } = await supabase.auth.setSession({
          access_token,
          refresh_token,
        });
        if (error) throw error;
        navigate('/home');
      }
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (!pendingEmail) return;
    setError(null);
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: pendingEmail,
      options: { emailRedirectTo: `${window.location.origin}/auth` },
    });
    if (error) setError(friendlyError(error));
    else setResent(true);
  }

  // ── Post-signup: verify-your-email panel ──
  if (pendingEmail) {
    return (
      <main className="auth">
        <div className="auth__card auth__card--notice">
          <h1>Check your inbox</h1>
          <p className="auth__lead">
            We sent a confirmation link to <strong>{pendingEmail}</strong>. Click
            it to activate your account, then come back to sign in.
          </p>
          {error && <p className="auth__error">{error}</p>}
          <button
            type="button"
            className="button button--primary"
            onClick={resend}
            disabled={resent}
          >
            {resent ? 'Link resent ✓' : 'Resend link'}
          </button>
          <button
            type="button"
            className="auth__switch"
            onClick={() => {
              setPendingEmail(null);
              setResent(false);
              switchMode('signin');
            }}
          >
            Back to sign in
          </button>
        </div>
      </main>
    );
  }

  // ── Forgot-password: request-sent panel ──
  if (mode === 'forgot' && forgotSent) {
    return (
      <main className="auth">
        <div className="auth__card auth__card--notice">
          <h1>Check your email</h1>
          <p className="auth__lead">
            If an account matches that email or username, we've sent a link to
            reset your password.
          </p>
          <button
            type="button"
            className="auth__switch"
            onClick={() => switchMode('signin')}
          >
            Back to sign in
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="auth">
      <form className="auth__card" onSubmit={handleSubmit}>
        <h1>
          {mode === 'signin'
            ? 'Sign in'
            : mode === 'signup'
              ? 'Create account'
              : 'Reset password'}
        </h1>

        {mode === 'forgot' && (
          <p className="auth__lead">
            Enter your email or username and we'll send a reset link.
          </p>
        )}

        {mode === 'signup' && (
          <label className="field">
            <span>Username</span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
              minLength={USERNAME_MIN_LEN}
              maxLength={USERNAME_MAX_LEN}
              autoComplete="username"
              aria-describedby="username-status"
            />
            <span
              id="username-status"
              className={`auth__hint auth__hint--${usernameStatus}`}
            >
              {usernameStatus === 'checking' && 'Checking availability…'}
              {usernameStatus === 'available' && '✓ Available'}
              {usernameStatus === 'taken' && 'That username is taken'}
              {usernameStatus === 'short' &&
                `At least ${USERNAME_MIN_LEN} characters`}
            </span>
          </label>
        )}

        {mode === 'signup' ? (
          <label className="field">
            <span>Email</span>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
        ) : (
          <label className="field">
            <span>Email or username</span>
            <input
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoComplete="username"
            />
          </label>
        )}

        {mode !== 'forgot' && (
          <label className="field">
            <span>Password</span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={mode === 'signup' ? 8 : 1}
              autoComplete={
                mode === 'signin' ? 'current-password' : 'new-password'
              }
            />
            {mode === 'signup' && (
              <span className="auth__hint">At least 8 characters</span>
            )}
          </label>
        )}

        {mode === 'signin' && (
          <button
            type="button"
            className="auth__link"
            onClick={() => switchMode('forgot')}
          >
            Forgot password?
          </button>
        )}

        {error && <p className="auth__error">{error}</p>}

        <button className="button button--primary" disabled={busy}>
          {busy
            ? '…'
            : mode === 'signin'
              ? 'Sign in'
              : mode === 'signup'
                ? 'Sign up'
                : 'Send reset link'}
        </button>

        {mode === 'forgot' ? (
          <button
            type="button"
            className="auth__switch"
            onClick={() => switchMode('signin')}
          >
            Back to sign in
          </button>
        ) : (
          <button
            type="button"
            className="auth__switch"
            onClick={() => switchMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            {mode === 'signin'
              ? "Don't have an account? Sign up"
              : 'Already have an account? Sign in'}
          </button>
        )}
      </form>
    </main>
  );
}

/**
 * Keep Supabase's raw error strings out of the UI (they leak internals and are
 * inconsistent with the login endpoint's careful generic messages).
 */
function friendlyError(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('username_taken') || lower.includes('unique'))
    return 'That username is already taken';
  if (lower.includes('already registered') || lower.includes('already exists'))
    return 'An account with that email already exists';
  if (lower.includes('invalid') && lower.includes('credential'))
    return 'Invalid email/username or password';
  if (lower.includes('password'))
    return 'Password must be at least 8 characters';
  if (lower.includes('email') && lower.includes('valid'))
    return 'Enter a valid email address';
  if (lower.includes('database error'))
    // The trigger's raise surfaces here on a username-collision race.
    return 'That username is already taken';
  return msg;
}
