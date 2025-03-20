import { JSONObject, Adapter, AdapterObjectOutput, AdapterTextOutput, AdapterImageOutput } from "../types";

export interface Prompt<Input, Output, A extends Adapter, ReturnType = unknown> {
  template: unknown;
  path?: string;
  
  format(props: Input, options?: JSONObject): Promise<ReturnType>;
}

export { TextPrompt, TextPromptInterface } from './text';
export { ObjectPrompt, ObjectPromptInterface } from './object';
export { ImagePrompt, ImagePromptInterface } from './image';