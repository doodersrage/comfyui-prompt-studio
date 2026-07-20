import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";

export type SharedProject = {
  id: string;
  name: string;
  groupIds: string[];
  notes?: string;
  createdAt: number;
  updatedAt: number;
  createdBy?: string;
};

type SharedProjectsDocument = {
  version: 1;
  projects: SharedProject[];
};

function projectsPath(): string {
  const base =
    process.env.PROMPT_DATA_DIR?.trim() ||
    path.join(process.cwd(), ".prompt-studio-data");
  fs.mkdirSync(base, { recursive: true });
  return path.join(base, "shared-projects.json");
}

function readDoc(): SharedProjectsDocument {
  try {
    return JSON.parse(fs.readFileSync(projectsPath(), "utf8")) as SharedProjectsDocument;
  } catch {
    return { version: 1, projects: [] };
  }
}

function writeDoc(doc: SharedProjectsDocument): void {
  fs.writeFileSync(projectsPath(), JSON.stringify(doc, null, 2), "utf8");
}

export function listSharedProjects(): SharedProject[] {
  return readDoc().projects;
}

export function listSharedProjectsForGroups(groupIds: string[]): SharedProject[] {
  const set = new Set(groupIds);
  return readDoc().projects.filter((project) =>
    project.groupIds.some((groupId) => set.has(groupId)),
  );
}

export function upsertSharedProject(input: {
  id?: string;
  name: string;
  groupIds: string[];
  notes?: string;
  createdBy?: string;
}): SharedProject {
  const doc = readDoc();
  const now = Date.now();
  const existingIndex = input.id
    ? doc.projects.findIndex((project) => project.id === input.id)
    : -1;
  const next: SharedProject = {
    id: input.id ?? randomUUID(),
    name: input.name.trim(),
    groupIds: input.groupIds,
    notes: input.notes?.trim() || undefined,
    createdAt: existingIndex >= 0 ? doc.projects[existingIndex].createdAt : now,
    updatedAt: now,
    createdBy: input.createdBy ?? doc.projects[existingIndex]?.createdBy,
  };
  if (existingIndex >= 0) {
    doc.projects[existingIndex] = next;
  } else {
    doc.projects.unshift(next);
  }
  writeDoc(doc);
  return next;
}

export function deleteSharedProject(id: string): boolean {
  const doc = readDoc();
  const next = doc.projects.filter((project) => project.id !== id);
  if (next.length === doc.projects.length) {
    return false;
  }
  writeDoc({ version: 1, projects: next });
  return true;
}
