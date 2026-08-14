/** Hard-pin queue to the host that holds the identity file (not preferredComfyHost). */
export function resolveIdentityLockApiUrl(shared: {
  ipAdapterImageFilename?: string;
  ipAdapterComfyUrl?: string;
}): string | undefined {
  if (!shared.ipAdapterImageFilename?.trim()) {
    return undefined;
  }
  return shared.ipAdapterComfyUrl?.trim() || undefined;
}
