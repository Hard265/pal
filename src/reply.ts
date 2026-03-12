import { config } from "./config";
import { TermuxBridge } from "./bridge";
import { ConversationStore } from "./store";
import { Summarizer } from "./ai/summarizer";
import { GeminiAgent } from "./ai/client";
import { buildSystemPrompt } from "./ai/prompts";
import { resolveContactName } from "./bridge/contacts";
import { normalizeNumber } from "./bridge/sms";
import { log } from "./logger";

export interface InboundSms {
  from: string;
  body: string;
}

export async function handleInbound(sms: InboundSms): Promise<void> {
  const number = normalizeNumber(sms.from);
  const body = sms.body.trim();

  log.info(`reply: inbound from ${number} — "${body.slice(0, 60)}"`);

  const store = await ConversationStore.open();
  const bridge = new TermuxBridge();

  try {
    // 1. Resolve contact name from device
    const contactName = resolveContactName(number);
    log.info(`reply: contact resolved as "${contactName ?? "unknown"}"`);

    // 2. Upsert contact + store inbound message
    store.upsertContact(number, contactName);
    store.addMessage(number, "user", body);

    // 3. Maybe compress history into a summary before proceeding
    const summarizer = new Summarizer();
    await summarizer.maybeRefreshSummary(store, number);

    // 4. Build conversation history for the AI
    const { history, summary } = store.buildConversationHistory(number);

    // 5. Build system prompt with context
    const systemPrompt = buildSystemPrompt({
      contactName,
      contactNumber: number,
      summary,
      inboundMessage: body,
    });

    log.debug("reply: system prompt built\n" + systemPrompt);

    // 6. Run the agentic loop
    const agent = new GeminiAgent();
    const result = await agent.run({
      systemPrompt,
      history,
      inboundMessage: body,
      bridge,
    });

    // 7. Handle dry-run mode (agent already called send_sms in live mode)
    if (config.dryRun) {
      if (result.replyText) {
        log.info(`[DRY RUN] Would send to ${number}:\n${result.replyText}`);
      } else {
        log.info(`[DRY RUN] Agent did not produce a reply text`);
      }
    }

    // 8. Store our reply for future context
    if (result.replyText) {
      store.addMessage(number, "assistant", result.replyText);
    }

    log.info(
      `reply: done — smsSent=${result.smsSent} rounds=${result.rounds}`
    );
  } finally {
    store.close();
  }
}
