import dynamic from "next/dynamic";
import { ToolPageSkeleton } from "@/components/ui/ViewState";

const QueueTool = dynamic(() => import("@/components/QueueTool"), {
  loading: () => <ToolPageSkeleton label="Loading queue" />,
});

export default function QueuePage() {
  return <QueueTool />;
}
