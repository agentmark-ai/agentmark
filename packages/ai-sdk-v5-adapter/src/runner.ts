import { getFrontMatter } from "@agentmark/templatedx";
import type { Ast } from "@agentmark/templatedx";
import type { AgentMark } from "@agentmark/prompt-core";
import type { VercelAIAdapter } from "./adapter";
import { generateObject, generateText, streamObject, streamText, experimental_generateImage as generateImage, experimental_generateSpeech as generateSpeech } from "ai";
import type { RunnerDatasetResponse, RunnerPromptResponse } from "@agentmark/prompt-core";

type Frontmatter = {
  text_config?: unknown;
  object_config?: unknown;
  image_config?: unknown;
  speech_config?: unknown;
  test_settings?: { dataset?: string; evals?: string[] };
};

export class VercelAdapterRunner {
  constructor(private readonly client: AgentMark<any, VercelAIAdapter<any, any>>) {}

  async runPrompt(promptAst: Ast, options?: { shouldStream?: boolean; customProps?: Record<string, any> }): Promise<RunnerPromptResponse> {
    const frontmatter = getFrontMatter(promptAst) as Frontmatter;

    if (frontmatter.object_config) {
      const prompt = await this.client.loadObjectPrompt(promptAst);
      const input = options?.customProps ? await prompt.format({ props: options.customProps }) : await prompt.formatWithTestProps();
      const shouldStream = options?.shouldStream !== undefined ? options.shouldStream : true;
      if (shouldStream) {
        const { usage, fullStream } = streamObject(input);
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            for await (const chunk of fullStream) {
              if ((chunk as any).type === "error") {
                const error = (chunk as any)?.error;
                const message = error?.message || error?.data?.error?.message || error?.toString() || "Something went wrong during inference";
                console.error("[Runner] Error during streaming:", error);
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
        return { type: "stream", stream, streamHeader: { "AgentMark-Streaming": "true" } } as RunnerPromptResponse;
      }
      const { object, usage, finishReason } = await generateObject(input);
      return { type: "object", result: object, usage, finishReason } as RunnerPromptResponse;
    }

    if (frontmatter.text_config) {
      const prompt = await this.client.loadTextPrompt(promptAst);
      const input = options?.customProps ? await prompt.format({ props: options.customProps }) : await prompt.formatWithTestProps();
      const shouldStream = options?.shouldStream !== undefined ? options.shouldStream : true;
      if (shouldStream) {
        const { fullStream } = streamText(input);
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            for await (const chunk of fullStream) {
              if ((chunk as any).type === "error") {
                const error = (chunk as any)?.error;
                const message = error?.message || error?.data?.error?.message || error?.toString() || "Something went wrong during inference";
                console.error("[Runner] Error during streaming:", error);
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
        return { type: "stream", stream, streamHeader: { "AgentMark-Streaming": "true" } } as RunnerPromptResponse;
      }
      const { text, usage, finishReason, steps } = await generateText(input);
      const toolCalls = steps?.flatMap((s: any) => s.toolCalls) ?? [];
      const toolResults = steps?.flatMap((s: any) => s.toolResults) ?? [];
      return { type: "text", result: text, usage, finishReason, toolCalls, toolResults } as RunnerPromptResponse;
    }

    if (frontmatter.image_config) {
      const prompt = await this.client.loadImagePrompt(promptAst);
      const input = options?.customProps ? await prompt.format({ props: options.customProps }) : await prompt.formatWithTestProps();
      const result = await generateImage(input);
      return {
        type: "image",
        result: result.images.map(i => ({ mimeType: i.mediaType, base64: i.base64 }))
      } as RunnerPromptResponse;
    }

    if (frontmatter.speech_config) {
      const prompt = await this.client.loadSpeechPrompt(promptAst);
      const input = options?.customProps ? await prompt.format({ props: options.customProps }) : await prompt.formatWithTestProps();
      const result = await generateSpeech(input);
      return {
        type: "speech",
        result: { mimeType: result.audio.mediaType, base64: result.audio.base64, format: result.audio.format }
      } as RunnerPromptResponse;
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
      const dataset = await prompt.formatWithDataset({ datasetPath: resolvedDatasetPath, telemetry: { isEnabled: true } });
      const stream = new ReadableStream({
        async start(controller) {
          let index = 0;
          const reader = dataset.getReader();
          for (;;) {
            const { value: item, done } = await reader.read();
            if (done) break;
            if (item.type === "error") continue;
            const traceId = crypto.randomUUID();
            const formatted = item.formatted as any;
            const { text, usage } = await generateText({
              ...formatted,
              experimental_telemetry: {
                ...(formatted?.experimental_telemetry ?? {}),
                metadata: {
                  ...((formatted?.experimental_telemetry?.metadata) ?? {}),
                  dataset_run_id: runId,
                  dataset_path: resolvedDatasetPath,
                  dataset_run_name: datasetRunName,
                  dataset_item_name: index,
                  traceName: `ds-run-${datasetRunName}-${index}`,
                  traceId,
                  dataset_expected_output: item.dataset?.expected_output,
                },
              },
            });

            let evalResults: any[] = [];
            if (evalRegistry && Array.isArray(item.evals) && item.evals.length > 0) {
              const evalNames = item.evals;
              const evaluators = evalNames
                .map((name: string) => {
                  const fn = evalRegistry.get(name);
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
              runId,
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
      const dataset = await prompt.formatWithDataset({ datasetPath: resolvedDatasetPath, telemetry: { isEnabled: true } });
      const stream = new ReadableStream({
        async start(controller) {
          let index = 0;
          const reader = dataset.getReader();
          for (;;) {
            const { value: item, done } = await reader.read();
            if (done) break;
            if (item.type === "error") continue;
            const traceId = crypto.randomUUID();
            const { object, usage } = await (await import("ai")).generateObject({
              ...item.formatted,
              experimental_telemetry: {
                ...(item.formatted.experimental_telemetry ?? {}),
                metadata: {
                  ...(item.formatted.experimental_telemetry?.metadata ?? {}),
                  dataset_run_id: runId,
                  dataset_path: resolvedDatasetPath,
                  dataset_run_name: datasetRunName,
                  dataset_item_name: index,
                  traceName: `ds-run-${datasetRunName}-${index}`,
                  traceId,
                  dataset_expected_output: item.dataset.expected_output,
                },
              },
            });

            let evalResults: any[] = [];
            if (evalRegistry && Array.isArray(item.evals) && item.evals.length > 0) {
              const evaluators = item.evals
                .map((name: string) => {
                  const fn = evalRegistry.get(name);
                  return fn ? { name, fn } : undefined;
                })
                .filter(Boolean) as Array<{ name: string; fn: any }>;
              evalResults = await Promise.all(
                evaluators.map(async (e) => {
                  const r = await e.fn({ input: item.formatted.messages, output: object, expectedOutput: item.dataset.expected_output });
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
              runId,
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
      const dataset = await prompt.formatWithDataset({ datasetPath: resolvedDatasetPath });
      const stream = new ReadableStream({
        async start(controller) {
          let index = 0;
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
                actualOutput: images.map((image: any) => ({ mimeType: image.mediaType, base64: image.base64 })),
                evals: [],
              },
              runId,
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

    if (frontmatter.speech_config) {
      const prompt = await this.client.loadSpeechPrompt(promptAst);
      const dataset = await prompt.formatWithDataset({ datasetPath: resolvedDatasetPath });
      const stream = new ReadableStream({
        async start(controller) {
          let index = 0;
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
                actualOutput: { mimeType: audio.mediaType, base64: audio.base64, format: audio.format },
                evals: [],
              },
              runId,
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

    throw new Error("Invalid prompt");
  }
}
