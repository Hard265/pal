import { Summarizer } from "./summarizer";
import { ConversationStore } from "../store";
import * as path from "path";
import * as fs from "fs";
import * as os from "os";

// Mock the Gemini SDK
jest.mock("@google/genai", () => {
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => {
      return {
        models: {
          generateContent: jest.fn().mockResolvedValue({
            text: "This is a summary of the conversation.",
          }),
        },
      };
    }),
  };
});

describe("Summarizer", () => {
  let dbPath: string;
  let store: ConversationStore;
  let summarizer: Summarizer;

  beforeEach(async () => {
    dbPath = path.join(os.tmpdir(), `pal-test-summarizer-${Math.random().toString(36).substring(7)}.db`);
    store = await ConversationStore.open(dbPath);
    summarizer = new Summarizer("fake-api-key");
  });

  afterEach(() => {
    store.close();
    if (fs.existsSync(dbPath)) {
      fs.unlinkSync(dbPath);
    }
  });

  it("should not summarize if message count is below limit", async () => {
    const number = "+1234567890";
    store.upsertContact(number, "John");
    store.addMessage(number, "user", "Hello");

    await summarizer.maybeRefreshSummary(store, number);

    const contact = store.getContact(number);
    expect(contact?.summary).toBeNull();
  });

  it("should generate and store summary when limit is reached", async () => {
    const number = "+1234567890";
    store.upsertContact(number, "John");

    // Add more than the default history limit (20)
    for (let i = 0; i < 25; i++) {
      store.addMessage(number, i % 2 === 0 ? "user" : "assistant", `Message ${i}`);
    }

    await summarizer.maybeRefreshSummary(store, number);

    const contact = store.getContact(number);
    expect(contact?.summary).toBe("This is a summary of the conversation.");
    
    // Check if messages were pruned
    const count = store.countMessages(number);
    expect(count).toBeLessThan(25);
    expect(count).toBe(10); // config.historyLimit / 2
  });
});
