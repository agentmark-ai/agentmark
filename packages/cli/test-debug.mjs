import { vi } from 'vitest';
import { TraceForwarder } from './cli-src/forwarding/forwarder.js';
import { ForwardingStatusReporter } from './cli-src/forwarding/status.js';

vi.useFakeTimers();
global.fetch = vi.fn().mockResolvedValue({ ok: true, status: 200 });

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
console.log('Initial stats:', forwarder.getStats());

forwarder.enqueue({ id: 1 });
console.log('After enqueue:', forwarder.getStats());

// Advance timers
for (let i = 0; i < 5; i++) {
  await vi.advanceTimersByTimeAsync(1000);
  console.log(`After ${i+1} seconds:`, forwarder.getStats());
}
