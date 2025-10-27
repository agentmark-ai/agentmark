import Database, { type Database as DatabaseType } from "better-sqlite3";

const db: DatabaseType = new Database(":memory:");

db.exec(`
    CREATE TABLE IF NOT EXISTS traces (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        Timestamp TEXT, 
        CreatedAt TEXT DEFAULT (datetime('now')), 
        TraceId TEXT,
        SpanId TEXT,
        ParentSpanId TEXT,
        TraceState TEXT,
        SpanName TEXT,
        SpanKind TEXT,
        ServiceName TEXT,
        ResourceAttributes TEXT,
        SpanAttributes TEXT,
        Duration INTEGER,       
        StatusCode TEXT,
        StatusMessage TEXT,
        Events_Timestamp TEXT,   
        Events_Name TEXT,        
        Events_Attributes TEXT,  
        Links_TraceId TEXT,      
        Links_SpanId TEXT,       
        Links_TraceState TEXT,   
        Links_Attributes TEXT,   
        TenantId TEXT GENERATED ALWAYS AS (json_extract(SpanAttributes, '$.puzzlet.tenant_id')) VIRTUAL,
        AppId TEXT GENERATED ALWAYS AS (json_extract(SpanAttributes, '$.puzzlet.app_id')) VIRTUAL
    )
`)

export default db;
