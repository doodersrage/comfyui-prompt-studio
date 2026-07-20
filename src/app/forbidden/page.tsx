import PageCanvas from "@/components/ui/PageCanvas";

export default function ForbiddenPage() {
  return (
    <PageCanvas accent="rose">
      <div className="mx-auto max-w-lg space-y-4 px-4 py-20 text-center">
        <h1 className="type-title text-zinc-50">Access blocked</h1>
        <p className="text-sm text-zinc-400">
          Your account or group does not have permission for this tool. Contact an admin to
          adjust blocked features in Settings → Users.
        </p>
        <a href="/" className="inline-flex text-sm text-violet-300 hover:text-violet-200">
          Back to home
        </a>
      </div>
    </PageCanvas>
  );
}
