import type { AdaptOptions } from "./types";
import type { McpServers } from "./mcp";
import { parseMcpUri } from "./mcp";
import { McpServerRegistry, type McpClientFactory } from "./mcp-registry";

/**
 * Declarative field-rename entry for translating snake_case AgentMark config
 * to SDK-native camelCase params.
 *
 * - `string`: rename `input[inputKey]` → `output[string]`, pass value through.
 * - `null`: drop this field entirely (e.g. field isn't supported by this SDK).
 * - function: rename + transform value. Used for cases like
 *   `max_calls` → `stopWhen: stepCountIs(n)` where the target SDK needs
 *   a wrapped value rather than the raw number.
 */
export type ParamMapEntry =
  | string
  | null
  | { key: string; transform: (value: any) => unknown };

export type ParamMap = Record<string, ParamMapEntry>;

/**
 * Translate a snake_case settings object to SDK-native params using the
 * declarative map. Unknown keys are dropped silently — adapters opt fields
 * in explicitly so the wire format stays predictable.
 */
export function applyParamMap(
  input: Record<string, unknown> | undefined,
  map: ParamMap
): Record<string, unknown> {
  if (!input) return {};
  const out: Record<string, unknown> = {};
  for (const [inKey, value] of Object.entries(input)) {
    if (value === undefined) continue;
    const entry = map[inKey];
    if (entry === undefined || entry === null) continue;
    if (typeof entry === "string") {
      out[entry] = value;
      continue;
    }
    out[entry.key] = entry.transform(value);
  }
  return out;
}

/**
 * Shared telemetry metadata builder. Every adapter merges the user's base
 * telemetry with the prompt name, props (stringified), and optional
 * agentmark_meta block. Keeping this in one place means fixes to telemetry
 * encoding land everywhere at once.
 */
export function buildTelemetryMetadata(
  telemetry: AdaptOptions["telemetry"],
  props: Record<string, unknown>,
  promptName: string,
  agentmarkMeta?: Record<string, unknown>
) {
  if (!telemetry) return undefined;
  return {
    ...telemetry,
    metadata: {
      ...telemetry?.metadata,
      prompt_name: promptName,
      props: JSON.stringify(props),
      ...(agentmarkMeta ?? {}),
    },
  };
}

/**
 * Base class every SDK adapter extends. Absorbs the three responsibilities
 * that were duplicated across ai-sdk-v4, ai-sdk-v5, and mastra adapters:
 *
 *   1. Holding a registry of in-process tools + an McpServerRegistry.
 *   2. Resolving `tools: [...]` lists — including `mcp://server/*` wildcards.
 *   3. Building telemetry metadata.
 *
 * Subclasses provide the SDK-native tool type via `TTool` and wire in the
 * MCP client factory in their constructor. Beyond that, subclasses only
 * implement `adaptText` / `adaptObject` / `adaptImage` / `adaptSpeech`
 * by calling `resolveTools()` + `applyParamMap()` with their SDK's paramMap.
 */
export abstract class BaseAdapter<TTool = unknown> {
  protected readonly tools: Record<string, TTool> | undefined;
  protected readonly mcpRegistry: McpServerRegistry<TTool>;

  constructor(
    mcpClientFactory: McpClientFactory<TTool>,
    tools?: Record<string, TTool>,
    mcpServers?: McpServers
  ) {
    this.tools = tools;
    this.mcpRegistry = new McpServerRegistry<TTool>(mcpClientFactory);
    if (mcpServers) {
      this.mcpRegistry.registerServers(mcpServers);
    }
  }

  /**
   * Resolve a list of tool references from prompt config. Supports:
   *   - Plain names: must exist in the adapter's `tools` record.
   *   - `mcp://server/tool`: single tool from MCP server.
   *   - `mcp://server/*`: all tools from MCP server (wildcard expansion).
   */
  protected async resolveTools(
    toolNames: string[]
  ): Promise<Record<string, TTool>> {
    const out: Record<string, TTool> = {};
    for (const toolName of toolNames) {
      if (toolName.startsWith("mcp://")) {
        const { server, tool } = parseMcpUri(toolName);
        if (tool === "*") {
          const all = await this.mcpRegistry.getAllTools(server);
          Object.assign(out, all);
          continue;
        }
        out[tool] = await this.mcpRegistry.getTool(server, tool);
        continue;
      }
      if (this.tools && toolName in this.tools) {
        out[toolName] = this.tools[toolName];
        continue;
      }
      const available = this.tools
        ? Object.keys(this.tools).join(", ")
        : "(none)";
      throw new Error(
        `Tool '${toolName}' referenced in prompt config was not found in the provided tools record. Available tools: ${available}`
      );
    }
    return out;
  }
}
