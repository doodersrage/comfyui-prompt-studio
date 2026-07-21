import PageCanvas from "@/components/ui/PageCanvas";
import { Skeleton } from "@/components/ui/Button";

export default function GlobalLoading() {
  return (
    <PageCanvas accent="neutral">
      <div className="mx-auto w-full max-w-6xl space-y-6 px-6 py-10">
        <div className="space-y-3">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-72 max-w-full" />
          <Skeleton className="h-4 w-full max-w-xl" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
          <Skeleton className="h-40 rounded-2xl" />
        </div>
      </div>
    </PageCanvas>
  );
}
