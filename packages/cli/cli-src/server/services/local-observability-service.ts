import type { Database } from 'better-sqlite3';
import type {
  VerifiedAppId,
  TracesParams,
  TracesResponse,
  TraceDetail,
  SpanIO,
  SessionsParams,
  SessionsResponse,
  ScoresParams,
  ScoresResponse,
  Score,
  ScoreNamesResponse,
  ScoreType,
  DatasetRunParams,
  DatasetRunsResponse,
  DatasetRunDetail,
  ExperimentParams,
  ExperimentsResponse,
  ExperimentDetail,
  PromptLogsParams,
  PromptLogsResponse,
} from './types';
import { NotAvailableLocallyError } from './errors';
import { LocalTracesService } from './local-traces-service';
import { LocalSessionsService } from './local-sessions-service';
import { LocalScoresService } from './local-scores-service';
import { LocalDatasetsService } from './local-datasets-service';
import { LocalExperimentsService } from './local-experiments-service';
import { LocalPromptLogsService } from './local-prompt-logs-service';

/**
 * Local implementation of the analytics service backed by SQLite (better-sqlite3).
 *
 * Delegates real method implementations to domain-specific sub-services.
 * Methods that require an aggregation/analytics engine not available on
 * the local dev server (metrics, percentiles, score analytics, ranking)
 * throw NotAvailableLocallyError.
 */
export class LocalObservabilityService {
  private readonly db: Database;
  private readonly traces: LocalTracesService;
  private readonly sessions: LocalSessionsService;
  private readonly scores: LocalScoresService;
  private readonly datasets: LocalDatasetsService;
  private readonly experiments: LocalExperimentsService;
  private readonly promptLogs: LocalPromptLogsService;

  constructor(db: Database) {
    this.db = db;
    this.traces = new LocalTracesService(db);
    this.sessions = new LocalSessionsService(db);
    this.scores = new LocalScoresService(db);
    this.datasets = new LocalDatasetsService(db);
    this.experiments = new LocalExperimentsService();
    this.promptLogs = new LocalPromptLogsService(db);
  }

  // ---------------------------------------------------------------------------
  // Health
  // ---------------------------------------------------------------------------

