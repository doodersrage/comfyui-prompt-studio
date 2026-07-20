import dynamic from "next/dynamic";
import PageCanvas from "@/components/ui/PageCanvas";
import { ToolPageSkeleton } from "@/components/ui/ViewState";

const RefineTool = dynamic(() => import("@/components/RefineTool"), {
  loading: () => <ToolPageSkeleton label="Loading refine" />,
});

export default function RefinePage() {
  return (
    <PageCanvas accent="fuchsia">
      <RefineTool />
    </PageCanvas>
  );
}
