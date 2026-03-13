import { execSync, spawnSync } from "child_process";
import { SmsMessage, BridgeTool, ToolResult } from "./types";
import { log } from "../logger";

/** Normalize a phone number to digits + optional leading + */
export function normalizeNumber(raw: string): string {
  const stripped = raw.replace(/[\s\-().]/g, "");
  return stripped;
}

/** Run termux-sms-list and return parsed messages */
export function listSms(opts: {
  limit?: number;
  number?: string;
  type?: "inbox" | "sent" | "all";
}): ToolResult<SmsMessage[]> {
  try {
    const args = [];

    if (opts.limit) args.push("-l", String(opts.limit));
    if (opts.number) args.push("-f", opts.number);
    if (opts.type && opts.type !== "all") args.push("-t", opts.type);

    log.debug("sms:list →", "termux-sms-list", args.join(" "));

    const result = spawnSync("termux-sms-list", args, {
      encoding: "utf8",
      timeout: 10_000,
    });

    if (result.status !== 0) {
      return {
        ok: false,
        error: result.stderr || `exited with code ${result.status}`,
      };
    }

    const messages: SmsMessage[] = JSON.parse(result.stdout);
    return { ok: true, data: messages };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    log.debug("sms:list error →", msg);
    return { ok: false, error: msg };
  }
}

/** Send an SMS via termux-sms-send */
export function sendSms(to: string, body: string): ToolResult<void> {
  try {
    log.debug(`sms:send → to=${to} body="${body.slice(0, 60)}..."`);

    const result = spawnSync("termux-sms-send", ["-n", to, "-s", "0", body], {
      encoding: "utf8",
      timeout: 15_000,
    });

    if (result.status !== 0) {
      return {
        ok: false,
        error: result.stderr || `exited with code ${result.status}`,
      };
    }

    return { ok: true, data: undefined };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: msg };
  }
}

// ── Bridge tool definitions ─────────────────────────────────────────────────

export const getRecentMessagesTool: BridgeTool = {
  name: "get_recent_messages",
  description:
    "Fetch recent SMS messages for a specific contact number. Use this to understand the conversation history before composing a reply.",
  parameters: {
    number: {
      type: "string",
      description: "The phone number of the contact (e.g. +1234567890)",
      required: true,
    },
    limit: {
      type: "number",
      description: "Max number of messages to retrieve (default 15, max 50)",
      required: false,
    },
    type: {
      type: "string",
      description: "Message type filter",
      required: false,
      enum: ["inbox", "sent", "all"],
    },
  },
  async execute(args) {
    const number = String(args.number ?? "");
    const limit = Math.min(Number(args.limit ?? 15), 50);
    const type = (args.type as "inbox" | "sent" | "all") ?? "all";

    const result = listSms({ number, limit, type });
    if (!result.ok) return { error: result.error };

    // Return a clean subset to avoid token bloat
    return result.data.map((m) => ({
      id: m._id,
      type: m.type,
      body: m.body,
      date: m.date,
    }));
  },
};

export const sendSmsTool: BridgeTool = {
  name: "send_sms",
  description:
    "Send an SMS message to a phone number. Call this only once you have composed the final reply.",
  parameters: {
    to: {
      type: "string",
      description: "Recipient phone number",
      required: true,
    },
    body: {
      type: "string",
      description: "The SMS message text to send",
      required: true,
    },
  },
  async execute(args) {
    const to = String(args.to ?? "");
    const body = String(args.body ?? "");

    if (!to || !body) return { error: "Missing 'to' or 'body'" };

    const result = sendSms(to, body);
    if (!result.ok) return { error: result.error };
    return { sent: true };
  },
};
