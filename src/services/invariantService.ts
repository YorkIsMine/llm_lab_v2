import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import {
  DEFAULT_INVARIANT_SCOPE_CONTEXT,
  INVARIANT_STATUSES,
  INVARIANT_SCOPES,
  INVARIANTS_ENABLED_SETTING_PREFIX,
  type Invariant,
  type InvariantCreatePayload,
  type InvariantScope,
  type InvariantScopeContext,
  type InvariantStatus,
  type InvariantUpdatePayload,
  type InvariantValidationResult,
} from "@/types/invariant";

export interface InvariantStore {
  list(params: {
    scopeType: InvariantScope;
    scopeId: string | null;
    includeGlobal: boolean;
    status: InvariantStatus | "all";
  }): Promise<Invariant[]>;
  create(data: Omit<Invariant, "id" | "createdAt" | "updatedAt">): Promise<Invariant>;
  update(
    id: string,
    patch: Partial<Omit<Invariant, "id" | "createdAt" | "updatedAt" | "scopeType" | "scopeId" | "createdBy">>
  ): Promise<Invariant | null>;
  getById(id: string): Promise<Invariant | null>;
  getSetting(key: string): Promise<string | null>;
  setSetting(key: string, value: string): Promise<void>;
}

function normalizeScopeContext(scopeContext?: InvariantScopeContext): {
  scopeType: InvariantScope;
  scopeId: string | null;
  includeGlobal: boolean;
} {
  const source = scopeContext ?? DEFAULT_INVARIANT_SCOPE_CONTEXT;
  const scopeType = INVARIANT_SCOPES.includes(source.scopeType) ? source.scopeType : "user";
  const scopeId = typeof source.scopeId === "string" && source.scopeId.trim() ? source.scopeId.trim() : null;
  const includeGlobal = source.includeGlobal ?? scopeType !== "global";
  return { scopeType, scopeId, includeGlobal };
}

function ensureNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required`);
  }
  return value.trim();
}

function ensureOptionalString(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (typeof value !== "string") {
    throw new Error("Field must be a string");
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function ensureStringArray(value: unknown, fieldName: string): string[] {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    throw new Error(`${fieldName} must be an array of strings`);
  }
  return value
    .map((item) => String(item).trim())
    .filter(Boolean);
}

function ensureStatus(value: unknown, fallback: InvariantStatus): InvariantStatus {
  if (value == null) return fallback;
  if (value === "active" || value === "archived") return value;
  throw new Error("status must be active or archived");
}

function ensurePriority(value: unknown, fallback: number): number {
  if (value == null) return fallback;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    throw new Error("priority must be an integer");
  }
  return Math.min(1000, Math.max(1, value));
}

function validateInvariantPatchPayload(payload: InvariantUpdatePayload): Partial<InvariantValidationResult> {
  const patch: Partial<InvariantValidationResult> = {};

  if (payload.title !== undefined) {
    patch.title = ensureNonEmptyString(payload.title, "title");
  }
  if (payload.rule !== undefined) {
    patch.rule = ensureNonEmptyString(payload.rule, "rule");
  }
  if (payload.status !== undefined) {
    patch.status = ensureStatus(payload.status, "active");
  }
  if (payload.priority !== undefined) {
    patch.priority = ensurePriority(payload.priority, 100);
  }
  if (payload.tags !== undefined) {
    patch.tags = ensureStringArray(payload.tags, "tags");
  }
  if (payload.examplesAllowed !== undefined) {
    patch.examplesAllowed = ensureStringArray(payload.examplesAllowed, "examplesAllowed");
  }
  if (payload.examplesForbidden !== undefined) {
    patch.examplesForbidden = ensureStringArray(payload.examplesForbidden, "examplesForbidden");
  }

  return patch;
}

export function validateInvariantPayload(payload: InvariantCreatePayload): InvariantValidationResult {
  return {
    title: ensureNonEmptyString(payload.title, "title"),
    rule: ensureNonEmptyString(payload.rule, "rule"),
    status: ensureStatus(payload.status, "active"),
    priority: ensurePriority(payload.priority, 100),
    tags: ensureStringArray(payload.tags, "tags"),
    examplesAllowed: ensureStringArray(payload.examplesAllowed, "examplesAllowed"),
    examplesForbidden: ensureStringArray(payload.examplesForbidden, "examplesForbidden"),
    createdBy: ensureOptionalString(payload.createdBy) ?? null,
  };
}

function decodeArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) => String(item).trim()).filter(Boolean);
  } catch {
    return raw
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function encodeArray(items: string[]): string {
  return JSON.stringify(items.map((item) => item.trim()).filter(Boolean));
}

function toDomain(row: {
  id: string;
  title: string;
  rule: string;
  scopeType: string;
  scopeId: string | null;
  status: string;
  priority: number;
  tags: string;
  examplesAllowed: string | null;
  examplesForbidden: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}): Invariant {
  const scopeType = INVARIANT_SCOPES.includes(row.scopeType as InvariantScope)
    ? (row.scopeType as InvariantScope)
    : "user";
  const status = INVARIANT_STATUSES.includes(row.status as InvariantStatus)
    ? (row.status as InvariantStatus)
    : "archived";

  return {
    id: row.id,
    title: row.title,
    rule: row.rule,
    scopeType,
    scopeId: row.scopeId,
    status,
    priority: row.priority,
    tags: decodeArray(row.tags),
    examplesAllowed: decodeArray(row.examplesAllowed),
    examplesForbidden: decodeArray(row.examplesForbidden),
    createdBy: row.createdBy,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function createPrismaInvariantStore(): InvariantStore {
  return {
    async list(params) {
      const scopeFilters: Array<{ scopeType: string; scopeId?: string | null }> = [
        params.scopeId ? { scopeType: params.scopeType, scopeId: params.scopeId } : { scopeType: params.scopeType },
      ];
      if (params.includeGlobal && params.scopeType !== "global") {
        scopeFilters.push({ scopeType: "global" });
      }

      const rows = await prisma.invariant.findMany({
        where: {
          ...(params.status === "all" ? {} : { status: params.status }),
          OR: scopeFilters,
        },
        orderBy: [{ priority: "asc" }, { updatedAt: "desc" }],
      });

      return rows.map((row) => toDomain(row));
    },

    async create(data) {
      const row = await prisma.invariant.create({
        data: {
          title: data.title,
          rule: data.rule,
          scopeType: data.scopeType,
          scopeId: data.scopeId,
          status: data.status,
          priority: data.priority,
          tags: encodeArray(data.tags),
          examplesAllowed: data.examplesAllowed.length > 0 ? encodeArray(data.examplesAllowed) : null,
          examplesForbidden: data.examplesForbidden.length > 0 ? encodeArray(data.examplesForbidden) : null,
          createdBy: data.createdBy,
        },
      });
      return toDomain(row);
    },

    async update(id, patch) {
      try {
        const row = await prisma.invariant.update({
          where: { id },
          data: {
            ...(patch.title !== undefined ? { title: patch.title } : {}),
            ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
            ...(patch.status !== undefined ? { status: patch.status } : {}),
            ...(patch.priority !== undefined ? { priority: patch.priority } : {}),
            ...(patch.tags !== undefined ? { tags: encodeArray(patch.tags) } : {}),
            ...(patch.examplesAllowed !== undefined
              ? { examplesAllowed: patch.examplesAllowed.length > 0 ? encodeArray(patch.examplesAllowed) : null }
              : {}),
            ...(patch.examplesForbidden !== undefined
              ? { examplesForbidden: patch.examplesForbidden.length > 0 ? encodeArray(patch.examplesForbidden) : null }
              : {}),
          },
        });
        return toDomain(row);
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
          return null;
        }
        throw error;
      }
    },

    async getById(id) {
      const row = await prisma.invariant.findUnique({ where: { id } });
      return row ? toDomain(row) : null;
    },

    async getSetting(key) {
      const row = await prisma.assistantSetting.findUnique({ where: { key } });
      return row?.value ?? null;
    },

    async setSetting(key, value) {
      await prisma.assistantSetting.upsert({
        where: { key },
        create: { key, value },
        update: { value },
      });
    },
  };
}

export function getInvariantSettingsKey(scopeContext?: InvariantScopeContext): string {
  const normalized = normalizeScopeContext(scopeContext);
  const scopeId = normalized.scopeId ?? "*";
  return `${INVARIANTS_ENABLED_SETTING_PREFIX}:${normalized.scopeType}:${scopeId}`;
}

export function createInvariantService(store: InvariantStore) {
  const list = async (
    scopeContext: InvariantScopeContext = DEFAULT_INVARIANT_SCOPE_CONTEXT,
    options: { status?: InvariantStatus | "all" } = {}
  ): Promise<Invariant[]> => {
    const normalized = normalizeScopeContext(scopeContext);
    const status = options.status ?? "active";
    return store.list({
      scopeType: normalized.scopeType,
      scopeId: normalized.scopeId,
      includeGlobal: normalized.includeGlobal,
      status,
    });
  };

  return {
    listInvariants: list,

    async createInvariant(
      scopeContext: InvariantScopeContext,
      payload: InvariantCreatePayload
    ): Promise<Invariant> {
      const normalized = normalizeScopeContext(scopeContext);
      const validated = validateInvariantPayload(payload);

      return store.create({
        title: validated.title,
        rule: validated.rule,
        status: validated.status,
        priority: validated.priority,
        tags: validated.tags,
        examplesAllowed: validated.examplesAllowed,
        examplesForbidden: validated.examplesForbidden,
        createdBy: validated.createdBy,
        scopeType: normalized.scopeType,
        scopeId: normalized.scopeId,
      });
    },

    async updateInvariant(id: string, patch: InvariantUpdatePayload): Promise<Invariant> {
      const validatedPatch = validateInvariantPatchPayload(patch);
      if (Object.keys(validatedPatch).length === 0) {
        throw new Error("No valid fields to update");
      }
      const updated = await store.update(id, validatedPatch);
      if (!updated) {
        throw new Error("Invariant not found");
      }
      return updated;
    },

    async archiveInvariant(id: string): Promise<Invariant> {
      const archived = await store.update(id, { status: "archived" });
      if (!archived) {
        throw new Error("Invariant not found");
      }
      return archived;
    },

    async deleteInvariant(id: string): Promise<Invariant> {
      const archived = await store.update(id, { status: "archived" });
      if (!archived) {
        throw new Error("Invariant not found");
      }
      return archived;
    },

    validateInvariantPayload,

    async findInvariantByReference(
      reference: string,
      scopeContext: InvariantScopeContext = DEFAULT_INVARIANT_SCOPE_CONTEXT
    ): Promise<Invariant | null> {
      const ref = reference.trim();
      if (!ref) return null;

      const exact = await store.getById(ref);
      if (exact) return exact;

      const all = await list(scopeContext, { status: "all" });
      const byPrefix = all.filter((item) => item.id.startsWith(ref));
      if (byPrefix.length === 1) return byPrefix[0];
      return null;
    },

    async areInvariantsEnabled(scopeContext: InvariantScopeContext = DEFAULT_INVARIANT_SCOPE_CONTEXT): Promise<boolean> {
      const key = getInvariantSettingsKey(scopeContext);
      const value = await store.getSetting(key);
      return value == null ? true : value !== "off";
    },

    async setInvariantsEnabled(
      scopeContext: InvariantScopeContext = DEFAULT_INVARIANT_SCOPE_CONTEXT,
      enabled: boolean
    ): Promise<boolean> {
      const key = getInvariantSettingsKey(scopeContext);
      await store.setSetting(key, enabled ? "on" : "off");
      return enabled;
    },
  };
}

const defaultService = createInvariantService(createPrismaInvariantStore());

export const listInvariants = defaultService.listInvariants;
export const createInvariant = defaultService.createInvariant;
export const updateInvariant = defaultService.updateInvariant;
export const archiveInvariant = defaultService.archiveInvariant;
export const deleteInvariant = defaultService.deleteInvariant;
export const findInvariantByReference = defaultService.findInvariantByReference;
export const areInvariantsEnabled = defaultService.areInvariantsEnabled;
export const setInvariantsEnabled = defaultService.setInvariantsEnabled;
