/**
 * createConnectServer — the user-facing factory that composes WebSocketClient
 * and JobHandler into a simple start/stop/getStatus API.
 */

import { WebSocketClient } from './websocket-client';
import { JobHandler } from './job-handler';
import type {
  ConnectServerOptions,
  ConnectServer,
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
    onConnected,
    onDisconnected,
    onError,
    heartbeatIntervalMs,
    reconnectMaxDelayMs,
    language,
  } = options;

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

  const jobHandler = new JobHandler(wsClient, handler);
  wsClient.setActiveJobsProvider(() => jobHandler.getActiveJobIds());

  return {
    start: () => wsClient.connect(),
    stop: () => wsClient.close(),
    getStatus: () => wsClient.getStatus(),
  };
}
