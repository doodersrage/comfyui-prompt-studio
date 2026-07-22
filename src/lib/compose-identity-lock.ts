import { getFaceDetailerHealth } from "./face-detailer-health";

/** Default IP-Adapter weight for Compose identity lock (Edit + IP can overfit if higher). */
export const DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH = 0.5;

export type ComposeIdentityLockState = {
  enabled: boolean;
  strength: number;
};

export function normalizeComposeIdentityLockStrength(value: unknown): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH;
  }
  return Math.min(1, Math.max(0.05, Math.round(n * 100) / 100));
}

export function normalizeComposeIdentityLock(
  enabled: unknown,
  strength: unknown,
): ComposeIdentityLockState {
  return {
    enabled: enabled === true,
    strength: normalizeComposeIdentityLockStrength(strength),
  };
}

export type ComposeIdentityLockQueuePatch = {
  ipAdapterImageFilename: string;
  ipAdapterImageFilenames: string[];
  ipAdapterStrength: number;
};

/** Queue-time IP-Adapter patch when lock is on and Figure 1 was uploaded. */
export function buildComposeIdentityLockQueuePatch(input: {
  enabled: boolean;
  strength?: number;
  inputImageFilename?: string | null;
}): ComposeIdentityLockQueuePatch | null {
  if (!input.enabled) {
    return null;
  }
  const filename = input.inputImageFilename?.trim();
  if (!filename) {
    return null;
  }
  const strength = normalizeComposeIdentityLockStrength(input.strength);
  return {
    ipAdapterImageFilename: filename,
    ipAdapterImageFilenames: [filename],
    ipAdapterStrength: strength,
  };
}

export function formatComposeIdentityLockHint(input: {
  enabled: boolean;
  strength?: number;
}): string {
  if (!input.enabled) {
    return "Off — Edit refs only (no IP-Adapter identity pull).";
  }
  const strength = normalizeComposeIdentityLockStrength(input.strength);
  const face = getFaceDetailerHealth();
  const faceNote =
    face.status === "ready" || face.status === "detected"
      ? `FaceDetailer ${face.label.toLowerCase()} — optional gallery Face detail after queue.`
      : "FaceDetailer not configured — IP-Adapter only.";
  return `Lock Figure 1 via IP-Adapter @ ${strength.toFixed(2)}. ${faceNote}`;
}
