import { NextResponse } from "next/server";
import { getMemoryView } from "@/services/memoryService";

/** GET /api/sessions/:id/memory — short (computed) + working + long-term for session */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  try {
    const view = await getMemoryView(sessionId);
    return NextResponse.json(view);
  } catch (e) {
    console.error("[GET /api/sessions/:id/memory]", e);
    return NextResponse.json({ error: "Failed to load memory" }, { status: 500 });
  }
}
