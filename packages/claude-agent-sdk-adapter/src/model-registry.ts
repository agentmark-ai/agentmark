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
  private providers: Record<string, any> = {};

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
   * Register provider(s) for automatic model resolution.
   *
   * When a model name contains a "/" (e.g., "openai/gpt-4o"), the registry
   * will look up the provider by the prefix before the first slash.
   *
   * - If the provider is a function, it is called with (modelId, options)
   * - If the provider is a truthy non-function, the prefix is stripped and { model: modelId } is returned
   * - If the provider is not registered, resolution falls through to the default creator
   *
   * @param providers - Record of provider name to provider (function or truthy value)
   * @returns this for chaining
   */
  registerProviders(providers: Record<string, any>): this {
    Object.assign(this.providers, providers);
    return this;
  }

  /**
   * Get model configuration for a given model name.
   *
   * Resolution order:
   * 1. Exact match
   * 2. Pattern match (first match wins)
   * 3. Provider auto-resolution (for "provider/model" names)
   * 4. Default creator
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

    // Provider auto-resolution
    if (modelName.includes("/")) {
      const slashIndex = modelName.indexOf("/");
      const providerName = modelName.substring(0, slashIndex);
      const modelId = modelName.substring(slashIndex + 1);

      if (!providerName || !modelId) {
        throw new Error(
          `Invalid model name format: '${modelName}'. Expected 'provider/model'.`
        );
      }

      const provider = this.providers[providerName];
      if (provider) {
        if (typeof provider === "function") {
          return provider(modelId, options);
        }
        return { model: modelId };
      }
      // If provider not found but has "/", fall through to default creator
      // This allows the default creator to handle "provider/model" format too
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
    // Check provider auto-resolution
    if (modelName.includes("/")) {
      const slashIndex = modelName.indexOf("/");
      const providerName = modelName.substring(0, slashIndex);
      const modelId = modelName.substring(slashIndex + 1);
      if (providerName && modelId && this.providers[providerName]) {
        return true;
      }
    }
    return this.defaultCreator !== undefined;
  }
}
