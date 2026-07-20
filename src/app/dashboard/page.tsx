import dynamic from "next/dynamic";
import PageCanvas from "@/components/ui/PageCanvas";
import { ToolPageSkeleton } from "@/components/ui/ViewState";

const HomeDashboard = dynamic(() => import("@/components/HomeDashboard"), {
  loading: () => <ToolPageSkeleton label="Loading dashboard" />,
});

export default function DashboardPage() {
  return (
    <PageCanvas accent="neutral">
      <HomeDashboard />
    </PageCanvas>
  );
}
