export default function OfflinePage() {
  return (
    <main className="mx-auto flex min-h-[70vh] max-w-lg flex-col justify-center gap-4 px-6 py-16 text-zinc-200">
      <p className="text-xs uppercase tracking-[0.2em] text-zinc-500">Offline</p>
      <h1 className="text-3xl font-semibold tracking-tight">Shell only</h1>
      <p className="text-sm leading-relaxed text-zinc-400">
        You&apos;re offline. Settings and cached gallery views may still open;
        queueing and LLM calls need a network connection.
      </p>
    </main>
  );
}
