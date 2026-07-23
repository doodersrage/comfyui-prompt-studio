import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetBrowserStorageCache } from "./browser-storage.ts";
import {
  resolveRuntimeForModel,
  resolveRuntimeForQueue,
  scanAndAdaptSystemWorkflowInventory,
} from "./comfyui-runtime-for-model.ts";
import {
  DEFAULT_SHARED_SETTINGS,
  loadSettingsCache,
  saveSharedSettings,
} from "./settings-cache.ts";

function withMockLocalStorage(run: () => void | Promise<void>): Promise<void> {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value);
        },
        removeItem: (key: string) => {
          storage.delete(key);
        },
      },
    },
  });
  resetBrowserStorageCache();
  return Promise.resolve()
    .then(() => run())
    .finally(() => {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
      resetBrowserStorageCache();
    });
}

describe("comfyui-runtime-for-model system path", () => {
  beforeEach(() => {
    resetBrowserStorageCache();
  });
  afterEach(() => {
    resetBrowserStorageCache();
  });

  it("uses system scaffolds for Qwen when system workflows are on", async () => {
    await withMockLocalStorage(() => {
      saveSharedSettings({
        ...DEFAULT_SHARED_SETTINGS,
        ...loadSettingsCache().shared,
        useSystemWorkflows: true,
        model: "qwen-image-2512",
        queueQualityProfile: "final",
      });
      const runtime = resolveRuntimeForModel("qwen-image-2512", "generate", {
        inventory: {
          checkpoints: [],
          unets: ["qwen_image_2512_bf16.safetensors"],
          vaes: ["qwen_image_vae.safetensors"],
          clips: ["qwen_2.5_vl_7b.safetensors"],
          dualClipTypes: [],
          clipLoaderTypes: ["qwen_image"],
          loras: [],
          upscaleModels: [],
          controlNets: [],
        },
      });
      assert.equal(runtime.systemWorkflowSource, "scaffold");
      assert.ok(runtime.workflowJson?.includes("UNETLoader") || runtime.workflowJson?.includes("{{UNET}}"));
      assert.equal(runtime.syncWorkflowLoadersToModel, true);
    });
  });

  it("falls through to mapped/manual path for SDXL in hybrid mode", async () => {
    await withMockLocalStorage(() => {
      saveSharedSettings({
        ...DEFAULT_SHARED_SETTINGS,
        ...loadSettingsCache().shared,
        useSystemWorkflows: true,
        systemWorkflowsLimitPicker: false,
        model: "sdxl",
        modelWorkflowMap: {},
      });
      const runtime = resolveRuntimeForModel("sdxl", "generate", {
        inventory: null,
      });
      // Hybrid unsupported: no system scaffold/source stamps.
      assert.equal(runtime.systemWorkflowSource, undefined);
      assert.notEqual(runtime.syncWorkflowLoadersToModel, true);
    });
  });

  it("re-enables enrich for tool Final when global profile is Draft", async () => {
    await withMockLocalStorage(() => {
      saveSharedSettings({
        ...DEFAULT_SHARED_SETTINGS,
        ...loadSettingsCache().shared,
        useSystemWorkflows: true,
        model: "qwen-image-2512",
        queueQualityProfile: "draft",
        workflowGraphEnrich: true,
        toolQueueQualityProfiles: {
          compose: "final",
        },
      });
      const runtime = resolveRuntimeForQueue("qwen-image-2512", "compose", {
        inventory: {
          checkpoints: [],
          unets: ["qwen_image_2512_bf16.safetensors"],
          vaes: ["qwen_image_vae.safetensors"],
          clips: ["qwen_2.5_vl_7b.safetensors"],
          dualClipTypes: [],
          clipLoaderTypes: ["qwen_image"],
          loras: [],
          upscaleModels: [],
          controlNets: [],
        },
      });
      assert.equal(runtime.queueQualityProfile, "final");
      assert.equal(runtime.workflowGraphEnrich, true);
    });
  });

  it("scanAndAdapt returns null inventory when Comfy is unreachable without throwing", async () => {
    await withMockLocalStorage(async () => {
      saveSharedSettings({
        ...DEFAULT_SHARED_SETTINGS,
        ...loadSettingsCache().shared,
        useSystemWorkflows: true,
      });
      const originalFetch = globalThis.fetch;
      globalThis.fetch = (async () => {
        throw new Error("offline");
      }) as typeof fetch;
      try {
        const models = await scanAndAdaptSystemWorkflowInventory({
          persist: false,
        });
        assert.equal(models, null);
      } finally {
        globalThis.fetch = originalFetch;
      }
    });
  });
});
