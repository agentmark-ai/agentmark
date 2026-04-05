/**
 * createConnectServer — the user-facing factory that composes WebSocketClient
 * and JobHandler into a simple start/stop/getStatus API.
 */

import { WebSocketClient } from './websocket-client';
import { JobHandler } from './job-handler';
import { serializeScoreRegistry } from '@agentmark-ai/prompt-core';
import type {
  ConnectServerOptions,
  ConnectServer,
  JobHandlerFn,
  JobMessage,
  JobCancelMessage,
} from './types';

const DEFAULT_URL = 'wss://api.agentmark.co/v1/connect';

export function createConnectServer(options: ConnectServerOptions): ConnectServer {
  const {
    apiKey,
    appId,
    url = DEFAULT_URL,
    handler,
    scoreRegistry,
    onConnected,
    onDisconnected,
    onError,
    heartbeatIntervalMs,
    reconnectMaxDelayMs,
    language,
  } = options;

  // Wrap the user's handler to intercept get-score-configs jobs.
  // These are auto-responded with serialized score configs without
  // forwarding to the user's handler.
  const wrappedHandler: JobHandlerFn = async (request) => {
    if (request.type === 'get-score-configs') {
      const configs = serializeScoreRegistry(scoreRegistry ?? {});
      return {
        type: 'score-configs',
        result: JSON.stringify(configs),
        traceId: '',
      };
    }
    return handler(request);
  };

  const wsClient = new WebSocketClient(
    {
      url,
      apiKey,
      appId,
      heartbeatIntervalMs,
      reconnectMaxDelayMs,
      language,
    },
    {
      onConnected: () => onConnected?.(),
      onDisconnected: (reason) => onDisconnected?.(reason),
      onJob: (message) => jobHandler.handleMessage(message as JobMessage | JobCancelMessage),
      onError: (err) => onError?.(err),
    },
  );

  const jobHandler = new JobHandler(wsClient, wrappedHandler);
  wsClient.setActiveJobsProvider(() => jobHandler.getActiveJobIds());

  return {
    start: () => wsClient.connect(),
    stop: () => wsClient.close(),
    getStatus: () => wsClient.getStatus(),
  };
}
