import { loadComfyWorkflowFiles } from "./comfyui-workflow-files";
import { readCachedComfyObjectInfo } from "./comfyui-object-info-cache";

export type IdentityPackKind = "instantid" | "pulid";

export type IdentityPackHealthStatus = "ready" | "detected" | "missing";

export type IdentityPackHealth = {
  kind: IdentityPackKind;
  status: IdentityPackHealthStatus;
  label: string;
  detail?: string;
};

const INSTANTID_NODE_PATTERN = /applyinstantid|instantidmodelloader|instantidfaceanalysis/i;
const PULID_NODE_PATTERN = /applypulid|pulidmodelloader|pulidevacliploader/i;
const INSTANTID_SCAFFOLD_PATTERN = /instantid/i;
const PULID_SCAFFOLD_PATTERN = /pulid/i;

function hasNodeMatch(
  nodeTypes: Iterable<string> | null | undefined,
  pattern: RegExp,
): boolean {
  if (!nodeTypes) {
    return false;
  }
  for (const name of nodeTypes) {
    if (pattern.test(name)) {
      return true;
    }
  }
  return false;
}

function findScaffoldName(kind: IdentityPackKind): string | undefined {
  const pattern =
    kind === "pulid" ? PULID_SCAFFOLD_PATTERN : INSTANTID_SCAFFOLD_PATTERN;
  const files = loadComfyWorkflowFiles();
  const match = files.find((file) =>
    pattern.test(`${file.name} ${file.filename ?? ""}`),
  );
  return match?.name;
}

/**
 * InstantID / PuLID health for Settings chips.
 * Prefers live ComfyUI object_info inventory when cached; otherwise scaffold
 * presence in the workflow library.
 */
export function getIdentityPackHealth(
  kind: IdentityPackKind,
  availableNodeTypes?: Iterable<string> | null,
): IdentityPackHealth {
  const nodePattern =
    kind === "pulid" ? PULID_NODE_PATTERN : INSTANTID_NODE_PATTERN;
  const labelName = kind === "pulid" ? "PuLID" : "InstantID";

  const inventory =
    availableNodeTypes ?? readCachedComfyObjectInfo()?.nodeTypes ?? null;

  if (inventory && hasNodeMatch(inventory, nodePattern)) {
    return {
      kind,
      status: "ready",
      label: "Ready",
      detail: `${labelName} nodes installed`,
    };
  }

  const scaffoldName = findScaffoldName(kind);
  if (scaffoldName) {
    return {
      kind,
      status: "detected",
      label: "Detected",
      detail: scaffoldName,
    };
  }

  return {
    kind,
    status: "missing",
    label: "Missing",
    detail:
      inventory == null
        ? `No ${labelName} scaffold in library (and Comfy inventory unavailable)`
        : `${labelName} nodes not in ComfyUI inventory`,
  };
}

export function getInstantIdHealth(
  availableNodeTypes?: Iterable<string> | null,
): IdentityPackHealth {
  return getIdentityPackHealth("instantid", availableNodeTypes);
}

export function getPulidHealth(
  availableNodeTypes?: Iterable<string> | null,
): IdentityPackHealth {
  return getIdentityPackHealth("pulid", availableNodeTypes);
}
