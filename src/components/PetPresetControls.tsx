"use client";

import { useMemo } from "react";
import {
  PET_PRESET_UI_SECTIONS,
  clearPetPresetPatch,
  countPetPresetSectionSelections,
  countPetPresetSelections,
  getSelectOptionsForPetPresetKey,
  presetOptionsFromPetCache,
  type PetPresetOptions,
  type PetPresetUiField,
  type PetPresetUiSection,
} from "@/lib/pet-options";
import type { PetToolCache } from "@/lib/settings-cache";
import { SelectInput, TextInput } from "@/components/ui/Field";

function PetSelect({
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
  field: PetPresetUiField;
  settings: PetToolCache;
  onChange: (patch: Partial<PetToolCache>) => void;
}) {
  if (field.kind === "select") {
    return (
      <PetSelect
        label={field.label}
        value={(settings[field.key] as string | undefined) ?? ""}
        options={getSelectOptionsForPetPresetKey(field.key)}
        onChange={(value) => onChange({ [field.key]: value })}
      />
    );
  }

  return (
    <label className="space-y-2 sm:col-span-2">
      <span className="type-heading">{field.label}</span>
      <TextInput
        value={settings.petDetail ?? ""}
        onChange={(event) => onChange({ petDetail: event.target.value })}
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
  section: PetPresetUiSection;
  settings: PetToolCache;
  presetOptions: PetPresetOptions;
  onChange: (patch: Partial<PetToolCache>) => void;
}) {
  const sectionCount = countPetPresetSectionSelections(presetOptions, section.id);

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

type PetPresetControlsProps = {
  mounted: boolean;
  settings: PetToolCache;
  onChange: (patch: Partial<PetToolCache>) => void;
};

export default function PetPresetControls({
  mounted,
  settings,
  onChange,
}: PetPresetControlsProps) {
  const presetOptions = useMemo(
    () => presetOptionsFromPetCache(settings),
    [settings],
  );
  const selectionCount = countPetPresetSelections(presetOptions);

  if (!mounted) {
    return null;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="type-heading">Pet presets (optional)</p>
        <div className="flex items-center gap-2 text-xs">
          {selectionCount > 0 ? (
            <span className="text-rose-300">{selectionCount} active</span>
          ) : (
            <span className="text-zinc-500">Optional refinements</span>
          )}
          {selectionCount > 0 ? (
            <button
              type="button"
              onClick={() => onChange(clearPetPresetPatch())}
              className="rounded-lg border border-zinc-700 px-2 py-1 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            >
              Clear
            </button>
          ) : null}
        </div>
      </div>

      {PET_PRESET_UI_SECTIONS.map((section) => (
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
