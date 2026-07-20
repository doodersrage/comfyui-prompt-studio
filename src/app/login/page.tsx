import { Suspense } from "react";
import PageCanvas from "@/components/ui/PageCanvas";
import LoginForm from "@/components/auth/LoginForm";

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
