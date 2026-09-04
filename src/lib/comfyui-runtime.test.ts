import assert from "node:assert/strict";
import { describe, it, mock } from "node:test";
import type { ComfyUiSettings } from "./comfyui-settings";
import type { ComfyUiRuntimeConfig } from "./comfyui-config";
import type { ComfyWorkflowFile } from "./comfyui-workflow-files";
import type { SettingsCache } from "./settings-cache";

const comfyUiSettingsToRuntime = mock.fn(
  (_settings: ComfyUiSettings): ComfyUiRuntimeConfig | undefined => ({ apiUrl: "http://base" })
);
const loadComfyUiSettings = mock.fn((): ComfyUiSettings => ({}) as ComfyUiSettings);
mock.module("./comfyui-settings", { namedExports: { comfyUiSettingsToRuntime, loadComfyUiSettings } });

const stripEmptyComfyUiRuntime = mock.fn(
  (runtime?: ComfyUiRuntimeConfig) => runtime
);
mock.module("./comfyui-config", { namedExports: { stripEmptyComfyUiRuntime } });

const findComfyWorkflowFile = mock.fn((_id: string): ComfyWorkflowFile | undefined => undefined);
const mergeCustomWorkflowTokens = mock.fn(
  (...lists: Array<unknown[] | undefined | null>) => lists.flatMap(l => l ?? [])
);
mock.module("./comfyui-workflow-files", {
  namedExports: { findComfyWorkflowFile, mergeCustomWorkflowTokens },
});

let sharedSettings: SettingsCache["shared"] = {} as SettingsCache["shared"];
const loadSettingsCache = mock.fn(
  (): SettingsCache => ({ shared: sharedSettings, tools: {}, installedPlugins: [] }) as SettingsCache
);
const saveSharedSettings = mock.fn((next: SettingsCache["shared"]) => {
  sharedSettings = next;
});
mock.module("./settings-cache", { namedExports: { loadSettingsCache, saveSharedSettings } });

