import { getFaceDetailerHealth } from "./face-detailer-health";

/** Default IP-Adapter weight for Compose identity lock (Edit + IP can overfit if higher). */
export const DEFAULT_COMPOSE_IDENTITY_LOCK_STRENGTH = 0.5;

export const DEFAULT_COMPOSE_IDENTITY_KIND = "ipadapter" as const;

export type ComposeIdentityKind =
  | "ipadapter"
  | "instantid"
  | "pulid"
  | "auto";

export type ComposeIdentityLockState = {
  enabled: boolean;
  strength: number;
  identityKind: ComposeIdentityKind;
};

export function normalizeComposeIdentityKind(
  value: unknown,
): ComposeIdentityKind {
  if (
    value === "ipadapter" ||
    value === "instantid" ||
    value === "pulid" ||
    value === "auto"
  ) {
    return value;
  }
  return DEFAULT_COMPOSE_IDENTITY_KIND;
}

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
  identityKind?: unknown,
): ComposeIdentityLockState {
  return {
    enabled: enabled === true,
    strength: normalizeComposeIdentityLockStrength(strength),
    identityKind: normalizeComposeIdentityKind(identityKind),
  };
}

export type ComposeIdentityLockQueuePatch = {
  ipAdapterImageFilename: string;
  ipAdapterImageFilenames: string[];
  ipAdapterStrength: number;
  identityKind: ComposeIdentityKind;
};

/** Queue-time identity patch when lock is on and Figure 1 was uploaded. */
export function buildComposeIdentityLockQueuePatch(input: {
  enabled: boolean;
  strength?: number;
  identityKind?: unknown;
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
  const identityKind = normalizeComposeIdentityKind(input.identityKind);
  return {
    ipAdapterImageFilename: filename,
    ipAdapterImageFilenames: [filename],
    ipAdapterStrength: strength,
    identityKind,
  };
}

export function formatComposeIdentityLockHint(input: {
  enabled: boolean;
  strength?: number;
  identityKind?: unknown;
}): string {
  if (!input.enabled) {
    return "Off — Edit refs only (no identity pull).";
  }
  const strength = normalizeComposeIdentityLockStrength(input.strength);
  const identityKind = normalizeComposeIdentityKind(input.identityKind);
  const face = getFaceDetailerHealth();
  const faceNote =
    face.status === "ready" || face.status === "detected"
      ? `FaceDetailer ${face.label.toLowerCase()} — optional gallery Face detail after queue.`
      : "FaceDetailer not configured.";

  if (identityKind === "instantid") {
    return `Lock Figure 1 via InstantID @ ${strength.toFixed(2)}. ${faceNote}`;
  }
  if (identityKind === "pulid") {
    return `Lock Figure 1 via PuLID @ ${strength.toFixed(2)}. ${faceNote}`;
  }
  if (identityKind === "auto") {
    return `Lock Figure 1 via InstantID/PuLID auto @ ${strength.toFixed(2)}. ${faceNote}`;
  }
  return `Lock Figure 1 via IP-Adapter @ ${strength.toFixed(2)}. ${faceNote}`;
}

/** True when queue should prefer InstantID/PuLID insert over IP-Adapter. */
export function composeIdentityUsesIdentityChain(
  identityKind: unknown,
): boolean {
  const kind = normalizeComposeIdentityKind(identityKind);
  return kind === "instantid" || kind === "pulid" || kind === "auto";
}
