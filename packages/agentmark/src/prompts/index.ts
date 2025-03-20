import { Adapter, JSONObject } from "../types";

/**
 * Common interface for all prompt types with a generic return type
 */
export interface Prompt<Input extends JSONObject, Output, A> {
  /**
   * The original prompt template
   */
  template: unknown;
  
  /**
   * Format the prompt with the given input properties and options
   */
  format(props: Input, options?: JSONObject): Promise<unknown>;
}

// Re-export prompt interfaces and implementations from individual files
export { TextPrompt, TextPromptInterface } from './text';
export { ObjectPrompt, ObjectPromptInterface } from './object';
export { ImagePrompt, ImagePromptInterface } from './image';