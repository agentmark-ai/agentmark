/**
 * Vitest setup file for traced module tests.
 * Mocks @opentelemetry/api before any imports.
 */

// Mock span tracking - shared with test file via globalThis
interface MockSpan {
  name: string;
  attributes: Record<string, string | number | boolean>;
  status: { code: number; message?: string } | null;
  ended: boolean;
  traceId: string;
  spanId: string;
}

// Use globalThis to share state between setup and test
(globalThis as any).__mockOtelSpans = [] as MockSpan[];
(globalThis as any).__resetMockOtelCounters = () => {
  traceIdCounter = 0;
  spanIdCounter = 0;
};

// Counter for generating unique trace/span IDs
let traceIdCounter = 0;
let spanIdCounter = 0;

const generateTraceId = () => {
  traceIdCounter++;
  return `trace${traceIdCounter.toString().padStart(30, '0')}`;
};

const generateSpanId = () => {
  spanIdCounter++;
  return `span${spanIdCounter.toString().padStart(12, '0')}`;
};

const createMockSpan = (name: string, options?: { attributes?: Record<string, string | number | boolean> }) => {
  const traceId = generateTraceId();
  const spanId = generateSpanId();

  const span: MockSpan = {
    name,
    attributes: { ...options?.attributes },
    status: null,
    ended: false,
    traceId,
    spanId,
  };
  (globalThis as any).__mockOtelSpans.push(span);

  return {
    setAttribute: (key: string, value: string | number | boolean) => {
      span.attributes[key] = value;
    },
    setStatus: (status: { code: number; message?: string }) => {
      span.status = status;
    },
    addEvent: () => {},
    spanContext: () => ({
      traceId,
      spanId,
    }),
    end: () => {
      span.ended = true;
    },
  };
};

const mockContext = {};
const mockTracer = {
  startSpan: (name: string, options?: { attributes?: Record<string, string | number | boolean> }) => {
    return createMockSpan(name, options);
  },
};

const mockOtelApi = {
  trace: {
    getTracer: () => mockTracer,
    setSpan: () => mockContext,
  },
  context: {
    active: () => mockContext,
  },
};

// Mock the module in Node's require cache
require.cache[require.resolve("@opentelemetry/api")] = {
  id: require.resolve("@opentelemetry/api"),
  filename: require.resolve("@opentelemetry/api"),
  loaded: true,
  exports: mockOtelApi,
} as any;
