/**
 * Merge type for accumulating tool types during chaining.
 */
type Merge<A, B> = {
  [K in keyof A | keyof B]: K extends keyof B
    ? B[K]
    : K extends keyof A
      ? A[K]
      : never;
};

/**
 * Type-safe tool registry for Claude Agent SDK adapter.
 *
 * Tools registered here are bridged to the Claude Agent SDK via MCP.
 * Tool descriptions and parameters are derived from the prompt's tool schema.
 *
 * @example
 * ```typescript
 * const toolRegistry = new ClaudeAgentToolRegistry()
 *   .register("search_documents", async ({ query }) => {
 *     const results = await searchDB(query);
 *     return { results };
 *   })
 *   .register("get_weather", async ({ location }) => {
 *     return await fetchWeather(location);
 *   });
 * ```
 */
export class ClaudeAgentToolRegistry<
  TD extends { [K in keyof TD]: { args: any } },
  RM extends Partial<Record<keyof TD, any>> = {}
> {
  /**
   * Phantom type for tracking tool types.
   * This enables TypeScript to infer correct types for tool inputs/outputs.
   */
  declare readonly __tools: { input: TD; output: RM };

  private map: {
    [K in keyof TD]?: (args: TD[K]["args"]) => any;
  } = {};

  /**
   * Register a tool execution function.
   * Tool description and parameters are derived from the prompt's tool schema.
   *
   * @param name - Unique tool name (must match tool name in prompt config)
   * @param fn - Async function to execute the tool
   * @returns New registry with accumulated tool type
   */
  register<K extends keyof TD, R>(
    name: K,
    fn: (args: TD[K]["args"]) => R
  ): ClaudeAgentToolRegistry<TD, Merge<RM, { [P in K]: R }>> {
    this.map[name] = fn;
    return this as unknown as ClaudeAgentToolRegistry<
      TD,
      Merge<RM, { [P in K]: R }>
    >;
  }

  /**
   * Get a tool execution function by name.
   */
  get<K extends keyof TD & keyof RM>(name: K) {
    return this.map[name] as (args: TD[K]["args"]) => RM[K];
  }

  /**
   * Check if a tool is registered.
   */
  has(name: string): boolean {
    return name in this.map;
  }

  /**
   * Get the number of registered tools.
   */
  get size(): number {
    return Object.keys(this.map).length;
  }

  /**
   * Get all tool names.
   */
  getToolNames(): string[] {
    return Object.keys(this.map);
  }
}
