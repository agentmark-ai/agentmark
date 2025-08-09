import { AgentMark, EvalRegistry } from "@agentmark/agentmark-core";
import {
  PromptRunEventData,
  InferenceAdapter,
  DatasetRunEventData,
  RunPromptOptions,
  RunDatasetResponse,
} from "./types";
import { getFrontMatter } from "@agentmark/templatedx";
import { getInferenceAdapter } from "./utils";
import { type AgentMarkSDK } from "@agentmark/sdk";

export class WebhookHelper {
  private readonly agentmarkClient: AgentMark<any, any>;
  private readonly inferenceAdapter: InferenceAdapter;
  private readonly evalRegistry?: EvalRegistry;
  private readonly agentmarkSDK?: AgentMarkSDK;

  constructor(
    agentmarkClient: AgentMark<any, any>,
    evalRegistry?: EvalRegistry,
    agentmarkSDK?: AgentMarkSDK
  ) {
    this.agentmarkClient = agentmarkClient;
    this.inferenceAdapter = getInferenceAdapter(agentmarkClient.getAdapter());
    this.evalRegistry = evalRegistry;
    this.agentmarkSDK = agentmarkSDK;
  }

  async runPrompt(event: PromptRunEventData, options?: RunPromptOptions) {
    const data = event;
    const frontmatter = getFrontMatter(data.prompt) as any;

    if (frontmatter.object_config) {
      const prompt = await this.agentmarkClient.loadObjectPrompt(data.prompt);
      const input = await prompt.formatWithTestProps({});
      return this.inferenceAdapter.runObjectPrompt(input, options);
    }

    if (frontmatter.text_config) {
      const prompt = await this.agentmarkClient.loadTextPrompt(data.prompt);
      const input = await prompt.formatWithTestProps({});
      return this.inferenceAdapter.runTextPrompt(input, options);
    }

    if (frontmatter.image_config) {
      const prompt = await this.agentmarkClient.loadImagePrompt(data.prompt);
      const input = await prompt.formatWithTestProps({});
      return this.inferenceAdapter.runImagePrompt(input);
    }

    if (frontmatter.speech_config) {
      const prompt = await this.agentmarkClient.loadSpeechPrompt(data.prompt);
      const input = await prompt.formatWithTestProps({});
      return this.inferenceAdapter.runSpeechPrompt(input);
    }

    throw new Error("Invalid prompt");
  }

