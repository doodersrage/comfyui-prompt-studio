import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildComposeIdentityLockQueuePatch,
  formatComposeIdentityLockHint,
  normalizeComposeIdentityLockStrength,
} from "./compose-identity-lock.ts";
import {
  buildGalleryHandoff,
  buildReeditGalleryHandoff,
  sharedPatchFromGalleryHandoff,
} from "./gallery-handoff.ts";
import type { ComfyGalleryEntry } from "./comfyui-gallery-entry.ts";

describe("compose identity lock", () => {
  it("builds IP-Adapter queue patch from Figure 1 filename", () => {
    const patch = buildComposeIdentityLockQueuePatch({
      enabled: true,
      strength: 0.55,
      inputImageFilename: "fig1.png",
    });
    assert.deepEqual(patch, {
      ipAdapterImageFilename: "fig1.png",
      ipAdapterImageFilenames: ["fig1.png"],
      ipAdapterStrength: 0.55,
      identityKind: "ipadapter",
    });
  });

  it("returns null when lock is off or filename missing", () => {
    assert.equal(
      buildComposeIdentityLockQueuePatch({
        enabled: false,
        inputImageFilename: "fig1.png",
      }),
      null,
    );
    assert.equal(
      buildComposeIdentityLockQueuePatch({
        enabled: true,
        inputImageFilename: "  ",
      }),
      null,
    );
  });

  it("clamps strength", () => {
    assert.equal(normalizeComposeIdentityLockStrength(2), 1);
    assert.equal(normalizeComposeIdentityLockStrength(0), 0.05);
  });

  it("formats hint", () => {
    assert.match(formatComposeIdentityLockHint({ enabled: false }), /Off/);
    assert.match(
      formatComposeIdentityLockHint({ enabled: true, strength: 0.5 }),
      /IP-Adapter @ 0\.50/,
    );
    assert.match(
      formatComposeIdentityLockHint({
        enabled: true,
        strength: 0.5,
        identityKind: "instantid",
      }),
      /InstantID @ 0\.50/,
    );
  });
});

function fakeEntry(
  patch: Partial<ComfyGalleryEntry> = {},
): ComfyGalleryEntry {
  return {
    id: "g1",
    promptId: "p1",
    prompt: "a portrait",
    model: "qwen-image-edit-2511-lightning-8",
    tool: "compose",
    comfyUrl: "http://127.0.0.1:8188",
    status: "completed",
    queuedAt: Date.now(),
    images: [{ filename: "out.png", subfolder: "", type: "output" }],
    queueQualityProfile: "final",
    sessionActiveLoraIds: ["skin", "anypose"],
    ...patch,
  };
}

describe("gallery re-edit handoff", () => {
  it("includes entry LoRA stack and quality on reedit", () => {
    const payload = buildReeditGalleryHandoff(fakeEntry(), "compose");
    assert.equal(payload.handoffMode, "reedit");
    assert.equal(payload.target, "compose");
    assert.deepEqual(payload.sessionActiveLoraIds, ["skin", "anypose"]);
    assert.equal(payload.queueQualityProfile, "final");
  });

  it("sharedPatchFromGalleryHandoff restores LoRAs and profile", () => {
    const payload = buildGalleryHandoff(fakeEntry(), "refine", {
      handoffMode: "reedit",
      includeSessionLoras: true,
    });
    const patch = sharedPatchFromGalleryHandoff(payload);
    assert.deepEqual(patch.sessionActiveLoraIds, ["skin", "anypose"]);
    assert.equal(patch.queueQualityProfile, "final");
  });
});
