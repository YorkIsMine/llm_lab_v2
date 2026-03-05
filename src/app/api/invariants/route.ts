import { NextResponse } from "next/server";
import {
  areInvariantsEnabled,
  createInvariant,
  listInvariants,
  setInvariantsEnabled,
} from "@/services/invariantService";
import {
  DEFAULT_INVARIANT_SCOPE_CONTEXT,
  type InvariantScope,
  type InvariantScopeContext,
  type InvariantStatus,
} from "@/types/invariant";

function parseScopeFromQuery(url: URL): InvariantScopeContext {
  const scopeType = (url.searchParams.get("scopeType") ?? DEFAULT_INVARIANT_SCOPE_CONTEXT.scopeType) as InvariantScope;
  const scopeId = url.searchParams.get("scopeId") ?? DEFAULT_INVARIANT_SCOPE_CONTEXT.scopeId ?? null;
  const includeGlobalParam = url.searchParams.get("includeGlobal");
  const includeGlobal = includeGlobalParam == null ? true : includeGlobalParam !== "false";
  return { scopeType, scopeId, includeGlobal };
}

function deriveTitle(rule: string): string {
  const words = rule
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
  return words || "Invariant";
}

/** GET /api/invariants — list invariants + enabled flag for current scope. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const scope = parseScopeFromQuery(url);
  const statusParam = url.searchParams.get("status");
  const status: InvariantStatus | "all" =
    statusParam === "all" || statusParam === "archived" || statusParam === "active" ? statusParam : "active";

  try {
    const [items, enabled] = await Promise.all([
      listInvariants(scope, { status }),
      areInvariantsEnabled(scope),
    ]);
    return NextResponse.json({ items, enabled });
  } catch (error) {
    console.error("[GET /api/invariants]", error);
    return NextResponse.json({ error: "Failed to load invariants" }, { status: 500 });
  }
}

/** POST /api/invariants — create invariant. */
export async function POST(request: Request) {
  let body: {
    title?: string;
    rule?: string;
    status?: InvariantStatus;
    scopeType?: InvariantScope;
    scopeId?: string;
    createdBy?: string;
    tags?: string[];
    priority?: number;
    examplesAllowed?: string[];
    examplesForbidden?: string[];
  };

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const rule = typeof body.rule === "string" ? body.rule.trim() : "";
  if (!rule) {
    return NextResponse.json({ error: "rule is required" }, { status: 400 });
  }

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : deriveTitle(rule);
  const scope: InvariantScopeContext = {
    scopeType: body.scopeType ?? DEFAULT_INVARIANT_SCOPE_CONTEXT.scopeType,
    scopeId: body.scopeId ?? DEFAULT_INVARIANT_SCOPE_CONTEXT.scopeId,
    includeGlobal: true,
  };

  try {
    const created = await createInvariant(scope, {
      title,
      rule,
      status: body.status,
      createdBy: body.createdBy,
      tags: body.tags,
      priority: body.priority,
      examplesAllowed: body.examplesAllowed,
      examplesForbidden: body.examplesForbidden,
    });
    return NextResponse.json(created);
  } catch (error) {
    console.error("[POST /api/invariants]", error);
    return NextResponse.json({ error: (error as Error).message || "Failed to create invariant" }, { status: 400 });
  }
}

/** PATCH /api/invariants — toggle enabled flag for current scope. */
export async function PATCH(request: Request) {
  let body: { enabled?: boolean; scopeType?: InvariantScope; scopeId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "enabled boolean is required" }, { status: 400 });
  }

  const scope: InvariantScopeContext = {
    scopeType: body.scopeType ?? DEFAULT_INVARIANT_SCOPE_CONTEXT.scopeType,
    scopeId: body.scopeId ?? DEFAULT_INVARIANT_SCOPE_CONTEXT.scopeId,
    includeGlobal: true,
  };

  try {
    const enabled = await setInvariantsEnabled(scope, body.enabled);
    return NextResponse.json({ enabled });
  } catch (error) {
    console.error("[PATCH /api/invariants]", error);
    return NextResponse.json({ error: "Failed to update invariant settings" }, { status: 500 });
  }
}
