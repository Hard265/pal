import { GeminiAgent } from "./client";
import { TermuxBridge } from "../bridge";
import { GoogleGenAI } from "@google/genai";

// Mock the Gemini SDK
jest.mock("@google/genai", () => {
  return {
    GoogleGenAI: jest.fn().mockImplementation(() => {
      return {
        chats: {
          create: jest.fn().mockImplementation(() => {
            return {
              sendMessage: jest.fn()
                .mockResolvedValueOnce({
                  functionCalls: [{
                    name: "lookup_contact",
                    args: { number: "+1234567890" }
                  }],
                })
                .mockResolvedValueOnce({
                  text: "Hi John, I'm doing well.",
                  functionCalls: [],
                }),
            };
          }),
        },
      };
    }),
    createPartFromFunctionResponse: jest.fn().mockReturnValue({}),
    Type: {
      OBJECT: "OBJECT",
      STRING: "STRING",
      NUMBER: "NUMBER",
      BOOLEAN: "BOOLEAN",
    },
  };
});

describe("GeminiAgent", () => {
  let agent: GeminiAgent;
  let bridge: TermuxBridge;

  beforeEach(() => {
    // Set API key to avoid config error
    process.env.GEMINI_API_KEY = "fake-key";
    agent = new GeminiAgent();
    bridge = new TermuxBridge();
    // Mock bridge execute
    bridge.execute = jest.fn().mockResolvedValue({ name: "John Doe" });
  });

  it("should run the agentic loop and return results", async () => {
    const result = await agent.run({
      systemPrompt: "You are Alex.",
      history: [],
      inboundMessage: "Hi",
      bridge,
    });

    expect(result.rounds).toBe(2);
    expect(result.replyText).toBe("Hi John, I'm doing well.");
    expect(bridge.execute).toHaveBeenCalledWith("lookup_contact", { number: "+1234567890" });
  });

  it("should track send_sms calls", async () => {
    // Re-mock to include send_sms
    const { GoogleGenAI } = require("@google/genai");
    (GoogleGenAI as jest.Mock).mockImplementationOnce(() => ({
      chats: {
        create: () => ({
          sendMessage: jest.fn().mockResolvedValue({
            functionCalls: [{
              name: "send_sms",
              args: { to: "+1234567890", body: "Replied via SMS" }
            }],
          }),
        }),
      },
    }));

    const newAgent = new GeminiAgent();
    const result = await newAgent.run({
      systemPrompt: "You are Alex.",
      history: [],
      inboundMessage: "Reply",
      bridge,
    });

    expect(result.smsSent).toBe(true);
    expect(result.replyText).toBe("Replied via SMS");
  });
});
