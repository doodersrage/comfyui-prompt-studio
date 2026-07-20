import dynamic from "next/dynamic";
import PageCanvas from "@/components/ui/PageCanvas";
import { StudioTabSkeleton } from "@/components/ui/ViewState";

const StudioTool = dynamic(() => import("@/components/StudioTool"), {
  loading: () => (
    <PageCanvas accent="violet">
      <StudioTabSkeleton />
    </PageCanvas>
  ),
});

export default function StudioPage() {
  return (
    <PageCanvas accent="violet">
      <StudioTool />
    </PageCanvas>
  );
}
