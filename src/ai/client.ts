import {
  GoogleGenAI,
  Content,
  createPartFromFunctionResponse,
  type FunctionCall,
  type GenerateContentResponse,
} from "@google/genai";
import { config } from "../config";
import { TermuxBridge } from "../bridge";
import { withRetry } from "./retry";
import { log } from "../logger";

const MAX_TOOL_ROUNDS = 6; // prevent runaway loops

export interface AgentRunOptions {
  systemPrompt: string;
  history: Content[];
  inboundMessage: string;
  bridge: TermuxBridge;
}

export interface AgentResult {
  /** The final text reply the agent decided to send (for logging) */
  replyText: string | null;
  /** True if the agent called send_sms at least once */
  smsSent: boolean;
  /** Number of tool-call rounds performed */
  rounds: number;
}

export class GeminiAgent {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: config.geminiApiKey });
  }

  async run(opts: AgentRunOptions): Promise<AgentResult> {
    const { systemPrompt, history, inboundMessage, bridge } = opts;

    const chat = this.ai.chats.create({
      model: config.geminiModel,
      history,
      config: {
        systemInstruction: systemPrompt,
        tools: [{ functionDeclarations: bridge.toGeminiFunctionDeclarations() }],
      },
    });

    let round = 0;
    let smsSent = false;
    let replyText: string | null = null;

    // Kick off with the inbound message
    let response = await withRetry<GenerateContentResponse>(
      "sendMessage:initial",
      () => chat.sendMessage({ message: inboundMessage })
    );

    while (round < MAX_TOOL_ROUNDS) {
      round++;

      const functionCalls = response.functionCalls ?? [];

      if (functionCalls.length === 0) {
        replyText = response.text ?? null;
        log.debug(`agent: finished after ${round} round(s)`);
        break;
      }

      log.info(`agent: round ${round} — ${functionCalls.length} tool call(s)`);

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        functionCalls.map((fc) => this.executeTool(fc, bridge))
      );

      // Track if send_sms was called
      for (const fc of functionCalls) {
        if (fc.name === "send_sms") {
          smsSent = true;
          replyText =
            typeof fc.args?.body === "string" ? fc.args.body : null;
          log.info(`agent: send_sms called — "${replyText?.slice(0, 80)}"`);
        }
      }

      // Build function response parts using the new SDK helper
      const responseParts = toolResults.map(({ name, id, result }) =>
        createPartFromFunctionResponse(
          id,
          name,
          result as Record<string, unknown>
        )
      );

      // Feed all results back in a single message
      response = await withRetry<GenerateContentResponse>(
        `sendMessage:round${round}`,
        () => chat.sendMessage({ message: responseParts })
      );
    }

    if (round >= MAX_TOOL_ROUNDS) {
      log.error(`agent: hit max tool rounds (${MAX_TOOL_ROUNDS}), aborting`);
    }

    return { replyText, smsSent, rounds: round };
  }

  private async executeTool(
    fc: FunctionCall,
    bridge: TermuxBridge
  ): Promise<{ id: string; name: string; result: unknown }> {
    const name = fc.name ?? "";
    const args = (fc.args ?? {}) as Record<string, unknown>;
    const id = fc.id ?? name;
    
    log.info(`agent: executing tool "${name}" with args: ${JSON.stringify(args)}`);
    log.debug(`agent: tool call id=${id}`);

    const result = await bridge.execute(name, args);
    log.info(`agent: tool "${name}" returned result: ${JSON.stringify(result).slice(0, 200)}${JSON.stringify(result).length > 200 ? "..." : ""}`);
    
    return { id, name, result };
  }
}
