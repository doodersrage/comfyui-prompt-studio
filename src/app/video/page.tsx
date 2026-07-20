import dynamic from "next/dynamic";
import PageCanvas from "@/components/ui/PageCanvas";
import { ToolPageSkeleton } from "@/components/ui/ViewState";

const VideoPromptTool = dynamic(() => import("@/components/VideoPromptTool"), {
  loading: () => <ToolPageSkeleton label="Loading video prompt" />,
});

export default function VideoPage() {
  return (
    <PageCanvas accent="violet">
      <VideoPromptTool />
    </PageCanvas>
  );
}
