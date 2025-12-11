import { Trace, TraceData } from "@/sections";
import { GraphData } from "@/sections/traces/trace-drawer/trace-graph/use-trace-graph";

export const traces: Trace[] = [
  {
    id: "1",
    name: "Trace 1",
    status: "0",
    latency: "1000",
    cost: "1000",
    tokens: "1000",
    start: "2021-01-01T00:00:00Z",
    end: "2021-01-01T00:00:01Z",
  },
  {
    id: "2",
    name: "Trace 2",
    status: "1",
    latency: "2000",
    cost: "2000",
    tokens: "2000",
    start: "2021-01-01T00:00:00Z",
    end: "2021-01-01T00:00:02Z",
  },
  {
    id: "3",
    name: "Trace 3",
    status: "0",
    latency: "3000",
    cost: "3000",
    tokens: "3000",
    start: "2021-01-01T00:00:00Z",
    end: "2021-01-01T00:00:03Z",
  },
  {
    id: "4",
    name: "Trace 4",
    status: "1",
    latency: "4000",
    cost: "4000",
    tokens: "4000",
    start: "2021-01-01T00:00:00Z",
    end: "2021-01-01T00:00:04Z",
  },
  {
    id: "5",
    name: "Trace 5",
    status: "0",
    latency: "5000",
    cost: "5000",
    tokens: "5000",
    start: "2021-01-01T00:00:00Z",
    end: "2021-01-01T00:00:05Z",
  },
];

export const traceData: TraceData[] = [
  {
    id: "1",
    name: "Trace 1",
    spans: [
      {
        id: "4",
        name: "Span 1",
        duration: 1000,
        timestamp: 1000,
        traceId: "1",
        data: {
          type: "GENERATION",
          model: "gpt-3.5-turbo",
          inputTokens: 245,
          outputTokens: 41,
          totalTokens: 286,
          cost: 0.0004495,
          input: JSON.stringify([
            {
              role: "system",
              content: "You are a customer feedback analyst. Your task is to analyze customer feedback and extract key insights including sentiment, topics, urgency, and suggested actions.\n\nAnalyze the provided customer feedback and respond with a structured analysis including:\n\n1. Overall sentiment (positive, negative, neutral, or mixed)\n2. Key topics or themes mentioned\n3. Urgency level based on the nature and impact of the feedback\n4. Suggested actions to address the feedback\n\nBe thorough in your analysis and provide actionable insights.",
            },
            {
              role: "user",
              content: [{ type: "text", text: "Customer Feedback:" }],
            },
          ]),
          output: null,
          outputObject: JSON.stringify({
            sentiment: "negative",
            key_topics: ["product quality", "customer service", "shipping"],
            urgency_level: "high",
            suggested_actions: [
              "conduct quality checks",
              "improve customer service training",
              "optimize shipping processes",
            ],
          }),
          finishReason: "stop",
          settings: JSON.stringify({
            temperature: 0.7,
            maxTokens: 4096,
            topP: 1,
            presencePenalty: 0,
            frequencyPenalty: 0,
          }),
          sessionId: "session-123",
          sessionName: "Test Session",
          userId: "user-123",
          traceName: "ds-run-test-2",
          promptName: "customer-feedback-analyzer",
          props: JSON.stringify({
            customer_question: "How do I return a product that I purchased last week?",
          }),
          status: "2",
          spanKind: "SPAN_KIND_SERVER",
          serviceName: "test-service",
          tenantId: "0e0d58a5-981b-4eeb-a03a-b8b72a9b5a18",
          appId: "26a6d21d-153d-4bd9-a944-7c9c9df136f5",
          attributes: '{"operation.name":"ai.generateObject.doGenerate","ai.operationId":"ai.generateObject.doGenerate","ai.model.provider":"openai.chat","ai.model.id":"gpt-3.5-turbo","ai.settings.temperature":"0.7","ai.settings.maxTokens":"4096","ai.settings.topP":"1","ai.settings.frequencyPenalty":"0","ai.settings.presencePenalty":"0","ai.settings.maxRetries":"2","ai.telemetry.metadata.prompt":"customer-feedback-analyzer","ai.telemetry.metadata.props":"{\\"customer_question\\":\\"How do I return a product that I purchased last week?\\"}","ai.telemetry.metadata.dataset_run_id":"e96c4dcc-8ee7-4f90-b1b2-4c5a67c6990b","ai.telemetry.metadata.dataset_path":"customer-query.jsonl","ai.telemetry.metadata.dataset_run_name":"test","ai.telemetry.metadata.dataset_item_name":"2","ai.telemetry.metadata.traceName":"ds-run-test-2","ai.telemetry.metadata.traceId":"d662a67a-ad48-47c2-b8e1-02394997faa6","ai.prompt.format":"messages","ai.prompt.messages":"[{\\"role\\":\\"system\\",\\"content\\":\\"You are a customer feedback analyst. Your task is to analyze customer feedback and extract key insights including sentiment, topics, urgency, and suggested actions.\\\\n\\\\nAnalyze the provided customer feedback and respond with a structured analysis including:\\\\n\\\\n1. Overall sentiment (positive, negative, neutral, or mixed)\\\\n2. Key topics or themes mentioned\\\\n3. Urgency level based on the nature and impact of the feedback\\\\n4. Suggested actions to address the feedback\\\\n\\\\nBe thorough in your analysis and provide actionable insights.\\"},{\\"role\\":\\"user\\",\\"content\\":[{\\"type\\":\\"text\\",\\"text\\":\\"Customer Feedback:\\"}]}]","ai.settings.mode":"tool","gen_ai.system":"openai.chat","gen_ai.request.model":"gpt-3.5-turbo","gen_ai.request.frequency_penalty":"0","gen_ai.request.max_tokens":"4096","gen_ai.request.presence_penalty":"0","gen_ai.request.temperature":"0.7","gen_ai.request.top_p":"1","ai.response.finishReason":"stop","ai.response.object":"{\\"sentiment\\":\\"negative\\",\\"key_topics\\":[\\"product quality\\",\\"customer service\\",\\"shipping\\"],\\"urgency_level\\":\\"high\\",\\"suggested_actions\\":[\\"conduct quality checks\\",\\"improve customer service training\\",\\"optimize shipping processes\\"]}","ai.response.id":"chatcmpl-CO41bSPi3QW40nb5KWTsKN2lC1Wfz","ai.response.model":"gpt-3.5-turbo-0125","ai.response.timestamp":"2025-10-07T15:36:19.000Z","ai.usage.promptTokens":"245","ai.usage.completionTokens":"41","gen_ai.response.finish_reasons":"[\\"stop\\"]","gen_ai.response.id":"chatcmpl-CO41bSPi3QW40nb5KWTsKN2lC1Wfz","gen_ai.response.model":"gpt-3.5-turbo-0125","gen_ai.usage.input_tokens":"245","gen_ai.usage.output_tokens":"41","end_time":"1759851379990779000","puzzlet.tenant_id":"0e0d58a5-981b-4eeb-a03a-b8b72a9b5a18","puzzlet.app_id":"26a6d21d-153d-4bd9-a944-7c9c9df136f5","puzzlet.branch_id":"401b8d9b-55d7-4822-b691-841ad04367b3","gen_ai.usage.cost":"0.00044950000000000003"}'
        },
      },
      {
        id: "5",
        name: "Span 2",
        duration: 2000,
        parentId: "4",
        timestamp: 2000,
        traceId: "1",
        data: {
          type: "SPAN",
          status: "2",
        },
      },
      {
        id: "6",
        name: "Span 3",
        duration: 3000,
        parentId: "5",
        timestamp: 3000,
        traceId: "1",
        data: {
          type: "SPAN",
          status: "2",
        },
      },
    ],
    data: {},
  },
];

