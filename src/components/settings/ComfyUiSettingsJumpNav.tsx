"use client";

import { useMemo, useState } from "react";
import { ChipButton } from "@/components/ui/Field";
import { accentFocusClass } from "@/components/ui/ToolPageShell";
import {
  COMFYUI_SETTINGS_SECTIONS,
  filterComfyUiSettingsSections,
  type ComfyUiSettingsSectionId,
} from "@/lib/settings-comfyui-nav";

export default function ComfyUiSettingsJumpNav({
  activeSection,
  onJump,
}: {
  activeSection?: ComfyUiSettingsSectionId | null;
  onJump: (section: ComfyUiSettingsSectionId) => void;
}) {
  const [query, setQuery] = useState("");
  const sections = useMemo(
    () => filterComfyUiSettingsSections(query),
    [query],
  );

  return (
    <div className="ui-surface-inset space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="type-overline text-[var(--text-muted)]">Jump to</p>
          <p className="type-caption mt-1 text-zinc-500">
            Search or jump within the ComfyUI settings tab.
          </p>
        </div>
        <label className="block min-w-[12rem] flex-1 sm:max-w-xs">
          <span className="sr-only">Search ComfyUI settings sections</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search sections…"
            className={`ui-input w-full text-sm ${accentFocusClass()}`}
          />
        </label>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {(sections.length ? sections : COMFYUI_SETTINGS_SECTIONS).map((section) => (
          <ChipButton
            key={section.id}
            active={activeSection === section.id}
            onClick={() => onJump(section.id)}
          >
            {section.label}
          </ChipButton>
        ))}
      </div>
      {query.trim() && sections.length === 0 ? (
        <p className="type-caption text-zinc-500">No sections match “{query.trim()}”.</p>
      ) : null}
    </div>
  );
}
