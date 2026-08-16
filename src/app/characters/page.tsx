import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';
import { ToolPageSkeleton } from '@/components/ui/ViewState';

const CharacterCastRoster = dynamic(() => import('@/components/CharacterCastRoster'), {
  loading: () => <ToolPageSkeleton label="Loading cast" />,
});

export default function CharactersPage() {
  return (
    <PageCanvas accent="sky">
      <CharacterCastRoster />
    </PageCanvas>
  );
}
