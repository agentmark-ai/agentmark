import db from "../../database";
import { randomUUID } from "crypto";

type ScoreBody = {
  resourceId: string;
  score: number;
  label: string;
  reason: string;
  name: string;
  type?: string;
};

export const createScore = async (body: ScoreBody) => {
  const { resourceId, score, label, reason, name, type } = body;

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
    label,
    reason,
    name,
    type || null,
    "eval",
    new Date().toISOString()
  );

  return { id, message: "Score created successfully" };
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

