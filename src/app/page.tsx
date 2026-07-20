import PageCanvas from "@/components/ui/PageCanvas";
import PromptGenerator from "@/components/PromptGenerator";

export default function Home() {
  return (
    <PageCanvas accent="violet">
      <PromptGenerator />
    </PageCanvas>
  );
}
