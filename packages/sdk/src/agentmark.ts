import { AGENTMARK_SCORE_ENDPOINT } from "./config";
import { initialize } from "./trace";
import { ApiLoader } from "@agentmark-ai/loader-api";
import type { MaskFunction } from "./trace";

type AgentmarkProps = {
  apiKey: string;
  appId: string;
  baseUrl?: string;
  mask?: MaskFunction;
};

type DefaultIO = {
  input: Record<string, any>;
  output: any;
};

type ScoreProps = {
  resourceId: string;
  label: string;
  reason: string;
  score: number;
  name: string;
  type?: string;
};

export class AgentMarkSDK<
  T extends { [P in keyof T]: { input: any; output: any } } = {
    [key: string]: DefaultIO;
  },
> {
  private apiKey: string;
  private appId: string;
  private baseUrl: string = "https://api.agentmark.co";
  private mask?: MaskFunction;

  constructor(
    { apiKey, appId, baseUrl, mask }: AgentmarkProps
  ) {
    this.apiKey = apiKey;
    this.appId = appId;
    this.baseUrl = baseUrl || this.baseUrl;
    this.mask = mask;
  }

  initTracing({ disableBatch }: { disableBatch?: boolean } = {}) {
    return initialize({
      apiKey: this.apiKey,
      appId: this.appId,
      baseUrl: this.baseUrl,
      disableBatch: !!disableBatch,
      mask: this.mask,
    });
  }

  getApiLoader() {
    return ApiLoader.cloud({
      apiKey: this.apiKey,
      appId: this.appId,
      baseUrl: this.baseUrl,
    });
  }

  async score({ resourceId, label, reason, score, name, type }: ScoreProps) {
    const response = await fetch(`${this.baseUrl}/${AGENTMARK_SCORE_ENDPOINT}`, {
      method: "POST",
      body: JSON.stringify({ resourceId, label, reason, score, name, type }),
      headers: {
        "Content-Type": "application/json",
        "X-Agentmark-App-Id": this.appId,
        Authorization: `${this.apiKey}`,
      },
    });

    if (response.ok) {
      return (await response.json()).data;
    }
    const errorResponse = await response.json();
    throw errorResponse.error;
  }
}
