import { NextResponse } from "next/server";
import * as memory from "@/services/memoryService";

/** GET /api/memory/long-term — all long-term memory (user + global) */
export async function GET(request: Request) {
  const scope = request.nextUrl.searchParams.get("scope") as "user" | "global" | null;
  try {
    const items = await memory.getLongTermMemory(scope ?? undefined);
    return NextResponse.json({ items });
  } catch (e) {
    console.error("[GET /api/memory/long-term]", e);
    return NextResponse.json({ error: "Failed to load long-term memory" }, { status: 500 });
  }
}

/** POST /api/memory/long-term — create or update long-term entry */
export async function POST(request: Request) {
  let body: { id?: string; scope?: string; contentText?: string; contentJson?: string; tags?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const scope = (body.scope === "global" ? "global" : "user") as "user" | "global";
  const id = typeof body.id === "string" && body.id.trim() ? body.id.trim() : `manual-${Date.now()}`;
  const contentText = typeof body.contentText === "string" ? body.contentText : "";
  const contentJson = typeof body.contentJson === "string" ? body.contentJson : JSON.stringify({ text: contentText });
  const tags = typeof body.tags === "string" ? body.tags : "";

  try {
    const item = await memory.upsertLongTermMemory(scope, id, contentText, contentJson, tags);
    return NextResponse.json(item);
  } catch (e) {
    console.error("[POST /api/memory/long-term]", e);
    return NextResponse.json({ error: "Failed to upsert long-term memory" }, { status: 500 });
  }
}
