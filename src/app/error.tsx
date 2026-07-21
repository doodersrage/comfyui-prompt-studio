"use client";

import { useEffect } from "react";
import PageCanvas from "@/components/ui/PageCanvas";
import { EmptyState } from "@/components/ui/ViewState";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <PageCanvas accent="neutral">
      <div className="mx-auto flex min-h-[50vh] max-w-2xl items-center justify-center px-6 py-16">
        <EmptyState
          icon="alert"
          title="Something went wrong"
          description={
            error.digest
              ? `An unexpected error occurred (ref ${error.digest}). Try again, or reload the page.`
              : "An unexpected error occurred. Try again, or reload the page."
          }
          action={{ label: "Try again", onClick: () => reset() }}
        />
      </div>
    </PageCanvas>
  );
}
