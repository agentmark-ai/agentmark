import { JSONObject } from "../types";

export interface Prompt<Props extends JSONObject, Result, A> {
  template: unknown;
  
  format(props: Props, options?: JSONObject): Promise<unknown>;
}

export { TextPrompt, TextPromptInterface } from './text';
export { ObjectPrompt, ObjectPromptInterface } from './object';
export { ImagePrompt, ImagePromptInterface } from './image';