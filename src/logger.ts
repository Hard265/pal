type Level = "silent" | "info" | "debug";

const LEVELS: Record<Level, number> = { silent: 0, info: 1, debug: 2 };

function getLevel(): Level {
  const l = (process.env.PAL_LOG_LEVEL ?? "info") as Level;
  return LEVELS[l] !== undefined ? l : "info";
}

function shouldLog(target: Level): boolean {
  return LEVELS[getLevel()] >= LEVELS[target];
}

const ts = () => new Date().toISOString().slice(11, 23); // HH:MM:SS.mmm

export const log = {
  info: (...args: unknown[]) => {
    if (shouldLog("info")) console.error(`[pal ${ts()}]`, ...args);
  },
  debug: (...args: unknown[]) => {
    if (shouldLog("debug")) console.error(`[pal:dbg ${ts()}]`, ...args);
  },
  error: (...args: unknown[]) => {
    // always show errors
    console.error(`[pal:ERR ${ts()}]`, ...args);
  },
};
