'use client';

import { use } from 'react';
import PageCanvas from '@/components/ui/PageCanvas';
import CharacterHome from '@/components/CharacterHome';

type CharacterHomePageProps = {
  params: Promise<{ id: string }>;
};

export default function CharacterHomePage({ params }: CharacterHomePageProps) {
  const { id } = use(params);
  return (
    <PageCanvas accent="sky">
      <CharacterHome characterId={decodeURIComponent(id)} />
    </PageCanvas>
  );
}
