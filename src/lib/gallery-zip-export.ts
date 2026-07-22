import { buildGallerySidecar } from "./comfyui-gallery-export";
import type { ComfyGalleryEntry } from "./comfyui-gallery";
import { buildComfyViewPath } from "./comfyui-outputs";

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (let index = 0; index < data.length; index += 1) {
    crc ^= data[index];
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function u16(value: number): Uint8Array {
  return new Uint8Array([value & 0xff, (value >>> 8) & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    value & 0xff,
    (value >>> 8) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 24) & 0xff,
  ]);
}

function concat(chunks: Uint8Array[]): Uint8Array {
  const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}

export type ZipFileEntry = {
  filename: string;
  data: Uint8Array;
};

/** Tiny inline STORE-only (uncompressed) ZIP writer — no external dep required. */
export function buildZipBlob(files: ZipFileEntry[]): Blob {
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;

  for (const file of files) {
    const nameBytes = new TextEncoder().encode(file.filename);
    const checksum = crc32(file.data);

    const localHeader = concat([
      u32(0x04034b50),
      u16(20),
      u16(0),
      u16(0),
      u16(0),
      u16(0),
      u32(checksum),
      u32(file.data.length),
      u32(file.data.length),
      u16(nameBytes.length),
      u16(0),
      nameBytes,
    ]);

    localParts.push(localHeader, file.data);

    centralParts.push(
      concat([
        u32(0x02014b50),
        u16(20),
        u16(20),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(checksum),
        u32(file.data.length),
        u32(file.data.length),
        u16(nameBytes.length),
        u16(0),
        u16(0),
        u16(0),
        u16(0),
        u32(0),
        u32(offset),
        nameBytes,
      ]),
    );

    offset += localHeader.length + file.data.length;
  }

  const centralDirectory = concat(centralParts);
  const endRecord = concat([
    u32(0x06054b50),
    u16(0),
    u16(0),
    u16(files.length),
    u16(files.length),
    u32(centralDirectory.length),
    u32(offset),
    u16(0),
  ]);

  return new Blob([...localParts, centralDirectory, endRecord] as BlobPart[], {
    type: "application/zip",
  });
}

export async function downloadGalleryZipBundle(
  entries: ComfyGalleryEntry[],
): Promise<number> {
  const files: ZipFileEntry[] = [];

  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    const prefix = `entry-${index + 1}-${entry.promptId.slice(0, 8)}`;
    files.push({
      filename: `${prefix}/sidecar.json`,
      data: new TextEncoder().encode(
        JSON.stringify(buildGallerySidecar(entry), null, 2),
      ),
    });

    const image = entry.images[0];
    if (entry.status === "completed" && image) {
      try {
        const response = await fetch(buildComfyViewPath(entry.comfyUrl, image));
        if (response.ok) {
          files.push({
            filename: `${prefix}/${image.filename || "output.png"}`,
            data: new Uint8Array(await response.arrayBuffer()),
          });
        }
      } catch {
        // sidecar still exported
      }
    }
  }

  if (files.length === 0) {
    return 0;
  }

  const blob = buildZipBlob(files);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `gallery-export-${Date.now()}.zip`;
  anchor.click();
  URL.revokeObjectURL(url);
  return entries.length;
}
