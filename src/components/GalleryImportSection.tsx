"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import { ToolPageSkeleton } from "@/components/ui/ViewState";

const GalleryImportTools = dynamic(() => import("@/components/GalleryImportTools"), {
  loading: () => <ToolPageSkeleton label="Loading import tools" />,
});

export default function GalleryImportSection() {
  const [expanded, setExpanded] = useState(true);

  return (
    <details
      className="ui-collapsible group"
      open
      onToggle={(event) => {
        setExpanded((event.currentTarget as HTMLDetailsElement).open);
      }}
    >
      <summary className="list-none marker:content-none [&::-webkit-details-marker]:hidden cursor-pointer">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 space-y-1.5">
            <p className="type-heading">Import & queue tools</p>
            <p className="type-caption">Sidecar, PNG, ComfyUI history</p>
          </div>
          <span
            aria-hidden
            className="type-caption mt-0.5 shrink-0 transition group-open:rotate-180"
          >
            ▾
          </span>
        </div>
      </summary>
      <div className="mt-4 space-y-4 border-t border-zinc-800/80 pt-4">
        {expanded ? <GalleryImportTools /> : null}
      </div>
    </details>
  );
}
