import { GalleryMenuButton, GalleryMenuGroup } from '@/components/gallery/GalleryMenuPrimitives';
import type { GalleryCardMenuSectionProps } from '@/components/gallery/gallery-card-menu-types';

export function GalleryManageSection({ onRemove, setMenuOpen }: GalleryCardMenuSectionProps) {
  return (
    <GalleryMenuGroup label="Manage">
      <GalleryMenuButton
        label="Remove from gallery"
        tone="danger"
        onClick={() => {
          onRemove();
          setMenuOpen(false);
        }}
      />
    </GalleryMenuGroup>
  );
}
