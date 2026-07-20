import PageCanvas from "@/components/ui/PageCanvas";
import ProfilePanel from "@/components/profile/ProfilePanel";

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
