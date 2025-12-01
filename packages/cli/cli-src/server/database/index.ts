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
        
        -- Version control field
        CommitSha TEXT DEFAULT '',
        
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

export default db;
