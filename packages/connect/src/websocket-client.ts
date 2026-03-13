/**
 * WebSocket client for the AgentMark Connect protocol.
 *
 * Maintains a persistent connection to the platform, handling:
 * - Authentication via headers (Node.js `ws` package)
 * - Heartbeat keep-alive (30 s default)
 * - Exponential-backoff reconnection (1 s -> 30 s cap)
 * - Typed message dispatch to event callbacks
 */

import WebSocket from 'ws';
import type {
  ConnectionStatus,
  WebSocketClientOptions,
  WebSocketClientEvents,
  PlatformMessage,
  WorkerMessage,
} from './types';

const DEFAULT_HEARTBEAT_INTERVAL_MS = 30_000;
const DEFAULT_RECONNECT_MAX_DELAY_MS = 30_000;
const INITIAL_RECONNECT_DELAY_MS = 1_000;

export class WebSocketClient {
  private options: Required<
    Pick<WebSocketClientOptions, 'url' | 'apiKey' | 'appId' | 'heartbeatIntervalMs' | 'reconnectMaxDelayMs'>
  > &
    Pick<WebSocketClientOptions, 'sdkVersion' | 'adapterType' | 'language'>;

  private events: WebSocketClientEvents;
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';

  // Heartbeat
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // Reconnection
  private reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private shouldReconnect = true;
  private reconnectionCount = 0;

  /** Consecutive connection failures without a successful connect in between. */
  private consecutiveFailures = 0;
  private proxyWarningLogged = false;

  /** Job IDs that were in-flight when the connection was lost. */
  private inFlightJobsAtDisconnect: string[] = [];

  /** External callback to retrieve active job IDs (set via setActiveJobsProvider). */
  private activeJobsProvider: (() => string[]) | null = null;

  constructor(options: WebSocketClientOptions, events: WebSocketClientEvents) {
    this.options = {
      url: options.url,
      apiKey: options.apiKey,
      appId: options.appId,
      sdkVersion: options.sdkVersion,
      adapterType: options.adapterType,
      language: options.language,
      heartbeatIntervalMs: options.heartbeatIntervalMs ?? DEFAULT_HEARTBEAT_INTERVAL_MS,
      reconnectMaxDelayMs: options.reconnectMaxDelayMs ?? DEFAULT_RECONNECT_MAX_DELAY_MS,
    };
    this.events = events;
  }

  // ── Public API ──────────────────────────────────────────────────────────────

  /** Opens the WebSocket connection. Safe to call multiple times. */
  connect(): void {
    if (this.ws) {
      return;
    }

    this.shouldReconnect = true;
    this.setStatus('connecting');
    this.openSocket();
  }

