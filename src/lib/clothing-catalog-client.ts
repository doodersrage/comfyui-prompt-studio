import type { CatalogClothingEntry } from "./catalog-index";
import type { ClothingCatalogFieldKey } from "./clothing-catalog-fields";

const labelCache = new Map<string, string | null>();

type ClothingSelectOption = {
  value: string;
  label: string;
  group?: string;
};

const selectOptionsCache = new Map<string, ClothingSelectOption[]>();
const selectOptionsInflight = new Map<string, Promise<ClothingSelectOption[]>>();

export async function fetchClothingLabels(
  ids: readonly string[],
): Promise<Map<string, string | null>> {
  const pending = ids
    .map((id) => id.trim())
    .filter(Boolean)
    .filter((id) => !labelCache.has(id));

  if (pending.length > 0) {
    try {
      const response = await fetch(
        `/api/catalog?type=clothing&ids=${encodeURIComponent(pending.join(","))}`,
      );
      if (response.ok) {
        const data = (await response.json()) as {
          clothing?: CatalogClothingEntry[];
        };
        const returned = new Set<string>();
        for (const entry of data.clothing ?? []) {
          labelCache.set(entry.id, entry.label);
          returned.add(entry.id);
        }
        for (const id of pending) {
          if (!returned.has(id)) {
            labelCache.set(id, null);
          }
        }
      } else {
        for (const id of pending) {
          labelCache.set(id, null);
        }
      }
    } catch {
      for (const id of pending) {
        labelCache.set(id, null);
      }
    }
  }

  const result = new Map<string, string | null>();
  for (const id of ids) {
    const trimmed = id.trim();
    if (!trimmed) {
      continue;
    }
    result.set(trimmed, labelCache.get(trimmed) ?? null);
  }
  return result;
}

export function getCachedClothingLabel(id: string | undefined): string | null {
  if (!id?.trim()) {
    return null;
  }
  return labelCache.get(id.trim()) ?? null;
}

export async function fetchClothingSelectOptions(
  field: ClothingCatalogFieldKey,
  gender: "women" | "men" | "any" = "any",
): Promise<ClothingSelectOption[]> {
  const cacheKey = `${field}:${gender}`;
  const cached = selectOptionsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const inflight = selectOptionsInflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const request = (async () => {
    const fallback: ClothingSelectOption[] = [
      { value: "", label: "Default (random / LLM)" },
    ];

    try {
      const response = await fetch(
        `/api/catalog?type=clothing-options&field=${encodeURIComponent(field)}&gender=${encodeURIComponent(gender)}`,
      );
      if (!response.ok) {
        return fallback;
      }
      const data = (await response.json()) as {
        options?: ClothingSelectOption[];
      };
      const options =
        Array.isArray(data.options) && data.options.length > 0
          ? data.options
          : fallback;
      selectOptionsCache.set(cacheKey, options);
      return options;
    } catch {
      return fallback;
    } finally {
      selectOptionsInflight.delete(cacheKey);
    }
  })();

  selectOptionsInflight.set(cacheKey, request);
  return request;
}
