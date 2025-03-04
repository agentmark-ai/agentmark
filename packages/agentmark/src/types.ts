import {
  TextSettings,
  ObjectSettings,
  ImageSettings,
  TextConfig,
  ObjectConfig,
  ImageConfig,
  ChatMessage
} from './schemas';

export type JSONPrimitive = string | number | boolean | null;
export type JSONValue = JSONPrimitive | JSONObject | JSONArray;
export type JSONObject = { [key: string]: JSONValue };
export type JSONArray = JSONValue[];

export type {
  TextSettings,
  ObjectSettings,
  ImageSettings,
  TextConfig,
  ObjectConfig,
  ImageConfig,
  ChatMessage
};

export interface Loader {
  load(path: string): Promise<any>;
}

export interface TemplateEngine {
  compile(
    template: any,
    props?: JSONObject,
  ): any;
}

export interface Adapter<TextOutput = any, ObjectOutput = any, ImageOutput = any> {
  adaptText(input: TextConfig): TextOutput;
  adaptObject(input: ObjectConfig): ObjectOutput;
  adaptImage(input: ImageConfig): ImageOutput;
}

export interface PromptType {
  input: any;
  output: any;
}