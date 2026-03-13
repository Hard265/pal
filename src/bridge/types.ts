/** A single SMS message as returned by termux-sms-list */
export interface SmsMessage {
  _id: number;
  threadid: number;
  type: "inbox" | "sent" | "draft" | "outbox" | "failed" | "queued";
  read: boolean;
  address: string;
  body: string;
  date: string; // ISO timestamp
}

/** A contact entry from termux-contact-list */
export interface Contact {
  name: string;
  number: string;
}

/** A tool the bridge exposes to Gemini */
export interface BridgeTool {
  name: string;
  description: string;
  parameters: Record<string, ToolParameter>;
  execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ToolParameter {
  type: "string" | "number" | "boolean";
  description: string;
  required?: boolean;
  enum?: string[];
}

/** Result wrapper for bridge tool calls */
export type ToolResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string };
