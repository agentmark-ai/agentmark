import { 
  Adapter, 
  TextConfig,
  ImageConfig,
  ObjectConfig, 
} from "../types";

export class DefaultAdapter<
  T extends { [K in keyof T]: { input: any; output: any } },
> implements Adapter<T> {
  adaptText(
    input: TextConfig,
  ): TextConfig {
    return input;
  }

  adaptObject(
    input: ObjectConfig,
  ): ObjectConfig {
    return input;
  }

  adaptImage(
    input: ImageConfig,
  ): ImageConfig {
    return input;
  }
}