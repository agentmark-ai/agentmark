import type { AdaptOptions } from "@agentmark-ai/prompt-core";
import type { ModelConfigCreator, ModelConfig } from "./types";

/**
 * Registry for Claude Agent SDK model configurations.
 *
 * Unlike other adapters, Claude Agent SDK accepts model names directly,
 * so this registry primarily provides validation and optional configuration
 * like maxThinkingTokens for extended thinking models.
 *
 * @example
 * ```typescript
 * const registry = new ClaudeAgentModelRegistry()
 *   .registerModels(/claude-.*-thinking/, (name) => ({
 *     model: name,
 *     maxThinkingTokens: 10000
 *   }))
 *   .registerModels("claude-sonnet-4-20250514", (name) => ({
 *     model: name
 *   }));
 * ```
 */
export class ClaudeAgentModelRegistry {
  private exactMatches: Record<string, ModelConfigCreator> = {};
  private patternMatches: Array<[RegExp, ModelConfigCreator]> = [];
  private defaultCreator?: ModelConfigCreator;

  /**
   * Create a default registry that passes model names through directly.
   */
  static createDefault(): ClaudeAgentModelRegistry {
    return new ClaudeAgentModelRegistry((modelName) => ({ model: modelName }));
  }

  /**
   * Create a new model registry.
   * @param defaultCreator - Default creator function for unmatched models
   */
  constructor(defaultCreator?: ModelConfigCreator) {
    this.defaultCreator = defaultCreator ?? ((name) => ({ model: name }));
  }

  /**
   * Register model(s) with a configuration creator.
   *
   * @param pattern - Exact model name, regex pattern, or array of names
   * @param creator - Function that creates model configuration
   * @returns this for chaining
   */
  registerModels(
    pattern: string | RegExp | string[],
    creator: ModelConfigCreator
  ): this {
    if (typeof pattern === "string") {
      this.exactMatches[pattern] = creator;
    } else if (Array.isArray(pattern)) {
      pattern.forEach((m) => {
        this.exactMatches[m] = creator;
      });
    } else {
      this.patternMatches.push([pattern, creator]);
    }
    return this;
  }

  /**
   * Get model configuration for a given model name.
   *
   * Resolution order:
   * 1. Exact match
   * 2. Pattern match (first match wins)
   * 3. Default creator
   *
   * @param modelName - The model name to look up
   * @param options - Optional adapt options
   * @returns Model configuration
   * @throws Error if no matching configuration found
   */
  getModelConfig(modelName: string, options?: AdaptOptions): ModelConfig {
    // Check exact matches first
    const exactCreator = this.exactMatches[modelName];
    if (exactCreator) {
      return exactCreator(modelName, options);
    }

    // Check pattern matches
    for (const [pattern, creator] of this.patternMatches) {
      if (pattern.test(modelName)) {
        return creator(modelName, options);
      }
    }

    // Use default creator
    if (this.defaultCreator) {
      return this.defaultCreator(modelName, options);
    }

    throw new Error(
      `No model configuration found for: ${modelName}. ` +
      `Register the model using registerModels() or provide a default creator.`
    );
  }

  /**
   * Check if a model is registered (exact or pattern match).
   */
  hasModel(modelName: string): boolean {
    if (this.exactMatches[modelName]) {
      return true;
    }
    for (const [pattern] of this.patternMatches) {
      if (pattern.test(modelName)) {
        return true;
      }
    }
    return this.defaultCreator !== undefined;
  }
}
