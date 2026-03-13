import initSqlJs, { Database, SqlJsStatic, SqlValue } from "sql.js";
import * as fs from "fs";
import * as path from "path";
import type { Content } from "@google/genai";
import { config } from "../config";
import { log } from "../logger";
import { ContactRecord, MessageRecord } from "./schema";

let SQL: SqlJsStatic | null = null;

async function getSql(): Promise<SqlJsStatic> {
  if (!SQL) SQL = await initSqlJs();
  return SQL;
}

export class ConversationStore {
  private db!: Database;
  private dbPath: string;

  private constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  /** Factory — must be used instead of `new` because sql.js init is async */
  static async open(dbPath: string = config.dbPath): Promise<ConversationStore> {
    const store = new ConversationStore(dbPath);
    await store.init();
    return store;
  }

  private async init(): Promise<void> {
    const SQL = await getSql();
    const dir = path.dirname(this.dbPath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      log.info(`store: created db directory ${dir}`);
    }

    if (fs.existsSync(this.dbPath)) {
      const fileBuffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(fileBuffer);
      log.debug(`store: loaded existing db from ${this.dbPath}`);
    } else {
      this.db = new SQL.Database();
      log.debug(`store: created new db at ${this.dbPath}`);
    }

    this.db.run("PRAGMA foreign_keys = ON");
    this.migrate();
    this.persist();
  }

  /** Write the in-memory db back to disk */
  private persist(): void {
    const data = this.db.export();
    fs.writeFileSync(this.dbPath, Buffer.from(data));
  }

  // ── Migrations ─────────────────────────────────────────────────────────────

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS contacts (
        id                INTEGER PRIMARY KEY AUTOINCREMENT,
        number            TEXT    NOT NULL UNIQUE,
        contact_name      TEXT,
        summary           TEXT,
        summary_updated_at TEXT,
        created_at        TEXT    NOT NULL DEFAULT (datetime('now')),
        updated_at        TEXT    NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS messages (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_number  TEXT    NOT NULL,
        role            TEXT    NOT NULL CHECK(role IN ('user','assistant')),
        body            TEXT    NOT NULL,
        sent_at         TEXT    NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (contact_number) REFERENCES contacts(number)
      );

      CREATE INDEX IF NOT EXISTS idx_messages_contact
        ON messages(contact_number, sent_at DESC);

      CREATE TABLE IF NOT EXISTS facts (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        contact_number  TEXT    NOT NULL,
        fact_text       TEXT    NOT NULL,
        created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
        FOREIGN KEY (contact_number) REFERENCES contacts(number)
      );

      CREATE INDEX IF NOT EXISTS idx_facts_contact
        ON facts(contact_number);
    `);
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private queryAll<T>(sql: string, params: SqlValue[] = []): T[] {
    const [result] = this.db.exec(sql, params);
    if (!result) return [];
    return result.values.map((row) => {
      const obj: Record<string, unknown> = {};
      result.columns.forEach((col, i) => { obj[col] = row[i]; });
      return obj as T;
    });
  }

  private queryOne<T>(sql: string, params: SqlValue[] = []): T | null {
    return this.queryAll<T>(sql, params)[0] ?? null;
  }

  // ── Contact ops ────────────────────────────────────────────────────────────

  upsertContact(number: string, name?: string | null): ContactRecord {
    this.db.run(
      `INSERT INTO contacts (number, contact_name)
       VALUES (?, ?)
       ON CONFLICT(number) DO UPDATE SET
         contact_name = COALESCE(?, contact_name),
         updated_at   = datetime('now')`,
      [number, name ?? null, name ?? null]
    );
    this.persist();
    return this.queryOne<ContactRecord>(
      "SELECT * FROM contacts WHERE number = ?", [number]
    )!;
  }

  getContact(number: string): ContactRecord | null {
    return this.queryOne<ContactRecord>(
      "SELECT * FROM contacts WHERE number = ?", [number]
    );
  }

  setSummary(number: string, summary: string): void {
    this.db.run(
      `UPDATE contacts
       SET summary = ?, summary_updated_at = datetime('now'), updated_at = datetime('now')
       WHERE number = ?`,
      [summary, number]
    );
    this.persist();
  }

  // ── Message ops ────────────────────────────────────────────────────────────

  addMessage(number: string, role: "user" | "assistant", body: string): MessageRecord {
    this.db.run(
      "INSERT INTO messages (contact_number, role, body) VALUES (?, ?, ?)",
      [number, role, body]
    );
    this.persist();
    // Fetch the row we just inserted
    return this.queryOne<MessageRecord>(
      "SELECT * FROM messages WHERE contact_number = ? ORDER BY id DESC LIMIT 1",
      [number]
    )!;
  }

  getRecentMessages(number: string, limit: number = config.historyLimit): MessageRecord[] {
    return this.queryAll<MessageRecord>(
      `SELECT * FROM (
         SELECT * FROM messages WHERE contact_number = ?
         ORDER BY sent_at DESC LIMIT ?
       ) ORDER BY sent_at ASC`,
      [number, limit]
    );
  }

  countMessages(number: string): number {
    const row = this.queryOne<{ count: number }>(
      "SELECT COUNT(*) as count FROM messages WHERE contact_number = ?",
      [number]
    );
    return row?.count ?? 0;
  }

  pruneOldMessages(number: string, keepLast: number = config.historyLimit): void {
    this.db.run(
      `DELETE FROM messages
       WHERE contact_number = ?
         AND id NOT IN (
           SELECT id FROM messages WHERE contact_number = ?
           ORDER BY sent_at DESC LIMIT ?
         )`,
      [number, number, keepLast]
    );
    this.persist();
  }

  // ── Fact ops ───────────────────────────────────────────────────────────────

  saveFact(number: string, factText: string): void {
    this.db.run(
      "INSERT INTO facts (contact_number, fact_text) VALUES (?, ?)",
      [number, factText]
    );
    this.persist();
  }

  getFacts(number: string): string[] {
    const rows = this.queryAll<{ fact_text: string }>(
      "SELECT fact_text FROM facts WHERE contact_number = ? ORDER BY id DESC",
      [number]
    );
    return rows.map((r) => r.fact_text);
  }

  // ── AI history builder ─────────────────────────────────────────────────────

  buildConversationHistory(number: string): {
    history: Content[];
    summary: string | null;
  } {
    const contact = this.getContact(number);
    const messages = this.getRecentMessages(number);

    const history: Content[] = messages.map((m) => ({
      role: m.role === "user" ? "user" : "model",
      parts: [{ text: m.body }],
    }));

    return { history, summary: contact?.summary ?? null };
  }

  close(): void {
    this.db.close();
  }
}
