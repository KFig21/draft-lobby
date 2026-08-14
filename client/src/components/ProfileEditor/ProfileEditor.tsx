import {
  avatarSchema,
  defaultAvatar,
  rollAvatar,
  USERNAME_MAX_LEN,
  USERNAME_MIN_LEN,
  type Avatar as AvatarData,
} from '@draft-lobby/shared';
import CasinoIcon from '@mui/icons-material/Casino';
import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { supabase } from '../../supabase';
import { AvatarEditor } from '../AvatarEditor/AvatarEditor';
import './ProfileEditor.scss';

export function ProfileEditor() {
  const { session, refreshProfile } = useAuth();
  const userId = session?.user.id;

  const [username, setUsername] = useState('');
  const [avatar, setAvatar] = useState<AvatarData>(() => defaultAvatar(userId ?? 'seed'));
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    void supabase
      .from('profiles')
      .select('username, avatar')
      .eq('id', userId)
      .single()
      .then(({ data }) => {
        if (data) {
          setUsername(data.username ?? '');
          const parsed = avatarSchema.safeParse(data.avatar);
          setAvatar(parsed.success ? parsed.data : defaultAvatar(userId));
        }
        setLoaded(true);
      });
  }, [userId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!userId) return;
    setStatus(null);

    const trimmed = username.trim();
    if (trimmed.length < USERNAME_MIN_LEN) {
      setStatus(`Username must be at least ${USERNAME_MIN_LEN} characters`);
      return;
    }

    setSaving(true);
    // Persist to the profile row (RLS: users update their own).
    const { error } = await supabase
      .from('profiles')
      .update({ username: trimmed, avatar })
      .eq('id', userId);

    if (error) {
      setSaving(false);
      setStatus(
        error.code === '23505' ? 'That username is taken' : error.message,
      );
      return;
    }

    // Keep auth metadata in sync so greetings/headers reflect the new name.
    await supabase.auth.updateUser({ data: { username: trimmed } });
    // Refresh the shared profile so the sidebar avatar/name update immediately.
    await refreshProfile();
    setSaving(false);
    setStatus('Saved');
  }

  if (!loaded) return <p className="muted">Loading your profile…</p>;

  return (
    <form className="profile-editor" onSubmit={handleSubmit}>
      <section className="profile-editor__group">
        <div className="profile-editor__subhead-row">
          <h3 className="profile-editor__subhead">Avatar</h3>
          {/* Mobile-only — desktop keeps Randomize in the avatar preview rail. */}
          <button
            type="button"
            className="avatar-editor__randomize profile-editor__roll"
            onClick={() => setAvatar(rollAvatar(avatar))}
          >
            <CasinoIcon fontSize="small" />
            Randomize
          </button>
        </div>
        <AvatarEditor value={avatar} onChange={setAvatar} />
      </section>

      <section className="profile-editor__group">
        <h3 className="profile-editor__subhead">Username</h3>
        <label className="field">
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            minLength={USERNAME_MIN_LEN}
            maxLength={USERNAME_MAX_LEN}
            aria-label="Username"
            required
          />
        </label>
      </section>

      <div className="profile-editor__actions">
        {status && (
          <span
            className={`profile-editor__status${
              status === 'Saved' ? ' profile-editor__status--ok' : ''
            }`}
          >
            {status}
          </span>
        )}
        <button className="button button--primary" disabled={saving}>
          {saving ? 'Saving…' : 'Save profile'}
        </button>
      </div>
    </form>
  );
}
