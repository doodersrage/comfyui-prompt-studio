import type { CatalogClothingEntry } from "./catalog-index";

let clothingCatalogPromise: Promise<typeof import("./clothing-catalog")> | null =
  null;

export function loadClothingCatalogModule() {
  if (!clothingCatalogPromise) {
    clothingCatalogPromise = import("./clothing-catalog");
  }
  return clothingCatalogPromise;
}

const labelCache = new Map<string, string | null>();

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
      }
    } catch {
      // Fall back to lazy module lookup below.
    }
  }

  const unresolved = ids
    .map((id) => id.trim())
    .filter(Boolean)
    .filter((id) => !labelCache.has(id));

  if (unresolved.length > 0) {
    const catalog = await loadClothingCatalogModule();
    for (const id of unresolved) {
      labelCache.set(id, catalog.getClothingLabel(id));
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
