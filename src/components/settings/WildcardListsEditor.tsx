"use client";

import { useMemo, useState } from "react";
import {
  DEFAULT_WILDCARDS,
  parseWildcardListFile,
  type WildcardMap,
} from "@/lib/wildcard-expand";
import { FieldLabel } from "@/components/ui/Field";

type WildcardListsEditorProps = {
  lists: WildcardMap | undefined;
  disabled?: boolean;
  onChange: (lists: WildcardMap) => void;
  focusClassName?: string;
};

function normalizeName(raw: string): string {
  return raw.trim().toLowerCase().replace(/^__+|__+$/g, "").replace(/\s+/g, "_");
}

export default function WildcardListsEditor({
  lists,
  disabled,
  onChange,
  focusClassName = "",
}: WildcardListsEditorProps) {
  const custom = lists ?? {};
  const names = useMemo(
    () => Object.keys(custom).sort((a, b) => a.localeCompare(b)),
    [custom],
  );
  const [selected, setSelected] = useState(names[0] ?? "");
  const [draftName, setDraftName] = useState("");
  const active = selected && custom[selected] ? selected : names[0] ?? "";
  const body = active ? (custom[active] ?? []).join("\n") : "";

  const saveBody = (text: string) => {
    if (!active) {
      return;
    }
    const nextEntries = parseWildcardListFile(text);
    const next: WildcardMap = { ...custom };
    if (nextEntries.length === 0) {
      delete next[active];
    } else {
      next[active] = nextEntries;
    }
    onChange(next);
  };

  const addList = () => {
    const name = normalizeName(draftName);
    if (!name || custom[name]) {
      return;
    }
    onChange({ ...custom, [name]: ["option one", "option two"] });
    setSelected(name);
    setDraftName("");
  };

  const removeList = () => {
    if (!active) {
      return;
    }
    const next = { ...custom };
    delete next[active];
    onChange(next);
    setSelected(Object.keys(next).sort()[0] ?? "");
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-zinc-400">
        Custom <code className="rounded bg-zinc-800 px-1 text-violet-300">__name__</code>{" "}
        lists layered on built-ins ({Object.keys(DEFAULT_WILDCARDS).join(", ")}
        ). One option per line; lines starting with # are ignored.
      </p>

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1">
          <FieldLabel htmlFor="wildcard-list-select">Custom list</FieldLabel>
          <select
            id="wildcard-list-select"
            value={active}
            disabled={disabled || names.length === 0}
            onChange={(event) => setSelected(event.target.value)}
            className={`ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body ${focusClassName}`}
          >
            {names.length === 0 ? (
              <option value="">No custom lists yet</option>
            ) : (
              names.map((name) => (
                <option key={name} value={name}>
                  __{name}__
                </option>
              ))
            )}
          </select>
        </div>
        <button
          type="button"
          disabled={disabled || !active}
          onClick={removeList}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-300 transition hover:border-rose-500/40 hover:text-rose-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/40 active:scale-[0.98] disabled:opacity-40"
        >
          Remove
        </button>
      </div>

      {active ? (
        <div>
          <FieldLabel htmlFor="wildcard-list-body">Options for __{active}__</FieldLabel>
          <textarea
            id="wildcard-list-body"
            rows={8}
            value={body}
            disabled={disabled}
            spellCheck={false}
            onChange={(event) => saveBody(event.target.value)}
            className={`ui-input w-full font-mono text-xs leading-relaxed ${focusClassName}`}
          />
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[10rem] flex-1">
          <FieldLabel htmlFor="wildcard-list-new">New list name</FieldLabel>
          <input
            id="wildcard-list-new"
            value={draftName}
            disabled={disabled}
            placeholder="e.g. outfit"
            onChange={(event) => setDraftName(event.target.value)}
            className={`ui-input w-full px-[var(--input-padding-x)] py-[var(--input-padding-y)] type-body ${focusClassName}`}
          />
        </div>
        <button
          type="button"
          disabled={disabled || !normalizeName(draftName)}
          onClick={addList}
          className="rounded-lg border border-zinc-700 px-3 py-2 text-sm text-zinc-200 transition hover:border-zinc-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-violet-400/40 active:scale-[0.98] disabled:opacity-40"
        >
          Add list
        </button>
      </div>
    </div>
  );
}
