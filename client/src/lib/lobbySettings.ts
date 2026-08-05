import type { LobbySettings } from '@draft-lobby/shared';
import { api } from './api';

/**
 * Commissioner edits a lobby's settings. Sends the full desired settings; the
 * server keeps only the fields editable at the lobby's current phase and
 * returns the effective result.
 */
export async function updateLobbySettings(
  lobbyId: string,
  settings: LobbySettings,
): Promise<LobbySettings> {
  const { settings: saved } = await api<{ settings: LobbySettings }>(
    `/lobbies/${lobbyId}/settings`,
    { method: 'PATCH', body: { settings } },
  );
  return saved;
}
