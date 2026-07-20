import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { featureForPath } from "./features";
import { userCanAccessFeature } from "./store";
import type { AuthUser } from "./types";

describe("auth features", () => {
  it("maps root path to generate", () => {
    assert.equal(featureForPath("/"), "generate");
  });

  it("maps gallery and comfyui api paths", () => {
    assert.equal(featureForPath("/gallery"), "gallery");
    assert.equal(featureForPath("/api/comfyui"), "comfyui-api");
  });
});

describe("auth access resolution", () => {
  const baseUser: AuthUser = {
    id: "u1",
    username: "tester",
    passwordHash: "scrypt$abc$def",
    role: "user",
    groupIds: [],
    blockedFeatures: ["settings"],
    enabled: true,
    createdAt: 1,
    updatedAt: 1,
  };

  it("grants admins all features", () => {
    assert.equal(
      userCanAccessFeature({ ...baseUser, role: "admin", blockedFeatures: ["gallery"] }, "gallery"),
      true,
    );
  });

  it("blocks user-specific features", () => {
    assert.equal(userCanAccessFeature(baseUser, "settings"), false);
    assert.equal(userCanAccessFeature(baseUser, "gallery"), true);
  });
});
