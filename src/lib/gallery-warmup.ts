let prefetched = false;

/** Warm gallery IndexedDB + route chunks before navigation. */
export function prefetchGalleryPage(): void {
  if (typeof window === "undefined" || prefetched) {
    return;
  }
  prefetched = true;

  void import("@/components/GalleryTool");
  void import("@/components/ComfyUiGalleryPanel");
  void import("@/lib/gallery-db-store").then(({ warmGalleryStore }) => warmGalleryStore());
}
