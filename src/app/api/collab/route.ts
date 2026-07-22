import { NextResponse } from "next/server";
import {
  pruneStalePeers,
  upsertPresencePeer,
  type CollabDraftPayload,
  type CollabPresencePeer,
} from "@/lib/collab-presence";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RoomState = {
  peers: CollabPresencePeer[];
  draft?: CollabDraftPayload;
};

const rooms = new Map<string, RoomState>();

function getRoom(projectId: string): RoomState {
  const key = projectId.trim() || "default";
  let room = rooms.get(key);
  if (!room) {
    room = { peers: [] };
    rooms.set(key, room);
  }
  return room;
}

/** GET SSE stream — presence snapshots every few seconds + draft pushes. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId")?.trim() || "default";
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: string, data: unknown) => {
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      const room = getRoom(projectId);
      room.peers = pruneStalePeers(room.peers);
      send("presence", { peers: room.peers });
      if (room.draft) {
        send("draft", room.draft);
      }

      const timer = setInterval(() => {
        const current = getRoom(projectId);
        current.peers = pruneStalePeers(current.peers);
        send("presence", { peers: current.peers });
        send("ping", { at: Date.now() });
      }, 4000);

      request.signal.addEventListener("abort", () => {
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // ignore
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

/** POST presence heartbeat or draft update. */
export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const projectId =
    typeof record.projectId === "string" && record.projectId.trim()
      ? record.projectId.trim()
      : "default";
  const room = getRoom(projectId);

  if (record.type === "presence" && record.peer && typeof record.peer === "object") {
    const peer = record.peer as CollabPresencePeer;
    if (peer.peerId && peer.displayName) {
      room.peers = upsertPresencePeer(room.peers, {
        ...peer,
        projectId,
        lastSeenAt: Date.now(),
      });
    }
    return NextResponse.json({ ok: true, peers: room.peers });
  }

  if (record.type === "draft" && typeof record.draft === "string") {
    const payload: CollabDraftPayload = {
      projectId,
      peerId: typeof record.peerId === "string" ? record.peerId : "unknown",
      tool: typeof record.tool === "string" ? record.tool : undefined,
      draft: record.draft.slice(0, 20_000),
      updatedAt: Date.now(),
    };
    room.draft = payload;
    return NextResponse.json({ ok: true, draft: payload });
  }

  return NextResponse.json({ ok: false, error: "Unknown event" }, { status: 400 });
}