export const graphData: GraphData[] = [
  {
    nodeId: "4",
    spanId: "4",
    nodeType: "span",
    displayName: "Span 1",
    spanName: "Span 1",
  },
  {
    parentNodeId: "4",
    nodeId: "5",
    spanId: "5",
    nodeType: "span",
    displayName: "Span 2",
    spanName: "Span 2",
  },
  {
    parentNodeId: "5",
    nodeId: "6",
    spanId: "6",
    nodeType: "span",
    displayName: "Span 3",
    spanName: "Span 3",
  },
];

/**
 * Mock spans for auto-generated workflow graph testing.
 * Simulates an agentic workflow with a parent agent span containing:
 * - Multiple LLM calls (generateText)
 * - Two different tool calls (search_web, calculate)
 */
export const workflowSpans = [
  // Parent agent span
  {
    spanId: "agent-span",
    parentSpanId: undefined,
    name: "research_agent",
    startTime: 0,
    type: "SPAN",
    data: { type: "SPAN" },
  },
  // First generateText call (planning)
  {
    spanId: "span-1",
    parentSpanId: "agent-span",
    name: "generateText",
    startTime: 1000,
    type: "GENERATION",
    data: { type: "GENERATION" },
  },
  // First search tool call
  {
    spanId: "span-2",
    parentSpanId: "agent-span",
    name: "search_web",
    startTime: 2000,
    type: "SPAN",
    data: { toolCalls: '[{"name":"search_web"}]' },
  },
  // Second generateText call (process search results)
  {
    spanId: "span-3",
    parentSpanId: "agent-span",
    name: "generateText",
    startTime: 3000,
    type: "GENERATION",
    data: { type: "GENERATION" },
  },
  // Calculate tool call (new tool type)
  {
    spanId: "span-4",
    parentSpanId: "agent-span",
    name: "calculate",
    startTime: 4000,
    type: "SPAN",
    data: { toolCalls: '[{"name":"calculate"}]' },
  },
  // Third generateText call (more reasoning)
  {
    spanId: "span-5",
    parentSpanId: "agent-span",
    name: "generateText",
    startTime: 5000,
    type: "GENERATION",
    data: { type: "GENERATION" },
  },
  // Second search tool call
  {
    spanId: "span-6",
    parentSpanId: "agent-span",
    name: "search_web",
    startTime: 6000,
    type: "SPAN",
    data: { toolCalls: '[{"name":"search_web"}]' },
  },
  // Final generateText call (response)
  {
    spanId: "span-7",
    parentSpanId: "agent-span",
    name: "generateText",
    startTime: 7000,
    type: "GENERATION",
    data: { type: "GENERATION" },
  },
];

