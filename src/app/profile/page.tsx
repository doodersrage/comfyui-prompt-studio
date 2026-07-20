import dynamic from "next/dynamic";
import PageCanvas from "@/components/ui/PageCanvas";
import { ToolPageSkeleton } from "@/components/ui/ViewState";

const ProfilePanel = dynamic(() => import("@/components/profile/ProfilePanel"), {
  loading: () => <ToolPageSkeleton label="Loading profile" />,
});

export default function ProfilePage() {
  return (
    <PageCanvas accent="violet">
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="type-title mb-6 text-zinc-50">Profile</h1>
        <ProfilePanel />
      </div>
    </PageCanvas>
  );
}
