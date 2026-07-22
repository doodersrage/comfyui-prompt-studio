/**
 * Shared-project live presence + draft broadcast (collab-lite).
 * Transport: BroadcastChannel locally + optional SSE fan-out via /api/collab.
 */

export type CollabPresencePeer = {
  peerId: string;
  displayName: string;
  projectId: string;
  tool?: string;
  lastSeenAt: number;
};

export type CollabDraftPayload = {
  projectId: string;
  peerId: string;
  tool?: string;
  draft: string;
  updatedAt: number;
};

export type CollabRoomEvent =
  | { type: "presence"; peers: CollabPresencePeer[] }
  | { type: "draft"; payload: CollabDraftPayload }
  | { type: "ping"; at: number };

const CHANNEL_PREFIX = "cps-collab-";

export function collabChannelName(projectId: string): string {
  return `${CHANNEL_PREFIX}${projectId.trim() || "default"}`;
}

export function createCollabPeerId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `peer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function pruneStalePeers(
  peers: CollabPresencePeer[],
  now = Date.now(),
  ttlMs = 15_000,
): CollabPresencePeer[] {
  return peers.filter((peer) => now - peer.lastSeenAt <= ttlMs);
}

export function upsertPresencePeer(
  peers: CollabPresencePeer[],
  next: CollabPresencePeer,
): CollabPresencePeer[] {
  const without = peers.filter((peer) => peer.peerId !== next.peerId);
  return pruneStalePeers([...without, next]);
}

export function shouldWarnRemoteDraft(
  localUpdatedAt: number | undefined,
  remote: CollabDraftPayload,
  selfPeerId: string,
): boolean {
  if (remote.peerId === selfPeerId) {
    return false;
  }
  if (!localUpdatedAt) {
    return true;
  }
  return remote.updatedAt > localUpdatedAt + 250;
}
