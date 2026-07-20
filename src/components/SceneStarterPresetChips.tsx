"use client";

import { useMemo, useState } from "react";
import {
  SCENE_STARTER_CATEGORIES,
  SCENE_STARTER_PRESETS,
  SCENE_STARTER_TAG_OPTIONS,
  filterSceneStarters,
  type SceneStarterCategory,
  type SceneStarterFramingFilter,
  type SceneStarterPreset,
} from "@/lib/scene-starter-presets";
import { ROUTE_TINT_CLASSES, type ToolAccent } from "@/lib/tool-theme";
import { TextInput } from "@/components/ui/Field";
import { Button } from "@/components/ui/Button";

const FRAMING_OPTIONS: { value: SceneStarterFramingFilter; label: string }[] = [
  { value: "all", label: "All framing" },
  { value: "portrait", label: "Portrait" },
  { value: "full-body", label: "Full-body" },
  { value: "action", label: "Action" },
];

const PRESET_BATCH = 48;

type SceneStarterPresetChipsProps = {
  selectedId?: string;
  onSelect: (preset: SceneStarterPreset) => void;
  category?: SceneStarterCategory | "all";
  onCategoryChange?: (category: SceneStarterCategory | "all") => void;
  mode?: "solo" | "duo" | "all";
  accent?: ToolAccent;
  title?: string;
};

export default function SceneStarterPresetChips({
  selectedId,
  onSelect,
  category = "all",
  onCategoryChange,
  mode = "all",
  accent = "violet",
  title = "Scene presets",
}: SceneStarterPresetChipsProps) {
  const [localCategory, setLocalCategory] = useState<SceneStarterCategory | "all">(
    category,
  );
  const [query, setQuery] = useState("");
  const [framing, setFraming] = useState<SceneStarterFramingFilter>("all");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [visibleCount, setVisibleCount] = useState(PRESET_BATCH);

  const activeCategory = onCategoryChange ? category : localCategory;
  const activeChipClass = ROUTE_TINT_CLASSES[accent].badge;

  const filtered = useMemo(
    () =>
      filterSceneStarters(
        SCENE_STARTER_PRESETS,
        { category: activeCategory, framing, query, tags: activeTags },
        mode,
      ),
    [activeCategory, framing, query, activeTags, mode],
  );

  const visiblePresets = filtered.slice(0, visibleCount);
  const filtersActive =
    query.trim().length > 0 ||
    framing !== "all" ||
    activeTags.length > 0 ||
    activeCategory !== "all";

  const setCategory = (next: SceneStarterCategory | "all") => {
    if (onCategoryChange) {
      onCategoryChange(next);
    } else {
      setLocalCategory(next);
    }
    setVisibleCount(PRESET_BATCH);
  };

  const toggleTag = (tag: string) => {
    setActiveTags((previous) =>
      previous.includes(tag)
        ? previous.filter((entry) => entry !== tag)
        : [...previous, tag],
    );
    setVisibleCount(PRESET_BATCH);
  };

  const clearFilters = () => {
    setQuery("");
    setFraming("all");
    setActiveTags([]);
    setCategory("all");
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-medium text-zinc-200">{title}</p>
        <p className="type-caption">
          {filtered.length} of {SCENE_STARTER_PRESETS.length} presets
        </p>
      </div>

      <TextInput
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setVisibleCount(PRESET_BATCH);
        }}
        placeholder="Search presets by name, mood, or keywords…"
        aria-label="Search scene presets"
      />

      <div className="flex flex-wrap gap-2">
        {SCENE_STARTER_CATEGORIES.map((item) => (
          <button
            key={item.value}
            type="button"
            onClick={() => setCategory(item.value)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              activeCategory === item.value
                ? activeChipClass
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {FRAMING_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            onClick={() => {
              setFraming(option.value);
              setVisibleCount(PRESET_BATCH);
            }}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
              framing === option.value
                ? activeChipClass
                : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {SCENE_STARTER_TAG_OPTIONS.filter((tag) => mode !== "solo" || tag.id !== "duo").map(
          (tag) => (
            <button
              key={tag.id}
              type="button"
              onClick={() => toggleTag(tag.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                activeTags.includes(tag.id)
                  ? activeChipClass
                  : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
              }`}
            >
              {tag.label}
            </button>
          ),
        )}
      </div>

      {filtersActive ? (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          Clear filters
        </Button>
      ) : null}

      <div className="ui-surface-inset max-h-56 space-y-2 overflow-y-auto p-2">
        {filtered.length === 0 ? (
          <p className="type-caption px-1 py-4 text-center">
            No presets match these filters. Try clearing search or tags.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {visiblePresets.map((preset) => {
              const active = selectedId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  title={preset.hints}
                  onClick={() => onSelect(preset)}
                  className={`rounded-lg border px-3 py-1.5 text-left text-xs font-medium transition ${
                    active
                      ? activeChipClass
                      : "border-zinc-700 text-zinc-400 hover:border-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  <span className="block">{preset.label}</span>
                  {preset.duo ? (
                    <span className="type-caption mt-0.5 block text-zinc-500">duo</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {filtered.length > visibleCount ? (
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setVisibleCount((count) => count + PRESET_BATCH)}
        >
          Show more ({filtered.length - visibleCount} remaining)
        </Button>
      ) : null}
    </div>
  );
}