/**
 * Mock trace data with spans suitable for auto-graph generation.
 * Demonstrates an agentic workflow with:
 * - Parent agent span containing all operations
 * - Multiple LLM calls (generateText) grouped into one node
 * - Two different tool types (search_web, calculate) as separate nodes
 *
 * Expected graph structure:
 * research_agent → generateText (4 spans) → search_web (2 spans)
 *                                        → calculate (1 span)
 */
export const workflowTraceData: TraceData = {
  id: "workflow-trace-1",
  name: "Research Agent Workflow",
  spans: [
    // Parent agent span
    {
      id: "agent-span",
      name: "research_agent",
      duration: 7500,
      timestamp: 0,
      traceId: "workflow-trace-1",
      data: {
        type: "SPAN",
        status: "2",
      },
    },
    // First generateText (planning)
    {
      id: "span-1",
      name: "generateText",
      parentId: "agent-span",
      duration: 800,
      timestamp: 1000,
      traceId: "workflow-trace-1",
      data: {
        type: "GENERATION",
        model: "claude-3-sonnet",
        inputTokens: 100,
        outputTokens: 50,
        totalTokens: 150,
        cost: 0.001,
        input: JSON.stringify([{ role: "user", content: "What is the population of Tokyo and calculate the density?" }]),
        output: "I'll search for Tokyo's population and area, then calculate the density.",
        status: "2",
      },
    },
    // First search_web tool call
    {
      id: "span-2",
      name: "search_web",
      parentId: "agent-span",
      duration: 500,
      timestamp: 2000,
      traceId: "workflow-trace-1",
      data: {
        type: "SPAN",
        toolCalls: JSON.stringify([{ name: "search_web", args: { query: "Tokyo population 2024" } }]),
        status: "2",
      },
    },
    // Second generateText (process search results)
    {
      id: "span-3",
      name: "generateText",
      parentId: "agent-span",
      duration: 600,
      timestamp: 3000,
      traceId: "workflow-trace-1",
      data: {
        type: "GENERATION",
        model: "claude-3-sonnet",
        inputTokens: 200,
        outputTokens: 80,
        totalTokens: 280,
        cost: 0.0015,
        input: JSON.stringify([{ role: "assistant", content: "Found population: 13.96 million. Now I need the area." }]),
        output: "I found the population. Now let me calculate the density.",
        status: "2",
      },
    },
    // Calculate tool call
    {
      id: "span-4",
      name: "calculate",
      parentId: "agent-span",
      duration: 100,
      timestamp: 4000,
      traceId: "workflow-trace-1",
      data: {
        type: "SPAN",
        toolCalls: JSON.stringify([{ name: "calculate", args: { expression: "13960000 / 2194" } }]),
        status: "2",
      },
    },
    // Third generateText (more reasoning)
    {
      id: "span-5",
      name: "generateText",
      parentId: "agent-span",
      duration: 700,
      timestamp: 5000,
      traceId: "workflow-trace-1",
      data: {
        type: "GENERATION",
        model: "claude-3-sonnet",
        inputTokens: 250,
        outputTokens: 100,
        totalTokens: 350,
        cost: 0.002,
        input: JSON.stringify([{ role: "assistant", content: "Density calculated. Let me verify with another search." }]),
        output: "The density is about 6,363 people per km². Let me verify this.",
        status: "2",
      },
    },
    // Second search_web tool call
    {
      id: "span-6",
      name: "search_web",
      parentId: "agent-span",
      duration: 450,
      timestamp: 6000,
      traceId: "workflow-trace-1",
      data: {
        type: "SPAN",
        toolCalls: JSON.stringify([{ name: "search_web", args: { query: "Tokyo population density verification" } }]),
        status: "2",
      },
    },
    // Final generateText (response)
    {
      id: "span-7",
      name: "generateText",
      parentId: "agent-span",
      duration: 900,
      timestamp: 7000,
      traceId: "workflow-trace-1",
      data: {
        type: "GENERATION",
        model: "claude-3-sonnet",
        inputTokens: 300,
        outputTokens: 150,
        totalTokens: 450,
        cost: 0.0025,
        input: JSON.stringify([{ role: "assistant", content: "Compiling final verified response." }]),
        output: "Tokyo has a population of approximately 13.96 million people with a population density of about 6,363 people per square kilometer, making it one of the most densely populated cities in the world.",
        status: "2",
      },
    },
  ],
  data: {
    latency: 7500,
  },
};
