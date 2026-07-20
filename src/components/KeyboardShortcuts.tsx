"use client";

import { useEffect } from "react";
import { loadKeyboardShortcuts, parseCombo } from "@/lib/keyboard-shortcuts-store";

export default function KeyboardShortcuts() {
  useEffect(() => {
    const bindings = loadKeyboardShortcuts();
    const handler = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      for (const binding of bindings) {
        if (!binding.selector || binding.action === "command-palette") {
          continue;
        }
        const combo = parseCombo(binding.combo);
        const ctrl = event.ctrlKey || event.metaKey;
        const key = event.key.toLowerCase();
        const expectedKey = combo.key === "enter" ? "enter" : combo.key;
        if (ctrl === combo.ctrl && event.shiftKey === combo.shift && key === expectedKey) {
          event.preventDefault();
          document.querySelector<HTMLElement>(binding.selector)?.click();
          return;
        }
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  return null;
}

export function keyboardShortcutHelp(): string {
  return loadKeyboardShortcuts().map((entry) => `${entry.combo}: ${entry.action}`).join(" · ");
}
