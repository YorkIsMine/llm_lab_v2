import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { sendMessage } from "@/services/chatService";
import { coerceAgentPhase } from "@/types/agentPhase";

/** GET /api/sessions/:id/messages — history */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  try {
    const [session, messages] = await Promise.all([
      prisma.chatSession.findUnique({
        where: { id: sessionId },
        select: { id: true, agentPhase: true },
      }),
      prisma.message.findMany({
        where: { sessionId },
        orderBy: { createdAt: "asc" },
      }),
    ]);

    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    return NextResponse.json({
      phase: coerceAgentPhase(session.agentPhase),
      messages: messages.map((m) => ({
        id: m.id,
        sessionId: m.sessionId,
        role: m.role,
        content: m.content,
        createdAt: m.createdAt.toISOString(),
      })),
    });
  } catch (e) {
    console.error("[GET /api/sessions/:id/messages]", e);
    return NextResponse.json({ error: "Failed to load messages" }, { status: 500 });
  }
}

/** POST /api/sessions/:id/messages — send user message, get assistant reply */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: sessionId } = await params;
  let body: { content?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const content = typeof body.content === "string" ? body.content.trim() : "";
  if (!content) {
    return NextResponse.json({ error: "content is required" }, { status: 400 });
  }

  try {
    const session = await prisma.chatSession.findUnique({ where: { id: sessionId } });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }

    const result = await sendMessage(sessionId, content);

    const updated = await prisma.chatSession.update({
      where: { id: sessionId },
      data: { updatedAt: new Date() },
    });
    if (updated.title === "New Chat") {
      const title = content.slice(0, 50) + (content.length > 50 ? "…" : "");
      await prisma.chatSession.update({
        where: { id: sessionId },
        data: { title },
      });
    }

    return NextResponse.json(result);
  } catch (e) {
    console.error("[POST /api/sessions/:id/messages]", e);
    return NextResponse.json({ error: "Failed to send message" }, { status: 500 });
  }
}
