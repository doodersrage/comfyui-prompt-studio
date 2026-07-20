let storeWarmed = false;

/** Warm gallery IndexedDB + route chunks before navigation. */
export function prefetchGalleryPage(): void {
  if (typeof window === "undefined") {
    return;
  }

  void import("@/components/GalleryTool");
  void import("@/components/ComfyUiGalleryPanel");

  if (storeWarmed) {
    return;
  }
  storeWarmed = true;
  void import("@/lib/gallery-db-store").then(({ warmGalleryStore }) => warmGalleryStore());
}
