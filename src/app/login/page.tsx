import { Suspense } from 'react';
import dynamic from 'next/dynamic';
import PageCanvas from '@/components/ui/PageCanvas';

const LoginForm = dynamic(() => import('@/components/auth/LoginForm'), {
  ssr: false,
  loading: () => <div className="text-sm text-zinc-500">Loading…</div>,
});

export default function LoginPage() {
  return (
    <PageCanvas accent="violet">
      <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
        <Suspense fallback={<div className="text-sm text-zinc-500">Loading…</div>}>
          <LoginForm />
        </Suspense>
      </div>
    </PageCanvas>
  );
}
