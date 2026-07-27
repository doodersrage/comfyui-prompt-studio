/**
 * Warm the browser (and view-proxy) cache for gallery mid-res lightbox URLs
 * before the lightbox mounts — hover/focus intent beats cold first open.
 */

const prefetchedUrls = new Set<string>();

export function prefetchGalleryImageUrl(url: string | null | undefined): void {
  const trimmed = url?.trim();
  if (!trimmed || typeof window === "undefined") {
    return;
  }
  if (prefetchedUrls.has(trimmed)) {
    return;
  }
  prefetchedUrls.add(trimmed);
  const img = new Image();
  img.decoding = "async";
  img.src = trimmed;
}

export function prefetchGalleryImageUrls(urls: readonly string[]): void {
  for (const url of urls) {
    prefetchGalleryImageUrl(url);
  }
}
