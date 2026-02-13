import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createApiServer, setForwarder } from '../../cli-src/api-server';
import { TraceForwarder } from '../../cli-src/forwarding/forwarder';
import type { Server } from 'http';

/**
 * Integration test for API server forwarding hook (T031)
 * Feature: 013-trace-tunnel
 *
 * Tests:
 * - POST /v1/traces saves locally AND enqueues to forwarder
 * - POST /v1/traces without forwarder only saves locally (no error)
 * - Forwarder failure doesn't affect local save response
 */

// Mock the database/traces module
vi.mock('../../cli-src/server/routes/traces', () => ({
  exportTraces: vi.fn().mockResolvedValue(undefined),
  getRequests: vi.fn(),
  getTraces: vi.fn(),
  getTraceById: vi.fn(),
  getTraceGraph: vi.fn(),
  getSessions: vi.fn(),
  getTracesBySessionId: vi.fn(),
  getTracesByRunId: vi.fn(),
  searchSpans: vi.fn(),
}));

// Mock findPromptFiles to avoid filesystem access
vi.mock('@agentmark-ai/shared-utils', async () => {
  const actual = await vi.importActual('@agentmark-ai/shared-utils');
  return {
    ...actual,
    findPromptFiles: vi.fn().mockResolvedValue([]),
  };
});

import { exportTraces } from '../../cli-src/server/routes/traces';

