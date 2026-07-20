"use client";

import dynamic from "next/dynamic";
import GalleryImportSection from "@/components/GalleryImportSection";
import GalleryPanelSkeleton from "@/components/gallery/GalleryPanelSkeleton";
import {
  ToolBadge,
  ToolLayout,
} from "@/components/ui/ToolPageShell";

const ComfyUiGalleryPanel = dynamic(() => import("@/components/ComfyUiGalleryPanel"), {
  loading: () => <GalleryPanelSkeleton showFilters />,
});

const ACCENT = "neutral" as const;

export default function GalleryTool() {
  return (
    <ToolLayout
      accent={ACCENT}
      width="wide"
      badge={<ToolBadge accent={ACCENT}>Gallery</ToolBadge>}
      title="ComfyUI Gallery"
      description="Browse outputs, review and compare variants, run experiments, and queue follow-up work from one place."
    >
      <ComfyUiGalleryPanel showHeader showFilters />
      <GalleryImportSection />
    </ToolLayout>
  );
}
