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
          attributes: '{"operation.name":"ai.generateObject.doGenerate","ai.operationId":"ai.generateObject.doGenerate","ai.model.provider":"openai.chat","ai.model.id":"gpt-3.5-turbo","ai.settings.temperature":"0.7","ai.settings.maxTokens":"4096","ai.settings.topP":"1","ai.settings.frequencyPenalty":"0","ai.settings.presencePenalty":"0","ai.settings.maxRetries":"2","ai.telemetry.metadata.prompt":"customer-feedback-analyzer","ai.telemetry.metadata.props":"{\\"customer_question\\":\\"How do I return a product that I purchased last week?\\"}","ai.telemetry.metadata.dataset_run_id":"e96c4dcc-8ee7-4f90-b1b2-4c5a67c6990b","ai.telemetry.metadata.dataset_path":"customer-query.jsonl","ai.telemetry.metadata.dataset_run_name":"test","ai.telemetry.metadata.dataset_item_name":"2","ai.telemetry.metadata.traceName":"ds-run-test-2","ai.telemetry.metadata.traceId":"d662a67a-ad48-47c2-b8e1-02394997faa6","ai.prompt.format":"messages","ai.prompt.messages":"[{\\"role\\":\\"system\\",\\"content\\":\\"You are a customer feedback analyst. Your task is to analyze customer feedback and extract key insights including sentiment, topics, urgency, and suggested actions.\\\\n\\\\nAnalyze the provided customer feedback and respond with a structured analysis including:\\\\n\\\\n1. Overall sentiment (positive, negative, neutral, or mixed)\\\\n2. Key topics or themes mentioned\\\\n3. Urgency level based on the nature and impact of the feedback\\\\n4. Suggested actions to address the feedback\\\\n\\\\nBe thorough in your analysis and provide actionable insights.\\"},{\\"role\\":\\"user\\",\\"content\\":[{\\"type\\":\\"text\\",\\"text\\":\\"Customer Feedback:\\"}]}]","ai.settings.mode":"tool","gen_ai.system":"openai.chat","gen_ai.request.model":"gpt-3.5-turbo","gen_ai.request.frequency_penalty":"0","gen_ai.request.max_tokens":"4096","gen_ai.request.presence_penalty":"0","gen_ai.request.temperature":"0.7","gen_ai.request.top_p":"1","ai.response.finishReason":"stop","ai.response.object":"{\\"sentiment\\":\\"negative\\",\\"key_topics\\":[\\"product quality\\",\\"customer service\\",\\"shipping\\"],\\"urgency_level\\":\\"high\\",\\"suggested_actions\\":[\\"conduct quality checks\\",\\"improve customer service training\\",\\"optimize shipping processes\\"]}","ai.response.id":"chatcmpl-CO41bSPi3QW40nb5KWTsKN2lC1Wfz","ai.response.model":"gpt-3.5-turbo-0125","ai.response.timestamp":"2025-10-07T15:36:19.000Z","ai.usage.promptTokens":"245","ai.usage.completionTokens":"41","gen_ai.response.finish_reasons":"[\\"stop\\"]","gen_ai.response.id":"chatcmpl-CO41bSPi3QW40nb5KWTsKN2lC1Wfz","gen_ai.response.model":"gpt-3.5-turbo-0125","gen_ai.usage.input_tokens":"245","gen_ai.usage.output_tokens":"41","end_time":"1759851379990779000","puzzlet.tenant_id":"0e0d58a5-981b-4eeb-a03a-b8b72a9b5a18","puzzlet.app_id":"26a6d21d-153d-4bd9-a944-7c9c9df136f5","puzzlet.branch_id":"401b8d9b-55d7-4822-b691-841ad04367b3","gen_ai.usage.cost":"0.00044950000000000003"}'
        },
      },
      {
        id: "5",
        name: "Span 2",
        duration: 2000,
        parentId: "1",
        timestamp: 2000,
        traceId: "1",
        data: {},
      },
      {
        id: "6",
        name: "Span 3",
        duration: 3000,
        parentId: "2",
        timestamp: 3000,
        traceId: "1",
        data: {},
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
