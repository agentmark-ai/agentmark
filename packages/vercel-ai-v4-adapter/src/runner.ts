import { EvalRegistry } from "@agentmark/agentmark-core";
export type { ResultKind, NormalizedEval, NormalizedRow } from "@agentmark/agentmark-core";
export { attachVerdicts, normalizeTextRow, normalizeObjectRow } from "@agentmark/agentmark-core";
import { getFrontMatter } from "@agentmark/templatedx";
import type { Ast } from "@agentmark/templatedx";
import type { AgentMark } from "@agentmark/agentmark-core";
import type { VercelAIAdapter } from "./adapter";
import { generateObject, generateText, streamObject, streamText, experimental_generateImage as generateImage, experimental_generateSpeech as generateSpeech } from "ai";
import type { RunnerDatasetResponse, RunnerPromptResponse } from "@agentmark/agentmark-core";

export type AdapterRunnerDeps = {
  evalRegistry: EvalRegistry;
};

export class VercelAdapterRunner {
  constructor(private readonly deps: AdapterRunnerDeps) {}

  async runPrompt(agentmarkClient: AgentMark<any, VercelAIAdapter<any, any>>, promptAst: Ast, options?: { shouldStream?: boolean }): Promise<RunnerPromptResponse> {
    const frontmatter = getFrontMatter(promptAst) as any;

    if (frontmatter.object_config) {
      const prompt = await agentmarkClient.loadObjectPrompt(promptAst);
      const input = await prompt.formatWithTestProps();
      const shouldStream = options?.shouldStream !== undefined ? options.shouldStream : true;
      if (shouldStream) {
        const { usage, fullStream } = streamObject(input as any);
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            for await (const chunk of fullStream as any) {
              if (chunk.type === "error") {
                controller.enqueue(encoder.encode(JSON.stringify({ type: "error", error: (chunk.error as any)?.data?.error?.message ?? "Something went wrong during inference" }) + "\n"));
                controller.close();
                return;
              }
              if (chunk.type === "object") {
                controller.enqueue(encoder.encode(JSON.stringify({ type: "object", result: chunk.object }) + "\n"));
              }
            }
            const usageData = await usage;
            controller.enqueue(encoder.encode(JSON.stringify({ type: "object", usage: usageData }) + "\n"));
            controller.close();
          }
        });
        return { type: "stream", stream, streamHeader: { "AgentMark-Streaming": "true" } } as RunnerPromptResponse;
      }
      const { object, usage, finishReason } = await generateObject(input as any);
      return { type: "object", result: object, usage, finishReason } as RunnerPromptResponse;
    }

    if (frontmatter.text_config) {
      const prompt = await agentmarkClient.loadTextPrompt(promptAst);
      const input = await prompt.formatWithTestProps();
      const shouldStream = options?.shouldStream !== undefined ? options.shouldStream : true;
      if (shouldStream) {
        const { fullStream } = streamText(input as any);
        const stream = new ReadableStream({
          async start(controller) {
            const encoder = new TextEncoder();
            for await (const chunk of fullStream as any) {
              if (chunk.type === "error") {
                controller.enqueue(encoder.encode(JSON.stringify({ type: "error", error: (chunk.error as any)?.data?.error?.message ?? "Something went wrong during inference" }) + "\n"));
                controller.close();
                return;
              }
              if (chunk.type === "text-delta") {
                controller.enqueue(encoder.encode(JSON.stringify({ type: "text", result: chunk.textDelta }) + "\n"));
              }
              if (chunk.type === "tool-call") {
                controller.enqueue(encoder.encode(JSON.stringify({ type: "text", toolCall: { toolCallId: chunk.toolCallId, toolName: chunk.toolName, args: chunk.args } }) + "\n"));
              }
              if (chunk.type === "finish") {
                controller.enqueue(encoder.encode(JSON.stringify({ type: "text", finishReason: chunk.finishReason, usage: chunk.usage }) + "\n"));
              }
            }
            controller.close();
          }
        });
        return { type: "stream", stream, streamHeader: { "AgentMark-Streaming": "true" } } as RunnerPromptResponse;
      }
      const { text, usage, finishReason, steps } = await generateText(input as any);
      const toolCalls = steps?.flatMap((s: any) => s.toolCalls) ?? [];
      const toolResults = steps?.flatMap((s: any) => s.toolResults) ?? [];
      return { type: "text", result: text, usage, finishReason, toolCalls, toolResults } as RunnerPromptResponse;
    }

    if (frontmatter.image_config) {
      const prompt = await agentmarkClient.loadImagePrompt(promptAst);
      const input = await prompt.formatWithTestProps();
      const { images } = await generateImage(input as any);
      return { type: "image", result: images.map(i => ({ mimeType: i.mimeType, base64: i.base64 })) } as RunnerPromptResponse;
    }

    if (frontmatter.speech_config) {
      const prompt = await agentmarkClient.loadSpeechPrompt(promptAst);
      const input = await prompt.formatWithTestProps();
      const { audio } = await generateSpeech(input as any);
      return { type: "speech", result: { mimeType: audio.mimeType, base64: audio.base64, format: audio.format } } as RunnerPromptResponse;
    }

    throw new Error("Invalid prompt");
  }

  async runExperiment(agentmarkClient: AgentMark<any, VercelAIAdapter<any, any>>, promptAst: Ast, datasetRunName: string): Promise<RunnerDatasetResponse> {
    const loader = agentmarkClient.getLoader();
    if (!loader) throw new Error("Loader not found");

    const frontmatter = getFrontMatter(promptAst) as any;
    const runId = crypto.randomUUID();
    const evalRegistry = this.deps.evalRegistry;

    if (frontmatter.text_config) {
      const prompt = await agentmarkClient.loadTextPrompt(promptAst);
      const dataset = await prompt.formatWithDataset({ datasetPath: frontmatter?.test_settings?.dataset, telemetry: { isEnabled: true } });
      const stream = new ReadableStream({
        async start(controller) {
          let index = 0;
          const reader = (dataset as ReadableStream<any>).getReader();
          for (;;) {
            const { value: item, done } = await reader.read();
            if (done) break;
            const traceId = crypto.randomUUID();
            const { text, usage } = await (await import("ai")).generateText({
              ...(item.formatted as any),
              experimental_telemetry: {
                ...(item.formatted.experimental_telemetry ?? {}),
                metadata: {
                  ...(item.formatted.experimental_telemetry?.metadata ?? {}),
                  dataset_run_id: runId,
                  dataset_path: frontmatter?.test_settings?.dataset,
                  dataset_run_name: datasetRunName,
                  dataset_item_name: index,
                  traceName: `ds-run-${datasetRunName}-${index}`,
                  traceId,
                  dataset_expected_output: item.dataset.expected_output,
                },
              },
            } as any);

            let evalResults: any[] = [];
            if (evalRegistry && Array.isArray((item as any).evals) && (item as any).evals.length > 0) {
              const evaluators = item.evals
                .map((name: string) => {
                  const def = evalRegistry.get(name);
                  return def?.fn ? { name, fn: def.fn } : undefined;
                })
                .filter(Boolean) as Array<{ name: string; fn: any }>;
              evalResults = await Promise.all(
                evaluators.map(async (e) => {
                  const r = await e.fn({ input: item.formatted.messages, output: text, expectedOutput: item.dataset.expected_output });
                  return { name: e.name, ...r };
                })
              );
            }

            const chunk = JSON.stringify({
              type: "dataset",
              result: {
                input: item.dataset.input,
                expectedOutput: item.dataset.expected_output,
                actualOutput: text,
                tokens: (usage as any)?.totalTokens,
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
      const prompt = await agentmarkClient.loadObjectPrompt(promptAst);
      const dataset = await prompt.formatWithDataset({ datasetPath: frontmatter?.test_settings?.dataset });
      const stream = new ReadableStream({
        async start(controller) {
          let index = 0;
          const reader = (dataset as ReadableStream<any>).getReader();
          for (;;) {
            const { value: item, done } = await reader.read();
            if (done) break;
            const traceId = crypto.randomUUID();
            const { object, usage } = await (await import("ai")).generateObject({
              ...(item.formatted as any),
              experimental_telemetry: {
                ...(item.formatted.experimental_telemetry ?? {}),
                metadata: {
                  ...(item.formatted.experimental_telemetry?.metadata ?? {}),
                  dataset_run_id: runId,
                  dataset_path: frontmatter?.test_settings?.dataset,
                  dataset_run_name: datasetRunName,
                  dataset_item_name: index,
                  traceName: `ds-run-${datasetRunName}-${index}`,
                  traceId,
                  dataset_expected_output: item.dataset.expected_output,
                },
              },
            } as any);

            let evalResults: any[] = [];
            if (evalRegistry) {
              const evaluators = item.evals
                .map((name: string) => {
                  const def = evalRegistry.get(name);
                  return def?.fn ? { name, fn: def.fn } : undefined;
                })
                .filter(Boolean) as Array<{ name: string; fn: any }>;
              evalResults = await Promise.all(
                evaluators.map(async (e) => {
                  const r = await e.fn({ input: item.formatted.messages, output: object as any, expectedOutput: item.dataset.expected_output });
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
                tokens: (usage as any)?.totalTokens,
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
      const prompt = await agentmarkClient.loadImagePrompt(promptAst);
      const dataset = await prompt.formatWithDataset({ datasetPath: frontmatter?.test_settings?.dataset });
      const stream = new ReadableStream({
        async start(controller) {
          let index = 0;
          const reader = (dataset as ReadableStream<any>).getReader();
          for (;;) {
            const { value: item, done } = await reader.read();
            if (done) break;
            const traceId = crypto.randomUUID();
            const { images } = await (await import("ai")).experimental_generateImage({
              ...(item.formatted as any),
              experimental_telemetry: {
                ...(item.formatted.experimental_telemetry ?? {}),
                metadata: {
                  ...(item.formatted.experimental_telemetry?.metadata ?? {}),
                  dataset_run_id: runId,
                  dataset_path: frontmatter?.test_settings?.dataset,
                  dataset_run_name: datasetRunName,
                  dataset_item_name: index,
                  traceName: `ds-run-${datasetRunName}-${index}`,
                  traceId,
                  dataset_expected_output: item.dataset.expected_output,
                },
              },
            } as any);

            const chunk = JSON.stringify({
              type: "dataset",
              result: {
                input: item.dataset.input,
                expectedOutput: item.dataset.expected_output,
                actualOutput: images.map((image: any) => ({ mimeType: image.mimeType, base64: image.base64 })),
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
      const prompt = await agentmarkClient.loadSpeechPrompt(promptAst);
      const dataset = await prompt.formatWithDataset({ datasetPath: frontmatter?.test_settings?.dataset });
      const stream = new ReadableStream({
        async start(controller) {
          let index = 0;
          const reader = (dataset as ReadableStream<any>).getReader();
          for (;;) {
            const { value: item, done } = await reader.read();
            if (done) break;
            const traceId = crypto.randomUUID();
            const { audio } = await (await import("ai")).experimental_generateSpeech({
              ...(item.formatted as any),
              experimental_telemetry: {
                ...(item.formatted.experimental_telemetry ?? {}),
                metadata: {
                  ...(item.formatted.experimental_telemetry?.metadata ?? {}),
                  dataset_run_id: runId,
                  dataset_path: frontmatter?.test_settings?.dataset,
                  dataset_run_name: datasetRunName,
                  dataset_item_name: index,
                  traceName: `ds-run-${datasetRunName}-${index}`,
                  traceId,
                  dataset_expected_output: item.dataset.expected_output,
                },
              },
            } as any);

            const chunk = JSON.stringify({
              type: "dataset",
              result: {
                input: item.dataset.input,
                expectedOutput: item.dataset.expected_output,
                actualOutput: { mimeType: audio.mimeType, base64: audio.base64, format: audio.format },
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
