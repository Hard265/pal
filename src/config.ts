import * as dotenv from "dotenv";
import * as path from "path";
import * as os from "os";
import { z } from "zod";

dotenv.config();

const ConfigSchema = z.object({
  geminiApiKey: z.string().min(1, "GEMINI_API_KEY is required"),
  geminiModel: z.string().default("gemini-2.0-flash"),
  personaName: z.string().default("Alex"),
  historyLimit: z.coerce.number().int().positive().default(20),
  summaryTokenThreshold: z.coerce.number().int().positive().default(3000),
  dbPath: z
    .string()
    .default(path.join(os.homedir(), ".pal", "pal.db")),
  dryRun: z
    .string()
    .optional()
    .transform((v) => v === "true"),
  logLevel: z.enum(["silent", "info", "debug"]).default("info"),
});

const parsed = ConfigSchema.safeParse({
  geminiApiKey: process.env.GEMINI_API_KEY,
  geminiModel: process.env.GEMINI_MODEL,
  personaName: process.env.PAL_PERSONA_NAME,
  historyLimit: process.env.PAL_HISTORY_LIMIT,
  summaryTokenThreshold: process.env.PAL_SUMMARY_TOKEN_THRESHOLD,
  dbPath: process.env.PAL_DB_PATH,
  dryRun: process.env.PAL_DRY_RUN,
  logLevel: process.env.PAL_LOG_LEVEL,
});

if (!parsed.success) {
  console.error("[pal] Config error:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const config = parsed.data;
export type Config = typeof parsed.data;
