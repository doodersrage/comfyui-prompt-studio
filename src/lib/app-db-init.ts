import { initBrowserStorage, isBrowserStorageReady } from "./browser-storage";
import { hydrateGalleryStore, isGalleryStoreReady } from "./gallery-db-store";

export async function initAppDb(): Promise<void> {
  await initBrowserStorage();
  await hydrateGalleryStore();
}

export async function initGalleryStore(): Promise<void> {
  return initAppDb();
}

export function isAppDbReady(): boolean {
  return isBrowserStorageReady() && isGalleryStoreReady();
}

export { isGalleryStoreReady } from "./gallery-db-store";
