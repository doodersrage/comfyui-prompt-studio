import fs from "node:fs";
import path from "node:path";

export type SharedPresetEntry = {
  id: string;
  label: string;
  hints: string;
  category?: string;
  model?: string;
  notes?: string;
  createdAt: number;
  updatedAt: number;
  publishedBy?: string;
};

type SharedPresetDocument = {
  version: 1;
  presets: SharedPresetEntry[];
};

function presetPath(): string {
  const base =
    process.env.PROMPT_DATA_DIR?.trim() ||
    path.join(process.cwd(), ".prompt-studio-data");
  fs.mkdirSync(base, { recursive: true });
  return path.join(base, "shared-presets.json");
}

function readDocument(): SharedPresetDocument {
  try {
    return JSON.parse(fs.readFileSync(presetPath(), "utf8")) as SharedPresetDocument;
  } catch {
    return { version: 1, presets: [] };
  }
}

function writeDocument(document: SharedPresetDocument): void {
  fs.writeFileSync(presetPath(), JSON.stringify(document, null, 2), "utf8");
}

export function listSharedPresets(): SharedPresetEntry[] {
  return readDocument().presets.sort((a, b) => a.label.localeCompare(b.label));
}

export function upsertSharedPreset(
  input: Omit<SharedPresetEntry, "id" | "createdAt" | "updatedAt"> & { id?: string },
): SharedPresetEntry {
  const document = readDocument();
  const now = Date.now();
  const index = input.id
    ? document.presets.findIndex((entry) => entry.id === input.id)
    : document.presets.findIndex(
        (entry) => entry.label.trim().toLowerCase() === input.label.trim().toLowerCase(),
      );

  const next: SharedPresetEntry = {
    id: input.id ?? `shared-${now}`,
    label: input.label.trim(),
    hints: input.hints.trim(),
    category: input.category?.trim() || undefined,
    model: input.model?.trim() || undefined,
    notes: input.notes?.trim() || undefined,
    publishedBy: input.publishedBy,
    createdAt: index >= 0 ? document.presets[index].createdAt : now,
    updatedAt: now,
  };

  if (index >= 0) {
    document.presets[index] = next;
  } else {
    document.presets.unshift(next);
  }

  writeDocument(document);
  return next;
}

export function deleteSharedPreset(id: string): void {
  const document = readDocument();
  document.presets = document.presets.filter((entry) => entry.id !== id);
  writeDocument(document);
}
