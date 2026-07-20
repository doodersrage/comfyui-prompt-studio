export type ClothingCategory =
  | "outfit"
  | "top"
  | "bottom"
  | "outerwear"
  | "footwear"
  | "accessory"
  | "swimwear"
  | "intimate"
  | "hosiery"
  | "formalwear"
  | "dressy-accessory"
  | "sleepwear"
  | "underwear"
  | "socks"
  | "headwear"
  | "traditional";

const WARDROBE_CATEGORIES: ClothingCategory[] = [
  "outfit",
  "top",
  "bottom",
  "outerwear",
  "swimwear",
  "intimate",
  "formalwear",
  "sleepwear",
  "underwear",
  "traditional",
];

export const CLOTHING_CATALOG_FIELD_KEYS = [
  "wardrobeCatalog",
  "footwearCatalog",
  "accessoriesCatalog",
] as const;

export type ClothingCatalogFieldKey = (typeof CLOTHING_CATALOG_FIELD_KEYS)[number];

export function getClothingCatalogFieldCategories(
  key: ClothingCatalogFieldKey,
): ClothingCategory[] {
  switch (key) {
    case "wardrobeCatalog":
      return WARDROBE_CATEGORIES;
    case "footwearCatalog":
      return ["footwear"];
    case "accessoriesCatalog":
      return ["accessory", "dressy-accessory", "hosiery", "socks", "headwear"];
    default:
      return [];
  }
}
