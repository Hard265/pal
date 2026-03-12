import type { Content } from "@google/genai";

/** Stored per-contact conversation record */
export interface ContactRecord {
  id: number;
  number: string;         // normalized phone number (primary key lookup)
  contact_name: string | null;
  summary: string | null; // rolling AI-generated summary of older messages
  summary_updated_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Individual stored message (rolling window) */
export interface MessageRecord {
  id: number;
  contact_number: string;
  role: "user" | "assistant"; // user = incoming, assistant = our reply
  body: string;
  sent_at: string; // ISO timestamp
}

/** Re-export for convenience — callers use this to type history arrays */
export type { Content as ConversationTurn };
