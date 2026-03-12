import { execSync } from "child_process";
import { Contact, BridgeTool, ToolResult } from "./types";
import { log } from "../logger";

export function listContacts(): ToolResult<Contact[]> {
  try {
    const out = execSync("termux-contact-list", {
      encoding: "utf8",
      timeout: 10_000,
    });
    const contacts: Contact[] = JSON.parse(out);
    return { ok: true, data: contacts };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

/** Resolve a phone number to a contact name, if available */
export function resolveContactName(number: string): string | null {
  const result = listContacts();
  if (!result.ok) return null;

  // Normalize for loose matching (last 9 digits)
  const tail = number.replace(/\D/g, "").slice(-9);

  const match = result.data.find((c) =>
    c.number.replace(/\D/g, "").endsWith(tail)
  );

  return match?.name ?? null;
}

export const lookupContactTool: BridgeTool = {
  name: "lookup_contact",
  description:
    "Look up the saved contact name for a given phone number. Useful for personalizing replies.",
  parameters: {
    number: {
      type: "string",
      description: "The phone number to look up",
      required: true,
    },
  },
  async execute(args) {
    const number = String(args.number ?? "");
    const name = resolveContactName(number);
    return name ? { name } : { name: null, note: "Not in contacts" };
  },
};
