import assert from "node:assert/strict";
import { afterEach, beforeEach, describe, it } from "node:test";
import { resetBrowserStorageCache } from "./browser-storage.ts";
import { APP_NAV_GROUPS, flattenAppNavLinks } from "./app-nav-catalog.ts";
import {
  SIMPLE_NAV_HREFS,
  defaultExpandedNavGroups,
  hasChosenWorkspaceMode,
  loadWorkspaceMode,
  navGroupsForWorkspaceMode,
  normalizeWorkspaceMode,
  saveWorkspaceMode,
  workspaceShowsAdvancedControls,
} from "./workspace-mode.ts";

function withMockLocalStorage(run: () => void): void {
  const storage = new Map<string, string>();
  const originalWindow = globalThis.window;
  const originalDocument = globalThis.document;
  const dataset: Record<string, string> = {};
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
  Object.defineProperty(globalThis, "document", {
    configurable: true,
    value: {
      documentElement: { dataset },
    },
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

describe("workspace-mode", () => {
  beforeEach(() => {
    withMockLocalStorage(() => resetBrowserStorageCache());
  });
  afterEach(() => {
    withMockLocalStorage(() => resetBrowserStorageCache());
  });

  it("normalizes unknown modes to studio", () => {
    assert.equal(normalizeWorkspaceMode("nope"), "studio");
    assert.equal(normalizeWorkspaceMode("simple"), "simple");
  });

  it("persists workspace mode and marks chosen", () => {
    withMockLocalStorage(() => {
      assert.equal(hasChosenWorkspaceMode(), false);
      saveWorkspaceMode("simple");
      assert.equal(loadWorkspaceMode(), "simple");
      assert.equal(hasChosenWorkspaceMode(), true);
      assert.equal(document.documentElement.dataset.workspace, "simple");
    });
  });

  it("builds Essentials + More for simple mode", () => {
    const groups = navGroupsForWorkspaceMode("simple", APP_NAV_GROUPS);
    assert.equal(groups[0]?.label, "Essentials");
    assert.ok(groups[0]!.links.length >= 6);
    for (const href of SIMPLE_NAV_HREFS) {
      assert.ok(
        groups[0]!.links.some((link) => link.href === href),
        `missing essential ${href}`,
      );
    }
    assert.equal(groups[1]?.label, "More tools");
    assert.ok((groups[1]?.links.length ?? 0) > 5);
    const flatCount = flattenAppNavLinks(groups).length;
    assert.equal(flatCount, flattenAppNavLinks(APP_NAV_GROUPS).length);
  });

  it("keeps Edit / Media / Library structure for studio and full", () => {
    for (const mode of ["studio", "full"] as const) {
      const groups = navGroupsForWorkspaceMode(mode, APP_NAV_GROUPS);
      const labels = groups.map((group) => group.label);
      assert.ok(labels.includes("Edit"));
      assert.ok(labels.includes("Media"));
      assert.ok(labels.includes("Library"));
      assert.equal(labels.includes("Tools"), false);
    }
  });

  it("defaults Media collapsed in studio and expands all in full", () => {
    const studio = defaultExpandedNavGroups("studio", APP_NAV_GROUPS);
    assert.equal(studio.includes("Media"), false);
    assert.ok(studio.includes("Edit"));
    const full = defaultExpandedNavGroups("full", APP_NAV_GROUPS);
    assert.deepEqual(
      full,
      APP_NAV_GROUPS.map((group) => group.label),
    );
    assert.deepEqual(
      defaultExpandedNavGroups("simple", [
        { label: "Essentials", links: [] },
        { label: "More tools", links: [] },
      ]),
      ["Essentials"],
    );
  });

  it("hides advanced controls only in simple mode", () => {
    assert.equal(workspaceShowsAdvancedControls("simple"), false);
    assert.equal(workspaceShowsAdvancedControls("studio"), true);
    assert.equal(workspaceShowsAdvancedControls("full"), true);
  });
});
