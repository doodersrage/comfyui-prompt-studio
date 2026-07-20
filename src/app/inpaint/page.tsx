import dynamic from "next/dynamic";
import PageCanvas from "@/components/ui/PageCanvas";
import { ToolPageSkeleton } from "@/components/ui/ViewState";

const InpaintTool = dynamic(() => import("@/components/InpaintTool"), {
  loading: () => <ToolPageSkeleton label="Loading inpaint" />,
});

export default function InpaintPage() {
  return (
    <PageCanvas accent="amber">
      <InpaintTool />
    </PageCanvas>
  );
}
