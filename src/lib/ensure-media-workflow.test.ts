import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetBrowserStorageCache } from "./browser-storage.ts";
import {
  ensureAudioWorkflowScaffold,
  ensureMeshWorkflowScaffold,
} from "./ensure-media-workflow.ts";
import { buildWorkflowScaffoldForModel } from "./workflow-scaffold.ts";
import { AUDIO_SECONDS_TOKEN, MESH_RESOLUTION_TOKEN } from "./audio-mesh-prompt.ts";

function withMockLocalStorage(run: () => void): void {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
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
      indexedDB: undefined,
    },
  });
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: { documentElement: { dataset: {} } },
  });
  try {
    run();
  } finally {
    if (originalWindow === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.window;
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: originalWindow,
      });
    }
    if (originalDocument === undefined) {
      // @ts-expect-error test cleanup
      delete globalThis.document;
    } else {
      Object.defineProperty(globalThis, "document", {
        configurable: true,
        value: originalDocument,
      });
    }
  }
}

describe("audio/mesh scaffolds", () => {
  beforeEach(() => {
    withMockLocalStorage(() => resetBrowserStorageCache());
  });
  afterEach(() => {
    withMockLocalStorage(() => resetBrowserStorageCache());
  });

  it("builds audio and mesh scaffold JSON with media tokens in notes", () => {
    const audio = buildWorkflowScaffoldForModel("stable-audio");
    assert.equal(audio.category, "audio");
    assert.match(audio.json, /SaveAudio|AUDIO_SECONDS|CheckpointLoaderSimple/);
    assert.ok(audio.notes.some((note) => /AUDIO_SECONDS|Stable Audio/i.test(note)));

    const mesh = buildWorkflowScaffoldForModel("hunyuan-3d");
    assert.equal(mesh.category, "mesh");
    assert.match(mesh.json, /LoadImage|MESH_RESOLUTION|CheckpointLoaderSimple/);
    assert.ok(mesh.notes.some((note) => /MESH_RESOLUTION|Hunyuan3D/i.test(note)));
  });

  it("ensure helpers assign scaffolds and custom tokens", () => {
    withMockLocalStorage(() => {
      const audio = ensureAudioWorkflowScaffold("stable-audio");
      assert.equal(audio.model, "stable-audio");
      assert.equal(audio.assigned, true);
      assert.ok(
        audio.workflow.customTokens?.some((token) => token.token === AUDIO_SECONDS_TOKEN),
      );

      const mesh = ensureMeshWorkflowScaffold("hunyuan-3d");
      assert.equal(mesh.model, "hunyuan-3d");
      assert.ok(
        mesh.workflow.customTokens?.some((token) => token.token === MESH_RESOLUTION_TOKEN),
      );

      const again = ensureAudioWorkflowScaffold("stable-audio");
      assert.equal(again.created, false);
      assert.equal(again.workflow.id, audio.workflow.id);
    });
  });
});
