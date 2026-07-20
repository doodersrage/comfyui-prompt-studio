/** Fast stable fingerprint for workflow JSON change detection. */
export function workflowContentHash(raw: string): string {
  const text = raw.trim();
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
