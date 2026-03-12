import { ConversationStore } from "./index";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";

describe("ConversationStore", () => {
  let dbPath: string;
  let store: ConversationStore;

  beforeEach(async () => {
    // Create a unique temp db path for each test
    dbPath = path.join(os.tmpdir(), `pal-test-${Math.random().toString(36).substring(7)}.db`);
    store = await ConversationStore.open(dbPath);
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it("should upsert a contact", () => {
    const number = "+1234567890";
    const name = "John Doe";
    const contact = store.upsertContact(number, name);

    expect(contact.number).toBe(number);
    expect(contact.contact_name).toBe(name);

    const retrieved = store.getContact(number);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.contact_name).toBe(name);
  });

  it("should add and retrieve messages", () => {
    const number = "+1234567890";
    store.upsertContact(number, "John Doe");

    store.addMessage(number, "user", "Hello");
    store.addMessage(number, "assistant", "Hi there!");

    const messages = store.getRecentMessages(number);
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe("user");
    expect(messages[0].body).toBe("Hello");
    expect(messages[1].role).toBe("assistant");
    expect(messages[1].body).toBe("Hi there!");
  });

  it("should build conversation history for Gemini", () => {
    const number = "+1234567890";
    store.upsertContact(number, "John Doe");
    store.addMessage(number, "user", "Hello");
    store.addMessage(number, "assistant", "Hi!");

    const { history, summary } = store.buildConversationHistory(number);

    expect(history.length).toBe(2);
    expect(history[0].role).toBe("user");
    expect(history[1].role).toBe("model"); // Gemini uses 'model' role
    expect(summary).toBeNull();
  });

  it("should handle summaries", () => {
    const number = "+1234567890";
    store.upsertContact(number, "John Doe");
    store.setSummary(number, "They talked about stuff.");

    const { summary } = store.buildConversationHistory(number);
    expect(summary).toBe("They talked about stuff.");
  });
});
