import { 
  Adapter, 
  TextConfig, 
  ObjectConfig, 
  ImageConfig, 
  JSONObject, 
  PromptMetadata,
  AdapterTextResult,
  AdapterObjectResult,
  AdapterImageResult
} from "../types";

export class DefaultAdapter implements Adapter {
  adaptText<T = string, R = AdapterTextResult<T>>(
    input: TextConfig, 
  ): R {
    return input as R;
  }

  adaptObject<T = any, R = AdapterObjectResult<T>>(
    input: ObjectConfig, 
  ): R {
    return input as R;
  }

  adaptImage<T = string, R = AdapterImageResult<T>>(
    input: ImageConfig, 
  ): R {
    return input as R;
  }
}