export type ModelSettingsTypeSlider = {
  minimum: number;
  maximum: number;
  default: number;
  multipleOf: number;
  type: "slider" | "number";
  ui?: "slider";
};

export type PuzzletModelSettingsConfig = {
  label: string;
  order: number;
  deafult: any;
} & ModelSettingsTypeSlider;

export type PuzzletModelSettingsSchema = {
  [key: string]: PuzzletModelSettingsConfig;
};

export type PuzzletModelConfig = {
  label: string;
  cost: {
    inputCost: number;
    outputCost: number;
    unitScale: number;
  };
  settings: PuzzletModelSettingsSchema;
};

export type PuzzletModelSchema = {
  [key: string]: PuzzletModelConfig;
};

export type PuzzletConfig = {
  puzzletPath: string;
  modelSchemas?: PuzzletModelSchema;
  version: string;
  builtInModels?: string[];
};
