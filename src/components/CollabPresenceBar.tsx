"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  collabChannelName,
  createCollabPeerId,
  shouldWarnRemoteDraft,
  type CollabDraftPayload,
  type CollabPresencePeer,
} from "@/lib/collab-presence";
import { loadActiveProjectId } from "@/lib/prompt-projects";

type CollabPresenceBarProps = {
  tool?: string;
  draft?: string;
  displayName?: string;
};

/**
 * Presence strip for shared projects — BroadcastChannel + SSE /api/collab.
 */
export default function CollabPresenceBar({
  tool,
  draft,
  displayName = "You",
}: CollabPresenceBarProps) {
  const [peerId] = useState(() => createCollabPeerId());
  const [peers, setPeers] = useState<CollabPresencePeer[]>([]);
  const [remoteWarning, setRemoteWarning] = useState<string | null>(null);
  const localDraftAtRef = useRef<number | undefined>(undefined);
  const projectId = useMemo(
    () => (typeof window === "undefined" ? "default" : loadActiveProjectId() || "default"),
    [],
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const channel = new BroadcastChannel(collabChannelName(projectId));
    const onMessage = (event: MessageEvent) => {
      const data = event.data as
        | { type: "presence"; peer: CollabPresencePeer }
        | { type: "draft"; payload: CollabDraftPayload };
      if (data?.type === "presence" && data.peer) {
        setPeers((current) => {
          const without = current.filter((p) => p.peerId !== data.peer.peerId);
          return [...without, data.peer];
        });
      }
      if (data?.type === "draft" && data.payload) {
        if (shouldWarnRemoteDraft(localDraftAtRef.current, data.payload, peerId)) {
          setRemoteWarning(
            `${data.payload.peerId.slice(0, 6)} edited the shared draft`,
          );
        }
      }
    };
    channel.addEventListener("message", onMessage);

    const beat = () => {
      const peer: CollabPresencePeer = {
        peerId,
        displayName,
        projectId,
        tool,
        lastSeenAt: Date.now(),
      };
      channel.postMessage({ type: "presence", peer });
      void fetch("/api/collab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "presence", projectId, peer }),
      }).catch(() => undefined);
    };
    beat();
    const timer = window.setInterval(beat, 5000);

    const source = new EventSource(
      `/api/collab?projectId=${encodeURIComponent(projectId)}`,
    );
    source.addEventListener("presence", (event) => {
      try {
        const parsed = JSON.parse((event as MessageEvent).data) as {
          peers?: CollabPresencePeer[];
        };
        if (parsed.peers) {
          setPeers(parsed.peers);
        }
      } catch {
        // ignore
      }
    });
    source.addEventListener("draft", (event) => {
      try {
        const payload = JSON.parse(
          (event as MessageEvent).data,
        ) as CollabDraftPayload;
        if (shouldWarnRemoteDraft(localDraftAtRef.current, payload, peerId)) {
          setRemoteWarning("Someone else edited the shared draft");
        }
      } catch {
        // ignore
      }
    });

    return () => {
      window.clearInterval(timer);
      channel.removeEventListener("message", onMessage);
      channel.close();
      source.close();
    };
  }, [displayName, peerId, projectId, tool]);

  useEffect(() => {
    if (draft == null) {
      return;
    }
    const at = Date.now();
    localDraftAtRef.current = at;
    const payload: CollabDraftPayload = {
      projectId,
      peerId,
      tool,
      draft,
      updatedAt: at,
    };
    try {
      const channel = new BroadcastChannel(collabChannelName(projectId));
      channel.postMessage({ type: "draft", payload });
      channel.close();
    } catch {
      // ignore
    }
    const handle = window.setTimeout(() => {
      void fetch("/api/collab", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "draft",
          projectId,
          peerId,
          tool,
          draft,
        }),
      }).catch(() => undefined);
    }, 400);
    return () => window.clearTimeout(handle);
  }, [draft, peerId, projectId, tool]);

  const others = peers.filter((peer) => peer.peerId !== peerId);

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-800/80 bg-zinc-950/50 px-3 py-2 text-[11px] text-zinc-400">
      <span className="font-medium text-zinc-300">Live · {projectId}</span>
      {others.length === 0 ? (
        <span>Only you here</span>
      ) : (
        others.map((peer) => (
          <span
            key={peer.peerId}
            className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-emerald-100"
          >
            {peer.displayName}
            {peer.tool ? ` · ${peer.tool}` : ""}
          </span>
        ))
      )}
      {remoteWarning ? (
        <span className="text-amber-200">{remoteWarning}</span>
      ) : null}
    </div>
  );
}
