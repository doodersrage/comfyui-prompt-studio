'use client';

import { useEffect } from 'react';
import PageCanvas from '@/components/ui/PageCanvas';
import { EmptyState } from '@/components/ui/ViewState';

export default function NotFound() {
  useEffect(() => {
    // Log 404 errors for analytics
    console.warn('404 page accessed');
  }, []);

  return (
    <PageCanvas accent="neutral">
      <div className="mx-auto flex min-h-[50vh] max-w-2xl items-center justify-center px-6 py-16">
        <EmptyState
          icon="alert"
          title="Page not found"
          description="The page you're looking for doesn't exist or has been moved."
          action={{
            label: 'Go home',
            onClick: () => (window.location.href = '/'),
          }}
        />
      </div>
    </PageCanvas>
  );
}
