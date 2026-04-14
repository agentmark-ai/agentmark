import { getFrontMatter } from "@agentmark-ai/templatedx";
import type { Ast } from "@agentmark-ai/templatedx";
import type { MastraAgentMark } from "./mastra-agentmark";
import type { MastraAdapter } from "./adapter";
import { Agent } from "@mastra/core/agent";
import type { ToolsInput } from "@mastra/core/agent";
import type { PromptShape } from "@agentmark-ai/prompt-core";
import { createPromptTelemetry } from "@agentmark-ai/prompt-core";
import type { WebhookDatasetResponse, WebhookPromptResponse } from "@agentmark-ai/prompt-core";
import { span } from "@agentmark-ai/sdk";
import type { SpanContext } from "@agentmark-ai/sdk";

type Frontmatter = {
  name?: string;
  text_config?: unknown;
  object_config?: unknown;
  image_config?: unknown;
  speech_config?: unknown;
  test_settings?: { dataset?: string; evals?: string[] };
};

function extractErrorMessage(error: unknown): string {
  if (!error) return "Unknown error";
  if (typeof error === "string") return error;
  if (typeof error === "object") {
    const e = error as Record<string, any>;  // pre-existing pattern for error unwrapping
    return e.message || e.error?.message || e.data?.error?.message || JSON.stringify(error);
  }
  return String(error);
}

export class MastraAdapterWebhookHandler<
  T extends PromptShape<T> | undefined = PromptShape<Record<string, never>>