describe("comfyui-runtime", async () => {
  const {
    getSelectedWorkflowFileId,
    resolveSelectedWorkflowRuntime,
    resolveComfyUiRuntime,
    clearSelectedWorkflowFileIfDeleted,
    setSelectedWorkflowFileId,
    clearSelectedWorkflowPresetIfDeleted,
    setSelectedWorkflowPresetId,
    getSelectedWorkflowPresetId,
    effectiveComfyUiSettings,
    mergeWorkflowPreset,
    SERVER_WORKFLOW_PREFIX,
  } = await import("./comfyui-runtime");

  describe("getSelectedWorkflowFileId", () => {
    it("prefers selectedWorkflowFileId over the legacy preset id", () => {
      sharedSettings = { selectedWorkflowFileId: "file-1", selectedWorkflowPresetId: "preset-1" } as never;
      assert.equal(getSelectedWorkflowFileId(), "file-1");
    });

    it("falls back to the legacy preset id when no file id is set", () => {
      sharedSettings = { selectedWorkflowPresetId: "preset-1" } as never;
      assert.equal(getSelectedWorkflowFileId(), "preset-1");
    });
  });

  describe("resolveSelectedWorkflowRuntime", () => {
    it("returns the base runtime when no workflow is selected (fileId undefined, none in settings)", () => {
      sharedSettings = {} as never;
      const result = resolveSelectedWorkflowRuntime();
      assert.deepEqual(result, { apiUrl: "http://base" });
    });

    it("returns the base runtime for an explicit null fileId without consulting settings-cache", () => {
      const before = loadSettingsCache.mock.calls.length;
      const result = resolveSelectedWorkflowRuntime(null);
      assert.deepEqual(result, { apiUrl: "http://base" });
      assert.equal(loadSettingsCache.mock.calls.length, before);
    });

    it("strips the server: prefix into workflowFileId for a server-prefixed id", () => {
      const result = resolveSelectedWorkflowRuntime("server:my-workflow") as ComfyUiRuntimeConfig;
      assert.equal(result.workflowFileId, "my-workflow");
      assert.equal(result.apiUrl, "http://base");
    });

    it("returns the base runtime when the given file id is not found", () => {
      findComfyWorkflowFile.mock.mockImplementationOnce(() => undefined);
      const result = resolveSelectedWorkflowRuntime("unknown-file");
      assert.deepEqual(result, { apiUrl: "http://base" });
    });

    it("merges the found file's workflow json and custom tokens into the runtime", () => {
      findComfyWorkflowFile.mock.mockImplementationOnce(
        () =>
          ({
            workflowJson: '{"nodes":[]}',
            lastOptimizedHash: "hash1",
            lastOptimizedModel: "model1",
            lastOptimizedProfile: "final",
            customTokens: [{ token: "{{X}}", value: "y" }],
          }) as unknown as ComfyWorkflowFile
      );
      const result = resolveSelectedWorkflowRuntime("my-file") as ComfyUiRuntimeConfig;
      assert.equal(result.workflowJson, '{"nodes":[]}');
      assert.equal(result.workflowOptimizedHash, "hash1");
      assert.equal(result.workflowOptimizedModel, "model1");
      assert.equal(result.workflowOptimizedProfile, "final");
      assert.deepEqual(result.workflowCustomTokens, [{ token: "{{X}}", value: "y" }]);
    });
  });

  it("resolveComfyUiRuntime is an alias for resolveSelectedWorkflowRuntime", () => {
    sharedSettings = {} as never;
    assert.deepEqual(resolveComfyUiRuntime(), resolveSelectedWorkflowRuntime());
  });

  describe("clearSelectedWorkflowFileIfDeleted", () => {
    it("clears both selection fields when the deleted id matches selectedWorkflowFileId", () => {
      sharedSettings = { selectedWorkflowFileId: "gone", selectedWorkflowPresetId: "gone" } as never;
      clearSelectedWorkflowFileIfDeleted("gone");
      assert.equal(sharedSettings.selectedWorkflowFileId, undefined);
      assert.equal(sharedSettings.selectedWorkflowPresetId, undefined);
    });

    it("does nothing when the deleted id does not match the current selection", () => {
      sharedSettings = { selectedWorkflowFileId: "kept" } as never;
      clearSelectedWorkflowFileIfDeleted("gone");
      assert.equal(sharedSettings.selectedWorkflowFileId, "kept");
    });
  });

  it("setSelectedWorkflowFileId sets the file id and clears the legacy preset id", () => {
    sharedSettings = { selectedWorkflowPresetId: "old-preset" } as never;
    setSelectedWorkflowFileId("new-file");
    assert.equal(sharedSettings.selectedWorkflowFileId, "new-file");
    assert.equal(sharedSettings.selectedWorkflowPresetId, undefined);
  });

  it("deprecated preset aliases delegate to their file-id counterparts", () => {
    sharedSettings = {} as never;
    setSelectedWorkflowPresetId("aliased-file");
    assert.equal(getSelectedWorkflowPresetId(), "aliased-file");
    clearSelectedWorkflowPresetIfDeleted("aliased-file");
    assert.equal(getSelectedWorkflowPresetId(), undefined);
  });

  it("effectiveComfyUiSettings returns loadComfyUiSettings() regardless of the presetId arg", () => {
    const settings = { apiUrl: "http://x" } as ComfyUiSettings;
    loadComfyUiSettings.mock.mockImplementationOnce(() => settings);
    assert.equal(effectiveComfyUiSettings("anything"), settings);
  });

  it("mergeWorkflowPreset returns the settings object unchanged", () => {
    const settings = { apiUrl: "http://x" } as ComfyUiSettings;
    assert.equal(mergeWorkflowPreset(settings, { whatever: true }), settings);
  });

  it("exposes the server workflow id prefix constant", () => {
    assert.equal(SERVER_WORKFLOW_PREFIX, "server:");
  });
});
