export type ToolExecutionFunction = (
  executionContext: any
) => Promise<any> | any;

export interface ToolRegistryEntry {
  execute: ToolExecutionFunction;
}

export class MastraToolRegistry {
  private tools: Map<string, ToolRegistryEntry> = new Map();

  /**
   * Register a tool with its execution function
   * @param name - The tool name (must match the tool name in MDX)
   * @param entry - The tool registry entry with execute function
   */
  register(name: string, entry: ToolRegistryEntry): void {
    this.tools.set(name, entry);
  }

  /**
   * Register multiple tools at once
   * @param toolEntries - Object with tool names as keys and registry entries as values
   */
  registerTools(toolEntries: Record<string, ToolRegistryEntry>): void {
    Object.entries(toolEntries).forEach(([name, entry]) => {
      this.register(name, entry);
    });
  }

  /**
   * Get a tool's registry entry by name
   * @param name - The tool name
   * @returns The tool registry entry if found
   * @throws Error if tool not found
   */
  get(name: string): ToolRegistryEntry {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Tool not found: ${name}`);
    }
    return tool;
  }

  /**
   * Check if a tool is registered
   * @param name - The tool name
   * @returns true if the tool is registered
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Get all registered tool names
   * @returns Array of registered tool names
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Remove a tool from the registry
   * @param name - The tool name to remove
   * @returns true if the tool was removed, false if it didn't exist
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Clear all registered tools
   */
  clear(): void {
    this.tools.clear();
  }

  /**
   * Get the number of registered tools
   * @returns The number of registered tools
   */
  size(): number {
    return this.tools.size;
  }
}
