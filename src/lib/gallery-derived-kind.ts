import type { ComfyGalleryEntry } from './comfyui-gallery-entry';

export const GALLERY_DERIVED_KIND_FILTERS = [
  'upscale',
  'refine',
  'soft-pass',
  'variation',
  'moire-clean',
  'face-detail',
  'controlnet',
] as const satisfies ReadonlyArray<NonNullable<ComfyGalleryEntry['derivedKind']>>;

export type GalleryDerivedKindFilter = (typeof GALLERY_DERIVED_KIND_FILTERS)[number];

export function galleryDerivedKindLabel(
  kind: ComfyGalleryEntry['derivedKind'] | undefined
): string | undefined {
  switch (kind) {
    case 'upscale':
      return 'upscaled from prior';
    case 'refine':
      return 'refined from prior';
    case 'soft-pass':
      return 'soft second pass from prior';
    case 'variation':
      return 'variation of prior';
    case 'moire-clean':
      return 'moiré-cleaned from prior';
    case 'face-detail':
      return 'face-detailed from prior';
    case 'controlnet':
      return 'ControlNet from prior';
    default:
      return undefined;
  }
}

export function galleryDerivedKindChipLabel(kind: GalleryDerivedKindFilter): string {
  switch (kind) {
    case 'upscale':
      return 'Upscale';
    case 'refine':
      return 'Refine';
    case 'soft-pass':
      return 'Soft pass';
    case 'variation':
      return 'Variation';
    case 'moire-clean':
      return 'Moiré';
    case 'face-detail':
      return 'Face detail';
    case 'controlnet':
      return 'ControlNet';
    default:
      return kind;
  }
}
