# pal

Auto SMS reply agent for Android. Tasker detects incoming SMS → fires a shell script → pal processes the message with Google Gemini (agentic function calling) → sends a reply via `termux-sms-send`.

## Architecture

```
SMS Received
    │
    ▼
[Tasker] — SMS Received profile
    │  %SMSRF (sender), %SMSTXT (body)
    ▼
[Termux:Tasker] → pal.sh
    │
    ▼
[pal CLI] — Node.js compiled binary
    ├── ConversationStore (SQLite) — per-contact history + summaries
    ├── Summarizer — compresses old threads into a context summary
    ├── TermuxBridge — MCP-style tool registry
    │     ├── get_recent_messages  → termux-sms-list
    │     ├── lookup_contact       → termux-contact-list
    │     └── send_sms             → termux-sms-send
    └── GeminiAgent — agentic loop with function calling
          → tool calls → bridge executes → results fed back
          → agent calls send_sms when ready
```

## Requirements

- Android phone with [Termux](https://termux.dev)
- [Tasker](https://tasker.joaoapps.com) + [Termux:Tasker](https://github.com/termux/termux-tasker) plugin
- [Termux:API](https://wiki.termux.com/wiki/Termux:API) (`pkg install termux-api`)
- Node.js (`pkg install nodejs`)
- Google Gemini API key ([get one free](https://aistudio.google.com/app/apikey))

## Install

```bash
# In Termux
git clone https://github.com/you/pal
cd pal
bash scripts/install.sh
```

Edit `~/.pal/.env`:
```bash
GEMINI_API_KEY=your_key_here
PAL_PERSONA_NAME=YourName
```

## Tasker Setup

1. **Profile**: Event → Phone → Received Text → Any
2. **Task**:
   - Action: Plugin → Termux:Tasker
   - Configuration:
     - Executable: `pal.sh`
     - Arguments: `%SMSRF` (line 1), `%SMSTXT` (line 2)

## Test (dry run)

```bash
PAL_DRY_RUN=true pal -f "+1234567890" -b "Hey, free tonight?"
```

## Config

| Variable | Default | Description |
|---|---|---|
| `GEMINI_API_KEY` | required | Google AI Studio key |
| `GEMINI_MODEL` | `gemini-2.0-flash` | Model to use |
| `PAL_PERSONA_NAME` | `Alex` | Name to reply as |
| `PAL_HISTORY_LIMIT` | `20` | Messages before summarizing |
| `PAL_DRY_RUN` | `false` | Print reply, don't send |
| `PAL_LOG_LEVEL` | `info` | `silent` / `info` / `debug` |

## Adding Custom Tools

Register new `BridgeTool`s in `src/bridge/index.ts`:

```ts
bridge.register({
  name: "get_calendar",
  description: "Get today's calendar events",
  parameters: {},
  async execute() {
    const out = execSync("termux-calendar-list").toString();
    return JSON.parse(out);
  }
});
```

Gemini will call it automatically when it decides it's relevant.
