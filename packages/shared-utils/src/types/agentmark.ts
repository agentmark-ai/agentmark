type Option = {
  label: string;
  value: string;
};

export type ModelSettingsTypeSlider = {
  minimum: number;
  maximum: number;
  default: number;
  multipleOf: number;
  type: "slider" | "number";
  ui?: "slider";
};

export type ModelSettingsTypeAspectRatio = {
  type: "string";
  ui?: "aspectRatio";
  default: string;
};

export type ModelSettingsTypeImageSize = {
  type: "string";
  ui?: "imageSize";
  default: string;
};

export type ModelSettingsTypeSelect = {
  type: "string";
  ui?: "select";
  options: Option[];
  default: string;
};

export type AgentmarkModelSettingsConfig = {
  label: string;
  order: number;
  deafult: any;
} & (
  | ModelSettingsTypeSlider
  | ModelSettingsTypeSelect
  | ModelSettingsTypeImageSize
  | ModelSettingsTypeAspectRatio
);

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

export type McpUrlServerConfig = {
  url: string;
  headers?: Record<string, string>;
};

export type McpStdioServerConfig = {
  command: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
};

export type McpServerConfig = McpUrlServerConfig | McpStdioServerConfig;
export type McpServers = Record<string, McpServerConfig>;

export type AgentmarkConfig = {
  $schema?: string;
  mdxVersion?: "1.0" | "0.0";
  agentmarkPath: string;
  modelSchemas?: AgentmarkModelSchema;
  version: string;
  builtInModels?: string[];
  mcpServers?: McpServers;
  evals: string[];
};
