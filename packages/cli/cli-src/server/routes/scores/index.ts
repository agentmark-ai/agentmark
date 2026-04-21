import db from "../../database";
import { randomUUID } from "crypto";

type ScoreBody = {
  resourceId?: string;
  resource_id?: string;
  score: number;
  label?: string;
  reason?: string;
  name: string;
  type?: string;
  dataType?: string;
  source?: string;
};

export const createScore = async (body: ScoreBody) => {
  const resourceId = body.resource_id || body.resourceId;
  const { score, label, reason, name, type } = body;

  if (!resourceId) {
    throw new Error("resourceId is required");
  }

  const id = randomUUID();

  const insert = db.prepare(`
    INSERT INTO scores (id, resource_id, score, label, reason, name, type, source, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  insert.run(
    id,
    resourceId,
    score,
    label ?? "",
    reason ?? "",
    name,
    type || null,
    body.source || "eval",
    new Date().toISOString()
  );

  return { id, message: "Score created successfully" };
};

export const MAX_SCORES_BATCH_SIZE = 1000;
const VALID_DATA_TYPES = new Set(["boolean", "numeric", "categorical", ""]);

type BatchItem = ScoreBody & { client_id?: string };
type BatchResultItem =
  | { status: "success"; id: string; client_id?: string }
  | { status: "error"; error: { code: string; message: string }; client_id?: string };

export type BatchResult = {
  results: BatchResultItem[];
  summary: { total: number; succeeded: number; failed: number };
};

export const createScoresBatch = async (body: { scores?: BatchItem[] }): Promise<BatchResult> => {
  const items = Array.isArray(body?.scores) ? body.scores : null;
  if (!items) {
    throw Object.assign(new Error("scores must be an array"), { code: "invalid_request_body" });
  }
  if (items.length === 0) {
    throw Object.assign(new Error("scores must contain at least one item"), {
      code: "invalid_request_body",
    });
  }
  if (items.length > MAX_SCORES_BATCH_SIZE) {
    throw Object.assign(
      new Error(`Batch size ${items.length} exceeds max of ${MAX_SCORES_BATCH_SIZE}`),
      { code: "payload_too_large", status: 413 },
    );
  }

  const results: BatchResultItem[] = new Array(items.length);
  type PreparedRow = {
    index: number;
    id: string;
    resourceId: string;
    score: number;
    label: string;
    reason: string;
    name: string;
    type: string | null;
    source: string;
    createdAt: string;
  };
  const prepared: PreparedRow[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;
    const resourceId = item.resource_id || item.resourceId;
    const clientId = item.client_id;

    if (!resourceId) {
      results[i] = {
        status: "error",
        ...(clientId ? { client_id: clientId } : {}),
        error: { code: "missing_required_field", message: "resource_id is required" },
      };
      continue;
    }
    if (item.dataType != null && !VALID_DATA_TYPES.has(item.dataType)) {
      results[i] = {
        status: "error",
        ...(clientId ? { client_id: clientId } : {}),
        error: {
          code: "invalid_field_value",
          message: "Invalid dataType. Must be boolean, numeric, or categorical.",
        },
      };
      continue;
    }

    const id = randomUUID();
    results[i] = { status: "success", ...(clientId ? { client_id: clientId } : {}), id };

    prepared.push({
      index: i,
      id,
      resourceId,
      score: item.score,
      label: item.label ?? "",
      reason: item.reason ?? "",
      name: item.name,
      type: item.type || null,
      source: item.source || "eval",
      createdAt: new Date().toISOString(),
    });
  }

  if (prepared.length > 0) {
    const insert = db.prepare(`
      INSERT INTO scores (id, resource_id, score, label, reason, name, type, source, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const runAll = db.transaction((rows: PreparedRow[]) => {
      for (const r of rows) {
        insert.run(r.id, r.resourceId, r.score, r.label, r.reason, r.name, r.type, r.source, r.createdAt);
      }
    });
    runAll(prepared);
  }

  const succeeded = results.filter((r) => r.status === "success").length;
  return {
    results,
    summary: { total: results.length, succeeded, failed: results.length - succeeded },
  };
};

export const getScoresByResourceId = async (
  resourceId: string
): Promise<any[]> => {
  const sql = `
    SELECT 
      id,
      resource_id,
      score,
      label,
      reason,
      name,
      type,
      source,
      created_at
    FROM scores
    WHERE resource_id = ?
    ORDER BY created_at DESC
  `;

  const rows = db.prepare(sql).all(resourceId) as any[];

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    score: row.score,
    label: row.label,
    reason: row.reason,
    source: row.source || "eval",
    created_at: row.created_at,
  }));
};


