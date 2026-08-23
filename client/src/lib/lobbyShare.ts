import { api } from './api';

/**
 * Snapshot a draft's full setup (settings + teams + keepers) into a shareable
 * token. With `toUserId` (an accepted friend), also drops a share notification
 * in their feed. Returns the share id — build a /import/ruleset/<id> link from it.
 */
export async function shareDraftSetup(lobbyId: string, toUserId?: string): Promise<string> {
  const res = await api<{ id: string }>(`/lobbies/${lobbyId}/share-setup`, {
    method: 'POST',
    body: toUserId ? { toUserId } : {},
  });
  return res.id;
}
