import { avatarSchema, defaultAvatar, type Avatar as AvatarData } from '@draft-lobby/shared';
import { useEffect, useState } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { supabase } from '../../supabase';
import { AvatarEditor } from '../AvatarEditor/AvatarEditor';
import './ProfileEditor.scss';

export function ProfileEditor() {
  const { session } = useAuth();
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
    if (trimmed.length < 3) {
      setStatus('Username must be at least 3 characters');
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
    setSaving(false);
    setStatus('Saved');
  }

  if (!loaded) return <p className="muted">Loading your profile…</p>;

  return (
    <form className="profile-editor" onSubmit={handleSubmit}>
      <AvatarEditor value={avatar} onChange={setAvatar} />

      <label className="field">
        <span>Username</span>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          minLength={3}
          maxLength={20}
          required
        />
      </label>

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
