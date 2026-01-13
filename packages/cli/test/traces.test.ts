import { describe, it, expect, beforeEach } from "vitest";
import { normalizeOtlpSpans } from "@agentmark-ai/shared-utils";
import db from "../cli-src/server/database";
import {
  exportTraces,
  getTraces,
  getTracesByRunId,
  getRequests,
  getSpans,
  getTraceById,
  getTraceGraph,
  getSessions,
  getTracesBySessionId,
  searchSpans,
} from "../cli-src/server/routes/traces";

describe("Traces Routes", () => {
  beforeEach(() => {
    // Clear the traces table before each test
    db.exec("DELETE FROM traces");
  });

  describe("getTracesByRunId", () => {
    it("should return traces filtered by datasetRunId", async () => {
      // Create mock OTLP spans with dataset fields
      const mockOtlpSpans = [{
        resource: {
          attributes: [
            { key: "service.name", value: { stringValue: "test-service" } }
          ]
        },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [{
            traceId: "trace-with-run-id",
            spanId: "span-1",
            name: "invoke_agent test",
            kind: 1,
            startTimeUnixNano: "1000000000000000",
            endTimeUnixNano: "2000000000000000",
            status: { code: 1 },
            attributes: [
              { key: "agentmark.dataset_run_id", value: { stringValue: "run-uuid-123" } },
              { key: "agentmark.dataset_path", value: { stringValue: "test.jsonl" } },
            ],
          }]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      const traces = await getTracesByRunId("run-uuid-123");

      expect(traces).toHaveLength(1);
      expect(traces[0].id).toBe("trace-with-run-id");
      expect(traces[0].dataset_run_id).toBe("run-uuid-123");
    });

    it("should return empty array when no traces match the runId", async () => {
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [{
            traceId: "some-trace",
            spanId: "span-1",
            name: "test",
            kind: 1,
            startTimeUnixNano: "1000000000000000",
            endTimeUnixNano: "2000000000000000",
            status: { code: 1 },
            attributes: [
              { key: "agentmark.dataset_run_id", value: { stringValue: "different-run-id" } },
            ],
          }]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      const traces = await getTracesByRunId("non-existent-run-id");

      expect(traces).toHaveLength(0);
    });

    it("should aggregate datasetRunId correctly when only parent span has it", async () => {
      // This tests the MAX(NULLIF(...)) fix
      // Parent span has datasetRunId, child spans don't
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [
            // Parent span with datasetRunId
            {
              traceId: "multi-span-trace",
              spanId: "parent-span",
              name: "invoke_agent test",
              kind: 1,
              startTimeUnixNano: "1000000000000000",
              endTimeUnixNano: "3000000000000000",
              status: { code: 1 },
              attributes: [
                { key: "agentmark.dataset_run_id", value: { stringValue: "the-run-uuid" } },
                { key: "agentmark.dataset_path", value: { stringValue: "test.jsonl" } },
              ],
            },
            // Child span without datasetRunId
            {
              traceId: "multi-span-trace",
              spanId: "child-span-1",
              parentSpanId: "parent-span",
              name: "chat claude",
              kind: 1,
              startTimeUnixNano: "1500000000000000",
              endTimeUnixNano: "2000000000000000",
              status: { code: 1 },
              attributes: [], // No datasetRunId
            },
            // Another child span without datasetRunId
            {
              traceId: "multi-span-trace",
              spanId: "child-span-2",
              parentSpanId: "parent-span",
              name: "chat claude",
              kind: 1,
              startTimeUnixNano: "2000000000000000",
              endTimeUnixNano: "2500000000000000",
              status: { code: 1 },
              attributes: [], // No datasetRunId
            },
          ]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      // Query by the run ID - should find the trace even though only parent has it
      const traces = await getTracesByRunId("the-run-uuid");

      expect(traces).toHaveLength(1);
      expect(traces[0].id).toBe("multi-span-trace");
      expect(traces[0].dataset_run_id).toBe("the-run-uuid");
    });

    it("should handle traces where no spans have datasetRunId", async () => {
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [{
            traceId: "trace-without-run-id",
            spanId: "span-1",
            name: "test span",
            kind: 1,
            startTimeUnixNano: "1000000000000000",
            endTimeUnixNano: "2000000000000000",
            status: { code: 1 },
            attributes: [], // No datasetRunId
          }]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      // getTraces should show null/empty for dataset_run_id
      const allTraces = await getTraces();
      const trace = allTraces.find((t: any) => t.id === "trace-without-run-id");

      expect(trace).toBeDefined();
      expect(trace?.dataset_run_id).toBeNull(); // MAX(NULLIF('', '')) returns NULL
    });
  });

  describe("getTraces", () => {
    it("should return all traces with dataset_run_id aggregated", async () => {
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [
            {
              traceId: "trace-1",
              spanId: "span-1",
              name: "test 1",
              kind: 1,
              startTimeUnixNano: "1000000000000000",
              endTimeUnixNano: "2000000000000000",
              status: { code: 1 },
              attributes: [
                { key: "agentmark.dataset_run_id", value: { stringValue: "run-1" } },
              ],
            },
            {
              traceId: "trace-2",
              spanId: "span-2",
              name: "test 2",
              kind: 1,
              startTimeUnixNano: "3000000000000000",
              endTimeUnixNano: "4000000000000000",
              status: { code: 1 },
              attributes: [
                { key: "agentmark.dataset_run_id", value: { stringValue: "run-2" } },
              ],
            },
          ]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      const traces = await getTraces();

      expect(traces.length).toBeGreaterThanOrEqual(2);

      const trace1 = traces.find((t: any) => t.id === "trace-1");
      const trace2 = traces.find((t: any) => t.id === "trace-2");

      expect(trace1?.dataset_run_id).toBe("run-1");
      expect(trace2?.dataset_run_id).toBe("run-2");
    });

    it("should support filtering by status", async () => {
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [
            {
              traceId: "trace-ok",
              spanId: "span-ok",
              name: "success trace",
              kind: 1,
              startTimeUnixNano: "1000000000000000",
              endTimeUnixNano: "2000000000000000",
              status: { code: 1 },
              attributes: [],
            },
            {
              traceId: "trace-error",
              spanId: "span-error",
              name: "error trace",
              kind: 1,
              startTimeUnixNano: "3000000000000000",
              endTimeUnixNano: "4000000000000000",
              status: { code: 2 },
              attributes: [],
            },
          ]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      const errorTraces = await getTraces({ status: "2" });
      expect(errorTraces.some((t: any) => t.id === "trace-error")).toBe(true);
    });

    it("should support pagination with limit and offset", async () => {
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [
            { traceId: "trace-a", spanId: "span-a", name: "a", kind: 1, startTimeUnixNano: "1000000000000000", endTimeUnixNano: "2000000000000000", status: { code: 1 }, attributes: [] },
            { traceId: "trace-b", spanId: "span-b", name: "b", kind: 1, startTimeUnixNano: "2000000000000000", endTimeUnixNano: "3000000000000000", status: { code: 1 }, attributes: [] },
            { traceId: "trace-c", spanId: "span-c", name: "c", kind: 1, startTimeUnixNano: "3000000000000000", endTimeUnixNano: "4000000000000000", status: { code: 1 }, attributes: [] },
          ]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      const limitedTraces = await getTraces({ limit: 2 });
      expect(limitedTraces).toHaveLength(2);

      const offsetTraces = await getTraces({ limit: 2, offset: 1 });
      expect(offsetTraces).toHaveLength(2);
    });
  });

  describe("getRequests", () => {
    it("should return only GENERATION type spans", async () => {
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [
            {
              traceId: "trace-1",
              spanId: "gen-span",
              name: "chat claude-sonnet",
              kind: 1,
              startTimeUnixNano: "1000000000000000",
              endTimeUnixNano: "2000000000000000",
              status: { code: 1 },
              attributes: [
                { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
                { key: "gen_ai.request.model", value: { stringValue: "claude-sonnet" } },
                { key: "gen_ai.usage.input_tokens", value: { intValue: 100 } },
                { key: "gen_ai.usage.output_tokens", value: { intValue: 50 } },
              ],
            },
            {
              traceId: "trace-1",
              spanId: "tool-span",
              parentSpanId: "gen-span",
              name: "execute_tool Read",
              kind: 1,
              startTimeUnixNano: "1500000000000000",
              endTimeUnixNano: "1800000000000000",
              status: { code: 1 },
              attributes: [
                { key: "gen_ai.operation.name", value: { stringValue: "execute_tool" } },
              ],
            },
          ]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      const requests = await getRequests();

      // Should only include GENERATION spans (the chat span)
      expect(requests.length).toBeGreaterThanOrEqual(1);
      const genRequest = requests.find((r: any) => r.id === "gen-span");
      expect(genRequest).toBeDefined();
      expect(genRequest?.prompt_tokens).toBe(100);
      expect(genRequest?.completion_tokens).toBe(50);
      expect(genRequest?.total_tokens).toBe(150);
    });

    it("should return empty array when no GENERATION spans exist", async () => {
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [{
            traceId: "trace-1",
            spanId: "span-span",
            name: "execute_tool Read",
            kind: 1,
            startTimeUnixNano: "1000000000000000",
            endTimeUnixNano: "2000000000000000",
            status: { code: 1 },
            attributes: [
              { key: "gen_ai.operation.name", value: { stringValue: "execute_tool" } },
            ],
          }]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      const requests = await getRequests();
      // Tool spans are not GENERATION type
      expect(requests.every((r: any) => r.id !== "span-span")).toBe(true);
    });
  });

  describe("getSpans", () => {
    it("should return all spans for a given traceId", async () => {
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [
            {
              traceId: "trace-xyz",
              spanId: "parent-span",
              name: "invoke_agent test",
              kind: 1,
              startTimeUnixNano: "1000000000000000",
              endTimeUnixNano: "3000000000000000",
              status: { code: 1 },
              attributes: [],
            },
            {
              traceId: "trace-xyz",
              spanId: "child-span-1",
              parentSpanId: "parent-span",
              name: "chat claude",
              kind: 1,
              startTimeUnixNano: "1500000000000000",
              endTimeUnixNano: "2000000000000000",
              status: { code: 1 },
              attributes: [],
            },
            {
              traceId: "other-trace",
              spanId: "other-span",
              name: "other span",
              kind: 1,
              startTimeUnixNano: "5000000000000000",
              endTimeUnixNano: "6000000000000000",
              status: { code: 1 },
              attributes: [],
            },
          ]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      const spans = await getSpans("trace-xyz");

      expect(spans).toHaveLength(2);
      expect(spans.every((s: any) => s.traceId === "trace-xyz")).toBe(true);
      expect(spans.find((s: any) => s.id === "parent-span")).toBeDefined();
      expect(spans.find((s: any) => s.id === "child-span-1")).toBeDefined();
    });

    it("should return empty array for non-existent traceId", async () => {
      const spans = await getSpans("non-existent-trace");
      expect(spans).toHaveLength(0);
    });

    it("should include span data with proper structure", async () => {
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [{
            traceId: "trace-data",
            spanId: "span-with-data",
            name: "chat claude-sonnet",
            kind: 1,
            startTimeUnixNano: "1000000000000000",
            endTimeUnixNano: "2000000000000000",
            status: { code: 1 },
            attributes: [
              { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
              { key: "gen_ai.request.model", value: { stringValue: "claude-sonnet" } },
              { key: "gen_ai.usage.input_tokens", value: { intValue: 100 } },
              { key: "gen_ai.usage.output_tokens", value: { intValue: 50 } },
              { key: "agentmark.session_id", value: { stringValue: "session-123" } },
            ],
          }]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      const spans = await getSpans("trace-data");
      expect(spans).toHaveLength(1);

      const span = spans[0];
      expect(span.id).toBe("span-with-data");
      expect(span.name).toBe("chat claude-sonnet");
      expect(span.data).toBeDefined();
      expect(span.data.model).toBe("claude-sonnet");
      expect(span.data.inputTokens).toBe(100);
      expect(span.data.outputTokens).toBe(50);
      expect(span.data.sessionId).toBe("session-123");
    });
  });

  describe("getTraceById", () => {
    it("should return trace with spans for a given traceId", async () => {
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [
            {
              traceId: "trace-by-id",
              spanId: "root-span",
              name: "invoke_agent myagent",
              kind: 1,
              startTimeUnixNano: "1000000000000000",
              endTimeUnixNano: "3000000000000000",
              status: { code: 1 },
              attributes: [
                { key: "agentmark.trace_name", value: { stringValue: "My Trace" } },
              ],
            },
            {
              traceId: "trace-by-id",
              spanId: "child-span",
              parentSpanId: "root-span",
              name: "chat claude",
              kind: 1,
              startTimeUnixNano: "1500000000000000",
              endTimeUnixNano: "2500000000000000",
              status: { code: 1 },
              attributes: [
                { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
                { key: "gen_ai.usage.input_tokens", value: { intValue: 100 } },
                { key: "gen_ai.usage.output_tokens", value: { intValue: 50 } },
              ],
            },
          ]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      const trace = await getTraceById("trace-by-id");

      expect(trace).not.toBeNull();
      expect(trace?.id).toBe("trace-by-id");
      expect(trace?.spans).toHaveLength(2);
      expect(trace?.data).toBeDefined();
      expect(trace?.data.tokens).toBe(150); // 100 + 50 from GENERATION span
    });

    it("should return null for non-existent traceId", async () => {
      const trace = await getTraceById("non-existent-id");
      expect(trace).toBeNull();
    });
  });

  describe("getTraceGraph", () => {
    it("should return graph data for traces with graph metadata", async () => {
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [
            {
              traceId: "graph-trace",
              spanId: "node-1-span",
              name: "Step 1",
              kind: 1,
              startTimeUnixNano: "1000000000000000",
              endTimeUnixNano: "2000000000000000",
              status: { code: 1 },
              attributes: [
                { key: "agentmark.metadata.graph.node.id", value: { stringValue: "node-1" } },
                { key: "agentmark.metadata.graph.node.type", value: { stringValue: "start" } },
                { key: "agentmark.metadata.graph.node.display_name", value: { stringValue: "Start Node" } },
              ],
            },
            {
              traceId: "graph-trace",
              spanId: "node-2-span",
              parentSpanId: "node-1-span",
              name: "Step 2",
              kind: 1,
              startTimeUnixNano: "2000000000000000",
              endTimeUnixNano: "3000000000000000",
              status: { code: 1 },
              attributes: [
                { key: "agentmark.metadata.graph.node.id", value: { stringValue: "node-2" } },
                { key: "agentmark.metadata.graph.node.parent_id", value: { stringValue: "node-1" } },
                { key: "agentmark.metadata.graph.node.type", value: { stringValue: "process" } },
                { key: "agentmark.metadata.graph.node.display_name", value: { stringValue: "Process Node" } },
              ],
            },
          ]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      const graphData = await getTraceGraph("graph-trace");

      expect(graphData.length).toBeGreaterThanOrEqual(1);
    });

    it("should return empty array for trace without graph metadata", async () => {
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [{
            traceId: "no-graph-trace",
            spanId: "span-1",
            name: "regular span",
            kind: 1,
            startTimeUnixNano: "1000000000000000",
            endTimeUnixNano: "2000000000000000",
            status: { code: 1 },
            attributes: [],
          }]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      const graphData = await getTraceGraph("no-graph-trace");
      expect(graphData).toHaveLength(0);
    });
  });

  describe("getSessions", () => {
    it("should return unique sessions", async () => {
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [
            {
              traceId: "trace-1",
              spanId: "span-1",
              name: "span in session 1",
              kind: 1,
              startTimeUnixNano: "1000000000000000",
              endTimeUnixNano: "2000000000000000",
              status: { code: 1 },
              attributes: [
                { key: "agentmark.session_id", value: { stringValue: "session-abc" } },
                { key: "agentmark.session_name", value: { stringValue: "Session ABC" } },
              ],
            },
            {
              traceId: "trace-2",
              spanId: "span-2",
              name: "another span in session 1",
              kind: 1,
              startTimeUnixNano: "2000000000000000",
              endTimeUnixNano: "3000000000000000",
              status: { code: 1 },
              attributes: [
                { key: "agentmark.session_id", value: { stringValue: "session-abc" } },
              ],
            },
            {
              traceId: "trace-3",
              spanId: "span-3",
              name: "span in session 2",
              kind: 1,
              startTimeUnixNano: "4000000000000000",
              endTimeUnixNano: "5000000000000000",
              status: { code: 1 },
              attributes: [
                { key: "agentmark.session_id", value: { stringValue: "session-xyz" } },
              ],
            },
          ]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      const sessions = await getSessions();

      expect(sessions.length).toBeGreaterThanOrEqual(2);
      const sessionAbc = sessions.find((s: any) => s.id === "session-abc");
      const sessionXyz = sessions.find((s: any) => s.id === "session-xyz");

      expect(sessionAbc).toBeDefined();
      expect(sessionXyz).toBeDefined();
      expect(sessionAbc?.name).toBe("Session ABC");
    });

    it("should return empty array when no sessions exist", async () => {
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [{
            traceId: "trace-no-session",
            spanId: "span-1",
            name: "span without session",
            kind: 1,
            startTimeUnixNano: "1000000000000000",
            endTimeUnixNano: "2000000000000000",
            status: { code: 1 },
            attributes: [],
          }]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      const sessions = await getSessions();
      // No spans have session_id, so should be empty or not include new entries
      expect(sessions.every((s: any) => s.id !== "")).toBe(true);
    });
  });

  describe("getTracesBySessionId", () => {
    it("should return all traces for a given sessionId", async () => {
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [
            {
              traceId: "trace-sess-1",
              spanId: "span-1",
              name: "first trace in session",
              kind: 1,
              startTimeUnixNano: "1000000000000000",
              endTimeUnixNano: "2000000000000000",
              status: { code: 1 },
              attributes: [
                { key: "agentmark.session_id", value: { stringValue: "target-session" } },
              ],
            },
            {
              traceId: "trace-sess-2",
              spanId: "span-2",
              name: "second trace in session",
              kind: 1,
              startTimeUnixNano: "3000000000000000",
              endTimeUnixNano: "4000000000000000",
              status: { code: 1 },
              attributes: [
                { key: "agentmark.session_id", value: { stringValue: "target-session" } },
              ],
            },
            {
              traceId: "trace-other",
              spanId: "span-3",
              name: "trace in different session",
              kind: 1,
              startTimeUnixNano: "5000000000000000",
              endTimeUnixNano: "6000000000000000",
              status: { code: 1 },
              attributes: [
                { key: "agentmark.session_id", value: { stringValue: "other-session" } },
              ],
            },
          ]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);

      const traces = await getTracesBySessionId("target-session");

      expect(traces).toHaveLength(2);
      expect(traces.find((t: any) => t.id === "trace-sess-1")).toBeDefined();
      expect(traces.find((t: any) => t.id === "trace-sess-2")).toBeDefined();
      expect(traces.find((t: any) => t.id === "trace-other")).toBeUndefined();
    });

    it("should return empty array for non-existent sessionId", async () => {
      const traces = await getTracesBySessionId("non-existent-session");
      expect(traces).toHaveLength(0);
    });
  });

  describe("searchSpans", () => {
    beforeEach(async () => {
      // Set up test data for searchSpans
      const mockOtlpSpans = [{
        resource: { attributes: [] },
        scopeSpans: [{
          scope: { name: "agentmark" },
          spans: [
            {
              traceId: "search-trace-1",
              spanId: "gen-span-1",
              name: "chat claude-sonnet",
              kind: 1,
              startTimeUnixNano: "1000000000000000",
              endTimeUnixNano: "2000000000000000",
              status: { code: 1 },
              attributes: [
                { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
                { key: "gen_ai.request.model", value: { stringValue: "claude-sonnet" } },
              ],
            },
            {
              traceId: "search-trace-1",
              spanId: "tool-span-1",
              parentSpanId: "gen-span-1",
              name: "execute_tool Read",
              kind: 1,
              startTimeUnixNano: "1200000000000000",
              endTimeUnixNano: "1500000000000000",
              status: { code: 1 },
              attributes: [
                { key: "gen_ai.operation.name", value: { stringValue: "execute_tool" } },
              ],
            },
            {
              traceId: "search-trace-2",
              spanId: "gen-span-2",
              name: "chat gpt-4",
              kind: 1,
              startTimeUnixNano: "3000000000000000",
              endTimeUnixNano: "5000000000000000",
              status: { code: 2 },
              attributes: [
                { key: "gen_ai.operation.name", value: { stringValue: "chat" } },
                { key: "gen_ai.request.model", value: { stringValue: "gpt-4" } },
              ],
            },
          ]
        }]
      }];

      const normalizedSpans = normalizeOtlpSpans(mockOtlpSpans as any);
      await exportTraces(normalizedSpans);
    });

    it("should filter spans by traceId", async () => {
      const spans = await searchSpans({ traceId: "search-trace-1" });

      expect(spans).toHaveLength(2);
      expect(spans.every((s: any) => s.traceId === "search-trace-1")).toBe(true);
    });

    it("should filter spans by type", async () => {
      const spans = await searchSpans({ type: "GENERATION" });

      expect(spans.length).toBeGreaterThanOrEqual(2);
      expect(spans.every((s: any) => s.data.type === "GENERATION")).toBe(true);
    });

    it("should filter spans by name pattern", async () => {
      const spans = await searchSpans({ name: "chat" });

      expect(spans.length).toBeGreaterThanOrEqual(2);
      expect(spans.every((s: any) => s.name.includes("chat"))).toBe(true);
    });

    it("should filter spans by model", async () => {
      const spans = await searchSpans({ model: "claude" });

      expect(spans.length).toBeGreaterThanOrEqual(1);
      expect(spans.every((s: any) => s.data.model?.includes("claude"))).toBe(true);
    });

    it("should support pagination", async () => {
      const allSpans = await searchSpans({});
      const limitedSpans = await searchSpans({ limit: 1 });

      expect(limitedSpans).toHaveLength(1);
      expect(allSpans.length).toBeGreaterThanOrEqual(limitedSpans.length);
    });

    it("should combine multiple filters", async () => {
      const spans = await searchSpans({
        traceId: "search-trace-1",
        type: "GENERATION",
      });

      expect(spans).toHaveLength(1);
      expect(spans[0].traceId).toBe("search-trace-1");
      expect(spans[0].data.type).toBe("GENERATION");
    });

    it("should return empty array when no spans match filters", async () => {
      const spans = await searchSpans({ model: "non-existent-model-xyz" });
      expect(spans).toHaveLength(0);
    });
  });
});
