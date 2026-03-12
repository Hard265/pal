import { GoogleGenAI, type GenerateContentResponse } from "@google/genai";
import { config } from "../config";
import { ConversationStore } from "../store";
import { buildSummarizationPrompt } from "./prompts";
import { withRetry } from "./retry";
import { log } from "../logger";

export class Summarizer {
  private ai: GoogleGenAI;

  constructor(apiKey: string = config.geminiApiKey) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Check if a contact's history needs summarizing, and if so,
   * generate + store a new summary, then prune old messages.
   */
  async maybeRefreshSummary(
    store: ConversationStore,
    number: string
  ): Promise<void> {
    const count = store.countMessages(number);

    if (count < config.historyLimit) {
      log.debug(`summarizer: ${count} messages, no summary needed`);
      return;
    }

    log.info(`summarizer: ${count} messages, generating summary for ${number}`);

    const contact = store.getContact(number);
    const messages = store.getRecentMessages(number, count); // get all

    const prompt = buildSummarizationPrompt(
      contact?.contact_name ?? null,
      number,
      messages
    );

    try {
      const response = await withRetry<GenerateContentResponse>(
        "summarizer:generateContent",
        () => this.ai.models.generateContent({
          model: config.geminiModel,
          contents: prompt,
        })
      );

      const summary = response.text?.trim() ?? "";
      if (!summary) throw new Error("Empty summary response");

      store.setSummary(number, summary);
      store.pruneOldMessages(number, Math.floor(config.historyLimit / 2));

      log.info(`summarizer: summary stored (${summary.length} chars)`);
    } catch (err) {
      // Non-fatal: log and continue without summarizing
      log.error("summarizer: failed to generate summary:", err);
    }
  }
}
