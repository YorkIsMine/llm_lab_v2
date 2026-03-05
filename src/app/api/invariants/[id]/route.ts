import { NextResponse } from "next/server";
import { archiveInvariant, updateInvariant } from "@/services/invariantService";
import type { InvariantStatus } from "@/types/invariant";

/** PATCH /api/invariants/:id — update invariant */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  let body: {
    title?: string;
    rule?: string;
    status?: InvariantStatus;
    priority?: number;
    tags?: string[];
    examplesAllowed?: string[];
    examplesForbidden?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  try {
    const updated = await updateInvariant(id, body);
    return NextResponse.json(updated);
  } catch (error) {
    const message = (error as Error).message || "Failed to update invariant";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

/** DELETE /api/invariants/:id — archive invariant */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  try {
    const archived = await archiveInvariant(id);
    return NextResponse.json({ ok: true, item: archived });
  } catch (error) {
    const message = (error as Error).message || "Failed to archive invariant";
    const status = message.includes("not found") ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
