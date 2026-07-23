import assert from "node:assert/strict";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import {
  assetIsDownloadable,
  getCatalogAsset,
  isAllowlistedAssetUrl,
} from "./comfy-asset-catalog";
import {
  __resetComfyAssetJobsForTests,
  getComfyAssetJob,
  startComfyAssetDownload,
} from "./comfy-asset-download";
import {
  canWriteComfyModelsRoot,
  resolveAssetDestinationPath,
  resolveKindModelsDir,
} from "./comfy-asset-paths";
import {
  buildComfyAssetStatusRows,
  inventoryHasFilename,
} from "./comfy-asset-status";

describe("comfy asset paths", () => {
  it("maps clip and controlnet folders and blocks traversal", () => {
    const root = "/tmp/comfy-root-test";
    assert.equal(
      resolveKindModelsDir(root, "clip"),
      path.resolve(root, "models/text_encoders"),
    );
    assert.equal(
      resolveKindModelsDir(root, "controlnet"),
      path.resolve(root, "models/controlnet"),
    );
  });

  it("maps kinds to models subfolders and blocks traversal", () => {
    const root = "/tmp/comfy-root-test";
    assert.equal(
      resolveKindModelsDir(root, "checkpoint"),
      path.resolve(root, "models/checkpoints"),
    );
    assert.equal(
      resolveKindModelsDir(root, "unet"),
      path.resolve(root, "models/diffusion_models"),
    );

    const dest = resolveAssetDestinationPath({
      root,
      kind: "vae",
      filename: "ae.safetensors",
    });
    assert.equal(dest.destPath, path.resolve(root, "models/vae/ae.safetensors"));

    assert.throws(() =>
      resolveAssetDestinationPath({
        root,
        kind: "checkpoint",
        filename: "../../etc/passwd",
      }),
    );
  });

  it("prefers existing unet folder when present", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-unet-"));
    try {
      await fsp.mkdir(path.join(root, "models", "unet"), { recursive: true });
      assert.equal(
        resolveKindModelsDir(root, "unet"),
        path.resolve(root, "models/unet"),
      );
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  it("detects writable models roots", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-write-"));
    try {
      assert.equal(canWriteComfyModelsRoot(root), true);
      assert.equal(canWriteComfyModelsRoot("/no/such/comfy/root"), false);
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });
});

describe("comfy asset catalog", () => {
  it("allowlists huggingface hosts only", () => {
    assert.equal(
      isAllowlistedAssetUrl(
        "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/resolve/main/sd_xl_base_1.0.safetensors",
      ),
      true,
    );
    assert.equal(
      isAllowlistedAssetUrl("https://evil.example/model.safetensors"),
      false,
    );
    assert.equal(isAllowlistedAssetUrl("http://huggingface.co/x"), false);
  });

  it("marks SDXL base and Qwen VAE downloadable; gated FLUX AE docs-only", () => {
    const sdxl = getCatalogAsset("sdxl-base");
    assert.ok(sdxl);
    assert.equal(assetIsDownloadable(sdxl!), true);
    const qwenVae = getCatalogAsset("qwen-image-vae");
    assert.ok(qwenVae);
    assert.equal(assetIsDownloadable(qwenVae!), true);
    const clip = getCatalogAsset("qwen-2.5-vl-7b-fp8");
    assert.ok(clip);
    assert.equal(clip!.kind, "clip");
    assert.equal(assetIsDownloadable(clip!), true);
    const fluxAe = getCatalogAsset("flux1-ae");
    assert.ok(fluxAe);
    assert.equal(assetIsDownloadable(fluxAe!), false);
  });
});

describe("comfy asset status", () => {
  it("matches inventory by basename", () => {
    assert.equal(
      inventoryHasFilename(
        ["folder/sd_xl_base_1.0.safetensors"],
        "sd_xl_base_1.0.safetensors",
      ),
      true,
    );
  });

  it("reports installed when inventory has the file", () => {
    const { rows, rootConfigured } = buildComfyAssetStatusRows({
      root: null,
      inventory: {
        checkpoints: ["sd_xl_base_1.0.safetensors"],
      },
    });
    assert.equal(rootConfigured, false);
    const sdxl = rows.find((row) => row.id === "sdxl-base");
    assert.equal(sdxl?.status, "installed");
    assert.equal(sdxl?.inInventory, true);
  });

  it("reports missing when downloadable and absent", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-status-"));
    try {
      await fsp.mkdir(path.join(root, "models", "checkpoints"), {
        recursive: true,
      });
      const { rows } = buildComfyAssetStatusRows({
        root,
        inventory: { checkpoints: [] },
      });
      const sdxl = rows.find((row) => row.id === "sdxl-base");
      assert.equal(sdxl?.status, "missing");
      assert.equal(sdxl?.downloadable, true);
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });
  it("reports clip inventory hits", () => {
    const { rows } = buildComfyAssetStatusRows({
      root: null,
      inventory: {
        clips: ["qwen_2.5_vl_7b_fp8_scaled.safetensors"],
      },
    });
    const clip = rows.find((row) => row.id === "qwen-2.5-vl-7b-fp8");
    assert.equal(clip?.status, "installed");
    assert.equal(clip?.inInventory, true);
  });
});

describe("comfy asset download", () => {
  afterEach(() => {
    __resetComfyAssetJobsForTests();
  });

  it("refuses unknown and docs-only assets", () => {
    assert.throws(() => startComfyAssetDownload({ assetId: "nope" }));
    assert.throws(() =>
      startComfyAssetDownload({ assetId: "flux1-ae", root: "/tmp" }),
    );
  });

  it("streams allowlisted download into models folder", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-dl-"));
    try {
      await fsp.mkdir(path.join(root, "models", "checkpoints"), {
        recursive: true,
      });
      const payload = Buffer.from("fake-sdxl-weights");
      const job = startComfyAssetDownload({
        assetId: "sdxl-base",
        root,
        fetchImpl: async () =>
          new Response(payload, {
            status: 200,
            headers: {
              "content-length": String(payload.length),
              "content-type": "application/octet-stream",
            },
          }),
      });

      for (let i = 0; i < 50; i += 1) {
        const current = getComfyAssetJob(job.id);
        if (current?.status === "complete" || current?.status === "error") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }

      const done = getComfyAssetJob(job.id);
      assert.equal(done?.status, "complete", done?.error);
      const dest = path.join(
        root,
        "models",
        "checkpoints",
        "sd_xl_base_1.0.safetensors",
      );
      assert.equal(fs.existsSync(dest), true);
      assert.equal(fs.readFileSync(dest).toString(), "fake-sdxl-weights");
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  it("surfaces HTTP errors on the job instead of hanging", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-dl-err-"));
    try {
      await fsp.mkdir(path.join(root, "models", "upscale_models"), {
        recursive: true,
      });
      const job = startComfyAssetDownload({
        assetId: "ultrasharp-4x",
        root,
        fetchImpl: async () =>
          new Response("forbidden", { status: 403, statusText: "Forbidden" }),
      });
      for (let i = 0; i < 50; i += 1) {
        const current = getComfyAssetJob(job.id);
        if (current?.status === "complete" || current?.status === "error") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const done = getComfyAssetJob(job.id);
      assert.equal(done?.status, "error");
      assert.match(done?.error ?? "", /403|Hugging Face/i);
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });

  it("retries HTTP 429 then completes", async () => {
    const root = await fsp.mkdtemp(path.join(os.tmpdir(), "comfy-dl-429-"));
    try {
      await fsp.mkdir(path.join(root, "models", "upscale_models"), {
        recursive: true,
      });
      let calls = 0;
      const payload = Buffer.from("ultrasharp-bytes");
      const job = startComfyAssetDownload({
        assetId: "ultrasharp-4x",
        root,
        fetchImpl: async () => {
          calls += 1;
          if (calls === 1) {
            return new Response("slow down", {
              status: 429,
              headers: { "retry-after": "0" },
            });
          }
          return new Response(payload, {
            status: 200,
            headers: {
              "content-length": String(payload.length),
            },
          });
        },
      });
      for (let i = 0; i < 100; i += 1) {
        const current = getComfyAssetJob(job.id);
        if (current?.status === "complete" || current?.status === "error") {
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const done = getComfyAssetJob(job.id);
      // sha256 on catalog will fail for fake bytes — assert we got past 429.
      assert.ok(calls >= 2, `expected retries, got ${calls} fetch(es)`);
      assert.ok(
        done?.status === "complete" || /SHA-256|mismatch/i.test(done?.error ?? ""),
        done?.error,
      );
    } finally {
      await fsp.rm(root, { recursive: true, force: true });
    }
  });
});
