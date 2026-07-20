import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hashPassword, verifyPassword } from "./password";

describe("default admin env sync", () => {
  let tempDir = "";
  const previousDataDir = process.env.PROMPT_DATA_DIR;
  const previousAuthEnabled = process.env.PROMPT_AUTH_ENABLED;
  const previousAdminUser = process.env.PROMPT_ADMIN_USERNAME;
  const previousAdminPassword = process.env.PROMPT_ADMIN_PASSWORD;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "prompt-auth-sync-"));
    process.env.PROMPT_DATA_DIR = tempDir;
    process.env.PROMPT_AUTH_ENABLED = "true";
    process.env.PROMPT_ADMIN_USERNAME = "admin";
    process.env.PROMPT_ADMIN_PASSWORD = "first-password";
  });

  afterEach(() => {
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
    if (previousDataDir === undefined) {
      delete process.env.PROMPT_DATA_DIR;
    } else {
      process.env.PROMPT_DATA_DIR = previousDataDir;
    }
    if (previousAuthEnabled === undefined) {
      delete process.env.PROMPT_AUTH_ENABLED;
    } else {
      process.env.PROMPT_AUTH_ENABLED = previousAuthEnabled;
    }
    if (previousAdminUser === undefined) {
      delete process.env.PROMPT_ADMIN_USERNAME;
    } else {
      process.env.PROMPT_ADMIN_USERNAME = previousAdminUser;
    }
    if (previousAdminPassword === undefined) {
      delete process.env.PROMPT_ADMIN_PASSWORD;
    } else {
      process.env.PROMPT_ADMIN_PASSWORD = previousAdminPassword;
    }
  });

  it("updates bootstrap admin password when env changes", async () => {
    const { verifyUserCredentials } = await import("./store");

    assert.equal(verifyUserCredentials("admin", "first-password")?.role, "admin");
    assert.equal(verifyUserCredentials("admin", "second-password"), null);

    process.env.PROMPT_ADMIN_PASSWORD = "second-password";
    assert.equal(verifyUserCredentials("admin", "second-password")?.role, "admin");
    assert.equal(verifyUserCredentials("admin", "first-password"), null);
  });

  it("keeps stored hash when env password still matches", async () => {
    const authDir = path.join(tempDir, "auth");
    fs.mkdirSync(authDir, { recursive: true });
    const usersPath = path.join(authDir, "users.json");
    const passwordHash = hashPassword("first-password");
    fs.writeFileSync(
      usersPath,
      JSON.stringify(
        {
          version: 1,
          users: [
            {
              id: "user-admin-default",
              username: "admin",
              passwordHash,
              role: "admin",
              groupIds: [],
              blockedFeatures: [],
              enabled: true,
              createdAt: 1,
              updatedAt: 1,
            },
          ],
        },
        null,
        2,
      ),
      "utf8",
    );

    const { verifyUserCredentials } = await import("./store");
    assert.equal(verifyUserCredentials("admin", "first-password")?.role, "admin");
    assert.equal(
      JSON.parse(fs.readFileSync(usersPath, "utf8")).users[0].passwordHash,
      passwordHash,
    );
  });
});

describe("password hashing", () => {
  it("round-trips special characters", () => {
    const password = "WTm37WMT$@MN3zuu";
    const encoded = hashPassword(password);
    assert.equal(verifyPassword(password, encoded), true);
    assert.equal(verifyPassword("wrong", encoded), false);
  });
});
