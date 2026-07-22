import dynamic from "next/dynamic";
import PageCanvas from "@/components/ui/PageCanvas";
import { ToolPageSkeleton } from "@/components/ui/ViewState";

const ComposeTool = dynamic(() => import("@/components/ComposeTool"), {
  loading: () => <ToolPageSkeleton label="Loading compose" />,
});

export default function ComposePage() {
  return (
    <PageCanvas accent="cyan">
      <ComposeTool />
    </PageCanvas>
  );
}
