/**
 * Core platform-agnostic handler for AgentMark webhook requests.
 * This handler processes requests from any platform adapter and returns
 * a standardized response that adapters can translate to platform-specific formats.
 */

import type { WebhookHandler, WebhookRequest, WebhookResponse } from './types';

/**
 * Handles a webhook request and returns a platform-agnostic response.
 * This is the core business logic that all platform adapters use.
 *
 * @param request - The standardized webhook request
 * @param handler - The webhook handler instance (e.g., VercelAdapterWebhookHandler)
 * @returns A standardized response that adapters translate to platform formats
 */
export async function handleWebhookRequest(
  request: WebhookRequest,
  handler: WebhookHandler
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

    // Validate known event types
    if (type !== 'prompt-run' && type !== 'dataset-run') {
      console.log(`   ⚠️  Unknown event type: ${type}`);
      console.log(`   Valid types: "prompt-run", "dataset-run"`);
      return {
        type: 'error',
        error: 'Unknown event type',
        details: `Expected event.type to be 'prompt-run' or 'dataset-run', got: ${type}`,
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
        customProps: data.customProps
      };

      const response = await handler.runPrompt(data.ast, options);

      // Handle streaming response
      if (response.type === 'stream') {
        console.log('   ✓ Prompt executed successfully (streaming)');
        return {
          type: 'stream',
          stream: response.stream,
          headers: response.streamHeader || { 'AgentMark-Streaming': 'true' }
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
        response = await handler.runExperiment(data.ast, experimentId, data.datasetPath);
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
