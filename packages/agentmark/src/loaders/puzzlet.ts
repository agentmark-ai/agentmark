import { Loader } from "../types";
import type { Ast } from "@puzzlet/templatedx";
import cache from "./cache";

type FetchTemplateOptions = {
  cache:
    | {
        ttl?: number;
      }
    | false;
};

interface PuzzletSuccessResponse {
  data: Ast;
}

interface PuzzletErrorResponse {
  error: string;
}

export const PUZZLET_TRACE_ENDPOINT = `v1/export-traces`;
export const PUZZLET_TEMPLATE_ENDPOINT = `v1/templates`;
export const PUZZLET_SCORE_ENDPOINT = `v1/score`;

export class PuzzletLoader<T = Record<string, { input: any; output: any }>> implements Loader<Ast, FetchTemplateOptions> {

  constructor(
    private appId: string,
    private apiKey: string,
    private baseUrl: string,
  ) {
  }

  async load<K extends keyof T & string>(
    templatePath: K,
    options: FetchTemplateOptions = { cache: { ttl: 1000 * 60 } }
  ): Promise<Ast> {
    const ast =
      options.cache && cache.has(templatePath as string)
        ? cache.get<any>(templatePath as string)!
        : await this.fetchRequestForTemplate(templatePath as string);

    if (options.cache) {
      cache.set(templatePath as string, ast, {
        ttl: options.cache.ttl,
      });
    }
    return ast;
  }

  private fetchRequestForTemplate = async (templatePath: string) => {
    const headers = new Headers({
      "Content-Type": "application/json",
      "X-Puzzlet-App-Id": this.appId,
      Authorization: `${this.apiKey}`,
    });

    const response = await fetch(
      `${this.baseUrl}/${PUZZLET_TEMPLATE_ENDPOINT}?path=${templatePath}`,
      {
        headers,
      }
    );

    if (response.ok) {
      const successResponse = await response.json() as PuzzletSuccessResponse;
      return successResponse.data;
    }
    const errorResponse = await response.json() as PuzzletErrorResponse;
    throw errorResponse.error;
  };
}