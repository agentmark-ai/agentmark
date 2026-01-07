import Database, { type Database as DatabaseType } from "better-sqlite3";

const db: DatabaseType = new Database(":memory:");

db.exec(`
    CREATE TABLE IF NOT EXISTS traces (
        -- Identity
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        TraceId TEXT NOT NULL,
        SpanId TEXT NOT NULL,
        ParentSpanId TEXT,
        
        -- Core type and classification
        Type TEXT NOT NULL DEFAULT 'SPAN',  -- 'SPAN' | 'GENERATION' | 'EVENT'
        
        -- Timing
        Timestamp TEXT NOT NULL,  -- Start time (ISO 8601)
        EndTime REAL,              -- End time in milliseconds (Unix timestamp)
        Duration INTEGER,         -- Duration in milliseconds
        
        -- Span metadata
        SpanName TEXT,
        SpanKind TEXT,
        ServiceName TEXT,
        TraceState TEXT,
        StatusCode TEXT,
        StatusMessage TEXT,
        
        -- Normalized LLM generation fields
        Model TEXT DEFAULT '',
        InputTokens INTEGER DEFAULT 0,
        OutputTokens INTEGER DEFAULT 0,
        TotalTokens INTEGER DEFAULT 0,
        ReasoningTokens INTEGER DEFAULT 0,
        Cost REAL DEFAULT 0.0,
        
        -- I/O fields
        Input TEXT,               -- JSON array of Message objects
        Output TEXT,              -- Plain text or JSON-stringified structured data
        OutputObject TEXT,        -- JSON-stringified structured object output
        ToolCalls TEXT,           -- JSON array of ToolCall objects
        FinishReason TEXT,        -- Unified finish reason (stop, tool-calls, length, etc.)
        Settings TEXT,            -- JSON-stringified model generation settings
        
        -- Trace context fields
        SessionId TEXT DEFAULT '',
        SessionName TEXT DEFAULT '',
        UserId TEXT DEFAULT '',
        TraceName TEXT DEFAULT '',
        
        -- Dataset/evaluation fields
        DatasetRunId TEXT DEFAULT '',
        DatasetRunName TEXT DEFAULT '',
        DatasetPath TEXT DEFAULT '',
        DatasetItemName TEXT DEFAULT '',
        DatasetExpectedOutput TEXT DEFAULT '',
        
        -- Prompt/template fields
        PromptName TEXT DEFAULT '',
        Props TEXT,               -- JSON or string metadata props
        Metadata TEXT,            -- JSON-encoded custom metadata (Record<string, string>)
        
        -- Raw data for export/debug (JSON-encoded)
        ResourceAttributes TEXT,
        SpanAttributes TEXT,
        Events TEXT,              -- JSON array of event objects [{timestamp, name, attributes}, ...]
        Links TEXT,               -- JSON array of link objects [{traceId, spanId, traceState?, attributes?}, ...]
        
        -- Audit
        CreatedAt TEXT DEFAULT (datetime('now'))
    )
`)

db.exec(`
    CREATE TABLE IF NOT EXISTS scores (
        id TEXT PRIMARY KEY,
        resource_id TEXT NOT NULL,
        score REAL NOT NULL,
        label TEXT NOT NULL,
        reason TEXT NOT NULL,
        name TEXT NOT NULL,
        type TEXT,
        source TEXT DEFAULT 'eval',
        created_at TEXT DEFAULT (datetime('now'))
    )
`)

// Create indexes for efficient querying
db.exec(`
    CREATE INDEX IF NOT EXISTS idx_traces_trace_id ON traces(TraceId);
    CREATE INDEX IF NOT EXISTS idx_traces_session_id ON traces(SessionId);
    CREATE INDEX IF NOT EXISTS idx_traces_type_timestamp ON traces(Type, Timestamp DESC);
    CREATE INDEX IF NOT EXISTS idx_traces_dataset_run_id ON traces(DatasetRunId);
`)

