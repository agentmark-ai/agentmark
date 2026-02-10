import { getModelRegistry } from "@repo/model-registry";

export const Providers: Record<
  string,
  {
    label: string;
    languageModels: string[];
    imageModels: string[];
    speechModels: string[];
  }
> = getModelRegistry().getProviderModels();
