import { ALL_CLOTHING_CATALOG_ENTRIES } from "./clothing-catalog-batches";
import { ALL_EXTRA_SCENE_LOCATIONS } from "./location-catalog-batches";

export type CatalogClothingEntry = {
  id: string;
  label: string;
  category: string;
  contexts: readonly string[];
};

export type CatalogLocationEntry = {
  id: string;
  label: string;
  source: "handcrafted" | "composed";
};

export function listCatalogClothing(options?: {
  query?: string;
  limit?: number;
  ids?: readonly string[];
  categories?: readonly string[];
}): CatalogClothingEntry[] {
  const query = options?.query?.trim().toLowerCase() ?? "";
  const limit = options?.limit ?? 200;
  const idSet =
    options?.ids && options.ids.length > 0
      ? new Set(options.ids.map((id) => id.trim()).filter(Boolean))
      : null;
  const categorySet =
    options?.categories && options.categories.length > 0
      ? new Set(options.categories.map((category) => category.trim()).filter(Boolean))
      : null;

  return ALL_CLOTHING_CATALOG_ENTRIES.filter((entry) => {
    if (idSet && !idSet.has(entry.id)) {
      return false;
    }
    if (categorySet && !categorySet.has(entry.category)) {
      return false;
    }
    if (!query) {
      return true;
    }
    return (
      entry.label.toLowerCase().includes(query) ||
      entry.id.toLowerCase().includes(query) ||
      entry.category.toLowerCase().includes(query)
    );
  })
    .slice(0, limit)
    .map((entry) => ({
      id: entry.id,
      label: entry.label,
      category: entry.category,
      contexts: entry.contexts ?? [],
    }));
}

export function listCatalogLocations(options?: {
  query?: string;
  limit?: number;
}): CatalogLocationEntry[] {
  const query = options?.query?.trim().toLowerCase() ?? "";
  const limit = options?.limit ?? 200;

  return ALL_EXTRA_SCENE_LOCATIONS.filter((label) => {
    if (!query) {
      return true;
    }
    return label.toLowerCase().includes(query);
  })
    .slice(0, limit)
    .map((label, index) => ({
      id: `loc-${index}`,
      label,
      source: "handcrafted" as const,
    }));
}

export function searchCatalog(query: string) {
  return {
    clothing: listCatalogClothing({ query, limit: 50 }),
    locations: listCatalogLocations({ query, limit: 50 }),
  };
}
