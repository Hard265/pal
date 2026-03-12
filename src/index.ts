#!/usr/bin/env node
import "./config"; // validates env early
import minimist from "minimist";
import { handleInbound } from "./reply";
import { log } from "./logger";

const argv = minimist(process.argv.slice(2), {
  string: ["from", "body", "f", "b"],
  boolean: ["help", "version"],
  alias: { f: "from", b: "body", h: "help", v: "version" },
});

function printHelp(): void {
  console.log(`
pal — Auto SMS reply agent powered by Google Gemini

Usage:
  pal --from <number> --body <message>
  pal -f <number> -b <message>

Options:
  -f, --from     Sender phone number (required)
  -b, --body     Incoming SMS body text (required)
  -h, --help     Show this help
  -v, --version  Show version

Environment:
  GEMINI_API_KEY          Required. Your Google AI Studio API key.
  PAL_DRY_RUN=true        Print reply instead of sending via termux-sms-send.
  PAL_LOG_LEVEL=debug     Verbose logging.

Examples:
  pal -f "+1234567890" -b "Hey, are you free tonight?"
  PAL_DRY_RUN=true pal -f "+1234567890" -b "Test message"
`.trim());
}

async function main(): Promise<void> {
  if (argv.help) {
    printHelp();
    process.exit(0);
  }

  if (argv.version) {
    const pkg = require("../package.json");
    console.log(`pal v${pkg.version}`);
    process.exit(0);
  }

  const from = (argv.from ?? "").trim();
  const body = (argv.body ?? "").trim();

  if (!from || !body) {
    console.error("Error: --from and --body are required\n");
    printHelp();
    process.exit(1);
  }

  try {
    await handleInbound({ from, body });
    process.exit(0);
  } catch (err) {
    log.error("Unhandled error:", err);
    process.exit(1);
  }
}

main();
