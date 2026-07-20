import dynamic from "next/dynamic";
import PageCanvas from "@/components/ui/PageCanvas";
import { ToolPageSkeleton } from "@/components/ui/ViewState";

const PromptGenerator = dynamic(() => import("@/components/PromptGenerator"), {
  loading: () => <ToolPageSkeleton label="Loading generate" />,
});

export default function Home() {
  return (
    <PageCanvas accent="violet">
      <PromptGenerator />
    </PageCanvas>
  );
}
