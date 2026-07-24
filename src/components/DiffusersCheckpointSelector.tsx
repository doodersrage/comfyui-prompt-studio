"use client";

import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "@/components/ui/ViewState";
import { scheduleAfterCommit } from "@/lib/schedule-after-commit";
import { DIFFUSERS_DEFAULT_MODEL } from "@/lib/diffusers-defaults";
import { loadEngineSettings } from "@/lib/engine-settings";

export type DiffusersCheckpointOption = {
  id: string;
  label: string;
  kind: "single_file" | "diffusers_dir";
  family: "sdxl" | "sd15" | "other";
  default: boolean;
};

type DiffusersCheckpointSelectorProps = {
  value: string;
  onChange: (modelId: string) => void;
  id?: string;
};

async function fetchCheckpoints(
  engineUrl?: string,
): Promise<DiffusersCheckpointOption[]> {
  const params = new URLSearchParams();
  if (engineUrl?.trim()) {
    params.set("engineUrl", engineUrl.trim());
  }
  const query = params.toString();
  const response = await fetch(
    query ? `/api/diffusers/models?${query}` : "/api/diffusers/models",
  );
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  const data = (await response.json()) as {
    models?: DiffusersCheckpointOption[];
  };
  return Array.isArray(data.models) ? data.models : [];
}

export default function DiffusersCheckpointSelector({
  value,
  onChange,
  id,
}: DiffusersCheckpointSelectorProps) {
  const [query, setQuery] = useState("");
  const [family, setFamily] = useState<"all" | "sdxl" | "sd15" | "other">("all");
  const [models, setModels] = useState<DiffusersCheckpointOption[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      setLoading(true);
      const engineUrl = loadEngineSettings().diffusersApiUrl;
      void fetchCheckpoints(engineUrl)
        .then((next) => {
          if (cancelled) {
            return;
          }
          setModels(next);
          setError(null);
          if (
            next.length > 0 &&
            !next.some((item) => item.id === value)
          ) {
            const preferred =
              next.find((item) => item.default)?.id ||
              next.find((item) => item.id === DIFFUSERS_DEFAULT_MODEL)?.id ||
              next[0]!.id;
            onChange(preferred);
          }
        })
        .catch((err: unknown) => {
          if (!cancelled) {
            setModels([]);
            setError(
              err instanceof Error
                ? err.message
                : "Could not load Diffusers checkpoints.",
            );
          }
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
          }
        });
    };
    scheduleAfterCommit(load);
    return () => {
      cancelled = true;
    };
    // Re-fetch when engine URL changes via settings; value/onChange intentionally omitted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return models.filter((item) => {
      if (family !== "all" && item.family !== family) {
        return false;
      }
      if (!needle) {
        return true;
      }
      return (
        item.label.toLowerCase().includes(needle) ||
        item.id.toLowerCase().includes(needle) ||
        item.family.toLowerCase().includes(needle)
      );
    });
  }, [family, models, query]);

  const selected = models.find((item) => item.id === value);

  return (
    <div className="space-y-3" id={id}>
      <div className="rounded-[var(--radius-md)] border border-[var(--tint-info-border)] bg-[var(--tint-info-bg)]/40 px-3 py-2.5">
        <p className="type-caption text-[var(--tint-info-text)]">
          Diffusers txt2img · local SDXL/SD1.5 checkpoints from the engine
          (Comfy `models/checkpoints` + service folder). Qwen/Flux packs stay on
          ComfyUI.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search checkpoints…"
          aria-label="Search Diffusers checkpoints"
          className="ui-input min-h-11 w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body-lg"
        />
        <select
          value={family}
          onChange={(event) =>
            setFamily(event.target.value as "all" | "sdxl" | "sd15" | "other")
          }
          aria-label="Filter by checkpoint family"
          className="ui-input min-h-11 w-full px-3 py-[var(--input-padding-y)] type-body"
        >
          <option value="all">All families ({models.length})</option>
          <option value="sdxl">
            SDXL ({models.filter((item) => item.family === "sdxl").length})
          </option>
          <option value="sd15">
            SD1.5 ({models.filter((item) => item.family === "sd15").length})
          </option>
          <option value="other">
            Other ({models.filter((item) => item.family === "other").length})
          </option>
        </select>
      </div>

      <p className="type-caption">
        {loading
          ? "Loading checkpoints…"
          : `${filtered.length} checkpoint${filtered.length === 1 ? "" : "s"}`}
        {selected ? (
          <>
            {" · "}
            Selected:{" "}
            <span className="text-[var(--text-secondary)]">{selected.label}</span>
          </>
        ) : null}
      </p>

      {error ? (
        <EmptyState
          compact
          icon="alert"
          title="Diffusers unreachable"
          description={error}
        />
      ) : (
        <div className="sidebar-scroll max-h-80 space-y-2 overflow-y-auto pr-1">
          {!loading && filtered.length === 0 ? (
            <EmptyState
              compact
              icon="search"
              title="No checkpoints found"
              description="Drop SDXL .safetensors into Comfy models/checkpoints or the Diffusers service checkpoints folder."
            />
          ) : (
            filtered.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => onChange(entry.id)}
                data-active={value === entry.id ? "true" : "false"}
                className={`ui-chip w-full px-4 py-3 text-left ${
                  value === entry.id ? "" : "!items-start"
                }`}
              >
                <div className="flex w-full flex-wrap items-center justify-between gap-2">
                  <span
                    className={`type-heading ${
                      value === entry.id
                        ? "text-[var(--accent-text)]"
                        : "text-[var(--text-primary)]"
                    }`}
                  >
                    {entry.label}
                    {entry.default ? (
                      <span className="ml-2 type-overline !normal-case">
                        default
                      </span>
                    ) : null}
                  </span>
                  <span className="type-overline !normal-case !tracking-normal font-mono">
                    {entry.family.toUpperCase()}
                  </span>
                </div>
                <p className="type-caption mt-1 w-full font-mono">{entry.id}</p>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
