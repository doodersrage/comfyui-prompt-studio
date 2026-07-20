import dynamic from "next/dynamic";
import PageCanvas from "@/components/ui/PageCanvas";
import { ToolPageSkeleton } from "@/components/ui/ViewState";

const GalleryTool = dynamic(() => import("@/components/GalleryTool"), {
  loading: () => <ToolPageSkeleton label="Loading gallery" />,
});

export default function GalleryPage() {
  return (
    <PageCanvas accent="neutral">
      <GalleryTool />
    </PageCanvas>
  );
}
