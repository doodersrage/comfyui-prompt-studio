import dynamic from "next/dynamic";
import PageCanvas from "@/components/ui/PageCanvas";
import { ToolPageSkeleton } from "@/components/ui/ViewState";

const CharacterTool = dynamic(() => import("@/components/CharacterTool"), {
  loading: () => <ToolPageSkeleton label="Loading character" />,
});

export default function CharacterPage() {
  return (
    <PageCanvas accent="sky">
      <CharacterTool />
    </PageCanvas>
  );
}
