'use client';

import MotionMedia from '@/components/ui/MotionMedia';
import { galleryEntryHeroPreviewUrl, type ComfyGalleryEntry } from '@/lib/comfyui-gallery';
import { isMotionViewUrl } from '@/lib/comfyui-outputs';

/**
 * Grid/list preview for a gallery entry: looping clip for video/animated webp,
 * still thumb otherwise.
 */
export default function GalleryEntryPreview({
  entry,
  className,
  alt = '',
  controls = false,
}: {
  entry: ComfyGalleryEntry;
  className?: string;
  alt?: string;
  controls?: boolean;
}) {
  const src = galleryEntryHeroPreviewUrl(entry);
  if (!src) {
    return null;
  }
  if (isMotionViewUrl(src)) {
    return (
      <MotionMedia
        src={src}
        alt={alt}
        className={className}
        autoPlay
        loop
        muted
        controls={controls}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} loading="lazy" decoding="async" className={className} />
  );
}
