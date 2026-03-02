import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** POST /api/sessions — create new chat */
export async function POST() {
  try {
    const session = await prisma.chatSession.create({
      data: { title: "New Chat" },
    });
    return NextResponse.json({
      id: session.id,
      title: session.title,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    });
  } catch (e) {
    console.error("[POST /api/sessions]", e);
    return NextResponse.json({ error: "Failed to create session" }, { status: 500 });
  }
}

/** GET /api/sessions — list chats (single-user: no auth filter) */
export async function GET() {
  try {
    const sessions = await prisma.chatSession.findMany({
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(
      sessions.map((s) => ({
        id: s.id,
        title: s.title,
        createdAt: s.createdAt.toISOString(),
        updatedAt: s.updatedAt.toISOString(),
      }))
    );
  } catch (e) {
    console.error("[GET /api/sessions]", e);
    return NextResponse.json({ error: "Failed to list sessions" }, { status: 500 });
  }
}