> {
  constructor(
    private readonly client: MastraAgentMark<T, MastraAdapter<T, ToolsInput>>
  ) {}

  async runPrompt(
    promptAst: Ast,
    options?: { shouldStream?: boolean; customProps?: Record<string, any>; telemetry?: { isEnabled: boolean; metadata?: Record<string, any> } }
  ): Promise<WebhookPromptResponse> {
    const frontmatter = getFrontMatter(promptAst) as Frontmatter;
    const { telemetry } = createPromptTelemetry(frontmatter.name, options?.telemetry);

    if (frontmatter.object_config) {
      const prompt = await this.client.loadObjectPrompt(promptAst);
      const agentConfig = options?.customProps
        ? await prompt.formatAgent({ props: options.customProps as any, options: { telemetry } })
        : await prompt.formatAgentWithTestProps({ telemetry });

      const [messages, generateOptions] = options?.customProps
        ? await agentConfig.formatMessages({ props: options.customProps as any })
        : await agentConfig.formatMessages();

      const agent = new Agent(agentConfig);
      const shouldStream = options?.shouldStream !== undefined ? options.shouldStream : false;

      if (shouldStream) {
        try {
          const { result, traceId } = await span({ name: frontmatter.name || 'prompt-run' }, async (_ctx: SpanContext) => {
            return agent.stream(messages, generateOptions);
          });
          const streamResult = await result;
          const fullStream = (streamResult as any).fullStream;
          
          if (fullStream) {
            const stream = new ReadableStream({
              async start(controller) {
                const encoder = new TextEncoder();
                try {
                  for await (const chunk of fullStream) {
                    if ((chunk as any).type === "error") {
                      const message = extractErrorMessage((chunk as any)?.error);
                      console.error("[Runner] Error during streaming:", message);
                      controller.enqueue(
                        encoder.encode(
                          JSON.stringify({ type: "error", error: message }) + "\n"
                        )
                      );
                      controller.close();
                      return;
                    }
                    if ((chunk as any).type === "object") {
                      controller.enqueue(
                        encoder.encode(
                          JSON.stringify({
                            type: "object",
                            result: (chunk as any).object,
                          }) + "\n"
                        )
                      );
                    }
                    if ((chunk as any).type === "object-delta") {
                      controller.enqueue(
                        encoder.encode(
                          JSON.stringify({
                            type: "object",
                            result: (chunk as any).objectDelta,
                          }) + "\n"
                        )
                      );
                    }
                  }
                  // Try to get usage if available
                  if ((streamResult as any).usage) {
                    const usageData = await (streamResult as any).usage;
                    controller.enqueue(
                      encoder.encode(
                        JSON.stringify({ type: "object", usage: usageData }) + "\n"
                      )
                    );
                  }
                  controller.close();
                } catch (error: any) {
                  console.error("[Runner] Error during streaming:", error);
                  controller.enqueue(
                    encoder.encode(
                      JSON.stringify({
                        type: "error",
                        error: extractErrorMessage(error),
                      }) + "\n"
                    )
                  );
                  controller.close();
                }
              },
            });
            return {
              type: "stream",
              stream,
              streamHeader: { "AgentMark-Streaming": "true" },
              traceId,
            } as WebhookPromptResponse;
          }
        } catch (error) {
          // If streaming fails, fall back to non-streaming
          console.warn("[Runner] Streaming not available, falling back to non-streaming:", error);
        }
      }

      // Non-streaming object generation
      const { result, traceId } = await span({ name: frontmatter.name || 'prompt-run' }, async (_ctx: SpanContext) => {
        return agent.generate(messages, generateOptions);
      });
      const response = await result;
      return {
        type: "object",
        result: (response as any).object || response,
        usage: (response as any).usage,
        finishReason: (response as any).finishReason,
        traceId,
      } as WebhookPromptResponse;
    }

    if (frontmatter.text_config) {
      const prompt = await this.client.loadTextPrompt(promptAst);
      const agentConfig = options?.customProps
        ? await prompt.formatAgent({ props: options.customProps as any, options: { telemetry } })
        : await prompt.formatAgentWithTestProps({ telemetry });

      const [messages, generateOptions] = options?.customProps
        ? await agentConfig.formatMessages({ props: options.customProps as any })
        : await agentConfig.formatMessages();

      const agent = new Agent(agentConfig);
      const shouldStream = options?.shouldStream !== undefined ? options.shouldStream : false;

      if (shouldStream) {
        try {
          const { result, traceId } = await span({ name: frontmatter.name || 'prompt-run' }, async (_ctx: SpanContext) => {
            return agent.stream(messages, generateOptions);
          });
          const streamResult = await result;
          const fullStream = (streamResult as any).fullStream;
          
          if (fullStream) {
            const stream = new ReadableStream({
              async start(controller) {
                const encoder = new TextEncoder();
                try {
                  for await (const chunk of fullStream) {
                    if ((chunk as any).type === "error") {
                      const message = extractErrorMessage((chunk as any)?.error);
                      console.error("[Runner] Error during streaming:", message);
                      controller.enqueue(
                        encoder.encode(
                          JSON.stringify({ type: "error", error: message }) + "\n"
                        )
                      );
                      controller.close();
                      return;
                    }
                    if ((chunk as any).type === "text-delta") {
                      controller.enqueue(
                        encoder.encode(
                          JSON.stringify({
                            type: "text",
                            result: (chunk as any).textDelta,
                          }) + "\n"
                        )
                      );
                    }
                    if ((chunk as any).type === "tool-call") {
                      controller.enqueue(
                        encoder.encode(
                          JSON.stringify({
                            type: "text",
                            toolCall: {
                              toolCallId: (chunk as any).toolCallId,
                              toolName: (chunk as any).toolName,
                              args: (chunk as any).args,
                            },
                          }) + "\n"
                        )
                      );
                    }
                    if ((chunk as any).type === "tool-result") {
                      controller.enqueue(
                        encoder.encode(
                          JSON.stringify({
                            type: "text",
                            toolResult: {
                              toolCallId: (chunk as any).toolCallId,
                              toolName: (chunk as any).toolName,
                              result: (chunk as any).result,
                            },
                          }) + "\n"
                        )
                      );
                    }
                    if ((chunk as any).type === "finish") {
                      controller.enqueue(
                        encoder.encode(
                          JSON.stringify({
                            type: "text",
                            finishReason: (chunk as any).finishReason,
                            usage: (chunk as any).usage,
                          }) + "\n"
                        )
                      );
                    }
                  }
                  controller.close();
                } catch (error: any) {
                  console.error("[Runner] Error during streaming:", error);
                  controller.enqueue(
                    encoder.encode(
                      JSON.stringify({
                        type: "error",
                        error: extractErrorMessage(error),
                      }) + "\n"
                    )
                  );
                  controller.close();
                }
              },
            });
            return {
              type: "stream",
              stream,
              streamHeader: { "AgentMark-Streaming": "true" },
              traceId,
            } as WebhookPromptResponse;
          }
        } catch (error) {
          // If streaming fails, fall back to non-streaming
          console.warn("[Runner] Streaming not available, falling back to non-streaming:", error);
        }
      }

      // Non-streaming text generation
      const { result, traceId } = await span({ name: frontmatter.name || 'prompt-run' }, async (_ctx: SpanContext) => {
        return agent.generate(messages, generateOptions);
      });
      const response = await result;
      return {
        type: "text",
        result:
          (response as any).text ||
          (response as any).content ||
          String(response),
        usage: (response as any).usage,
        finishReason: (response as any).finishReason,
        toolCalls: (response as any).toolCalls || [],
        toolResults: (response as any).toolResults || [],
        traceId,
      } as WebhookPromptResponse;
    }

    if (frontmatter.image_config) {
      throw new Error("Image generation not implemented for Mastra adapter");
    }

    if (frontmatter.speech_config) {
      throw new Error("Speech generation not implemented for Mastra adapter");
    }

    throw new Error("Invalid prompt");
  }

  async runExperiment(
    promptAst: Ast,
    datasetRunName: string,
    datasetPath?: string,
    sampling?: Record<string, unknown>
  ): Promise<WebhookDatasetResponse> {
    const loader = this.client.getLoader();
    if (!loader) throw new Error("Loader not found");

    const frontmatter = getFrontMatter(promptAst) as Frontmatter;
    const runId = crypto.randomUUID();
    const evalRegistry = this.client.getEvalRegistry();

    const resolvedDatasetPath = datasetPath ?? frontmatter?.test_settings?.dataset;

    if (frontmatter.text_config) {
      const prompt = await this.client.loadTextPrompt(promptAst);
      const dataset = await prompt.formatAgentWithDataset({
        datasetPath: resolvedDatasetPath,
        telemetry: { isEnabled: true },
        ...(sampling ? { sampling } : {}),
      });
      const stream = new ReadableStream({
        async start(controller) {
          let index = 0;
          const reader = dataset.getReader();
          try {
            for (;;) {
              const { value: item, done } = await reader.read();
              if (done) break;
              const formatted = item.formatted;
              const [messages, options] = await formatted.formatMessages();

              const agent = new Agent(formatted);
              const telemetryMetadata: Record<string, any> = {
                ...(options.telemetry?.metadata ?? {}),
              };

              const { result, traceId } = await span({
                name: `ds-run-${datasetRunName}-${index}`,
                datasetRunId: runId,
                datasetRunName: datasetRunName,
                datasetItemName: String(index),
                datasetExpectedOutput: item.dataset?.expected_output,
                datasetPath: resolvedDatasetPath
              }, async (ctx: SpanContext) => {
                if (item.dataset?.input != null) {
                  try { ctx.setAttribute("agentmark.props", JSON.stringify(item.dataset.input)); } catch { /* ignore */ }
                }
                const genResult = await agent.generate(messages, {
                  ...options,
                  telemetry: options.telemetry
                    ? {
                        ...options.telemetry,
                        metadata: telemetryMetadata,
                      }
                    : undefined,
                });
                try {
                  const outputText = (genResult as any).text || (genResult as any).content || String(genResult);
                  ctx.setAttribute("agentmark.output", outputText);
                } catch { /* ignore */ }
                return genResult;
              });

              const response = await result;
              const text =
                (response as any).text ||
                (response as any).content ||
                String(response);
              const usage = (response as any).usage;

              let evalResults: any[] = [];
              const scoreNames = item.evals ?? [];
              if (
                evalRegistry &&
                Array.isArray(scoreNames) &&
                scoreNames.length > 0
              ) {
                const evaluators = scoreNames
                  .map((name: string) => {
                    const fn = evalRegistry[name] as (typeof evalRegistry)[string] | undefined;
                    return fn ? { name, fn } : undefined;
                  })
                  .filter(Boolean) as Array<{ name: string; fn: any }>;
                evalResults = await Promise.all(
                  evaluators.map(async (e) => {
                    const r = await e.fn({
                      input: messages,
                      output: text,
                      expectedOutput: item.dataset?.expected_output,
                    });
                    return { name: e.name, ...r };
                  })
                );
              }

              const chunk =
                JSON.stringify({
                  type: "dataset",
                  result: {
                    input: item.dataset?.input,
                    expectedOutput: item.dataset?.expected_output,
                    actualOutput: text,
                    tokens:
                      usage?.totalTokens ||
                      (usage?.promptTokens &&
                        usage?.completionTokens &&
                        usage.promptTokens + usage.completionTokens),
                    evals: evalResults,
                  },
                  runId,
                  runName: datasetRunName,
                  traceId,
                }) + "\n";
              controller.enqueue(chunk);
              index++;
            }
            controller.close();
          } catch (error) {
            console.error("[Runner] Error processing dataset:", error);
            controller.close();
          }
        },
      });
      return {
        stream,
        streamHeaders: { "AgentMark-Streaming": "true" as const },
      };
    }

    if (frontmatter.object_config) {
      const prompt = await this.client.loadObjectPrompt(promptAst);
      const dataset = await prompt.formatAgentWithDataset({
        datasetPath: resolvedDatasetPath,
        telemetry: { isEnabled: true },
        ...(sampling ? { sampling } : {}),
      });
      const stream = new ReadableStream({
        async start(controller) {
          let index = 0;
          const reader = dataset.getReader();
          try {
            for (;;) {
              const { value: item, done } = await reader.read();
              if (done) break;
              const formatted = item.formatted;
              const [messages, options] = await formatted.formatMessages();

              const agent = new Agent(formatted);
              const telemetryMetadata: Record<string, any> = {
                ...(options.telemetry?.metadata ?? {}),
              };

              const { result, traceId } = await span({
                name: `ds-run-${datasetRunName}-${index}`,
                datasetRunId: runId,
                datasetRunName: datasetRunName,
                datasetItemName: String(index),
                datasetExpectedOutput: item.dataset.expected_output,
                datasetPath: resolvedDatasetPath
              }, async (ctx: SpanContext) => {
                if (item.dataset?.input != null) {
                  try { ctx.setAttribute("agentmark.props", JSON.stringify(item.dataset.input)); } catch { /* ignore */ }
                }
                const genResult = await agent.generate(messages, {
                  ...options,
                  telemetry: options.telemetry
                    ? {
                        ...options.telemetry,
                        metadata: telemetryMetadata,
                      }
                    : undefined,
                });
                try {
                  const obj = (genResult as any).object || genResult;
                  const outputStr = typeof obj === 'string' ? obj : JSON.stringify(obj);
                  ctx.setAttribute("agentmark.output", outputStr);
                } catch { /* ignore */ }
                return genResult;
              });

              const response = await result;
              const object = (response as any).object || response;
              const usage = (response as any).usage;

              let evalResults: any[] = [];
              const scoreNamesObj = item.evals ?? [];
              if (
                evalRegistry &&
                Array.isArray(scoreNamesObj) &&
                scoreNamesObj.length > 0
              ) {
                const evaluators = scoreNamesObj
                  .map((name: string) => {
                    const fn = evalRegistry[name] as (typeof evalRegistry)[string] | undefined;
                    return fn ? { name, fn } : undefined;
                  })
                  .filter(Boolean) as Array<{ name: string; fn: any }>;
                evalResults = await Promise.all(
                  evaluators.map(async (e) => {
                    const r = await e.fn({
                      input: messages,
                      output: object,
                      expectedOutput: item.dataset.expected_output,
                    });
                    return { name: e.name, ...r };
                  })
                );
              }

              const chunk =
                JSON.stringify({
                  type: "dataset",
                  result: {
                    input: item.dataset.input,
                    expectedOutput: item.dataset.expected_output,
                    actualOutput: object,
                    tokens:
                      usage?.totalTokens ||
                      (usage?.promptTokens &&
                        usage?.completionTokens &&
                        usage.promptTokens + usage.completionTokens),
                    evals: evalResults,
                  },
                  runId,
                  runName: datasetRunName,
                  traceId,
                }) + "\n";
              controller.enqueue(chunk);
              index++;
            }
            controller.close();
          } catch (error) {
            console.error("[Runner] Error processing dataset:", error);
            controller.close();
          }
        },
      });
      return {
        stream,
        streamHeaders: { "AgentMark-Streaming": "true" as const },
      };
    }

    if (frontmatter.image_config) {
      throw new Error("Image generation not implemented for Mastra adapter");
    }

    if (frontmatter.speech_config) {
      throw new Error("Speech generation not implemented for Mastra adapter");
    }

    throw new Error("Invalid prompt");
  }
}