describe('API server forwarding hook', () => {
  let server: Server;
  let baseUrl: string;

  const sampleOtlpPayload = {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: 'test-service' } },
          ],
        },
        scopeSpans: [
          {
            scope: { name: 'test-scope', version: '1.0.0' },
            spans: [
              {
                traceId: 'abc123',
                spanId: 'span456',
                name: 'test-span',
                kind: 1,
                startTimeUnixNano: '1000000000000000000',
                endTimeUnixNano: '1000000001000000000',
                attributes: [],
              },
            ],
          },
        ],
      },
    ],
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    // createApiServer already calls listen() and returns the server
    server = (await createApiServer(0)) as Server;
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 9418;
    baseUrl = `http://localhost:${port}`;
  });

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve) => {
        server.close(() => resolve());
      });
      server = null as any;
    }
    setForwarder(null);
  });

  describe('POST /v1/traces with forwarder', () => {
    it('should save locally AND enqueue to forwarder', async () => {
      const mockConfig = {
        apiKey: 'sk_test',
        baseUrl: 'https://gateway.example.com',
        appId: 'app-123',
        appName: 'Test App',
        tenantId: 'tenant-123',
        apiKeyId: 'key-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      };

      const forwarder = new TraceForwarder(mockConfig);
      const enqueueSpy = vi.spyOn(forwarder, 'enqueue');
      setForwarder(forwarder);

      const response = await fetch(`${baseUrl}/v1/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleOtlpPayload),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toEqual({ success: true });

      // Verify local save was called
      expect(exportTraces).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            trace_id: 'abc123',
            span_id: 'span456',
          }),
        ])
      );

      // Verify forwarder enqueue was called with original payload
      expect(enqueueSpy).toHaveBeenCalledWith(sampleOtlpPayload);
    });

    it('should return 200 immediately without waiting for forward', async () => {
      const mockConfig = {
        apiKey: 'sk_test',
        baseUrl: 'https://gateway.example.com',
        appId: 'app-123',
        appName: 'Test App',
        tenantId: 'tenant-123',
        apiKeyId: 'key-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      };

      // Mock slow forwarder
      const forwarder = new TraceForwarder(mockConfig);
      const slowEnqueue = vi.fn(() => {
        // Simulate async work but don't block
        setTimeout(() => {}, 5000);
      });
      vi.spyOn(forwarder, 'enqueue').mockImplementation(slowEnqueue);

      setForwarder(forwarder);

      const start = Date.now();
      const response = await fetch(`${baseUrl}/v1/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleOtlpPayload),
      });
      const duration = Date.now() - start;

      expect(response.ok).toBe(true);

      // Should respond quickly (< 1 second), not wait for forwarder
      expect(duration).toBeLessThan(1000);
    });
  });

  describe('POST /v1/traces without forwarder', () => {
    it('should only save locally when no forwarder is set', async () => {
      setForwarder(null);

      const response = await fetch(`${baseUrl}/v1/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleOtlpPayload),
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      const data = await response.json();
      expect(data).toEqual({ success: true });

      // Verify local save was called
      expect(exportTraces).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            trace_id: 'abc123',
          }),
        ])
      );
    });

    it('should not error when forwarder is null', async () => {
      setForwarder(null);

      const response = await fetch(`${baseUrl}/v1/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleOtlpPayload),
      });

      expect(response.ok).toBe(true);
      expect(exportTraces).toHaveBeenCalled();
    });
  });

  describe('forwarder failure handling', () => {
    it('should not affect local save response when forwarder throws error', async () => {
      const mockConfig = {
        apiKey: 'sk_test',
        baseUrl: 'https://gateway.example.com',
        appId: 'app-123',
        appName: 'Test App',
        tenantId: 'tenant-123',
        apiKeyId: 'key-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      };

      const forwarder = new TraceForwarder(mockConfig);
      vi.spyOn(forwarder, 'enqueue').mockImplementation(() => {
        throw new Error('Forwarder error');
      });

      setForwarder(forwarder);

      const response = await fetch(`${baseUrl}/v1/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleOtlpPayload),
      });

      // Should still succeed locally even if forwarder fails
      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);

      // Local save should have been called
      expect(exportTraces).toHaveBeenCalled();
    });

    it('should still save locally when local save succeeds but forwarder fails', async () => {
      const mockConfig = {
        apiKey: 'sk_test',
        baseUrl: 'https://gateway.example.com',
        appId: 'app-123',
        appName: 'Test App',
        tenantId: 'tenant-123',
        apiKeyId: 'key-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      };

      const forwarder = new TraceForwarder(mockConfig);
      const enqueueSpy = vi
        .spyOn(forwarder, 'enqueue')
        .mockImplementation(() => {
          // Silently fail to enqueue
        });

      setForwarder(forwarder);

      const response = await fetch(`${baseUrl}/v1/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleOtlpPayload),
      });

      expect(response.ok).toBe(true);

      // Both should be called
      expect(exportTraces).toHaveBeenCalled();
      expect(enqueueSpy).toHaveBeenCalled();
    });
  });

  describe('invalid payload handling', () => {
    it('should return 400 when payload is missing resourceSpans', async () => {
      const response = await fetch(`${baseUrl}/v1/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'payload' }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);

      const data = await response.json();
      expect(data.error).toContain('Invalid OTLP payload');
    });

    it('should return 400 when resourceSpans is not an array', async () => {
      const response = await fetch(`${baseUrl}/v1/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resourceSpans: 'not-an-array' }),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
    });

    it('should not call forwarder when payload validation fails', async () => {
      const mockConfig = {
        apiKey: 'sk_test',
        baseUrl: 'https://gateway.example.com',
        appId: 'app-123',
        appName: 'Test App',
        tenantId: 'tenant-123',
        apiKeyId: 'key-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      };

      const forwarder = new TraceForwarder(mockConfig);
      const enqueueSpy = vi.spyOn(forwarder, 'enqueue');
      setForwarder(forwarder);

      await fetch(`${baseUrl}/v1/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ invalid: 'payload' }),
      });

      expect(enqueueSpy).not.toHaveBeenCalled();
      expect(exportTraces).not.toHaveBeenCalled();
    });
  });

  describe('local save failure', () => {
    it('should return 500 when local save fails', async () => {
      (exportTraces as any).mockRejectedValueOnce(
        new Error('Database error')
      );

      const response = await fetch(`${baseUrl}/v1/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleOtlpPayload),
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);

      const data = await response.json();
      expect(data.error).toBe('Database error');
    });

    it('should not call forwarder when local save fails', async () => {
      (exportTraces as any).mockRejectedValueOnce(
        new Error('Database error')
      );

      const mockConfig = {
        apiKey: 'sk_test',
        baseUrl: 'https://gateway.example.com',
        appId: 'app-123',
        appName: 'Test App',
        tenantId: 'tenant-123',
        apiKeyId: 'key-123',
        expiresAt: new Date(Date.now() + 30 * 24 * 3600 * 1000).toISOString(),
      };

      const forwarder = new TraceForwarder(mockConfig);
      const enqueueSpy = vi.spyOn(forwarder, 'enqueue');
      setForwarder(forwarder);

      await fetch(`${baseUrl}/v1/traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sampleOtlpPayload),
      });

      expect(enqueueSpy).not.toHaveBeenCalled();
    });
  });
});
