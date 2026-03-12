import { type FunctionDeclaration, type Schema, Type } from "@google/genai";
import { BridgeTool, ToolParameter } from "./types";
import { getRecentMessagesTool, sendSmsTool } from "./sms";
import { lookupContactTool } from "./contacts";
import { log } from "../logger";

export type { BridgeTool, ToolParameter };

/**
 * TermuxBridge — MCP-style tool registry.
 *
 * Exposes termux commands as structured tools that can be called
 * by the Gemini model via function calling.
 */
export class TermuxBridge {
  private tools: Map<string, BridgeTool> = new Map();

  constructor() {
    this.register(getRecentMessagesTool);
    this.register(sendSmsTool);
    this.register(lookupContactTool);
  }

  register(tool: BridgeTool): void {
    this.tools.set(tool.name, tool);
    log.debug(`bridge: registered tool "${tool.name}"`);
  }

  get(name: string): BridgeTool | undefined {
    return this.tools.get(name);
  }

  all(): BridgeTool[] {
    return Array.from(this.tools.values());
  }

  /**
   * Execute a tool by name with the given args.
   * Returns a JSON-serializable result or an error object.
   */
  async execute(
    name: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    const tool = this.tools.get(name);
    if (!tool) {
      log.debug(`bridge: unknown tool "${name}"`);
      return { error: `Unknown tool: ${name}` };
    }

    log.debug(`bridge: execute "${name}"`, args);

    try {
      const result = await tool.execute(args);
      log.debug(`bridge: result "${name}"`, result);
      return result;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log.debug(`bridge: error "${name}" →`, msg);
      return { error: msg };
    }
  }

  /**
   * Emit function declarations in the shape @google/genai expects.
   * Pass the result as: tools: [{ functionDeclarations: bridge.toGeminiFunctionDeclarations() }]
   */
  toGeminiFunctionDeclarations(): FunctionDeclaration[] {
    return this.all().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: Type.OBJECT,
        properties: Object.fromEntries(
          Object.entries(tool.parameters).map(([key, param]) => [
            key,
            buildSchema(param),
          ])
        ) as Record<string, Schema>,
        required: Object.entries(tool.parameters)
          .filter(([, p]) => p.required)
          .map(([k]) => k),
      } satisfies Schema,
    }));
  }
}

function buildSchema(param: ToolParameter): Schema {
  const type =
    param.type === "number"
      ? Type.NUMBER
      : param.type === "boolean"
      ? Type.BOOLEAN
      : Type.STRING;

  return {
    type,
    description: param.description,
    ...(param.enum ? { enum: param.enum } : {}),
  };
}