  async checkConnectivity(): Promise<boolean> {
    try {
      this.db.pragma('journal_mode');
      return true;
    } catch (error) {
      console.error('[LocalObservabilityService] checkConnectivity failed:', error);
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Core Metrics — not available on the local dev server
  // ---------------------------------------------------------------------------

  async getMetrics(
    _appId: unknown,
    _dateRange: unknown,
    _filters?: unknown,
    _dataRetentionDays?: unknown,
  ): Promise<never> {
    throw new NotAvailableLocallyError('getMetrics', 'a metrics aggregation engine');
  }

  async getExtendedMetrics(
    _appId: unknown,
    _dateRange: unknown,
    _dataRetentionDays?: unknown,
  ): Promise<never> {
    throw new NotAvailableLocallyError('getExtendedMetrics', 'a metrics aggregation engine');
  }

  async getModelStats(
    _appId: unknown,
    _dateRange: unknown,
    _limit?: unknown,
    _filters?: unknown,
    _dataRetentionDays?: unknown,
  ): Promise<never> {
    throw new NotAvailableLocallyError('getModelStats', 'a metrics aggregation engine');
  }

  async getPercentiles(
    _appId: unknown,
    _params: unknown,
    _filters?: unknown,
    _dataRetentionDays?: unknown,
  ): Promise<never> {
    throw new NotAvailableLocallyError('getPercentiles', 'a quantile aggregation engine');
  }

  // ---------------------------------------------------------------------------
  // Traces
  // ---------------------------------------------------------------------------

  async getTraces(
    appId: VerifiedAppId,
    params: TracesParams,
    dataRetentionDays?: number,
  ): Promise<TracesResponse> {
    return this.traces.getTraces(appId, params, dataRetentionDays);
  }

  async getTraceDetail(
    appId: VerifiedAppId,
    traceId: string,
    dataRetentionDays?: number,
  ): Promise<TraceDetail | null> {
    return this.traces.getTraceDetail(appId, traceId, dataRetentionDays);
  }

  async getTraceDetailLightweight(
    appId: VerifiedAppId,
    traceId: string,
    dataRetentionDays?: number,
  ): Promise<TraceDetail | null> {
    return this.traces.getTraceDetailLightweight(appId, traceId, dataRetentionDays);
  }

  async getSpanIO(
    appId: VerifiedAppId,
    traceId: string,
    spanId: string,
    dataRetentionDays?: number,
  ): Promise<SpanIO | null> {
    return this.traces.getSpanIO(appId, traceId, spanId, dataRetentionDays);
  }

  async getDistinctMetadataKeys(
    appId: VerifiedAppId,
    dataRetentionDays?: number,
  ): Promise<string[]> {
    return this.traces.getDistinctMetadataKeys(appId, dataRetentionDays);
  }

  // ---------------------------------------------------------------------------
  // Sessions
  // ---------------------------------------------------------------------------

  async getSessions(
    appId: VerifiedAppId,
    params: SessionsParams,
    dataRetentionDays?: number,
  ): Promise<SessionsResponse> {
    return this.sessions.getSessions(appId, params, dataRetentionDays);
  }

  async getSessionTraces(
    appId: VerifiedAppId,
    sessionId: string,
    dataRetentionDays?: number,
  ): Promise<TraceDetail[]> {
    return this.sessions.getSessionTraces(appId, sessionId, dataRetentionDays);
  }

  // ---------------------------------------------------------------------------
  // Scores
  // ---------------------------------------------------------------------------

  async getScores(
    appId: VerifiedAppId,
    params: ScoresParams,
    dataRetentionDays?: number,
  ): Promise<ScoresResponse> {
    return this.scores.getScores(appId, params, dataRetentionDays);
  }

  async getScoreById(
    appId: VerifiedAppId,
    scoreId: string,
  ): Promise<Score | null> {
    return this.scores.getScoreById(appId, scoreId);
  }

  async deleteScore(
    appId: VerifiedAppId,
    scoreId: string,
  ): Promise<boolean> {
    return this.scores.deleteScore(appId, scoreId);
  }

  async getScoresBySpanIds(
    appId: VerifiedAppId,
    spanIds: string[],
  ): Promise<Record<string, Score[]>> {
    return this.scores.getScoresBySpanIds(appId, spanIds);
  }

  async getScoreAggregations(
    _appId: unknown,
    _dateRange: unknown,
    _dataRetentionDays?: unknown,
  ): Promise<never> {
    throw new NotAvailableLocallyError('getScoreAggregations', 'a score aggregation engine');
  }

  async getDistinctScoreNames(
    appId: VerifiedAppId,
    dataRetentionDays?: number,
  ): Promise<ScoreNamesResponse> {
    return this.scores.getDistinctScoreNames(appId, dataRetentionDays);
  }

  async detectScoreType(
    appId: VerifiedAppId,
    name: string,
    dataRetentionDays?: number,
  ): Promise<ScoreType> {
    return this.scores.detectScoreType(appId, name, dataRetentionDays);
  }

  async getScoreHistogram(
    _appId: unknown,
    _name: unknown,
    _dateRange: unknown,
    _dataRetentionDays?: unknown,
    _source?: unknown,
  ): Promise<never> {
    throw new NotAvailableLocallyError('getScoreHistogram', 'a histogram aggregation engine');
  }

  async getScoreTrend(
    _appId: unknown,
    _name: unknown,
    _interval: unknown,
    _dateRange: unknown,
    _dataRetentionDays?: unknown,
    _source?: unknown,
  ): Promise<never> {
    throw new NotAvailableLocallyError('getScoreTrend', 'a time-series aggregation engine');
  }

  async getScoreComparison(
    _appId: unknown,
    _nameA: unknown,
    _nameB: unknown,
    _dateRange: unknown,
    _dataRetentionDays?: unknown,
    _source?: unknown,
  ): Promise<never> {
    throw new NotAvailableLocallyError('getScoreComparison', 'a score comparison engine');
  }

  async getScoreScatter(
    _appId: unknown,
    _nameA: unknown,
    _nameB: unknown,
    _dateRange: unknown,
    _dataRetentionDays?: unknown,
    _source?: unknown,
  ): Promise<never> {
    throw new NotAvailableLocallyError('getScoreScatter', 'a score scatter engine');
  }

  // ---------------------------------------------------------------------------
  // Datasets
  // ---------------------------------------------------------------------------

  async getDatasetRuns(
    appId: VerifiedAppId,
    params: DatasetRunParams,
    dataRetentionDays?: number,
  ): Promise<DatasetRunsResponse> {
    return this.datasets.getDatasetRuns(appId, params, dataRetentionDays);
  }

  async getDatasetRunDetail(
    appId: VerifiedAppId,
    runId: string,
    dataRetentionDays?: number,
  ): Promise<DatasetRunDetail | null> {
    return this.datasets.getDatasetRunDetail(appId, runId, dataRetentionDays);
  }

  // ---------------------------------------------------------------------------
  // Experiments
  // ---------------------------------------------------------------------------

  async getExperiments(
    appId: VerifiedAppId,
    params: ExperimentParams,
    dataRetentionDays?: number,
  ): Promise<ExperimentsResponse> {
    return this.experiments.getExperiments(appId, params, dataRetentionDays);
  }

  async getExperimentDetail(
    appId: VerifiedAppId,
    experimentId: string,
    dataRetentionDays?: number,
  ): Promise<ExperimentDetail | null> {
    return this.experiments.getExperimentDetail(appId, experimentId, dataRetentionDays);
  }

  // ---------------------------------------------------------------------------
  // Prompt Logs
  // ---------------------------------------------------------------------------

  async getPromptLogs(
    appId: VerifiedAppId,
    params: PromptLogsParams,
    dataRetentionDays?: number,
  ): Promise<PromptLogsResponse> {
    return this.promptLogs.getPromptLogs(appId, params, dataRetentionDays);
  }

  // ---------------------------------------------------------------------------
  // Ranking — not available on the local dev server
  // ---------------------------------------------------------------------------

  async getRankingData(
    _appId: unknown,
    _dateRange: unknown,
    _dimension: unknown,
    _limit?: unknown,
    _filters?: unknown,
    _dataRetentionDays?: unknown,
  ): Promise<never> {
    throw new NotAvailableLocallyError('getRankingData', 'a ranking aggregation engine');
  }

  async getAggregateRequests(
    _appId: unknown,
    _params: unknown,
    _dataRetentionDays?: unknown,
  ): Promise<never> {
    throw new NotAvailableLocallyError('getAggregateRequests', 'a request aggregation engine');
  }

  async getSpanKindBreakdown(
    _appId: unknown,
    _dateRange: unknown,
    _dataRetentionDays?: unknown,
  ): Promise<never> {
    throw new NotAvailableLocallyError('getSpanKindBreakdown', 'a span aggregation engine');
  }
}
