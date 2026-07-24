import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  comfyEngineAdapter,
  diffusersEngineAdapter,
  getEngineAdapter,
  getEngineAdapterById,
} from "./index.ts";
import { buildDiffusersViewPath, buildEngineViewPath } from "./view-paths.ts";

describe("engine adapter", () => {
  it("defaults to Comfy outside the browser", () => {
    assert.equal(getEngineAdapter().id, "comfyui");
    assert.equal(getEngineAdapter(), comfyEngineAdapter);
  });

  it("resolves adapters by id", () => {
    assert.equal(getEngineAdapterById("comfyui"), comfyEngineAdapter);
    assert.equal(getEngineAdapterById("diffusers"), diffusersEngineAdapter);
    assert.equal(getEngineAdapterById(undefined), comfyEngineAdapter);
  });

  it("maps engineUrl through buildViewPath to the Comfy view proxy", () => {
    const path = comfyEngineAdapter.buildViewPath(
      "http://127.0.0.1:8188",
      { filename: "out.png", subfolder: "", type: "output" },
      { width: 320 },
    );
    assert.match(path, /^\/api\/comfyui\/view\?/);
    assert.match(path, /filename=out\.png/);
    assert.match(path, /w=320/);
    assert.match(path, /comfyUrl=/);
  });

  it("maps Diffusers view paths through /api/diffusers/view", () => {
    const path = diffusersEngineAdapter.buildViewPath(
      "http://127.0.0.1:8190",
      { filename: "job.png", subfolder: "", type: "output" },
      { width: 256 },
    );
    assert.match(path, /^\/api\/diffusers\/view\?/);
    assert.match(path, /filename=job\.png/);
    assert.match(path, /engineUrl=/);
    assert.match(path, /w=256/);
    assert.equal(
      buildEngineViewPath("diffusers", "http://127.0.0.1:8190", {
        filename: "job.png",
        subfolder: "",
        type: "output",
      }),
      buildDiffusersViewPath("http://127.0.0.1:8190", {
        filename: "job.png",
        subfolder: "",
        type: "output",
      }),
    );
  });

  it("exposes progress subscribe helpers on both adapters", () => {
    assert.equal(typeof comfyEngineAdapter.subscribeProgress, "function");
    assert.equal(typeof comfyEngineAdapter.openProgressBeforeQueue, "function");
    assert.equal(typeof diffusersEngineAdapter.subscribeProgress, "function");
    assert.equal(typeof diffusersEngineAdapter.openProgressBeforeQueue, "function");
  });
});
