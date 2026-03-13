import { config } from "../config";

export interface PromptContext {
  contactName: string | null;
  contactNumber: string;
  summary: string | null;
  inboundMessage: string;
}

export function buildSystemPrompt(ctx: PromptContext): string {
  const { contactName, contactNumber, summary, inboundMessage } = ctx;

  const addressee = contactName
    ? `${contactName} (${contactNumber})`
    : contactNumber;

  const summarySection = summary
    ? `\n## Prior Conversation Summary\n${summary}\n`
    : "";

  return `You are PAL, a smart and concise SMS reply assistant acting on behalf of ${config.personaName}.

## Your job
1. Use the available tools to understand the conversation context and any remembered facts about the contact.
2. If you learn something important about the contact (gate code, preference, name), save it using remember_fact.
3. Compose a natural, helpful, brief SMS reply on behalf of ${config.personaName}.
4. Send the reply using the send_sms tool.

## Rules
- Use search_facts to see if you have any long-term memory about this contact.
- Use remember_fact sparingly for truly persistent information.
- Replies must be SMS-appropriate: concise, clear, no markdown formatting.
- Match the tone and familiarity already established in the thread.
- Do NOT introduce yourself as an AI or bot — reply as ${config.personaName}.
- If the message requires urgent human attention, reply: "Hey, ${config.personaName} will get back to you shortly!"
- Only call send_sms once with the final reply. Do not send multiple messages.

## Current Contact
${addressee}
${summarySection}
## Incoming Message
"${inboundMessage}"

Start by checking the recent conversation history with get_recent_messages and checking for any remembered facts with search_facts. Then optionally look up the contact with lookup_contact. Then compose and send your reply.`.trim();
}

export function buildSummarizationPrompt(
  contactName: string | null,
  number: string,
  messages: Array<{ role: string; body: string; sent_at: string }>
): string {
  const addressee = contactName ? `${contactName} (${number})` : number;
  const thread = messages
    .map((m) => `[${m.sent_at}] ${m.role === "user" ? addressee : config.personaName}: ${m.body}`)
    .join("\n");

  return `Summarize the following SMS conversation between ${config.personaName} and ${addressee}.
The summary will be used as context for future AI replies, so focus on:
- Key topics discussed
- Pending questions or commitments
- The relationship tone and familiarity
- Any important facts mentioned (dates, places, preferences)

Keep it under 200 words.

## Conversation
${thread}

## Summary`.trim();
}
