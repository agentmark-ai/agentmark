import { getFrontMatter } from "@agentmark-ai/templatedx";
import type { Ast } from "@agentmark-ai/templatedx";
import type { AgentMark } from "@agentmark-ai/prompt-core";
import { createPromptTelemetry } from "@agentmark-ai/prompt-core";
import type {
  WebhookPromptResponse,
  WebhookDatasetResponse,
} from "@agentmark-ai/prompt-core";
import { query } from "@anthropic-ai/claude-agent-sdk";
import { withTracing } from "./traced";
import type { ClaudeAgentAdapter } from "./adapter";
import type { ClaudeAgentTextParams, ClaudeAgentObjectParams, ClaudeAgentErrorResult } from "./types";

/**
 * Frontmatter type for AgentMark prompts
 */
interface Frontmatter {
  name?: string;
  text_config?: unknown;
  object_config?: unknown;
  image_config?: unknown;
  speech_config?: unknown;
  test_settings?: {
    dataset?: string;
    evals?: string[];
  };
}

/**
 * Options for running a prompt
 */
export interface RunPromptOptions {
  /** Whether to stream the response */
  shouldStream?: boolean;
  /** Custom props to pass to the prompt */
  customProps?: Record<string, unknown>;
  /** Telemetry configuration */
  telemetry?: {
    isEnabled: boolean;
    metadata?: Record<string, unknown>;
  };
}

/**
 * Webhook handler for Claude Agent SDK adapter.
 *
 * Implements the WebhookHandler interface used by the AgentMark CLI
 * to execute prompts with the Claude Agent SDK and return results.
 *
 * @example
 * ```typescript
 * import { ClaudeAgentWebhookHandler } from "@agentmark-ai/claude-agent-sdk-adapter/runner";
 *
 * const handler = new ClaudeAgentWebhookHandler(client);
 *
 * // Execute a prompt and get results
 * const response = await handler.runPrompt(ast, {
 *   customProps: { task: "Help me with coding" },
 *   shouldStream: true
 * });
 * ```
 */
export class ClaudeAgentWebhookHandler {
  constructor(
    private readonly client: AgentMark<
      Record<string, { input: unknown; output: unknown }>,
      ClaudeAgentAdapter<Record<string, { input: unknown; output: unknown }>>
    >
  ) {}