  /** Sends a typed worker message to the platform. */
  send(message: WorkerMessage): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return;
    }
    this.ws.send(JSON.stringify(message));
  }

  /** Gracefully closes the connection. No reconnection will be attempted. */
  close(): void {
    this.shouldReconnect = false;
    this.clearTimers();

    if (this.ws) {
      try {
        this.ws.close(1000, 'Client shutting down');
      } catch {
        // Ignore close errors
      }
      this.ws = null;
    }

    this.setStatus('disconnected');
  }

  /** Returns the current connection status. */
  getStatus(): ConnectionStatus {
    return this.status;
  }

  /** Returns the total number of reconnections since the client was created. */
  getReconnectionCount(): number {
    return this.reconnectionCount;
  }

  /**
   * Registers a callback that returns the IDs of currently active jobs.
   * Used to detect in-flight jobs when a disconnect occurs and to send
   * `job-error` messages on reconnect for jobs that timed out on the platform.
   */
  setActiveJobsProvider(provider: () => string[]): void {
    this.activeJobsProvider = provider;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  private openSocket(): void {
    const headers: Record<string, string> = {
      Authorization: this.options.apiKey,
      'X-Agentmark-App-Id': this.options.appId,
    };

    if (this.options.sdkVersion) {
      headers['X-Agentmark-SDK-Version'] = this.options.sdkVersion;
    }
    if (this.options.adapterType) {
      headers['X-Agentmark-Adapter'] = this.options.adapterType;
    }
    if (this.options.language) {
      headers['X-Agentmark-Language'] = this.options.language;
    }

    this.ws = new WebSocket(this.options.url, { headers });

    this.ws.on('open', () => {
      this.setStatus('connected');
      this.reconnectDelay = INITIAL_RECONNECT_DELAY_MS;
      this.consecutiveFailures = 0;
      this.startHeartbeat();

      // On reconnect, send job-error for any jobs that were in-flight when
      // the connection was lost — they will have timed out on the platform side.
      if (this.inFlightJobsAtDisconnect.length > 0) {
        for (const jobId of this.inFlightJobsAtDisconnect) {
          this.send({
            type: 'job-error',
            jobId,
            error: 'Connection lost during job execution',
            details: 'The WebSocket connection was interrupted. The job may have timed out on the platform.',
          });
        }
        this.inFlightJobsAtDisconnect = [];
      }

      this.events.onConnected();
    });

    this.ws.on('message', (data: WebSocket.Data) => {
      try {
        const message = JSON.parse(data.toString()) as PlatformMessage;
        this.handleMessage(message);
      } catch {
        // Malformed message — log and ignore per protocol
        console.warn('[connect] Received malformed JSON message from platform');
      }
    });

    this.ws.on('close', (_code: number, reason: Buffer) => {
      this.stopHeartbeat();
      this.ws = null;
      this.setStatus('disconnected');

      // Capture in-flight jobs before notifying — they'll be reported on reconnect.
      // Merge with any existing unreported jobs from a prior disconnect.
      const activeJobIds = this.activeJobsProvider?.() ?? [];
      if (activeJobIds.length > 0) {
        const existing = new Set(this.inFlightJobsAtDisconnect);
        for (const id of activeJobIds) {
          existing.add(id);
        }
        this.inFlightJobsAtDisconnect = Array.from(existing);
      }

      this.events.onDisconnected(reason.toString() || undefined);
      this.scheduleReconnect();
    });

    this.ws.on('error', (err: Error) => {
      this.setStatus('error');
      this.events.onError(err);
      // The 'close' event fires after 'error', so reconnection is handled there
    });
  }

  private handleMessage(message: PlatformMessage): void {
    switch (message.type) {
      case 'heartbeat-ack':

        break;
      case 'job':
        this.events.onJob(message);
        break;
      case 'job-cancel':
        this.events.onJob(message);
        break;
    }
  }

  // ── Heartbeat ───────────────────────────────────────────────────────────────

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.send({ type: 'heartbeat', timestamp: new Date().toISOString() });
    }, this.options.heartbeatIntervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  // ── Reconnection ───────────────────────────────────────────────────────────

  private scheduleReconnect(): void {
    if (!this.shouldReconnect) {
      return;
    }

    this.reconnectionCount++;
    this.consecutiveFailures++;

    // After repeated failures, suggest webhook/tunnel mode (likely a proxy blocking WebSocket)
    if (this.consecutiveFailures > 5 && !this.proxyWarningLogged) {
      this.proxyWarningLogged = true;
      this.events.onError(
        new Error(
          'WebSocket connection failed repeatedly. ' +
          'You may be behind a corporate proxy — try webhook/tunnel mode.'
        )
      );
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.setStatus('connecting');
      this.openSocket();
    }, this.reconnectDelay);

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, 30s (capped)
    this.reconnectDelay = Math.min(
      this.reconnectDelay * 2,
      this.options.reconnectMaxDelayMs,
    );
  }

  private clearTimers(): void {
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(newStatus: ConnectionStatus): void {
    if (newStatus !== this.status) {
      this.status = newStatus;
    }
  }
}
