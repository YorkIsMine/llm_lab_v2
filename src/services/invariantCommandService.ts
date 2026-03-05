import {
  areInvariantsEnabled,
  createInvariant,
  findInvariantByReference,
  listInvariants,
  setInvariantsEnabled,
  updateInvariant,
} from "@/services/invariantService";
import { DEFAULT_INVARIANT_SCOPE_CONTEXT, type InvariantScopeContext } from "@/types/invariant";

type ParsedInvariantCommand =
  | { type: "list" }
  | { type: "add"; title: string; rule: string }
  | { type: "edit"; reference: string; rule: string }
  | { type: "remove"; reference: string }
  | { type: "toggle"; enabled: boolean }
  | { type: "help" };

const INVARIANTS_COMMAND_PREFIX = /^\/invariants(?:\s+(.*))?$/i;

function deriveTitle(rule: string): string {
  const words = rule
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .slice(0, 6)
    .join(" ");
  return words.length > 0 ? words : "Invariant";
}

export function parseInvariantCommand(text: string): ParsedInvariantCommand | null {
  const match = text.trim().match(INVARIANTS_COMMAND_PREFIX);
  if (!match) return null;

  const args = (match[1] ?? "").trim();
  if (!args) return { type: "list" };

  if (args.toLowerCase() === "help") {
    return { type: "help" };
  }

  if (args.toLowerCase() === "on") {
    return { type: "toggle", enabled: true };
  }

  if (args.toLowerCase() === "off") {
    return { type: "toggle", enabled: false };
  }

  if (args.toLowerCase().startsWith("add ")) {
    const raw = args.slice(4).trim();
    if (!raw) return { type: "help" };
    const delimiterIndex = raw.indexOf("|");
    if (delimiterIndex !== -1) {
      const title = raw.slice(0, delimiterIndex).trim();
      const rule = raw.slice(delimiterIndex + 1).trim();
      if (!title || !rule) return { type: "help" };
      return { type: "add", title, rule };
    }
    return { type: "add", title: deriveTitle(raw), rule: raw };
  }

  if (args.toLowerCase().startsWith("edit ")) {
    const raw = args.slice(5).trim();
    const [reference, ...rest] = raw.split(" ");
    const rule = rest.join(" ").trim();
    if (!reference || !rule) return { type: "help" };
    return { type: "edit", reference, rule };
  }

  if (args.toLowerCase().startsWith("remove ")) {
    const reference = args.slice(7).trim();
    if (!reference) return { type: "help" };
    return { type: "remove", reference };
  }

  if (args.toLowerCase().startsWith("delete ")) {
    const reference = args.slice(7).trim();
    if (!reference) return { type: "help" };
    return { type: "remove", reference };
  }

  return { type: "help" };
}

function formatCommandHelp(): string {
  return [
    "Команды инвариантов:",
    "- /invariants — показать список",
    "- /invariants add <правило> — добавить инвариант",
    "- /invariants add <title> | <правило> — добавить с явным заголовком",
    "- /invariants edit <id> <новое правило> — изменить правило",
    "- /invariants remove <id> — архивировать",
    "- /invariants on|off — включить/выключить применение",
  ].join("\n");
}

function formatInvariantList(items: Awaited<ReturnType<typeof listInvariants>>, enabled: boolean): string {
  if (items.length === 0) {
    return `Инварианты пусты. Применение: ${enabled ? "ON" : "OFF"}.`;
  }

  const lines = items.map((item) => `- ${item.id} [${item.status}] ${item.title}: ${item.rule}`);
  return [`Инварианты (применение: ${enabled ? "ON" : "OFF"}):`, ...lines].join("\n");
}

export interface InvariantCommandResponse {
  handled: boolean;
  content?: string;
}

export async function handleInvariantCommand(
  text: string,
  scopeContext: InvariantScopeContext = DEFAULT_INVARIANT_SCOPE_CONTEXT
): Promise<InvariantCommandResponse> {
  const parsed = parseInvariantCommand(text);
  if (!parsed) return { handled: false };

  if (parsed.type === "help") {
    return { handled: true, content: formatCommandHelp() };
  }

  if (parsed.type === "list") {
    const [items, enabled] = await Promise.all([
      listInvariants(scopeContext, { status: "all" }),
      areInvariantsEnabled(scopeContext),
    ]);
    return { handled: true, content: formatInvariantList(items, enabled) };
  }

  if (parsed.type === "toggle") {
    const enabled = await setInvariantsEnabled(scopeContext, parsed.enabled);
    return { handled: true, content: `Применение инвариантов: ${enabled ? "ON" : "OFF"}.` };
  }

  if (parsed.type === "add") {
    const created = await createInvariant(scopeContext, {
      title: parsed.title,
      rule: parsed.rule,
      status: "active",
      createdBy: "user",
    });
    return { handled: true, content: `Инвариант добавлен: ${created.id} — ${created.title}.` };
  }

  if (parsed.type === "edit") {
    const invariant = await findInvariantByReference(parsed.reference, scopeContext);
    if (!invariant) {
      return { handled: true, content: "Инвариант не найден. Используйте /invariants для списка id." };
    }
    const updated = await updateInvariant(invariant.id, { rule: parsed.rule, status: "active" });
    return { handled: true, content: `Инвариант обновлён: ${updated.id} — ${updated.title}.` };
  }

  if (parsed.type === "remove") {
    const invariant = await findInvariantByReference(parsed.reference, scopeContext);
    if (!invariant) {
      return { handled: true, content: "Инвариант не найден. Используйте /invariants для списка id." };
    }
    const updated = await updateInvariant(invariant.id, { status: "archived" });
    return { handled: true, content: `Инвариант архивирован: ${updated.id} — ${updated.title}.` };
  }

  return { handled: true, content: formatCommandHelp() };
}
