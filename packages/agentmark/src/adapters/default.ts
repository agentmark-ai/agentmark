import { Adapter, TextConfig, ObjectConfig, ImageConfig } from "../types";

export class DefaultAdapter implements Adapter<TextConfig, ObjectConfig, ImageConfig> {
  adaptText(input: TextConfig) {
    return input;
  }

  adaptObject(input: ObjectConfig) {
    return input;
  }

  adaptImage(input: ImageConfig) {
    return input;
  }
}