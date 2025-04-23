export type ModelSettingsTypeSlider = {
  minimum: number;
  maximum: number;
  default: number;
  multipleOf: number;
  type: "slider" | "number";
  ui?: "slider";
};

export type AgentmarkModelSettingsConfig = {
  label: string;
  order: number;
  deafult: any;
} & ModelSettingsTypeSlider;

export type AgentmarkModelSettingsSchema = {
  [key: string]: AgentmarkModelSettingsConfig;
};

export type AgentmarkModelConfig = {
  label: string;
  cost: {
    inputCost: number;
    outputCost: number;
    unitScale: number;
  };
  settings: AgentmarkModelSettingsSchema;
};

export type AgentmarkModelSchema = {
  [key: string]: AgentmarkModelConfig;
};

export type AgentmarkConfig = {
  agentmarkPath: string;
  modelSchemas?: AgentmarkModelSchema;
  version: string;
  builtInModels?: string[];
}; 