import { Suspense } from "react";
import PageCanvas from "@/components/ui/PageCanvas";
import GalleryTool from "@/components/GalleryTool";
import GalleryPanelSkeleton from "@/components/gallery/GalleryPanelSkeleton";

export default function GalleryPage() {
  return (
    <PageCanvas accent="neutral">
      <Suspense fallback={<GalleryPanelSkeleton showFilters />}>
        <GalleryTool />
      </Suspense>
    </PageCanvas>
  );
}