// Seed sample trace data for development/demo purposes
// This provides realistic data to test the timeline and graph visualizations
function seedSampleData() {
  const baseTimeMs = Date.now() - 60000; // 1 minute ago
  const toNs = (ms: number) => String(ms * 1000000);

  const TRACE_ID = "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4";

  // Span timings (ms offsets from base)
  const spans = [
    {
      spanId: "1000000000000001",
      parentSpanId: null,
      name: "party-planner-workflow",
      type: "SPAN",
      startOffset: 0,
      duration: 3500,
      traceName: "Party Planner Agent",
      promptName: "party-planner.prompt.mdx",
    },
    {
      spanId: "1000000000000002",
      parentSpanId: "1000000000000001",
      name: "ai.workflow",
      type: "SPAN",
      startOffset: 50,
      duration: 3400,
    },
    {
      spanId: "1000000000000003",
      parentSpanId: "1000000000000002",
      name: "ai.generateText",
      type: "GENERATION",
      startOffset: 70,
      duration: 1200,
      model: "gpt-4o",
      inputTokens: 450,
      outputTokens: 320,
      input: JSON.stringify([
        { role: "system", content: "You are a party planning assistant." },
        { role: "user", content: "Plan a birthday party for 20 guests" }
      ]),
      output: "I'll help you plan an amazing birthday party! Let me search for venue options first.",
      finishReason: "tool-calls",
    },
    {
      spanId: "1000000000000004",
      parentSpanId: "1000000000000002",
      name: "ai.toolCall.searchVenues",
      type: "SPAN",
      startOffset: 1300,
      duration: 800,
      toolCalls: JSON.stringify([{
        type: "tool-call",
        toolCallId: "call_abc123",
        toolName: "searchVenues",
        args: { location: "San Francisco", capacity: 20, type: "birthday" },
        result: '[{"name":"The Party Place","price":500},{"name":"Fun Zone","price":750}]'
      }]),
    },
    {
      spanId: "1000000000000005",
      parentSpanId: "1000000000000002",
      name: "ai.generateText",
      type: "GENERATION",
      startOffset: 2150,
      duration: 1100,
      model: "gpt-4o",
      inputTokens: 680,
      outputTokens: 520,
      input: JSON.stringify([
        { role: "system", content: "You are a party planning assistant." },
        { role: "user", content: "Plan a birthday party for 20 guests" },
        { role: "assistant", content: "I found some venues. Let me create a complete plan." }
      ]),
      output: "Based on the venue search, I recommend 'The Party Place' at $500. Here's your complete party plan:\n\n1. Venue: The Party Place\n2. Catering: Pizza and cake for 20\n3. Decorations: Birthday theme\n4. Activities: Games and music\n\nTotal estimated budget: $850",
      finishReason: "stop",
    },
    {
      spanId: "1000000000000006",
      parentSpanId: "1000000000000002",
      name: "parseResponse",
      type: "SPAN",
      startOffset: 3280,
      duration: 150,
    },
  ];

  const insert = db.prepare(`
    INSERT INTO traces (
      Timestamp, TraceId, SpanId, ParentSpanId, SpanName, SpanKind, Duration,
      Type, Model, InputTokens, OutputTokens, TotalTokens, Cost,
      Input, Output, ToolCalls, FinishReason, TraceName, PromptName,
      StatusCode, ResourceAttributes, SpanAttributes, Events, Links
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const span of spans) {
    const startMs = baseTimeMs + span.startOffset;
    const timestampNs = toNs(startMs);
    const inputTokens = (span as any).inputTokens || 0;
    const outputTokens = (span as any).outputTokens || 0;
    const totalTokens = inputTokens + outputTokens;
    // Estimate cost at ~$0.01 per 1K tokens for gpt-4o
    const cost = (span as any).model ? totalTokens * 0.00001 : 0;

    insert.run(
      timestampNs,
      TRACE_ID,
      span.spanId,
      span.parentSpanId,
      span.name,
      "1", // SPAN_KIND_INTERNAL
      span.duration,
      span.type,
      (span as any).model || "",
      inputTokens,
      outputTokens,
      totalTokens,
      cost,
      (span as any).input || null,
      (span as any).output || null,
      (span as any).toolCalls || null,
      (span as any).finishReason || null,
      (span as any).traceName || "",
      (span as any).promptName || "",
      "1", // STATUS_CODE_OK
      "{}",
      "{}",
      "[]",
      "[]"
    );
  }
}

// Seed sample data on database initialization
seedSampleData();

export default db;
