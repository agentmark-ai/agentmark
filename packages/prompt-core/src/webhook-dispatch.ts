/**
 * Platform-agnostic AgentMark webhook dispatch.
 *
 * `handleWebhookRequest` is the core that turns one `{ type, data }` event from
 * AgentMark Cloud (or the local dev server) into a prompt run, an experiment
 * run, or a control-plane answer. It is generic over the {@link WebhookHandler}
 * an adapter supplies — it never reaches into adapter internals — so it lives
 * here in prompt-core rather than in any single adapter or the CLI.
 *
 * It is intentionally transport-agnostic: it consumes an already-parsed event
 * and returns a {@link WebhookResponse} envelope. The HTTP layer (the CLI's
 * local dev server, or AgentMark Cloud's managed machine) owns the wire.
 *
 * Keeping it in prompt-core means a deployed handler imports only
 * `@agentmark-ai/prompt-core/webhook-runner` + its adapter — never the CLI,
 * which carries an embedded dashboard (Next.js/React/MUI/better-sqlite3) that
 * has no business in a deployed handler's dependency tree.
 */

import { buildEvalsResponse } from './control-plane';
import type { ControlPlaneClient } from './control-plane';
import type { WebhookPromptResponse, WebhookDatasetResponse } from './runner';
import type { RunExperimentOptions } from './webhook-runner';

// Re-export the cross-language control-plane contract so adapters and the
// dispatch share one definition. The CLIENT (not the handler) owns these.
export type { ControlPlaneClient };
// Re-export prompt-core response types for convenience — consumers of the
// webhook surface get the request, response, and run types from one place.
export type { WebhookPromptResponse, WebhookDatasetResponse } from './runner';

/**
 * Telemetry options for tracking prompt execution.
 */
export interface TelemetryOptions {
  isEnabled: boolean;
  metadata?: {
    traceId?: string;
    traceName?: string;
    sessionId?: string;
    sessionName?: string;
    [key: string]: any;
  };
}

/**
 * Generic webhook handler interface that any adapter can implement.
 * This is the contract that adapters (e.g., VercelAdapterWebhookHandler) must fulfill.
 */
export interface WebhookHandler {
  runPrompt(promptAst: any, options?: { shouldStream?: boolean; customProps?: Record<string, any>; telemetry?: TelemetryOptions }): Promise<WebhookPromptResponse>;
  runExperiment(promptAst: any, datasetRunName: string, options?: RunExperimentOptions): Promise<WebhookDatasetResponse>;
  /**
   * The AgentMark client this handler executes against, surfaced so the shared
   * dispatch can answer control-plane jobs (e.g. `get-evals`) without the caller
   * threading the client separately. Optional: a handler that doesn't expose it
   * still works for prompt/experiment execution, and `handleWebhookRequest`
   * accepts an explicit client override. Adapters built from a client (Vercel,
   * etc.) set this so consumers get `get-evals` with zero extra wiring.
   */
  readonly client?: ControlPlaneClient;
}

/**
 * Standardized request format for all platform adapters.
 * Platform adapters translate their specific request formats into this structure.
 */
export interface WebhookRequest {
  type: 'prompt-run' | 'dataset-run' | 'get-evals';
  data: {
    // Optional: control-plane jobs (get-evals) carry no AST. prompt-run /
    // dataset-run require it; the dispatch validates presence for those.
    ast?: any;
    customProps?: Record<string, any>;
    options?: { shouldStream?: boolean };
    experimentId?: string;
    datasetPath?: string;
    promptPath?: string;
    sampling?: Record<string, unknown>;
    concurrency?: number;
    // Experiment identity for the regression gate. experimentKey = stable,
    // composition-agnostic eval identity; sourceTreeHash = git tree hash of the
    // run's code state (the gate's baseline-match key).
    experimentKey?: string;
    sourceTreeHash?: string;
  };
}

/**
 * Standardized response format from the core handler.
 * Platform adapters translate this into their specific response formats.
 */
export type WebhookResponse =
  | { type: 'json'; data: any; status?: number }
  | { type: 'stream'; stream: ReadableStream; headers: Record<string, string>; traceId?: string }
  | { type: 'error'; error: string; details?: string; status: number };

/**
 * Handles a webhook request and returns a platform-agnostic response.
 * This is the core business logic that all platform adapters use.
 *
 * @param request - The standardized webhook request
 * @param handler - The webhook handler instance (e.g., VercelAdapterWebhookHandler)
 * @param client - The AgentMark client, used to answer control-plane jobs
 *   (e.g. `get-evals`). The client — not the handler — owns the eval registry.
 * @returns A standardized response that adapters translate to platform formats
 */
