'use client';

import { useState } from 'react';
import { isHtmlVideoViewUrl, stripGalleryViewWidthParam } from '@/lib/comfyui-outputs';

type MotionMediaProps = {
  src: string;
  alt?: string;
  className?: string;
  poster?: string;
  autoPlay?: boolean;
  controls?: boolean;
  loop?: boolean;
  muted?: boolean;
};

/**
 * Play a clip in-place: `<video>` for mp4/webm, `<img>` for animated webp/gif.
 * Falls back once if the first element cannot decode the bytes.
 */
export default function MotionMedia({
  src,
  alt = '',
  className,
  poster,
  autoPlay = true,
  controls = false,
  loop = true,
  muted = true,
}: MotionMediaProps) {
  const url = stripGalleryViewWidthParam(src);
  const preferred = isHtmlVideoViewUrl(url) ? 'video' : 'image';
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const mode = failedUrl === url ? (preferred === 'video' ? 'image' : 'video') : preferred;

  const swap = () => {
    setFailedUrl(url);
  };

  if (mode === 'video') {
    return (
      <video
        src={url}
        className={className}
        autoPlay={autoPlay}
        loop={loop}
        muted={muted}
        playsInline
        controls={controls}
        poster={poster}
        onError={swap}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={url} alt={alt} className={className} onError={swap} />
  );
}
