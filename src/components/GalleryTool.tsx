"use client";

import GalleryImportSection from "@/components/GalleryImportSection";
import ComfyUiGalleryPanel from "@/components/ComfyUiGalleryPanel";
import {
  ToolBadge,
  ToolLayout,
} from "@/components/ui/ToolPageShell";

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
