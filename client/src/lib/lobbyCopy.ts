import type { Avatar as AvatarData, CopyLobbyInput } from '@draft-lobby/shared';
import { api } from './api';
import type { LobbyRow } from './types';

/** An original member of the source draft, offered for re-invite after a copy. */
export interface CopyMember {
  userId: string;
  username: string | null;
  avatar: AvatarData | null;
}

export interface CopyLobbyResult {
  lobby: LobbyRow;
  members: CopyMember[];
}

/** Duplicate a draft into a fresh lobby (see the copy checklist). */
export async function copyLobby(sourceId: string, input: CopyLobbyInput): Promise<CopyLobbyResult> {
  return api<CopyLobbyResult>(`/lobbies/${sourceId}/copy`, { method: 'POST', body: input });
}

/** Re-invite an original member into the copied lobby (existing LOBBY_INVITE flow). */
export async function reinviteToLobby(lobbyId: string, userId: string): Promise<void> {
  await api(`/lobbies/${lobbyId}/invite`, { method: 'POST', body: { userId } });
}