export async function handleWebhookRequest(
  request: WebhookRequest,
  handler: WebhookHandler,
  client?: ControlPlaneClient
): Promise<WebhookResponse> {
  try {
    const { type, data } = request;

    // Log the event type with more detail
    if (!type) {
      console.log(`   ⚠️  Event: missing 'type' field`);

      // Check for common mistakes
      const anyRequest = request as any;
      if (anyRequest.event) {
        console.log(`   💡 Found nested 'event' wrapper`);
        console.log(`   ❌ Incorrect: { "event": { "type": "...", "data": {...} } }`);
        console.log(`   ✅ Correct:   { "type": "...", "data": {...} }`);
      } else {
        console.log(`   📦 Request body:`, JSON.stringify(request, null, 2));
      }

      return {
        type: 'error',
        error: 'Missing event type',
        details: 'Request must include a "type" field at the top level: {"type": "prompt-run", "data": {...}}',
        status: 400
      };
    }

    console.log(`   📝 Event: ${type}`);

    // Control-plane job: list runnable evals for the dashboard's "New
    // Experiment" dialog. Carries no AST, so it short-circuits ahead of the
    // data/ast validation below. Sourced from the client (the eval-registry
    // owner) via the shared cross-language helper — no per-adapter logic.
    // Prefer an explicit client override, else the client the handler was built
    // from, so adapters (Vercel, etc.) answer get-evals with zero extra wiring.
    if (type === 'get-evals') {
      const cp = client ?? handler.client;
      if (cp) {
        console.log('   ✓ Listed evals');
      } else {
        console.log('   ⚠️  get-evals: no control-plane client on the call or handler; returning empty eval list');
      }
      // One source of truth for the envelope shape: the shared helper, fed an
      // empty-names client when none is available.
      return {
        type: 'json',
        data: buildEvalsResponse(cp ?? { getEvalNames: () => [] }),
        status: 200,
      };
    }

    // Validate known event types
    if (type !== 'prompt-run' && type !== 'dataset-run') {
      console.log(`   ⚠️  Unknown event type: ${type}`);
      console.log(`   Valid types: "prompt-run", "dataset-run", "get-evals"`);
      return {
        type: 'error',
        error: 'Unknown event type',
        details: `Expected event.type to be 'prompt-run', 'dataset-run', or 'get-evals', got: ${type}`,
        status: 400
      };
    }

    // Validate request structure
    if (!data) {
      console.log(`   ⚠️  Missing 'data' field in request`);
      return {
        type: 'error',
        error: 'Missing data object',
        details: 'Request must include a "data" object with the prompt AST and options',
        status: 400
      };
    }

    // Validate AST field
    if (!data.ast) {
      console.log(`   ⚠️  Missing 'data.ast' field`);
      console.log(`   📦 Available fields in data:`, Object.keys(data).join(', '));

      // Check for common mistakes
      const anyData = data as any;
      if (anyData.prompt) {
        console.log(`   💡 Found 'data.prompt' but expected 'data.ast'`);
        console.log(`   ❌ Incorrect: { "data": { "prompt": {...} } }`);
        console.log(`   ✅ Correct:   { "data": { "ast": {...} } }`);
      }

      return {
        type: 'error',
        error: 'Missing AST object',
        details: 'The request must include the prompt AST in data.ast (not data.prompt)',
        status: 400
      };
    }

    if (typeof data.ast !== 'object') {
      console.log(`   ⚠️  Invalid AST type: ${typeof data.ast} (expected object)`);
      return {
        type: 'error',
        error: 'Invalid AST type',
        details: `The AST must be an object, got ${typeof data.ast}`,
        status: 400
      };
    }

    // Handle prompt execution
    if (type === 'prompt-run') {
      console.log('   🤖 Executing prompt...');

      const options = {
        shouldStream: data.options?.shouldStream,
        customProps: data.customProps,
      };

      const response = await handler.runPrompt(data.ast, options);

      // Handle streaming response
      if (response.type === 'stream') {
        console.log('   ✓ Prompt executed successfully (streaming)');
        return {
          type: 'stream',
          stream: response.stream,
          headers: response.streamHeader || { 'AgentMark-Streaming': 'true' },
          traceId: response.traceId
        };
      }

      // Handle regular JSON response (text, object, image, speech)
      console.log('   ✓ Prompt executed successfully');
      return {
        type: 'json',
        data: response,
        status: 200
      };
    }

    // Handle dataset/experiment execution
    if (type === 'dataset-run') {
      console.log('   🧪 Running experiment with dataset...');
      const experimentId = data.experimentId ?? 'local-experiment';

      let response;
      try {
        response = await handler.runExperiment(data.ast, experimentId, {
          datasetPath: data.datasetPath,
          sampling: data.sampling,
          concurrency: data.concurrency,
          experimentKey: data.experimentKey,
          sourceTreeHash: data.sourceTreeHash,
        });
      } catch (e: any) {
        const errorMessage = e?.message || String(e);
        console.log(`   ❌ Experiment failed: ${errorMessage}`);
        return {
          type: 'error',
          error: errorMessage,
          details: 'An error occurred while running the experiment. Check that your prompt and dataset are valid.',
          status: 500
        };
      }

      // Dataset runs always return streams
      if (response?.stream) {
        console.log('   ✓ Experiment started successfully (streaming)');
        return {
          type: 'stream',
          stream: response.stream,
          headers: response.streamHeaders || { 'AgentMark-Streaming': 'true' }
        };
      }

      console.log('   ❌ Experiment failed: No stream returned');
      return {
        type: 'error',
        error: 'Expected stream from dataset-run',
        details: 'Dataset execution should return a streaming response',
        status: 500
      };
    }

    // Unknown event type
    return {
      type: 'error',
      error: 'Unknown event type',
      details: `Expected event.type to be 'prompt-run' or 'dataset-run', got: ${type || 'undefined'}`,
      status: 400
    };

  } catch (e: any) {
    const errorMessage = e?.message || String(e);

    return {
      type: 'error',
      error: 'Webhook handler error',
      details: errorMessage,
      status: 500
    };
  }
}
