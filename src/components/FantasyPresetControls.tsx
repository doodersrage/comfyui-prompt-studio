"use client";

import { useMemo } from "react";
import {
  FANTASY_PRESET_UI_SECTIONS,
  clearFantasyPresetPatch,
  countFantasyPresetSectionSelections,
  countFantasyPresetSelections,
  getSelectOptionsForFantasyPresetKey,
  presetOptionsFromFantasyCache,
  type FantasyPresetOptions,
  type FantasyPresetUiField,
  type FantasyPresetUiSection,
} from "@/lib/fantasy-options";
import type { FantasyToolCache } from "@/lib/settings-cache";
import { SelectInput, TextInput } from "@/components/ui/Field";

function FantasySelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ value: string; label: string }>;
  onChange: (value: string) => void;
}) {
  return (
    <label className="space-y-2">
      <span className="type-heading">{label}</span>
      <SelectInput
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option.value || "default"} value={option.value}>
            {option.label}
          </option>
        ))}
      </SelectInput>
    </label>
  );
}

function PresetField({
  field,
  settings,
  onChange,
}: {
  field: FantasyPresetUiField;
  settings: FantasyToolCache;
  onChange: (patch: Partial<FantasyToolCache>) => void;
}) {
  if (field.kind === "select") {
    return (
      <FantasySelect
        label={field.label}
        value={(settings[field.key] as string | undefined) ?? ""}
        options={getSelectOptionsForFantasyPresetKey(field.key)}
        onChange={(value) => onChange({ [field.key]: value })}
      />
    );
  }

  return (
    <label className="space-y-2 sm:col-span-2">
      <span className="type-heading">{field.label}</span>
      <TextInput
        value={settings.fantasyDetail ?? ""}
        onChange={(event) => onChange({ fantasyDetail: event.target.value })}
        placeholder={field.placeholder}
      />
    </label>
  );
}

function PresetSection({
  section,
  settings,
  presetOptions,
  onChange,
}: {
  section: FantasyPresetUiSection;
  settings: FantasyToolCache;
  presetOptions: FantasyPresetOptions;
  onChange: (patch: Partial<FantasyToolCache>) => void;
}) {
  const sectionCount = countFantasyPresetSectionSelections(
    presetOptions,
    section.id,
  );

  return (
    <details
      className="group rounded-xl border border-zinc-800 bg-zinc-950/40"
      open={section.defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <div>
          <p className="text-sm font-medium text-zinc-200">{section.title}</p>
          {section.description ? (
            <p className="text-xs text-zinc-500">{section.description}</p>
          ) : null}
        </div>
        <span className="text-xs text-zinc-500">
          {sectionCount > 0 ? `${sectionCount} set` : "Optional"}
          <span className="ml-2 text-zinc-600 transition group-open:rotate-180">
            ▾
          </span>
        </span>
      </summary>
      <div className="grid gap-3 border-t border-zinc-800 px-4 py-4 sm:grid-cols-2">
        {section.fields.map((field) => (
          <PresetField
            key={field.key}
            field={field}
            settings={settings}
            onChange={onChange}
          />
        ))}
      </div>
    </details>
  );
}

type FantasyPresetControlsProps = {
  mounted: boolean;
  settings: FantasyToolCache;
  onChange: (patch: Partial<FantasyToolCache>) => void;
};

export default function FantasyPresetControls({
  mounted,
  settings,
  onChange,
}: FantasyPresetControlsProps) {
  const presetOptions = useMemo(
    () => presetOptionsFromFantasyCache(settings),
    [settings],
  );
  const selectionCount = countFantasyPresetSelections(presetOptions);

  if (!mounted) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-heading">Fantasy presets (optional)</p>
        <div className="flex items-center gap-2 text-xs">
          {selectionCount > 0 ? (
            <span className="text-violet-300">{selectionCount} active</span>
          ) : (
            <span className="text-zinc-500">Optional refinements</span>
          )}
          {selectionCount > 0 ? (
            <button
              type="button"
              onClick={() => onChange(clearFantasyPresetPatch())}
              className="rounded-lg border border-zinc-700 px-2 py-1 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {FANTASY_PRESET_UI_SECTIONS.map((section) => (
        <PresetSection
          key={section.id}
          section={section}
          settings={settings}
          presetOptions={presetOptions}
          onChange={onChange}
        />
      ))}
    </div>
  );
}