  async runDataset(event: DatasetRunEventData): Promise<RunDatasetResponse> {
    const loader = this.agentmarkClient.getLoader();
    if (!loader) {
      throw new Error("Loader not found");
    }

    const frontmatter = getFrontMatter(event.prompt) as any;
    const runId = crypto.randomUUID();
    const inferenceAdapter = this.inferenceAdapter;
    const evalRegistry = this.evalRegistry;
    const agentmarkSDK = this.agentmarkSDK;

    if (frontmatter.text_config) {
      const prompt = await this.agentmarkClient.loadTextPrompt(event.prompt);

      const dataset = await prompt.formatWithDataset({
        datasetPath: frontmatter?.test_settings?.dataset,
        telemetry: {
          isEnabled: true,
        },
      });

      const stream = new ReadableStream({
        async start(controller) {
          let index = 0;
          for await (const item of dataset) {
            const traceId = crypto.randomUUID();
            const result = await inferenceAdapter.runTextPrompt(
              {
                ...item.formatted,
                experimental_telemetry: {
                  ...item.formatted.experimental_telemetry,
                  metadata: {
                    ...item.formatted.experimental_telemetry?.metadata,
                    dataset_run_id: runId,
                    dataset_path: frontmatter?.test_settings?.dataset,
                    dataset_run_name: event.datasetRunName,
                    dataset_item_name: index,
                    traceName: `ds-run-${event.datasetRunName}-${index}`,
                    traceId,
                    dataset_expected_output: item.dataset.expected_output,
                  },
                },
              },
              {
                shouldStream: false,
              }
            );

            let evalResults: any = [];

            if (evalRegistry) {
              const evaluators = item.evals
                .map((evaluator: string) => {
                  const def = evalRegistry.get(evaluator);
                  if (def?.fn) {
                    return {
                      name: evaluator,
                      fn: def.fn,
                    };
                  }
                })
                .filter((evaluator) => evaluator !== undefined);

              evalResults = await Promise.all(
                evaluators.map(async (evaluator) => {
                  const evalResult = await evaluator.fn({
                    input: item.formatted.messages,
                    output: result.type === "text" ? result.result : "",
                    expectedOutput: item.dataset.expected_output,
                  });

                  agentmarkSDK?.score({
                    resourceId: traceId,
                    label: evalResult.label,
                    reason: evalResult.reason,
                    score: evalResult.score,
                    name: evaluator.name,
                  });

                  return {
                    name: evaluator.name,
                    ...evalResult,
                  };
                })
              );
            }

            if (result.type === "text") {
              const chunk =
                JSON.stringify({
                  type: "dataset",
                  result: {
                    input: item.dataset.input,
                    expectedOutput: item.dataset.expected_output,
                    actualOutput: result.result,
                    tokens: result.usage?.totalTokens,
                    evals: evalResults,
                  },
                  runId,
                  runName: event.datasetRunName,
                }) + "\n";
              controller.enqueue(chunk);
            }
            index++;
          }
          controller.close();
        },
      });

      return {
        stream,
        streamHeaders: {
          "AgentMark-Streaming": "true",
        },
      };
    }

    if (frontmatter.object_config) {
      const prompt = await this.agentmarkClient.loadObjectPrompt(event.prompt);

      const dataset = await prompt.formatWithDataset({
        datasetPath: frontmatter?.test_settings?.dataset,
      });

      const stream = new ReadableStream({
        async start(controller) {
          let index = 0;
          for await (const item of dataset) {
            const traceId = crypto.randomUUID();
            const result = await inferenceAdapter.runObjectPrompt({
              ...item.formatted,
              experimental_telemetry: {
                ...item.formatted.experimental_telemetry,
                metadata: {
                  ...item.formatted.experimental_telemetry?.metadata,
                  dataset_run_id: runId,
                  dataset_path: frontmatter?.test_settings?.dataset,
                  dataset_run_name: event.datasetRunName,
                  dataset_item_name: index,
                  traceName: `ds-run-${event.datasetRunName}-${index}`,
                  traceId,
                  dataset_expected_output: item.dataset.expected_output,
                },
              },
            });

            let evalResults: any = [];

            if (evalRegistry) {
              const evaluators = item.evals
                .map((evaluator: string) => {
                  const def = evalRegistry.get(evaluator);
                  if (def?.fn) {
                    return {
                      name: evaluator,
                      fn: def.fn,
                    };
                  }
                })
                .filter((evaluator) => evaluator !== undefined);

              evalResults = await Promise.all(
                evaluators.map(async (evaluator) => {
                  const evalResult = await evaluator.fn({
                    input: item.formatted.messages,
                    output:
                      result.type === "object" ? (result.result as any) : "",
                    expectedOutput: item.dataset.expected_output,
                  });

                  agentmarkSDK?.score({
                    resourceId: traceId,
                    label: evalResult.label,
                    reason: evalResult.reason,
                    score: evalResult.score,
                    name: evaluator.name,
                  });

                  return {
                    name: evaluator,
                    ...evalResult,
                  };
                })
              );
            }

            if (result.type === "object") {
              const chunk =
                JSON.stringify({
                  type: "dataset",
                  result: {
                    input: item.dataset.input,
                    expectedOutput: item.dataset.expected_output,
                    actualOutput: result.result,
                    tokens: result.usage?.totalTokens,
                    evals: evalResults,
                  },
                  runId,
                  runName: event.datasetRunName,
                }) + "\n";
              controller.enqueue(chunk);
            }

            index++;
          }
          controller.close();
        },
      });

      return {
        stream,
        streamHeaders: {
          "AgentMark-Streaming": "true",
        },
      };
    }

    throw new Error("Invalid prompt");
  }
}
