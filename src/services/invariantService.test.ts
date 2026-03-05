import assert from "node:assert/strict";
import test from "node:test";
import {
  createInvariantService,
  type InvariantStore,
  validateInvariantPayload,
} from "./invariantService";
import { DEFAULT_INVARIANT_SCOPE_CONTEXT, type Invariant } from "../types/invariant";

class InMemoryInvariantStore implements InvariantStore {
  private items: Invariant[] = [];
  private settings = new Map<string, string>();

  async list(params: {
    scopeType: "user" | "workspace" | "global";
    scopeId: string | null;
    includeGlobal: boolean;
    status: "active" | "archived" | "all";
  }): Promise<Invariant[]> {
    return this.items
      .filter((item) => {
        const matchesScope =
          (item.scopeType === params.scopeType && (params.scopeId ? item.scopeId === params.scopeId : true)) ||
          (params.includeGlobal && item.scopeType === "global");
        const matchesStatus = params.status === "all" ? true : item.status === params.status;
        return matchesScope && matchesStatus;
      })
      .sort((a, b) => (a.priority === b.priority ? b.updatedAt.localeCompare(a.updatedAt) : a.priority - b.priority));
  }

  async create(data: Omit<Invariant, "id" | "createdAt" | "updatedAt">): Promise<Invariant> {
    const now = new Date().toISOString();
    const created: Invariant = {
      ...data,
      id: `inv-${this.items.length + 1}`,
      createdAt: now,
      updatedAt: now,
    };
    this.items.unshift(created);
    return created;
  }

  async update(
    id: string,
    patch: Partial<Omit<Invariant, "id" | "createdAt" | "updatedAt" | "scopeType" | "scopeId" | "createdBy">>
  ): Promise<Invariant | null> {
    const index = this.items.findIndex((item) => item.id === id);
    if (index === -1) return null;
    const updated: Invariant = {
      ...this.items[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    this.items[index] = updated;
    return updated;
  }

  async getById(id: string): Promise<Invariant | null> {
    return this.items.find((item) => item.id === id) ?? null;
  }

  async getSetting(key: string): Promise<string | null> {
    return this.settings.get(key) ?? null;
  }

  async setSetting(key: string, value: string): Promise<void> {
    this.settings.set(key, value);
  }
}

test("invariant CRUD in domain service", async () => {
  const service = createInvariantService(new InMemoryInvariantStore());

  const created = await service.createInvariant(DEFAULT_INVARIANT_SCOPE_CONTEXT, {
    title: "No background jobs",
    rule: "Нельзя использовать фоновые джобы",
    tags: ["architecture"],
  });

  assert.equal(created.status, "active");
  assert.equal(created.tags[0], "architecture");

  const listed = await service.listInvariants(DEFAULT_INVARIANT_SCOPE_CONTEXT, { status: "active" });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].id, created.id);

  const updated = await service.updateInvariant(created.id, {
    rule: "Нельзя использовать фоновые джобы и cron",
    priority: 5,
  });
  assert.equal(updated.rule, "Нельзя использовать фоновые джобы и cron");
  assert.equal(updated.priority, 5);

  const archived = await service.archiveInvariant(created.id);
  assert.equal(archived.status, "archived");

  const activeAfterArchive = await service.listInvariants(DEFAULT_INVARIANT_SCOPE_CONTEXT, { status: "active" });
  assert.equal(activeAfterArchive.length, 0);

  const all = await service.listInvariants(DEFAULT_INVARIANT_SCOPE_CONTEXT, { status: "all" });
  assert.equal(all.length, 1);
  assert.equal(all[0].status, "archived");
});

test("validateInvariantPayload rejects empty fields", () => {
  assert.throws(() =>
    validateInvariantPayload({
      title: "",
      rule: "",
    })
  );

  const valid = validateInvariantPayload({
    title: "PII",
    rule: "Нельзя показывать PII",
    priority: 2,
  });

  assert.equal(valid.title, "PII");
  assert.equal(valid.rule, "Нельзя показывать PII");
  assert.equal(valid.priority, 2);
});
