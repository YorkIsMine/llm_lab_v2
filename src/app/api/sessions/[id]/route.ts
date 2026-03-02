import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** DELETE /api/sessions/:id — delete chat (cascade: messages + working memory; long-term kept) */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    await prisma.chatSession.delete({
      where: { id },
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[DELETE /api/sessions/:id]", e);
    return NextResponse.json({ error: "Session not found or delete failed" }, { status: 404 });
  }
}
