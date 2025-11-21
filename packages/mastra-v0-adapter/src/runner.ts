import { getFrontMatter } from "@agentmark/templatedx";
import type { Ast } from "@agentmark/templatedx";
import type { MastraAgentMark } from "./mastra-agentmark";
import type { MastraAdapter } from "./adapter";
import { Agent } from "@mastra/core/agent";
import type { RunnerDatasetResponse, RunnerPromptResponse } from "@agentmark/prompt-core";

type Frontmatter = {
  text_config?: unknown;
  object_config?: unknown;
  image_config?: unknown;
  speech_config?: unknown;
  test_settings?: { dataset?: string; evals?: string[] };
};

export class MastraAdapterRunner {
  constructor(
    private readonly client: MastraAgentMark<any, any, MastraAdapter<any, any>>
  ) {}

  async runPrompt(
    promptAst: Ast,
    options?: { shouldStream?: boolean; customProps?: Record<string, any> }
  ): Promise<RunnerPromptResponse> {
    const frontmatter = getFrontMatter(promptAst) as Frontmatter;

    if (frontmatter.object_config) {
      const prompt = await this.client.loadObjectPrompt(promptAst);
      const agentConfig = options?.customProps
        ? await prompt.formatAgent({ props: options.customProps as any })
        : await prompt.formatAgentWithTestProps({});

      const [messages, generateOptions] = options?.customProps
        ? await agentConfig.formatMessages({ props: options.customProps as any })
        : await agentConfig.formatMessages();

      const agent = new Agent(agentConfig);
      const shouldStream = options?.shouldStream !== undefined ? options.shouldStream : false;

      if (shouldStream) {
        try {
          const streamResult = await agent.stream(messages, generateOptions);
          const fullStream = (streamResult as any).fullStream;
          
          if (fullStream) {
            const stream = new ReadableStream({
              async start(controller) {
                const encoder = new TextEncoder();
                try {
                  for await (const chunk of fullStream) {
                    if ((chunk as any).type === "error") {
                      const error = (chunk as any)?.error;
                      const message =
                        error?.message ||
                        error?.data?.error?.message ||
                        error?.toString() ||
                        "Something went wrong during inference";
                      console.error("[Runner] Error during streaming:", error);
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
                        error: error?.message || error?.toString() || "Unknown error",
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
            } as RunnerPromptResponse;
          }
        } catch (error) {
          // If streaming fails, fall back to non-streaming
          console.warn("[Runner] Streaming not available, falling back to non-streaming:", error);
        }
      }

      // Non-streaming object generation
      const response = await agent.generate(messages, generateOptions);
      return {
        type: "object",
        result: (response as any).object || response,
        usage: (response as any).usage,
        finishReason: (response as any).finishReason,
      } as RunnerPromptResponse;
    }

    if (frontmatter.text_config) {
      const prompt = await this.client.loadTextPrompt(promptAst);
      const agentConfig = options?.customProps
        ? await prompt.formatAgent({ props: options.customProps as any })
        : await prompt.formatAgentWithTestProps({});

      const [messages, generateOptions] = options?.customProps
        ? await agentConfig.formatMessages({ props: options.customProps as any })
        : await agentConfig.formatMessages();

      const agent = new Agent(agentConfig);
      const shouldStream = options?.shouldStream !== undefined ? options.shouldStream : false;

      if (shouldStream) {
        try {
          const streamResult = await agent.stream(messages, generateOptions);
          const fullStream = (streamResult as any).fullStream;
          
          if (fullStream) {
            const stream = new ReadableStream({
              async start(controller) {
                const encoder = new TextEncoder();
                try {
                  for await (const chunk of fullStream) {
                    if ((chunk as any).type === "error") {
                      const error = (chunk as any)?.error;
                      const message =
                        error?.message ||
                        error?.data?.error?.message ||
                        error?.toString() ||
                        "Something went wrong during inference";
                      console.error("[Runner] Error during streaming:", error);
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
                        error: error?.message || error?.toString() || "Unknown error",
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
            } as RunnerPromptResponse;
          }
        } catch (error) {
          // If streaming fails, fall back to non-streaming
          console.warn("[Runner] Streaming not available, falling back to non-streaming:", error);
        }
      }

      // Non-streaming text generation
      const response = await agent.generate(messages, generateOptions);
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
      } as RunnerPromptResponse;
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
    datasetPath?: string
  ): Promise<RunnerDatasetResponse> {
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
      });
      const stream = new ReadableStream({
        async start(controller) {
          let index = 0;
          const reader = dataset.getReader();
          try {
            for (;;) {
              const { value: item, done } = await reader.read();
              if (done) break;
              const traceId = crypto.randomUUID();
              const formatted = item.formatted;
              const [messages, options] = await formatted.formatMessages();

              const agent = new Agent(formatted);
              const telemetryMetadata: Record<string, any> = {
                ...(options.telemetry?.metadata ?? {}),
                dataset_run_id: runId,
                dataset_path: resolvedDatasetPath || "",
                dataset_run_name: datasetRunName,
                dataset_item_name: String(index),
                traceName: `ds-run-${datasetRunName}-${index}`,
                traceId,
              };
              if (item.dataset?.expected_output !== undefined) {
                telemetryMetadata.dataset_expected_output = item.dataset.expected_output;
              }

              const response = await agent.generate(messages, {
                ...options,
                telemetry: options.telemetry
                  ? {
                      ...options.telemetry,
                      metadata: telemetryMetadata,
                    }
                  : undefined,
              });

              const text =
                (response as any).text ||
                (response as any).content ||
                String(response);
              const usage = (response as any).usage;

              let evalResults: any[] = [];
              if (
                evalRegistry &&
                Array.isArray(item.evals) &&
                item.evals.length > 0
              ) {
                const evalNames = item.evals;
                const evaluators = evalNames
                  .map((name: string) => {
                    const fn = evalRegistry.get(name);
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
      });
      const stream = new ReadableStream({
        async start(controller) {
          let index = 0;
          const reader = dataset.getReader();
          try {
            for (;;) {
              const { value: item, done } = await reader.read();
              if (done) break;
              const traceId = crypto.randomUUID();
              const formatted = item.formatted;
              const [messages, options] = await formatted.formatMessages();

              const agent = new Agent(formatted);
              const telemetryMetadata: Record<string, any> = {
                ...(options.telemetry?.metadata ?? {}),
                dataset_run_id: runId,
                dataset_path: resolvedDatasetPath || "",
                dataset_run_name: datasetRunName,
                dataset_item_name: String(index),
                traceName: `ds-run-${datasetRunName}-${index}`,
                traceId,
              };
              if (item.dataset.expected_output !== undefined) {
                telemetryMetadata.dataset_expected_output = item.dataset.expected_output;
              }

              const response = await agent.generate(messages, {
                ...options,
                telemetry: options.telemetry
                  ? {
                      ...options.telemetry,
                      metadata: telemetryMetadata,
                    }
                  : undefined,
              });

              const object = (response as any).object || response;
              const usage = (response as any).usage;

              let evalResults: any[] = [];
              if (
                evalRegistry &&
                Array.isArray(item.evals) &&
                item.evals.length > 0
              ) {
                const evaluators = item.evals
                  .map((name: string) => {
                    const fn = evalRegistry.get(name);
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

