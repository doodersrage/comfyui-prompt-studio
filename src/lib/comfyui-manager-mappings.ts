import type { ComfyManagerPackSpec } from './comfyui-custom-node-registry';
import { lookupKnownComfyNodePack, uniquePackSpecs } from './comfyui-custom-node-registry';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item): item is string => typeof item === 'string')
    .map(item => item.trim())
    .filter(Boolean);
}

/** class_type → pack key (git URL or package name) from Manager getmappings. */
export function parseComfyManagerMappings(raw: unknown): Map<string, string> {
  const map = new Map<string, string>();
  const record = asRecord(raw);
  if (!record) {
    return map;
  }
  for (const [key, value] of Object.entries(record)) {
    const packKey = key.trim();
    if (!packKey) {
      continue;
    }
    if (typeof value === 'string' && value.trim()) {
      map.set(packKey, value.trim());
      continue;
    }
    if (!Array.isArray(value) || value.length === 0) {
      continue;
    }
    const classTypes = Array.isArray(value[0]) ? asStringArray(value[0]) : asStringArray(value);
    for (const classType of classTypes) {
      if (!map.has(classType)) {
        map.set(classType, packKey);
      }
    }
  }
  return map;
}

export function parseComfyManagerNodeList(raw: unknown): ComfyManagerPackSpec[] {
  const record = asRecord(raw);
  const list = Array.isArray(record?.custom_nodes)
    ? record.custom_nodes
    : Array.isArray(record?.node_packs)
      ? record.node_packs
      : Array.isArray(raw)
        ? raw
        : [];
  const packs: ComfyManagerPackSpec[] = [];
  for (const item of list) {
    const entry = asRecord(item);
    if (!entry) {
      continue;
    }
    const files = asStringArray(entry.files);
    const name =
      (typeof entry.name === 'string' && entry.name.trim()) ||
      (typeof entry.id === 'string' && entry.id.trim()) ||
      (typeof entry.title === 'string' && entry.title.trim()) ||
      '';
    if (!name && files.length === 0) {
      continue;
    }
    const installType =
      entry.install_type === 'copy' || entry.install_type === 'unzip'
        ? entry.install_type
        : 'git-clone';
    packs.push({
      name: name || files[0] || 'custom-node',
      files: files.length > 0 ? files : name ? [name] : [],
      install_type: installType,
      ...(typeof entry.title === 'string' ? { title: entry.title } : {}),
      ...(typeof entry.id === 'string' ? { id: entry.id } : {}),
    });
  }
  return packs;
}

function packMatchesKey(pack: ComfyManagerPackSpec, packKey: string): boolean {
  const needle = packKey.trim().toLowerCase();
  if (!needle) {
    return false;
  }
  const haystacks = [pack.id, pack.name, pack.title, ...pack.files]
    .filter((value): value is string => Boolean(value?.trim()))
    .map(value => value.trim().toLowerCase());
  return haystacks.some(
    value => value === needle || value.includes(needle) || needle.includes(value)
  );
}

export function resolvePacksForMissingNodeTypes(input: {
  classTypes: string[];
  mappings: Map<string, string>;
  catalog: ComfyManagerPackSpec[];
}): { packs: ComfyManagerPackSpec[]; unresolved: string[] } {
  const packs: ComfyManagerPackSpec[] = [];
  const unresolved: string[] = [];

  for (const classType of input.classTypes) {
    const trimmed = classType.trim();
    if (!trimmed) {
      continue;
    }
    const packKey = input.mappings.get(trimmed);
    const fromCatalog = packKey
      ? input.catalog.find(pack => packMatchesKey(pack, packKey))
      : undefined;
    const known = lookupKnownComfyNodePack(trimmed);
    if (fromCatalog) {
      packs.push(fromCatalog);
    } else if (known) {
      packs.push(known);
    } else {
      unresolved.push(trimmed);
    }
  }

  return { packs: uniquePackSpecs(packs), unresolved };
}
