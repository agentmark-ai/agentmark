import { getFrontMatter } from "@agentmark-ai/templatedx";
import type { Ast } from "@agentmark-ai/templatedx";
import type { AgentMark, PromptShape } from "@agentmark-ai/prompt-core";
import type { VercelAIAdapter } from "./adapter";
import type { Tool } from "ai";
import { generateObject, generateText, streamObject, streamText, Output, experimental_generateImage as generateImage, experimental_generateSpeech as generateSpeech } from "ai";
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
  test_settings?: { dataset?: string; evals?: string[]; scores?: string[] };
};

export class VercelAdapterWebhookHandler<
  T extends PromptShape<T> = PromptShape<Record<string, never>>
> {
  constructor(private readonly client: AgentMark<T, VercelAIAdapter<T, Record<string, Tool>>>) {}

  async runPrompt(promptAst: Ast, options?: { shouldStream?: boolean; customProps?: Record<string, any>; telemetry?: { isEnabled: boolean; metadata?: Record<string, any> } }): Promise<WebhookPromptResponse> {
    const frontmatter = getFrontMatter(promptAst) as Frontmatter;
    const { telemetry } = createPromptTelemetry(frontmatter.name, options?.telemetry);

    if (frontmatter.object_config) {
      const prompt = await this.client.loadObjectPrompt(promptAst);
      const input = options?.customProps
        ? await prompt.format({ props: options.customProps, telemetry })
        : await prompt.formatWithTestProps({ telemetry });
      const shouldStream = options?.shouldStream !== undefined ? options.shouldStream : true;

      const hasTools = input.tools && Object.keys(input.tools).length > 0;

      if (hasTools) {
        // Tools present: use generateText/streamText with experimental_output
        const { schema, output: _output, schemaName: _sn, schemaDescription: _sd, ...textParams } = input;
        const experimental_output = Output.object({ schema });

        if (shouldStream) {
          const { result, traceId } = await span({ name: frontmatter.name || 'prompt-run' }, async (_ctx: SpanContext) => {
            return streamText({ ...textParams, experimental_output });
          });
          const streamResult = await result;
          const stream = new ReadableStream({
            async start(controller) {
              const encoder = new TextEncoder();
              try {
                for await (const partialObject of streamResult.experimental_partialOutputStream) {
                  controller.enqueue(encoder.encode(JSON.stringify({ type: "object", result: partialObject }) + "\n"));
                }
                const usageData = await streamResult.usage;
                if (usageData) {
                  controller.enqueue(encoder.encode(JSON.stringify({ type: "object", usage: usageData }) + "\n"));
                }
              } catch (err) {
                const error = err as any;
                const message = error?.message || error?.data?.error?.message || error?.toString() || "Something went wrong during inference";
                console.error("[WebhookHandler] Error during streaming:", error);
                controller.enqueue(encoder.encode(JSON.stringify({ type: "error", error: message }) + "\n"));
              }
              controller.close();
            }
          });
          return { type: "stream", stream, streamHeader: { "AgentMark-Streaming": "true" }, traceId } as WebhookPromptResponse;
        }

        // Non-streaming with tools
        const { result, traceId } = await span({ name: frontmatter.name || 'prompt-run' }, async (_ctx: SpanContext) => {
          return generateText({ ...textParams, experimental_output });
        });
        const textResult = await result;
        return {
          type: "object",
          result: (textResult as any).experimental_output,
          usage: (textResult as any).usage,
          finishReason: (textResult as any).finishReason,
          traceId,
        } as WebhookPromptResponse;
      }

      // No tools: existing generateObject/streamObject path
      if (shouldStream) {
        const { result, traceId } = await span({ name: frontmatter.name || 'prompt-run' }, async (_ctx: SpanContext) => {
          return streamObject(input);
        });
        const { usage, fullStream } = await result;
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            for await (const chunk of fullStream) {
              if ((chunk as any).type === "error") {
                const error = (chunk as any)?.error;
                const message = error?.message || error?.data?.error?.message || error?.toString() || "Something went wrong during inference";
                console.error("[WebhookHandler] Error during streaming:", error);
                controller.enqueue(encoder.encode(JSON.stringify({ type: "error", error: message }) + "\n"));
                controller.close();
                return;
              }
              if ((chunk as any).type === "object") {
                controller.enqueue(encoder.encode(JSON.stringify({ type: "object", result: (chunk as any).object }) + "\n"));
              }
            }
            const usageData = await usage;
            controller.enqueue(encoder.encode(JSON.stringify({ type: "object", usage: usageData }) + "\n"));
            controller.close();
          }
        });
        return { type: "stream", stream, streamHeader: { "AgentMark-Streaming": "true" }, traceId } as WebhookPromptResponse;
      }
      const { result, traceId } = await span({ name: frontmatter.name || 'prompt-run' }, async (_ctx: SpanContext) => {
        return generateObject(input);
      });
      const { object, usage, finishReason } = await result;
      return { type: "object", result: object, usage, finishReason, traceId } as WebhookPromptResponse;
    }

    if (frontmatter.text_config) {
      const prompt = await this.client.loadTextPrompt(promptAst);
      const input = options?.customProps
        ? await prompt.format({ props: options.customProps, telemetry })
        : await prompt.formatWithTestProps({ telemetry });
      const shouldStream = options?.shouldStream !== undefined ? options.shouldStream : true;
      if (shouldStream) {
        const { result, traceId } = await span({ name: frontmatter.name || 'prompt-run' }, async (_ctx: SpanContext) => {
          return streamText(input);
        });
        const { fullStream } = await result;
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            for await (const chunk of fullStream) {
              if ((chunk as any).type === "error") {
                const error = (chunk as any)?.error;
                const message = error?.message || error?.data?.error?.message || error?.toString() || "Something went wrong during inference";
                console.error("[WebhookHandler] Error during streaming:", error);
                controller.enqueue(encoder.encode(JSON.stringify({ type: "error", error: message }) + "\n"));
                controller.close();
                return;
              }
              if ((chunk as any).type === "text-delta") {
                controller.enqueue(encoder.encode(JSON.stringify({ type: "text", result: (chunk as any).textDelta }) + "\n"));
              }
              if ((chunk as any).type === "tool-call") {
                controller.enqueue(encoder.encode(JSON.stringify({ type: "text", toolCall: { toolCallId: (chunk as any).toolCallId, toolName: (chunk as any).toolName, args: (chunk as any).args } }) + "\n"));
              }
              if ((chunk as any).type === "tool-result") {
                controller.enqueue(encoder.encode(JSON.stringify({ type: "text", toolResult: { toolCallId: (chunk as any).toolCallId, toolName: (chunk as any).toolName, result: (chunk as any).result } }) + "\n"));
              }
              if ((chunk as any).type === "finish") {
                controller.enqueue(encoder.encode(JSON.stringify({ type: "text", finishReason: (chunk as any).finishReason, usage: (chunk as any).usage }) + "\n"));
              }
            }
            controller.close();
          }
        });
        return { type: "stream", stream, streamHeader: { "AgentMark-Streaming": "true" }, traceId } as WebhookPromptResponse;
      }
      const { result, traceId } = await span({ name: frontmatter.name || 'prompt-run' }, async (_ctx: SpanContext) => {
        return generateText(input);
      });
      const { text, usage, finishReason, steps } = await result;
      const toolCalls = steps?.flatMap((s: any) => s.toolCalls) ?? [];
      const toolResults = steps?.flatMap((s: any) => s.toolResults) ?? [];
      return { type: "text", result: text, usage, finishReason, toolCalls, toolResults, traceId } as WebhookPromptResponse;
    }

    if (frontmatter.image_config) {
      const prompt = await this.client.loadImagePrompt(promptAst);
      const input = options?.customProps
        ? await prompt.format({ props: options.customProps, telemetry })
        : await prompt.formatWithTestProps({ telemetry });
      const { result, traceId } = await span({ name: frontmatter.name || 'prompt-run' }, async (_ctx: SpanContext) => {
        return generateImage(input);
      });
      const imageResult = await result;
      return {
        type: "image",
        result: imageResult.images.map((i: any) => ({ mimeType: i.mimeType, base64: i.base64 })),
        traceId
      } as WebhookPromptResponse;
    }

    if (frontmatter.speech_config) {
      const prompt = await this.client.loadSpeechPrompt(promptAst);
      const input = options?.customProps
        ? await prompt.format({ props: options.customProps, telemetry })
        : await prompt.formatWithTestProps({ telemetry });
      const { result, traceId } = await span({ name: frontmatter.name || 'prompt-run' }, async (_ctx: SpanContext) => {
        return generateSpeech(input);
      });
      const speechResult = await result;
      return {
        type: "speech",
        result: { mimeType: speechResult.audio.mimeType, base64: speechResult.audio.base64, format: speechResult.audio.format },
        traceId
      } as WebhookPromptResponse;
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
    const experimentRunId = crypto.randomUUID();
    const evalRegistry = this.client.getEvalRegistry();

    const resolvedDatasetPath = datasetPath ?? frontmatter?.test_settings?.dataset;

    if (frontmatter.text_config) {
      const prompt = await this.client.loadTextPrompt(promptAst);
      const dataset = await prompt.formatWithDataset({ datasetPath: resolvedDatasetPath, telemetry: { isEnabled: true }, ...(sampling ? { sampling } : {}) });
      const stream = new ReadableStream({
        async start(controller) {
          let index = 0;
          const reader = dataset.getReader();
          for (;;) {
            const { value: item, done } = await reader.read();
            if (done) break;
            if (item.type === "error") continue;
            const formatted = item.formatted as any;
            const { result, traceId } = await span({
              name: `experiment-${datasetRunName}-${index}`,
              datasetRunId: experimentRunId,
              datasetRunName: datasetRunName,
              datasetItemName: `${index}`,
              datasetExpectedOutput: item.dataset?.expected_output,
              datasetPath: resolvedDatasetPath
            }, async (ctx: SpanContext) => {
              if (item.dataset?.input != null) {
                try { ctx.setAttribute("agentmark.props", JSON.stringify(item.dataset.input)); } catch { /* ignore */ }
              }
              const genResult = await generateText({
                ...formatted,
                experimental_telemetry: {
                  ...(formatted?.experimental_telemetry ?? {}),
                  metadata: {
                    ...((formatted?.experimental_telemetry?.metadata) ?? {}),
                  },
                },
              });
              try { ctx.setAttribute("agentmark.output", genResult.text); } catch { /* ignore */ }
              return genResult;
            });

            const { text, usage } = await result;

            let evalResults: any[] = [];
            const scoreNames = item.scores ?? item.evals ?? [];
            if (evalRegistry && Array.isArray(scoreNames) && scoreNames.length > 0) {
              const evaluators = scoreNames
                .map((name: string) => {
                  const fn = evalRegistry[name] as typeof evalRegistry[string] | undefined;
                  return fn ? { name, fn } : undefined;
                })
                .filter(Boolean) as Array<{ name: string; fn: any }>;
              evalResults = await Promise.all(
                evaluators.map(async (e) => {
                  const r = await e.fn({ input: formatted?.messages, output: text, expectedOutput: item.dataset?.expected_output });
                  return { name: e.name, ...r };
                })
              );
            }

            const chunk = JSON.stringify({
              type: "dataset",
              result: {
                input: item.dataset?.input,
                expectedOutput: item.dataset?.expected_output,
                actualOutput: text,
                tokens: usage?.totalTokens,
                evals: evalResults,
              },
              traceId,
              runId: experimentRunId,
              runName: datasetRunName,
            }) + "\n";
            controller.enqueue(chunk);
            index++;
          }
          controller.close();
        },
      });
      return { stream, streamHeaders: { "AgentMark-Streaming": "true" as const } };
    }

    if (frontmatter.object_config) {
      const prompt = await this.client.loadObjectPrompt(promptAst);
      const dataset = await prompt.formatWithDataset({ datasetPath: resolvedDatasetPath, telemetry: { isEnabled: true }, ...(sampling ? { sampling } : {}) });
      const stream = new ReadableStream({
        async start(controller) {
          let index = 0;
          const reader = dataset.getReader();
          for (;;) {
            const { value: item, done } = await reader.read();
            if (done) break;
            if (item.type === "error") continue;
            const formatted = item.formatted as any;
            const hasTools = formatted.tools && Object.keys(formatted.tools).length > 0;

            let object: any;
            let usage: any;
            let traceId: string;

            if (hasTools) {
              const { schema, output: _output, schemaName: _sn, schemaDescription: _sd, ...textParams } = formatted;
              const experimental_output = Output.object({ schema });
              const spanRet = await span({
                name: `experiment-${datasetRunName}-${index}`,
                datasetRunId: experimentRunId,
                datasetRunName: datasetRunName,
                datasetItemName: `${index}`,
                datasetExpectedOutput: item.dataset.expected_output,
                datasetPath: resolvedDatasetPath
              }, async (ctx: SpanContext) => {
                if (item.dataset?.input != null) {
                  try { ctx.setAttribute("agentmark.props", JSON.stringify(item.dataset.input)); } catch { /* ignore */ }
                }
                const genResult = await generateText({
                  ...textParams,
                  experimental_output,
                  experimental_telemetry: {
                    ...(textParams?.experimental_telemetry ?? {}),
                    metadata: {
                      ...(textParams?.experimental_telemetry?.metadata ?? {}),
                    },
                  },
                });
                try {
                  const outputStr = typeof (genResult as any).experimental_output === 'string' ? (genResult as any).experimental_output : JSON.stringify((genResult as any).experimental_output);
                  ctx.setAttribute("agentmark.output", outputStr);
                } catch { /* ignore */ }
                return genResult;
              });
              traceId = spanRet.traceId;
              const textResult = await spanRet.result;
              object = (textResult as any).experimental_output;
              usage = (textResult as any).usage;
            } else {
              const spanRet = await span({
                name: `experiment-${datasetRunName}-${index}`,
                datasetRunId: experimentRunId,
                datasetRunName: datasetRunName,
                datasetItemName: `${index}`,
                datasetExpectedOutput: item.dataset.expected_output,
                datasetPath: resolvedDatasetPath
              }, async (ctx: SpanContext) => {
                if (item.dataset?.input != null) {
                  try { ctx.setAttribute("agentmark.props", JSON.stringify(item.dataset.input)); } catch { /* ignore */ }
                }
                const genResult = await (await import("ai")).generateObject({
                  ...formatted,
                  experimental_telemetry: {
                    ...(formatted.experimental_telemetry ?? {}),
                    metadata: {
                      ...(formatted.experimental_telemetry?.metadata ?? {}),
                    },
                  },
                });
                try {
                  const outputStr = typeof genResult.object === 'string' ? genResult.object : JSON.stringify(genResult.object);
                  ctx.setAttribute("agentmark.output", outputStr);
                } catch { /* ignore */ }
                return genResult;
              });
              traceId = spanRet.traceId;
              const objResult = await spanRet.result;
              object = objResult.object;
              usage = objResult.usage;
            }

            let evalResults: any[] = [];
            const scoreNamesObj = item.scores ?? item.evals ?? [];
            if (evalRegistry && Array.isArray(scoreNamesObj) && scoreNamesObj.length > 0) {
              const evaluators = scoreNamesObj
                .map((name: string) => {
                  const fn = evalRegistry[name] as typeof evalRegistry[string] | undefined;
                  return fn ? { name, fn } : undefined;
                })
                .filter(Boolean) as Array<{ name: string; fn: any }>;
              evalResults = await Promise.all(
                evaluators.map(async (e) => {
                  const r = await e.fn({ input: formatted.messages, output: object, expectedOutput: item.dataset.expected_output });
                  return { name: e.name, ...r };
                })
              );
            }

            const chunk = JSON.stringify({
              type: "dataset",
              result: {
                input: item.dataset.input,
                expectedOutput: item.dataset.expected_output,
                actualOutput: object,
                tokens: usage?.totalTokens,
                evals: evalResults,
              },
              traceId,
              runId: experimentRunId,
              runName: datasetRunName,
            }) + "\n";
            controller.enqueue(chunk);
            index++;
          }
          controller.close();
        },
      });
      return { stream, streamHeaders: { "AgentMark-Streaming": "true" as const } };
    }

    if (frontmatter.image_config) {
      const prompt = await this.client.loadImagePrompt(promptAst);
      const dataset = await prompt.formatWithDataset({ datasetPath: resolvedDatasetPath, ...(sampling ? { sampling } : {}) });
      const stream = new ReadableStream({
        async start(controller) {
          const reader = dataset.getReader();
          for (;;) {
            const { value: item, done } = await reader.read();
            if (done) break;
            if (item.type === "error") continue;
            const { images } = await (await import("ai")).experimental_generateImage({
              ...(item.formatted as any)
            });

            const chunk = JSON.stringify({
              type: "dataset",
              result: {
                input: item.dataset.input,
                expectedOutput: item.dataset.expected_output,
                actualOutput: images.map((image: any) => ({ mimeType: image.mimeType, base64: image.base64 })),
                evals: [],
              },
              runId: experimentRunId,
              runName: datasetRunName,
            }) + "\n";
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });
      return { stream, streamHeaders: { "AgentMark-Streaming": "true" as const } };
    }

    if (frontmatter.speech_config) {
      const prompt = await this.client.loadSpeechPrompt(promptAst);
      const dataset = await prompt.formatWithDataset({ datasetPath: resolvedDatasetPath, ...(sampling ? { sampling } : {}) });
      const stream = new ReadableStream({
        async start(controller) {
          const reader = dataset.getReader();
          for (;;) {
            const { value: item, done } = await reader.read();
            if (done) break;
            if (item.type === "error") continue;
            const { audio } = await (await import("ai")).experimental_generateSpeech({
              ...(item.formatted as any)
            });

            const chunk = JSON.stringify({
              type: "dataset",
              result: {
                input: item.dataset.input,
                expectedOutput: item.dataset.expected_output,
                actualOutput: { mimeType: audio.mimeType, base64: audio.base64, format: audio.format },
                evals: [],
              },
              runId: experimentRunId,
              runName: datasetRunName,
            }) + "\n";
            controller.enqueue(chunk);
          }
          controller.close();
        },
      });
      return { stream, streamHeaders: { "AgentMark-Streaming": "true" as const } };
    }

    throw new Error("Invalid prompt");
  }
}
