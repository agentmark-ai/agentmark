import { Adapter, TextConfig, ObjectConfig, ImageConfig, JSONObject } from "../types";

export class DefaultAdapter implements Adapter {
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