  /**
   * Run a prompt and return the response.
   *
   * @param promptAst - The parsed prompt AST
   * @param options - Execution options
   * @returns Webhook response with result or stream
   */
  async runPrompt(
    promptAst: Ast,
    options?: RunPromptOptions
  ): Promise<WebhookPromptResponse> {
    const frontmatter = getFrontMatter(promptAst) as Frontmatter;
    const { telemetry } = createPromptTelemetry(
      frontmatter.name,
      options?.telemetry
    );

    // Check for unsupported prompt types — return streaming error for tunnel compatibility
    if (frontmatter.image_config || frontmatter.speech_config) {
      const errorType = frontmatter.image_config ? "image" : "speech";
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "error",
                error: `${errorType.charAt(0).toUpperCase() + errorType.slice(1)} generation is not supported by Claude Agent SDK. Use the Vercel AI SDK adapter with ${errorType === "image" ? "an image" : "a speech"} model.`,
              }) + "\n"
            )
          );
          controller.close();
        },
      });
      return {
        type: "stream",
        stream,
        streamHeader: { "AgentMark-Streaming": "true" },
        traceId: "",
      } as WebhookPromptResponse;
    }

    // Handle object prompts
    if (frontmatter.object_config) {
      const prompt = await this.client.loadObjectPrompt(promptAst);
      const adapted = options?.customProps
        ? await prompt.format({ props: options.customProps, telemetry })
        : await prompt.formatWithTestProps({ telemetry });

      return this.executeQuery(
        adapted as ClaudeAgentObjectParams,
        options?.shouldStream ?? false,
        "object"
      );
    }

    // Handle text prompts
    if (frontmatter.text_config) {
      const prompt = await this.client.loadTextPrompt(promptAst);
      const adapted = options?.customProps
        ? await prompt.format({ props: options.customProps, telemetry })
        : await prompt.formatWithTestProps({ telemetry });

      return this.executeQuery(
        adapted as ClaudeAgentTextParams,
        options?.shouldStream ?? false,
        "text"
      );
    }

    throw new Error(
      "Invalid prompt: No recognized config type (text_config, object_config, image_config, speech_config)"
    );
  }

  /**
   * Execute the Claude Agent SDK query and return results.
   */
  private async executeQuery(
    adapted: ClaudeAgentTextParams | ClaudeAgentObjectParams,
    shouldStream: boolean,
    outputType: "text" | "object"
  ): Promise<WebhookPromptResponse> {
    if (shouldStream) {
      return this.createStreamingResponse(adapted, outputType);
    }

    return this.createNonStreamingResponse(adapted, outputType);
  }

  /**
   * Create a streaming response by iterating over the Claude Agent SDK query.
   */
  private async createStreamingResponse(
    adapted: ClaudeAgentTextParams | ClaudeAgentObjectParams,
    outputType: "text" | "object"
  ): Promise<WebhookPromptResponse> {
    // Create traced result before the stream so traceId is available immediately
    // withTracing() returns TracedResult which is both iterable and has traceId
    // adapted already has the right shape for withTracing()
    const tracedResult = await withTracing(query, adapted);

    // Get trace ID - use real OTEL trace ID when available, fallback otherwise
    const traceId = tracedResult.traceId;

    // Reference the iterator to use inside the stream
    const messageIterator = tracedResult;

    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let inputTokens = 0;
        let outputTokens = 0;
        let finalResult = "";
        let structuredOutput: unknown = undefined;

        try {
          // Execute the query and stream results
          for await (const message of messageIterator) {
            // Handle different message types from Claude Agent SDK
            if (message.type === "assistant") {
              // Stream assistant text content
              if (message.message?.content) {
                for (const block of message.message.content) {
                  if (block.type === "text") {
                    controller.enqueue(
                      encoder.encode(
                        JSON.stringify({
                          type: outputType,
                          delta: block.text,
                        }) + "\n"
                      )
                    );
                  }
                }
              }
            } else if (message.type === "result") {
              // Capture final result
              if (message.subtype === "success") {
                finalResult = message.result || "";
                structuredOutput = message.structured_output;
                inputTokens = message.usage?.input_tokens || 0;
                outputTokens = message.usage?.output_tokens || 0;
              } else {
                // Handle error subtypes: error_during_execution, error_max_turns, etc.
                const errorResult = message as ClaudeAgentErrorResult;
                controller.enqueue(
                  encoder.encode(
                    JSON.stringify({
                      type: "error",
                      error: errorResult.errors?.join(", ") || `Error: ${errorResult.subtype}`,
                    }) + "\n"
                  )
                );
              }
            }
          }

          // Emit final completion message
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: outputType,
                result: outputType === "object" ? structuredOutput : finalResult,
                finishReason: "stop",
                usage: {
                  promptTokens: inputTokens,
                  completionTokens: outputTokens,
                },
              }) + "\n"
            )
          );

          controller.close();
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "error",
                error: errorMessage,
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

  /**
   * Create a non-streaming response by executing the query and waiting for completion.
   */
  private async createNonStreamingResponse(
    adapted: ClaudeAgentTextParams | ClaudeAgentObjectParams,
    outputType: "text" | "object"
  ): Promise<WebhookPromptResponse> {
    let inputTokens = 0;
    let outputTokens = 0;
    let finalResult = "";
    let structuredOutput: unknown = undefined;
    let finishReason = "stop";

    // Use traced wrapper for OTEL telemetry
    // withTracing() returns TracedResult which is both iterable and has traceId
    // Tracing is automatically disabled if telemetry is not enabled
    // adapted already has the right shape for withTracing()
    const tracedResult = await withTracing(query, adapted);

    // Get trace ID from traced result
    const traceId = tracedResult.traceId;

    const messageIterator = tracedResult;

    try {
      // Execute the query and collect results
      for await (const message of messageIterator) {
        if (message.type === "result") {
          if (message.subtype === "success") {
            finalResult = message.result || "";
            structuredOutput = message.structured_output;
            inputTokens = message.usage?.input_tokens || 0;
            outputTokens = message.usage?.output_tokens || 0;
          } else {
            // Handle error subtypes: error_during_execution, error_max_turns, etc.
            const errorResult = message as ClaudeAgentErrorResult;
            finishReason = "error";
            finalResult = errorResult.errors?.join(", ") || `Error: ${errorResult.subtype}`;
          }
        }
      }

      return {
        type: outputType,
        result: outputType === "object" ? structuredOutput : finalResult,
        usage: {
          promptTokens: inputTokens,
          completionTokens: outputTokens,
          totalTokens: inputTokens + outputTokens,
        },
        finishReason,
        traceId,
      } as WebhookPromptResponse;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      return {
        type: outputType,
        result: `Error: ${errorMessage}`,
        usage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
        },
        finishReason: "error",
        traceId,
      } as WebhookPromptResponse;
    }
  }

  /**
   * Run an experiment against a dataset.
   *
   * @param promptAst - The parsed prompt AST
   * @param datasetRunName - Name for this experiment run
   * @param datasetPath - Optional override path to dataset
   * @returns Streaming dataset response
   */
  async runExperiment(
    promptAst: Ast,
    datasetRunName: string,
    datasetPath?: string
  ): Promise<WebhookDatasetResponse> {
    const frontmatter = getFrontMatter(promptAst) as Frontmatter;
    // Generate unique experiment run ID (similar to AI SDK v5)
    const experimentRunId = crypto.randomUUID();

    // Check for unsupported types
    if (frontmatter.image_config || frontmatter.speech_config) {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "error",
                error:
                  "Image and speech prompts are not supported by Claude Agent SDK",
              }) + "\n"
            )
          );
          controller.close();
        },
      });

      return {
        stream,
        streamHeaders: { "AgentMark-Streaming": "true" as const },
      };
    }

    const resolvedDatasetPath =
      datasetPath ?? frontmatter.test_settings?.dataset;

    if (!resolvedDatasetPath) {
      const stream = new ReadableStream({
        start(controller) {
          const encoder = new TextEncoder();
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "error",
                error:
                  "No dataset path provided and no default dataset in prompt frontmatter",
              }) + "\n"
            )
          );
          controller.close();
        },
      });

      return {
        stream,
        streamHeaders: { "AgentMark-Streaming": "true" as const },
      };
    }

    // Create streaming response for dataset experiment
    const client = this.client;
    const runId = experimentRunId;
    const stream = new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();

        try {
          // Emit experiment metadata
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "experiment_start",
                runId,
                runName: datasetRunName,
                datasetPath: resolvedDatasetPath,
                promptName: frontmatter.name,
              }) + "\n"
            )
          );

          // Load the prompt for dataset execution
          const isObjectPrompt = !!frontmatter.object_config;
          const prompt = isObjectPrompt
            ? await client.loadObjectPrompt(promptAst)
            : await client.loadTextPrompt(promptAst);

          // Get eval registry for running evaluations
          const evalRegistry = client.getEvalRegistry();

          // Format with dataset and execute each item
          const dataset = await prompt.formatWithDataset({
            datasetPath: resolvedDatasetPath,
            telemetry: { isEnabled: true },
          });

          // Use getReader() to consume the ReadableStream
          const reader = dataset.getReader();
          let itemIndex = 0;

          for (;;) {
            const { value: item, done } = await reader.read();
            if (done) break;

            // Check if this is an error chunk
            if ('error' in item) {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: "experiment_item_error",
                    index: itemIndex,
                    error: item.error,
                  }) + "\n"
                )
              );
              itemIndex++;
              continue;
            }

            // This is a valid data chunk with adapted prompt
            const adapted = await item.formatted as ClaudeAgentTextParams | ClaudeAgentObjectParams;

            // Execute the query for this dataset item with telemetry
            let result = "";
            let structuredOutput: unknown = undefined;
            let inputTokens = 0;
            let outputTokens = 0;
            let traceId = "";

            try {
              // Build telemetry context with dataset attributes
              const telemetryContext = {
                ...(adapted.telemetry || { isEnabled: true, promptName: frontmatter.name || "experiment" }),
                datasetRunId: runId,
                datasetRunName: datasetRunName,
                datasetItemName: String(itemIndex),
                datasetExpectedOutput: item.dataset.expected_output,
                datasetPath: resolvedDatasetPath,
              };

              // Use withTracing() wrapper for telemetry
              const tracedResult = await withTracing(query, {
                query: adapted.query,
                telemetry: telemetryContext,
              });

              traceId = tracedResult.traceId;

              for await (const message of tracedResult) {
                if (message.type === "result" && message.subtype === "success") {
                  result = message.result || "";
                  structuredOutput = message.structured_output;
                  inputTokens = message.usage?.input_tokens || 0;
                  outputTokens = message.usage?.output_tokens || 0;
                }
              }

              // Run evals if configured
              const actualOutput = isObjectPrompt ? structuredOutput : result;
              let evalResults: Array<{ name: string; score: number; label: string; reason: string; passed: boolean }> = [];
              if (evalRegistry && Array.isArray(item.evals) && item.evals.length > 0) {
                const evalNames = item.evals as string[];
                const evaluators = evalNames
                  .map((name: string) => {
                    const fn = evalRegistry.get(name);
                    return fn ? { name, fn } : undefined;
                  })
                  .filter(Boolean) as Array<{ name: string; fn: (params: { input: unknown; output: unknown; expectedOutput?: string }) => Promise<{ score: number; label: string; reason: string; passed: boolean }> | { score: number; label: string; reason: string; passed: boolean } }>;
                evalResults = await Promise.all(
                  evaluators.map(async (e) => {
                    const r = await e.fn({
                      input: adapted.messages,
                      output: actualOutput,
                      expectedOutput: item.dataset?.expected_output,
                    });
                    return { name: e.name, ...r };
                  })
                );
              }

              // Emit in format expected by CLI (type: 'dataset')
              const chunk = JSON.stringify({
                type: "dataset",
                result: {
                  input: item.dataset.input,
                  expectedOutput: item.dataset.expected_output,
                  actualOutput,
                  tokens: inputTokens + outputTokens,
                  evals: evalResults,
                },
                traceId,
                runId,
                runName: datasetRunName,
              }) + "\n";
              controller.enqueue(encoder.encode(chunk));
            } catch (itemError) {
              controller.enqueue(
                encoder.encode(
                  JSON.stringify({
                    type: "experiment_item_error",
                    index: itemIndex,
                    input: item.dataset.input,
                    error: itemError instanceof Error ? itemError.message : String(itemError),
                  }) + "\n"
                )
              );
            }

            itemIndex++;
          }

          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "experiment_end",
                totalItems: itemIndex,
              }) + "\n"
            )
          );

          controller.close();
        } catch (error) {
          const errorMessage =
            error instanceof Error ? error.message : String(error);
          controller.enqueue(
            encoder.encode(
              JSON.stringify({
                type: "error",
                error: errorMessage,
              }) + "\n"
            )
          );
          controller.close();
        }
      },
    });

    return {
      stream,
      streamHeaders: { "AgentMark-Streaming": "true" as const },
    };
  }
}
