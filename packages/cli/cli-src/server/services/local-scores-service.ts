import type { Database } from 'better-sqlite3';
import type {
  VerifiedAppId,
  ScoresParams,
  ScoresResponse,
  Score,
  ScoreNamesResponse,
  ScoreType,
} from './types';

export class LocalScoresService {
  private readonly db: Database;

  constructor(db: Database) {
    this.db = db;
  }

  async getScores(
    _appId: VerifiedAppId,
    params: ScoresParams,
    _dataRetentionDays?: number,
  ): Promise<ScoresResponse> {
    const limit = params.limit ?? 50;
    const offset = params.offset ?? 0;

    const conditions: string[] = [];
    const queryParams: unknown[] = [];

    if (params.resourceId) {
      conditions.push('resource_id = ?');
      queryParams.push(params.resourceId);
    }
    if (params.name) {
      conditions.push('name = ?');
      queryParams.push(params.name);
    }
    if (params.source) {
      conditions.push('source = ?');
      queryParams.push(params.source);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = this.db.prepare(
      `SELECT COUNT(*) AS total FROM scores ${whereClause}`
    ).get(...queryParams) as { total: number };

    const rows = this.db.prepare(`
      SELECT id, resource_id, score, label, reason, name, type, source, created_at
      FROM scores
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...queryParams, limit, offset) as Array<Record<string, unknown>>;

    const scores: Score[] = rows.map((row) => ({
      id: row.id as string,
      resourceId: row.resource_id as string,
      name: row.name as string,
      score: row.score as number,
      label: (row.label as string) || '',
      reason: (row.reason as string) || '',
      source: ((row.source as string) || 'eval') as 'eval' | 'annotation',
      createdAt: row.created_at as string,
    }));

    return {
      scores,
      total: countRow.total,
      limit,
      offset,
    };
  }

  async getScoresBySpanIds(
    _appId: VerifiedAppId,
    spanIds: string[],
  ): Promise<Record<string, Score[]>> {
    if (spanIds.length === 0) return {};

    const placeholders = spanIds.map(() => '?').join(',');
    const rows = this.db.prepare(`
      SELECT id, resource_id, score, label, reason, name, type, source, created_at
      FROM scores
      WHERE resource_id IN (${placeholders})
      ORDER BY created_at DESC
    `).all(...spanIds) as Array<Record<string, unknown>>;

    const result: Record<string, Score[]> = {};
    for (const row of rows) {
      const resourceId = row.resource_id as string;
      if (!result[resourceId]) {
        result[resourceId] = [];
      }
      result[resourceId].push({
        id: row.id as string,
        resourceId,
        name: row.name as string,
        score: row.score as number,
        label: (row.label as string) || '',
        reason: (row.reason as string) || '',
        source: ((row.source as string) || 'eval') as 'eval' | 'annotation',
        createdAt: row.created_at as string,
      });
    }

    return result;
  }

  async getScoreById(
    _appId: VerifiedAppId,
    scoreId: string,
  ): Promise<Score | null> {
    const row = this.db.prepare(
      `SELECT id, resource_id, score, label, reason, name, type, source, created_at
       FROM scores WHERE id = ?`
    ).get(scoreId) as Record<string, unknown> | undefined;

    if (!row) return null;

    return {
      id: row.id as string,
      resourceId: row.resource_id as string,
      name: row.name as string,
      score: row.score as number,
      label: (row.label as string) || '',
      reason: (row.reason as string) || '',
      source: ((row.source as string) || 'eval') as 'eval' | 'annotation',
      createdAt: row.created_at as string,
    };
  }

  async deleteScore(
    _appId: VerifiedAppId,
    scoreId: string,
  ): Promise<boolean> {
    const result = this.db.prepare(
      `DELETE FROM scores WHERE id = ?`
    ).run(scoreId);
    return result.changes > 0;
  }

  async getDistinctScoreNames(
    _appId: VerifiedAppId,
    _dataRetentionDays?: number,
  ): Promise<ScoreNamesResponse> {
    const rows = this.db.prepare(
      `SELECT DISTINCT name FROM scores ORDER BY name`
    ).all() as Array<{ name: string }>;

    return { names: rows.map((r) => r.name) };
  }

  async detectScoreType(
    _appId: VerifiedAppId,
    name: string,
    _dataRetentionDays?: number,
  ): Promise<ScoreType> {
    const rows = this.db.prepare(
      `SELECT score, label FROM scores WHERE name = ? LIMIT 100`
    ).all(name) as Array<{ score: number; label: string }>;

    if (rows.length === 0) return 'numeric';

    const labels = rows.map((r) => r.label).filter((l) => l != null && l !== '');

    if (labels.length > 0) {
      const uniqueLabels = new Set(labels.map((l) => l.toLowerCase()));
      // If all labels are true/false, it's boolean
      if (uniqueLabels.size <= 2 && [...uniqueLabels].every((l) => l === 'true' || l === 'false')) {
        return 'boolean';
      }
      return 'categorical';
    }

    return 'numeric';
  }
}
