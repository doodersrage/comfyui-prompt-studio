import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";

function installWindowStorage() {
  const store = new Map<string, string>();
  const localStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: () => null,
    length: 0,
  } as Storage;
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  });
  return () => {
    if (originalWindow) {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    } else {
      // @ts-expect-error cleanup stub
      delete globalThis.window;
    }
  };
}

describe("settings-presets", () => {
  let restore: (() => void) | undefined;

  beforeEach(() => {
    restore = installWindowStorage();
  });

  afterEach(() => {
    restore?.();
  });

  it("lists iterate, keeper, and lab presets with labels/descriptions", async () => {
    const { SETTINGS_BROWSER_PRESETS } = await import("./settings-presets.ts");
    const ids = SETTINGS_BROWSER_PRESETS.map((preset) => preset.id);
    assert.deepEqual(ids, ["iterate", "keeper", "lab"]);
    for (const preset of SETTINGS_BROWSER_PRESETS) {
      assert.ok(preset.label.trim().length > 0);
      assert.ok(preset.description.trim().length > 0);
    }
  });

  it("returns undefined for an unknown preset id", async () => {
    const { getSettingsBrowserPreset } = await import("./settings-presets.ts");
    assert.equal(getSettingsBrowserPreset("bogus"), undefined);
    assert.equal(getSettingsBrowserPreset(undefined), undefined);
  });

  it("applies the iterate preset: draft queueing, no Max hold, calm auto-improve", async () => {
    const { applySettingsBrowserPreset } = await import("./settings-presets.ts");
    const { loadSettingsCache } = await import("./settings-cache.ts");
    const { loadComfyUiSettings } = await import("./comfyui-settings.ts");

    const applied = applySettingsBrowserPreset("iterate");
    assert.equal(applied, true);

    const shared = loadSettingsCache().shared;
    assert.equal(shared.queueQualityProfile, "draft");
    assert.equal(shared.sessionQueueMode, "iterate");
    assert.equal(shared.holdMaxUntilIdle, false);
    assert.equal(shared.vramGuardEnabled, true);

    const comfyUi = loadComfyUiSettings();
    assert.equal(comfyUi.autoMutateOnHighRating, false);
    assert.equal(comfyUi.autoRequeueMaxOnFiveStar, false);
    assert.equal(comfyUi.autoRequeueFinalOnHighRating, true);
  });

  it("applies the keeper preset: final queueing, balanced auto-improve", async () => {
    const { applySettingsBrowserPreset } = await import("./settings-presets.ts");
    const { loadSettingsCache } = await import("./settings-cache.ts");
    const { loadComfyUiSettings } = await import("./comfyui-settings.ts");

    applySettingsBrowserPreset("keeper");

    const shared = loadSettingsCache().shared;
    assert.equal(shared.queueQualityProfile, "final");
    assert.equal(shared.sessionQueueMode, "keeper");
    assert.equal(shared.vramGuardEnabled, true);

    const comfyUi = loadComfyUiSettings();
    assert.equal(comfyUi.autoMutateOnHighRating, true);
    assert.equal(comfyUi.autoSeedExperimentOnHighRating, true);
    assert.equal(comfyUi.autoRequeueMaxOnFiveStar, true);
  });

  it("applies the lab preset: max queueing, hold until idle, aggressive auto-improve", async () => {
    const { applySettingsBrowserPreset } = await import("./settings-presets.ts");
    const { loadSettingsCache } = await import("./settings-cache.ts");
    const { loadComfyUiSettings } = await import("./comfyui-settings.ts");

    applySettingsBrowserPreset("lab");

    const shared = loadSettingsCache().shared;
    assert.equal(shared.queueQualityProfile, "max");
    assert.equal(shared.holdMaxUntilIdle, true);
    assert.equal(shared.vramGuardEnabled, true);

    const comfyUi = loadComfyUiSettings();
    assert.equal(comfyUi.autoMutateOnHighRating, true);
    assert.equal(comfyUi.autoSeedExperimentOnFavorite, true);
    assert.equal(comfyUi.autoImg2imgRefineOnFiveStar, true);
  });

  it("does not clobber unrelated settings when applying a preset", async () => {
    const { applySettingsBrowserPreset } = await import("./settings-presets.ts");
    const { loadSettingsCache, saveSharedSettings } = await import("./settings-cache.ts");

    saveSharedSettings({
      ...loadSettingsCache().shared,
      lockedLocation: "rooftop bar at dusk",
    });

    applySettingsBrowserPreset("keeper");

    assert.equal(loadSettingsCache().shared.lockedLocation, "rooftop bar at dusk");
  });

  it("returns false for an unknown preset id and leaves settings untouched", async () => {
    const { applySettingsBrowserPreset } = await import("./settings-presets.ts");
    const { loadSettingsCache } = await import("./settings-cache.ts");

    const before = loadSettingsCache().shared.queueQualityProfile;
    const applied = applySettingsBrowserPreset("not-a-real-preset");
    assert.equal(applied, false);
    assert.equal(loadSettingsCache().shared.queueQualityProfile, before);
  });
});
