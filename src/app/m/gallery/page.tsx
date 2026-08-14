import dynamic from 'next/dynamic';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const MobileGalleryTool = dynamic(() => import('@/components/mobile/MobileGalleryTool'), {
  ssr: false,
  loading: () => <ToolPageSkeleton label="Loading gallery" />,
});

export default function MobileGalleryPage() {
  return <MobileGalleryTool />;
}
