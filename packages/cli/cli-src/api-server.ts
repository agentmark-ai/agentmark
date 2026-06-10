import express, { Request, Response, NextFunction } from "express";
import { execFileSync } from "child_process";
import crypto from "crypto";
import fs from "fs";
import rateLimit from "express-rate-limit";
import path from "path";
import { deriveTraceIO, findPromptFiles, normalizeOtlpSpans, type OtlpResourceSpans } from "@agentmark-ai/shared-utils";
import cors from "cors";
import { z } from "zod";
import {
  exportTraces,
  getTraceGraph,
  getTraceById,
  getSpans,
  searchSpans,
} from "./server/routes/traces";
import { createScore, createScoresBatch } from "./server/routes/scores";
import { getBaselineScores } from "./server/routes/experiments";
import { readAllScoreConfigs } from "./server/routes/score-configs";
import { LOCAL_PRICING_MAP } from "./server/routes/pricing";
import { LocalObservabilityService } from "./server/services/local-observability-service";
import {
  toTracesListResponseWire,
  toTraceDetailWire,
  toSpansListWire,
  toSpanIOWire,
  toSessionsListWire,
  toScoresListWire,
  toScoreWire,
  toRequestsListWire,
} from "./server/wire-mappers";
import db from "./server/database";
import { getTemplateDXInstance } from "@agentmark-ai/prompt-core";
import type { TraceForwarder } from "./forwarding/forwarder";
import {
  CreateScoreBodySchema,
  ScoreConfigsListParamsSchema,
  ScoresListParamsSchema,
  TracesListParamsSchema,
  SpansListParamsSchema,
  SessionsListParamsSchema,
  RequestsListParamsSchema,
  ExperimentsListParamsSchema,
  ExperimentBaselineParamsSchema,
  DatasetsListParamsSchema,
  DatasetRowSchema,
  ImportDatasetRowsFromTracesBodySchema,
  ImportDatasetRowsFromSpansBodySchema,
  ListPromptsQuerySchema,
  type DatasetImportMapping,
  type DatasetRow,
} from "@agentmark-ai/api-schemas";
import {
  parseOrBadRequest,
  sendInternalError,
  sendNotFound,
  sendBadRequest,
  sendNotImplemented,
} from "./api-helpers";
import { structuredError } from "@agentmark-ai/api-schemas";
import { findProjectRoot } from "./config";
import { injectCommitShaIntoAst, resolveLocalCommitSha } from "./utils/commit-stamp";

// Envelope-only schema for /v1/scores/batch. The `createScoresBatch` service
// does its own per-item validation and returns a 207 with per-row errors
// when items are partially valid; it also throws a 413 when the array
// exceeds MAX_SCORES_BATCH_SIZE. Validating items at the wrapper via
// `CreateScoresBatchBodySchema` would fail the whole request at 400 and
// break both of those flows — so at the handler we only enforce
// "has a non-empty `scores` array", leaving the rest to the service.
const CreateScoresBatchEnvelopeSchema = z.object({
  scores: z.array(z.unknown()).min(1),
});

// ---------------------------------------------------------------------------
// Path-param schemas
//
// Not exported from the shared api-contract package because the cloud
// gateway encodes path params in its route class (chanfana handles the
// validation), so there's no reusable schema to vendor. Defined here so
// the OSS CLI handlers get the same "structured 400 on bad path" behavior
// as cloud.
// ---------------------------------------------------------------------------

const TraceIdParamsSchema = z.object({
  traceId: z.string().min(1),
});
const TraceSpanIdParamsSchema = z.object({
  traceId: z.string().min(1),
  spanId: z.string().min(1),
});
const ScoreIdParamsSchema = z.object({
  scoreId: z.string().min(1),
});
const SessionIdParamsSchema = z.object({
  sessionId: z.string().min(1),
});
const ExperimentIdParamsSchema = z.object({
  experimentId: z.string().min(1),
});
const RunIdParamsSchema = z.object({
  runId: z.string().min(1),
});
const DatasetNameParamsSchema = z.object({
  datasetName: z
    .string()
    .min(1)
    .refine((v) => !v.includes("..") && !path.isAbsolute(v), {
      message: "Invalid dataset name",
    }),
});

// Module-level forwarder instance (injected from dev command)
let forwarderInstance: TraceForwarder | null = null;

/**
 * Sets the trace forwarder instance for this API server.
 * Called from the dev command after forwarding is initialized.
 */
export function setForwarder(forwarder: TraceForwarder | null): void {
  forwarderInstance = forwarder;
}

function parseJsonLike(value: unknown): unknown {
  if (value == null || typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function normalizeDatasetRow(row: DatasetRow): DatasetRow {
  return {
    input: row.input,
    expected_output: row.expected_output ?? null,
    metadata: row.metadata ?? {},
  };
}

function resolvePath(source: unknown, path: string): unknown {
  if (path === "$") return source;
  if (!path.startsWith("$")) throw new Error(`Invalid path "${path}"`);

  const tokens = path
    .replace(/^\$\./, "")
    .replace(/\[(\d+)\]/g, ".$1")
    .split(".")
    .filter(Boolean);

  let current = source;
  for (const token of tokens) {
    if (current == null) return undefined;
    if (Array.isArray(current)) {
      const index = Number(token);
      if (!Number.isInteger(index)) return undefined;
      current = current[index];
      continue;
    }
    if (typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[token];
  }
  return current;
}

function buildDatasetRowFromSource(source: unknown, mapping?: DatasetImportMapping): DatasetRow {
  const inputPath = mapping?.input ?? "$.input";
  const expectedOutputPath = mapping?.expected_output ?? "$.output";
  const metadataMapping = mapping?.metadata ?? {};

  const input = resolvePath(source, inputPath);
  if (input === undefined) {
    throw new Error(`Mapping path "${inputPath}" did not resolve to an input value`);
  }

  const expectedOutput = resolvePath(source, expectedOutputPath);
  const metadata: Record<string, unknown> = {};
  for (const [key, path] of Object.entries(metadataMapping)) {
    const value = resolvePath(source, path);
    if (value !== undefined) metadata[key] = value;
  }

  return normalizeDatasetRow(DatasetRowSchema.parse({
    input,
    expected_output: expectedOutput === undefined ? null : expectedOutput,
    metadata,
  }));
}

function normalizeLocalTraceSource(trace: any) {
  const spans = Array.isArray(trace.spans) ? trace.spans.map((span: any) => ({
    id: span.id,
    trace_id: span.traceId ?? trace.id,
    parent_id: span.parentId ?? null,
    name: span.name,
    status: span.status,
    status_message: span.data?.statusMessage ?? "",
    duration_ms: span.duration ?? 0,
    timestamp: span.timestamp,
    type: span.data?.type ?? null,
    model: span.data?.model ?? null,
    input_tokens: span.data?.inputTokens ?? null,
    output_tokens: span.data?.outputTokens ?? null,
    tokens: span.data?.totalTokens ?? null,
    cost: span.data?.cost ?? null,
    prompt_name: span.data?.promptName ?? null,
    span_kind: span.data?.spanKind ?? null,
    service_name: span.data?.serviceName ?? null,
    metadata: span.data?.metadata ?? {},
    input: parseJsonLike(span.data?.input),
    output: parseJsonLike(span.data?.output),
  })) : [];

  const rootSpan = spans.find((span: any) => !span.parent_id) ?? spans[0];

  // Canonical shared derivation (root span first, GENERATION fallback) —
  // keeps dataset import-from-traces consistent with GET /v1/traces/:id
  // and the cloud gateway instead of its old root-span-only semantics.
  const traceIO = deriveTraceIO(
    spans.map((s: any) => ({
      parentId: s.parent_id,
      type: s.type,
      timestamp: s.timestamp,
      input: s.input,
      output: s.output,
    }))
  );

  return {
    id: trace.id,
    name: trace.name,
    status: trace.data?.status ?? trace.status,
    start: trace.data?.start,
    end: trace.data?.end,
    latency_ms: trace.data?.latency ?? null,
    cost: trace.data?.cost ?? null,
    tokens: trace.data?.tokens ?? null,
    input: traceIO.input,
    output: traceIO.output,
    metadata: rootSpan?.metadata ?? {},
    root_span: rootSpan ?? null,
    spans,
  };
}

function getLocalSpanSource(spanId: string) {
  const row = db.prepare(`
    SELECT
      SpanId AS id,
      TraceId AS trace_id,
      ParentSpanId AS parent_id,
      SpanName AS name,
      StatusCode AS status,
      StatusMessage AS status_message,
      Duration AS duration_ms,
      Timestamp AS timestamp,
      Type AS type,
      Model AS model,
      InputTokens AS input_tokens,
      OutputTokens AS output_tokens,
      TotalTokens AS tokens,
      Cost AS cost,
      PromptName AS prompt_name,
      SpanKind AS span_kind,
      ServiceName AS service_name,
      Metadata AS metadata,
      Input AS input,
      Output AS output
    FROM traces
    WHERE SpanId = ?
    ORDER BY CAST(Timestamp AS REAL) DESC
    LIMIT 1
  `).get(spanId) as Record<string, unknown> | undefined;

  if (!row) return null;
  return {
    ...row,
    parent_id: row.parent_id || null,
    metadata: parseJsonLike(row.metadata) ?? {},
    input: parseJsonLike(row.input),
    output: parseJsonLike(row.output),
  };
}

function safePath(): string {
  try {
    return process.cwd();
  } catch {
    return process.env.PWD || process.env.INIT_CWD || ".";
  }
}

export async function createApiServer(port: number) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json({ limit: '10mb' }));
  app.use(cors({ origin: /^https?:\/\/localhost(:\d+)?$/ }));

  const service = new LocalObservabilityService(db);
  // Local dev server doesn't use multi-tenancy - create a placeholder appId
  const localAppId = 'local' as any; // VerifiedAppId is a branded type

  // Liveness probe — tiny body, no auth, no DB hit.
  app.get("/health", (_req: Request, res: Response) => {
    res.status(200).json({ status: "ok" });
  });

  // OpenAPI spec endpoint — proxies the cloud's `/v1/openapi.json` and
  // rewrites the `servers` list so MCP tool calls land at this dev
  // server, not the cloud they came from. Cached in-process so we make
  // at most one upstream request per server lifetime.
  //
  // Why this exists: scaffolded projects ship with an
  // `agentmark-local` MCP server entry pointing here. The MCP server
  // fetches `/v1/openapi.json` at startup to register tools — without
  // this route, that registration 404s and the local-trace workflow
  // ("re-verify my fix against local agentmark dev traces") silently
  // has no tools available.
  //
  // Operations the local server doesn't implement (e.g. `POST /v1/apps`)
  // will 404 when called. That's an acceptable failure mode — the
  // agent gets a clear HTTP-level signal rather than a missing-tool
  // mystery. Most agent usage at this endpoint is read-only on
  // /v1/traces and /v1/spans which the local server does implement.
  let cachedOpenapiSpec: unknown = null;
  app.get("/v1/openapi.json", async (req: Request, res: Response) => {
    if (cachedOpenapiSpec) {
      return res.json(cachedOpenapiSpec);
    }
    const cloudUrl = process.env.AGENTMARK_API_URL_FOR_SPEC
      || 'https://api.agentmark.co';
    try {
      const response = await fetch(`${cloudUrl}/v1/openapi.json`);
      if (!response.ok) {
        return res.status(502).json({
          error: `Failed to fetch upstream OpenAPI spec: HTTP ${response.status}`,
          upstream: cloudUrl,
        });
      }
      const spec = (await response.json()) as { servers?: unknown[]; [k: string]: unknown };
      const localBase = `${req.protocol}://${req.get('host')}`;
      spec.servers = [
        { url: localBase, description: 'Local agentmark dev server' },
      ];
      cachedOpenapiSpec = spec;
      return res.json(spec);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'unknown error';
      return res.status(502).json({
        error: 'Failed to fetch upstream OpenAPI spec',
        detail: message,
        upstream: cloudUrl,
      });
    }
  });

  const currentPath = safePath();
  const basePath = path.join(currentPath);
  let agentmarkTemplatesBase = path.join(basePath, "agentmark");

  try {
    const jsonPath = path.join(currentPath, "agentmark.json");
    if (fs.existsSync(jsonPath)) {
      const agentmarkJson = JSON.parse(fs.readFileSync(jsonPath, "utf-8"));
      if (agentmarkJson?.agentmarkPath) {
        agentmarkTemplatesBase = path.join(
          basePath,
          agentmarkJson.agentmarkPath,
          "agentmark"
        );
      }
    }
  } catch {
    // Ignore errors when reading agentmark.json
  }

  // Landing page for browser access
  app.get("/", async (_req: Request, res: Response) => {
    let promptsList = "";
    try {
      const promptFiles = await findPromptFiles(agentmarkTemplatesBase);
      if (promptFiles.length > 0) {
        const relativePaths = promptFiles.map((file) =>
          path.relative(agentmarkTemplatesBase, file).split(path.sep).join("/")
        );
        promptsList = relativePaths
          .map((p) => `      <li><code>${p}</code></li>`)
          .join("\n");
      } else {
        promptsList = '      <li style="color: #64748b;">No prompts found</li>';
      }
    } catch {
      promptsList =
        '      <li style="color: #ef4444;">Error listing prompts</li>';
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.send(
      `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentMark API Server</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      max-width: 900px;
      margin: 40px auto;
      padding: 20px;
      line-height: 1.6;
      color: #333;
    }
    h1 { color: #2563eb; margin-bottom: 10px; }
    .subtitle { color: #64748b; margin-bottom: 30px; }
    .status {
      background: #dcfce7;
      border-left: 4px solid #22c55e;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .info-box {
      background: #f0f9ff;
      border-left: 4px solid #2563eb;
      padding: 15px;
      margin: 20px 0;
      border-radius: 4px;
    }
    .endpoint {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 15px;
      margin: 15px 0;
    }
    .endpoint-title {
      font-weight: 600;
      color: #1e293b;
      margin-bottom: 8px;
    }
    .endpoint-method {
      display: inline-block;
      background: #22c55e;
      color: white;
      padding: 2px 8px;
      border-radius: 3px;
      font-size: 12px;
      font-weight: 600;
      margin-right: 8px;
    }
    .endpoint-method.post {
      background: #3b82f6;
    }
    .endpoint-desc {
      color: #64748b;
      font-size: 14px;
      margin-top: 8px;
    }
    code {
      background: #1e293b;
      color: #e2e8f0;
      padding: 2px 6px;
      border-radius: 3px;
      font-size: 13px;
    }
    ul {
      margin: 10px 0;
    }
    li {
      margin: 5px 0;
    }
    a { color: #2563eb; text-decoration: none; }
    a:hover { text-decoration: underline; }
    footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 1px solid #e2e8f0;
      color: #64748b;
      font-size: 14px;
    }
  </style>
</head>
<body>
  <h1>AgentMark API Server</h1>
  <div class="subtitle">Local development server for serving prompts and datasets</div>

  <div class="status">
    <strong>✓ Server Status:</strong> Running on port ${port}
  </div>

  <div class="info-box">
    <strong>📁 Templates Directory:</strong><br>
    <code>${agentmarkTemplatesBase}</code>
  </div>

  <h2>What is this?</h2>
  <p>
    This is the <strong>AgentMark API Server</strong>, an internal development server that provides
    HTTP access to your local prompt files and datasets. It's automatically started when you run
    <code>agentmark dev</code> and enables your development runner to load templates and data.
  </p>

  <h2>Available Endpoints</h2>

  <div class="endpoint">
    <div class="endpoint-title">
      <span class="endpoint-method">GET</span>
      /v1/templates?path=your-prompt.prompt.mdx
    </div>
    <div class="endpoint-desc">
      Fetch and parse a prompt file, returning the AST (Abstract Syntax Tree)
    </div>
  </div>

  <div class="endpoint">
    <div class="endpoint-title">
      <span class="endpoint-method">GET</span>
      /v1/templates?path=your-dataset.jsonl
    </div>
    <div class="endpoint-desc">
      Fetch a dataset file in JSONL format (supports both array and streaming responses)
    </div>
  </div>

  <div class="endpoint">
    <div class="endpoint-title">
      <span class="endpoint-method">GET</span>
      /v1/prompts
    </div>
    <div class="endpoint-desc">
      List all available prompt files in the templates directory
    </div>
  </div>

  <div class="endpoint">
    <div class="endpoint-title">
      <span class="endpoint-method post">POST</span>
      /v1/traces
    </div>
    <div class="endpoint-desc">
      Accept OpenTelemetry traces in OTLP JSON format
    </div>
  </div>

  <div class="endpoint">
    <div class="endpoint-title">
      <span class="endpoint-method">GET</span>
      /v1/traces
    </div>
    <div class="endpoint-desc">
      Get list of all traces with aggregated metadata (name, status, latency, cost, tokens, start, end)
    </div>
  </div>

  <div class="endpoint">
    <div class="endpoint-title">
      <span class="endpoint-method">GET</span>
      /v1/traces/:traceId
    </div>
    <div class="endpoint-desc">
      Get a single trace with all its spans in TraceData format
    </div>
  </div>

  <div class="endpoint">
    <div class="endpoint-title">
      <span class="endpoint-method">GET</span>
      /v1/traces/:traceId/graph
    </div>
    <div class="endpoint-desc">
      Get graph data for a trace (nodes and edges for visualization)
    </div>
  </div>

  <div class="endpoint">
    <div class="endpoint-title">
      <span class="endpoint-method post">POST</span>
      /v1/score
    </div>
    <div class="endpoint-desc">
      Create a new evaluation score for a span or trace
    </div>
  </div>

  <div class="endpoint">
    <div class="endpoint-title">
      <span class="endpoint-method">GET</span>
      /v1/scores?resourceId=xxx
    </div>
    <div class="endpoint-desc">
      Get all evaluation scores for a specific span or trace resource
    </div>
  </div>

  <h2>Your Prompts</h2>
  <ul>
${promptsList}
  </ul>

  <h2>Usage</h2>
  <p>
    This server is accessed automatically by your development runner. You don't need to make
    HTTP requests directly. Just run your prompts using CLI commands:
  </p>
  <p>
    <code>agentmark run-prompt &lt;file&gt;</code> or <code>agentmark run-experiment &lt;file&gt;</code>
  </p>

  <footer>
    <div><strong>AgentMark Development Server</strong></div>
    <div>Learn more: <a href="https://docs.agentmark.co" target="_blank">docs.agentmark.co</a></div>
  </footer>
</body>
</html>
    `.trim()
    );
  });

  // Rate limiter: 100 requests per 15 minutes per IP for routes that perform
  // file-system access or shell-out. Applied to /v1/templates, /v1/prompts,
  // /v1/config, and the dataset write endpoint (CodeQL js/missing-rate-limiting).
  const apiRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
  });

  app.get("/v1/templates", apiRateLimiter, async (req: Request, res: Response) => {
    const filePath = req.query.path;

    if (!filePath || typeof filePath !== "string") {
      return sendBadRequest(
        res,
        "invalid_query_params",
        "Path query parameter must be a single string value",
      );
    }

    // Reject absolute paths
    if (path.isAbsolute(filePath)) {
      return sendBadRequest(
        res,
        "invalid_query_params",
        "Absolute paths are not allowed",
      );
    }

    // Normalize the path and remove leading ./
    const normalizedPath = path.normalize(
      filePath.startsWith("./") ? filePath.slice(2) : filePath
    );

    // Prevent path traversal with .. sequences
    if (normalizedPath.includes("..") || normalizedPath.startsWith("/")) {
      return sendBadRequest(
        res,
        "invalid_query_params",
        "Invalid path: path traversal detected",
      );
    }

    // Join with base path
    let fullPath = path.join(agentmarkTemplatesBase, normalizedPath);

    // Verify the resolved path is still within the base directory
    const resolvedPath = path.resolve(fullPath);
    const resolvedBase = path.resolve(agentmarkTemplatesBase);
    if (
      !resolvedPath.startsWith(resolvedBase + path.sep) &&
      resolvedPath !== resolvedBase
    ) {
      return res
        .status(403)
        .json({
          error: {
            code: "forbidden",
            message: "Access denied: path outside allowed directory",
          },
        });
    }

    // Try alternative path for .jsonl files in templates directory
    if (!fs.existsSync(fullPath) && filePath.endsWith(".jsonl")) {
      const altPath = path.join(
        agentmarkTemplatesBase,
        "templates",
        path.basename(filePath)
      );
      const resolvedAltPath = path.resolve(altPath);
      if (
        resolvedAltPath.startsWith(resolvedBase + path.sep) &&
        fs.existsSync(altPath)
      ) {
        fullPath = altPath;
      }
    }

    try {
      if (fullPath.endsWith(".jsonl")) {
        // Dataset: default to JSON array unless client explicitly requests NDJSON
        if (!fs.existsSync(fullPath))
          return sendNotFound(res, "Dataset not found");
        const accept = (req.get("accept") || "").toLowerCase();
        const explicitlyNdjson = accept.includes("application/x-ndjson");
        const wantsJsonArray = req.query.format === "json" || !explicitlyNdjson;
        if (wantsJsonArray) {
          try {
            const lines = fs
              .readFileSync(fullPath, "utf-8")
              .split(/\r?\n/)
              .filter(Boolean);
            const arr = lines.map((l) => JSON.parse(l));
            return res.json(arr);
          } catch (_e) {
            return sendInternalError(res, "Failed to read dataset");
          }
        }
        res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
        return fs.createReadStream(fullPath).pipe(res);
      }
      // Prompt: parse and return AST (no datasetUrl coupling)
      const fileContent = fs.readFileSync(fullPath, "utf-8");

      // Get the appropriate TemplateDX instance based on promptKind
      const promptKind = req.query.promptKind as string | undefined;
      const templateType = promptKind === 'image' ? 'image'
        : promptKind === 'speech' ? 'speech'
        : 'language'; // 'text' and 'object' both use language
      const templateDX = getTemplateDXInstance(templateType);

      // Create content loader for resolving imports
      const contentLoader = async (p: string) => {
        const resolved = path.isAbsolute(p)
          ? p
          : path.join(path.dirname(fullPath), p);
        // Validate that the resolved path is within the base directory
        const resolvedImportPath = path.resolve(resolved);
        const resolvedBase = path.resolve(agentmarkTemplatesBase);
        if (
          !resolvedImportPath.startsWith(resolvedBase + path.sep) &&
          resolvedImportPath !== resolvedBase
        ) {
          throw new Error(
            "Access denied: import path outside allowed directory"
          );
        }
        return fs.readFileSync(resolvedImportPath, "utf-8");
      };

      // Parse using the TemplateDX instance (which has System/User/Assistant tags registered)
      const data = await templateDX.parse(fileContent, path.dirname(fullPath), contentLoader);

      // Mirror the cloud gateway: stamp the served-at commit into the AST's
      // `agentmark_meta.commit_sha` so local prompt runs link traces to the
      // exact prompt version (the SDK run path reads it from the frontmatter).
      // Best-effort — outside a git repo the AST is served unstamped. The
      // response stays the canonical `{ data }` envelope, same as cloud.
      let commitSha: string | null = null;
      try {
        commitSha = resolveLocalCommitSha(findProjectRoot(currentPath));
      } catch {
        // findProjectRoot throws outside an agentmark project; serve unstamped.
      }
      injectCommitShaIntoAst(data, commitSha);
      return res.json({ data });
    } catch (_error) {
      return sendNotFound(res, "File not found or invalid");
    }
  });

  // Accept both JSON and protobuf OTLP payloads
  app.post("/v1/traces", express.raw({ type: 'application/x-protobuf', limit: '10mb' }), async (req: Request, res: Response) => {
    try {
      let body: any;

      if (Buffer.isBuffer(req.body)) {
        // Decode an incoming OTLP/protobuf trace export. We reach into
        // `@opentelemetry/otlp-transformer`'s generated protobuf root
        // because no public server-side decoder exists in the OTEL JS
        // ecosystem — the package's public API (ProtobufTraceSerializer)
        // exposes only client-side `serializeRequest` +
        // `deserializeResponse`, and no sibling package fills the gap.
        // Every Node OTLP ingest implementation surveyed (Langfuse,
        // Trigger.dev, etc.) reaches into this same internal path or
        // vendors the generated bundle. Dropping protobuf would break
        // every user of a stock OTEL SDK — protobuf is the spec-default
        // exporter protocol. The proper long-term fix is to run
        // `pbjs`/`pbts` against `opentelemetry-proto` at build time and
        // ship our own decoder, applied uniformly to cloud + OSS;
        // tracked separately. The pinned-internal reach has been stable
        // across `otlp-transformer` 0.50 → 0.203.
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const root = require("@opentelemetry/otlp-transformer/build/src/generated/root");
          const ExportTraceServiceRequest = root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;
          const decoded = ExportTraceServiceRequest.decode(req.body);
          body = ExportTraceServiceRequest.toObject(decoded, {
            longs: String,
            bytes: String,
            defaults: true,
          });
        } catch (protoErr: any) {
          return sendBadRequest(
            res,
            "protobuf_decode_failed",
            `Failed to decode protobuf: ${protoErr.message}`,
          );
        }
      } else {
        // JSON payload (already parsed by express.json middleware)
        body = req.body;
      }

      if (!body || !body.resourceSpans || !Array.isArray(body.resourceSpans)) {
        return sendBadRequest(
          res,
          "invalid_otlp_payload",
          "Invalid OTLP payload: expected ExportTraceServiceRequest with resourceSpans array",
        );
      }

      // Normalize OTLP spans using shared normalizer
      const normalizedSpans = normalizeOtlpSpans(body.resourceSpans as OtlpResourceSpans[]);

      // Write normalized spans to SQLite (always happens, regardless of forwarding)
      await exportTraces(normalizedSpans);

      // Forward to platform if forwarder is configured (non-blocking, never throws)
      forwarderInstance?.enqueue(body);

      const requestId = (req.headers["x-request-id"] as string) || crypto.randomUUID();
      return res.json({ data: { requestId } });
    } catch (error: any) {
      console.error("Error processing traces:", error);
      return sendInternalError(res, error.message || "Failed to export traces");
    }
  });

  app.get("/v1/prompts", apiRateLimiter, async (req: Request, res: Response) => {
    const query = parseOrBadRequest(ListPromptsQuerySchema, req.query, res, 'query');
    if (!query.ok) return;

    try {
      const promptFiles = await findPromptFiles(agentmarkTemplatesBase);
      const allPaths = promptFiles.map((file) =>
        path.relative(agentmarkTemplatesBase, file).split(path.sep).join("/")
      );

      const nameFilter = query.data.name;
      if (!nameFilter) {
        return res.json({ data: { paths: allPaths } });
      }

      // Frontmatter `name` is the source of truth — filenames are a hint,
      // not a contract. Read just the YAML block (~4KB) of each file
      // rather than running the full TemplateDX parser. Multiple matches
      // are legitimate (the platform's
      // `(app_id, name, parent_path, file_extension)` constraint allows
      // collisions across folders), so we return all of them and let the
      // caller decide what to do — typically a 1-element array.
      const { parse: parseYaml } = await import("yaml");
      const matches: string[] = [];
      for (const file of promptFiles) {
        const fd = await fs.promises.open(file, "r");
        let head = "";
        try {
          const buf = Buffer.alloc(4096);
          const { bytesRead } = await fd.read(buf, 0, buf.length, 0);
          head = buf.subarray(0, bytesRead).toString("utf-8");
        } finally {
          await fd.close();
        }
        const match = head.match(/^---\r?\n([\s\S]*?)\r?\n---/);
        if (!match) continue;
        let attributes: unknown;
        try {
          attributes = parseYaml(match[1]);
        } catch {
          continue;
        }
        if (
          attributes &&
          typeof attributes === "object" &&
          (attributes as { name?: unknown }).name === nameFilter
        ) {
          matches.push(path.relative(agentmarkTemplatesBase, file).split(path.sep).join("/"));
        }
      }
      return res.json({ data: { paths: matches } });
    } catch (_error) {
      return sendInternalError(res, "Failed to list prompts");
    }
  });

  app.get("/v1/config", apiRateLimiter, async (_req: Request, res: Response) => {
    try {
      const projectRoot = findProjectRoot(currentPath);
      const configPath = path.join(projectRoot, "agentmark.json");

      if (!fs.existsSync(configPath)) {
        return res.status(404).json({
          error: {
            code: "config_not_found",
            message: "Config not found",
          },
        });
      }

      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      if (!config || typeof config !== "object" || Array.isArray(config)) {
        return res.status(404).json({
          error: {
            code: "config_not_found",
            message: "Config not found",
          },
        });
      }

      let commitSha: string | null = null;
      try {
        const sha = execFileSync("git", ["rev-parse", "HEAD"], {
          cwd: projectRoot,
          encoding: "utf-8",
          stdio: ["ignore", "pipe", "ignore"],
        }).trim();
        commitSha = sha || null;
      } catch {
        // Best-effort only; local config should still work outside git repos.
      }

      return res.json({
        data: {
          commit_sha: commitSha,
          config,
        },
      });
    } catch (error) {
      console.error("Error reading config:", error);
      return sendInternalError(res, "Failed to read config");
    }
  });

  // --- Dataset endpoints ---

  app.get("/v1/datasets", async (req: Request, res: Response) => {
    const query = parseOrBadRequest(DatasetsListParamsSchema, req.query, res, 'query');
    if (!query.ok) return;
    try {
      // Walk the templates dir collecting (path, fs.Stats) for every .jsonl
      // file. Mirror cloud's response shape exactly: { name, row_count,
      // created_at } per row, sorted by name for deterministic pagination.
      type Entry = { name: string; row_count: number; created_at: string };
      const entries: Entry[] = [];
      const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const dirent of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, dirent.name);
          if (dirent.isDirectory()) {
            walk(full);
          } else if (dirent.name.endsWith(".jsonl")) {
            const stat = fs.statSync(full);
            // Count non-empty lines — JSONL row count.
            const contents = fs.readFileSync(full, "utf-8");
            const rowCount = contents
              .split("\n")
              .filter((l) => l.trim().length > 0).length;
            entries.push({
              name: path.relative(agentmarkTemplatesBase, full),
              row_count: rowCount,
              created_at: stat.birthtime.toISOString(),
            });
          }
        }
      };
      walk(agentmarkTemplatesBase);

      const { limit, offset, name } = query.data as {
        limit: number;
        offset: number;
        name?: string;
      };

      // Exact match on the leaf filename (without `.jsonl` extension) —
      // mirrors cloud's `template.name` column filter so the same query
      // returns the same shape regardless of which server answers.
      // E.g. `?name=sentiment` matches `evals/sentiment.jsonl` because
      // cloud's `template.name` for that row is `sentiment`.
      const leafOf = (relativePath: string): string => {
        const base = relativePath.split('/').pop() ?? relativePath;
        return base.replace(/\.jsonl$/i, '');
      };
      const filtered = name
        ? entries.filter((e) => leafOf(e.name) === name)
        : entries;
      filtered.sort((a, b) => a.name.localeCompare(b.name));

      const total = filtered.length;
      const page = filtered.slice(offset, offset + limit);

      res.json({ data: page, pagination: { total, limit, offset } });
    } catch (error) {
      console.error("Error listing datasets:", error);
      sendInternalError(res, "Failed to list datasets");
    }
  });

  app.post("/v1/datasets/:datasetName/rows", apiRateLimiter, async (req: Request, res: Response): Promise<void> => {
    const params = parseOrBadRequest(DatasetNameParamsSchema, req.params, res, 'params');
    if (!params.ok) return;
    const body = parseOrBadRequest(DatasetRowSchema, req.body, res, 'body');
    if (!body.ok) return;

    try {
      const datasetPath = `${params.data.datasetName}.jsonl`;
      const fullPath = path.resolve(agentmarkTemplatesBase, datasetPath);
      const resolvedBase = path.resolve(agentmarkTemplatesBase);
      if (!fullPath.startsWith(resolvedBase)) {
        // Defence-in-depth: schema-level `..`/absolute rejection should already
        // have caught this, but symlink escape via
        // `path.resolve` is worth guarding explicitly.
        parseOrBadRequest(
          z.never(),
          params.data.datasetName,
          res,
          'params',
        );
        return;
      }

      fs.mkdirSync(path.dirname(fullPath), { recursive: true });

      let nextLineNumber = 0;
      if (fs.existsSync(fullPath)) {
        const existing = fs.readFileSync(fullPath, "utf8");
        nextLineNumber = existing.split("\n").filter((l) => l.trim().length > 0).length;
      }

      fs.appendFileSync(fullPath, JSON.stringify(normalizeDatasetRow(body.data)) + "\n");

      res.status(201).json({ data: { line_number: nextLineNumber } });
    } catch (error: any) {
      console.error("Error appending to dataset:", error);
      sendInternalError(res, error?.message || "Failed to append to dataset");
    }
  });

  async function importDatasetRows<TBody extends { mapping?: DatasetImportMapping }>(
    datasetName: string,
    body: TBody,
    sourceIds: string[],
    fetchSource: (sourceId: string) => Promise<unknown | null> | unknown | null,
    res: Response,
  ): Promise<void> {
    try {
      const datasetPath = `${datasetName}.jsonl`;
      const fullPath = path.resolve(agentmarkTemplatesBase, datasetPath);
      const resolvedBase = path.resolve(agentmarkTemplatesBase);
      if (!fullPath.startsWith(resolvedBase)) {
        parseOrBadRequest(z.never(), datasetName, res, 'params');
        return;
      }

      fs.mkdirSync(path.dirname(fullPath), { recursive: true });

      let nextLineNumber = 0;
      if (fs.existsSync(fullPath)) {
        const existing = fs.readFileSync(fullPath, "utf8");
        nextLineNumber = existing.split("\n").filter((l) => l.trim().length > 0).length;
      }

      const results: Array<{ source_id: string; status: "created" | "failed"; line_number?: number; error?: string }> = [];
      let added = 0;

      for (const sourceId of sourceIds) {
        try {
          const source = await fetchSource(sourceId);
          if (!source) {
            results.push({ source_id: sourceId, status: "failed", error: "Source not found" });
            continue;
          }

          const row = buildDatasetRowFromSource(source, body.mapping);
          fs.appendFileSync(fullPath, JSON.stringify(row) + "\n");
          results.push({ source_id: sourceId, status: "created", line_number: nextLineNumber });
          nextLineNumber += 1;
          added += 1;
        } catch (error: any) {
          results.push({
            source_id: sourceId,
            status: "failed",
            error: error?.message || "Import failed",
          });
        }
      }

      const status = added === results.length ? 201 : 207;
      res.status(status).json({ data: { added, results } });
    } catch (error: any) {
      console.error("Error importing dataset rows:", error);
      sendInternalError(res, error?.message || "Failed to import dataset rows");
    }
  }

  app.post("/v1/datasets/:datasetName/rows/from-traces", async (req: Request, res: Response): Promise<void> => {
    const params = parseOrBadRequest(DatasetNameParamsSchema, req.params, res, 'params');
    if (!params.ok) return;
    const body = parseOrBadRequest(ImportDatasetRowsFromTracesBodySchema, req.body, res, 'body');
    if (!body.ok) return;

    await importDatasetRows(
      params.data.datasetName,
      body.data,
      body.data.trace_ids,
      async (traceId) => {
        const trace = await getTraceById(traceId);
        return trace ? normalizeLocalTraceSource(trace) : null;
      },
      res,
    );
  });

  app.post("/v1/datasets/:datasetName/rows/from-spans", async (req: Request, res: Response): Promise<void> => {
    const params = parseOrBadRequest(DatasetNameParamsSchema, req.params, res, 'params');
    if (!params.ok) return;
    const body = parseOrBadRequest(ImportDatasetRowsFromSpansBodySchema, req.body, res, 'body');
    if (!body.ok) return;

    await importDatasetRows(
      params.data.datasetName,
      body.data,
      body.data.span_ids,
      (spanId) => getLocalSpanSource(spanId),
      res,
    );
  });

  app.get("/v1/traces", async (req: Request, res: Response) => {
    const query = parseOrBadRequest(TracesListParamsSchema, req.query, res, 'query');
    if (!query.ok) return;
    try {
      // Map validated snake_case query to the service's camelCase params.
      // Same contract as the cloud gateway's `ListTraces` handler: list
      // filters include status, user_id, model, dataset_run_id,
      // session_id, name, tag (repeatable), and date ranges.
      const {
        dataset_run_id: datasetRunId,
        session_id: sessionId,
        name: traceName,
        tag: tagQuery,
        commit_sha: commitSha,
        ...rest
      } = query.data as any;
      const params: any = { ...rest };
      if (datasetRunId) params.datasetRunId = datasetRunId;
      if (sessionId) params.sessionId = sessionId;
      if (traceName) params.name = traceName;
      if (tagQuery != null) {
        params.tags = Array.isArray(tagQuery) ? tagQuery : [tagQuery];
      }
      if (commitSha) params.commitSha = commitSha;

      const result = await service.getTraces(localAppId, params);
      // Map the service's camelCase shape to the `/v1/traces` wire
      // contract (snake_case). Mapping lives in a helper so it's
      // unit-testable — see `test/wire-mappers.test.ts`.
      return res.json(toTracesListResponseWire(result));
    } catch (error) {
      console.error("Error getting traces:", error);
      return sendInternalError(res, "Failed to get traces");
    }
  });

  app.get("/v1/traces/:traceId", async (req: Request, res: Response) => {
    const params = parseOrBadRequest(TraceIdParamsSchema, req.params, res, 'params');
    if (!params.ok) return;
    try {
      // `?fields=graph` opts into the graph projection. Matches the
      // cloud gateway's `GetTrace` handler and supersedes the deprecated
      // `/v1/traces/:traceId/graph` sub-resource below.
      const fieldsParam = typeof req.query.fields === 'string' ? req.query.fields : '';
      const fields = fieldsParam.split(',').map((s) => s.trim()).filter(Boolean);
      const includeGraph = fields.includes('graph');

      const [trace, graph] = await Promise.all([
        service.getTraceDetail(localAppId, params.data.traceId),
        includeGraph ? getTraceGraph(params.data.traceId) : Promise.resolve(undefined),
      ]);
      if (!trace) return sendNotFound(res, "Trace not found");
      return res.json({
        data: toTraceDetailWire(trace, { graph }),
      });
    } catch (error) {
      console.error("Error getting trace:", error);
      return sendInternalError(res, "Failed to get trace");
    }
  });

  // Deprecated: graph data is a projection of span metadata, not a
  // sub-resource. Clients should migrate to
  // `GET /v1/traces/:traceId?fields=graph`. RFC 9745 Deprecation/Sunset
  // headers surface the replacement at runtime.
  app.get("/v1/traces/:traceId/graph", async (req: Request, res: Response) => {
    const params = parseOrBadRequest(TraceIdParamsSchema, req.params, res, 'params');
    if (!params.ok) return;
    try {
      const graphData = await getTraceGraph(params.data.traceId);
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', 'Tue, 21 Oct 2026 00:00:00 GMT');
      res.setHeader('Link', '</v1/traces/{traceId}?fields=graph>; rel="successor-version"');
      return res.json({ data: graphData });
    } catch (error) {
      console.error("Error getting trace graph:", error);
      return sendInternalError(res, "Failed to get trace graph");
    }
  });

  app.get("/v1/spans", async (req: Request, res: Response) => {
    const query = parseOrBadRequest(SpansListParamsSchema, req.query, res, 'query');
    if (!query.ok) return;
    try {
      const spans = await searchSpans(query.data as any);
      return res.json({
        data: toSpansListWire(spans as Array<Record<string, unknown>>),
        pagination: {
          total: spans.length,
          limit: (query.data as any).limit ?? 50,
          offset: (query.data as any).offset ?? 0,
        },
      });
    } catch (error) {
      console.error("Error searching spans:", error);
      return sendInternalError(res, "Failed to search spans");
    }
  });

  app.get("/v1/traces/:traceId/spans", async (req: Request, res: Response) => {
    const params = parseOrBadRequest(TraceIdParamsSchema, req.params, res, 'params');
    if (!params.ok) return;
    try {
      const spans = await getSpans(params.data.traceId);
      return res.json({
        data: toSpansListWire(spans as Array<Record<string, unknown>>),
      });
    } catch (error) {
      console.error("Error getting spans for trace:", error);
      return sendInternalError(res, "Failed to get spans for trace");
    }
  });

  app.get("/v1/traces/:traceId/spans/:spanId", async (req: Request, res: Response) => {
    const params = parseOrBadRequest(TraceSpanIdParamsSchema, req.params, res, 'params');
    if (!params.ok) return;
    try {
      const spanIO = await service.getSpanIO(localAppId, params.data.traceId, params.data.spanId);
      if (!spanIO) return sendNotFound(res, "Span not found");
      return res.json({ data: toSpanIOWire(spanIO) });
    } catch (error) {
      console.error("Error getting span detail:", error);
      return sendInternalError(res, "Failed to get span detail");
    }
  });

  app.post("/v1/scores", async (req: Request, res: Response) => {
    const body = parseOrBadRequest(CreateScoreBodySchema, req.body, res, 'body');
    if (!body.ok) return;
    try {
      const result = await createScore(body.data);
      return res.status(201).json(result);
    } catch (error: any) {
      console.error("Error creating score:", error);
      return sendInternalError(res, error?.message || "Failed to create score");
    }
  });

  app.post("/v1/scores/batch", async (req: Request, res: Response) => {
    const body = parseOrBadRequest(CreateScoresBatchEnvelopeSchema, req.body, res, 'body');
    if (!body.ok) return;
    try {
      const result = await createScoresBatch(body.data as { scores: any[] });
      const status =
        result.summary.failed === 0 ? 201 : result.summary.succeeded === 0 ? 400 : 207;
      return res.status(status).json({ data: result });
    } catch (error: any) {
      console.error("Error creating scores batch:", error);
      // Service-layer errors carry `status` + `code` for size-limit /
      // malformed-envelope rejections; preserve them.
      const status = typeof error?.status === "number" ? error.status : 500;
      if (status >= 500) {
        return sendInternalError(res, error?.message || "Failed to create scores");
      }
      return res.status(status).json({
        error: {
          code: error?.code || "invalid_request_body",
          message: error?.message || "Failed to create scores",
        },
      });
    }
  });

  app.get("/v1/scores", async (req: Request, res: Response) => {
    const query = parseOrBadRequest(ScoresListParamsSchema, req.query, res, 'query');
    if (!query.ok) return;
    try {
      // Cloud uses `resource_id` (snake_case); SQLite service expects
      // `resourceId` (camelCase). Map at the boundary.
      const params: any = { ...query.data };
      if (params.resource_id) {
        params.resourceId = params.resource_id;
        delete params.resource_id;
      }
      const result = await service.getScores(localAppId, params);
      return res.json(toScoresListWire(result));
    } catch (error) {
      console.error("Error getting scores:", error);
      return sendInternalError(res, "Failed to get scores");
    }
  });

  app.get("/v1/scores/names", async (_req: Request, res: Response) => {
    try {
      const result = await service.getDistinctScoreNames(localAppId);
      return res.json({ data: result.names });
    } catch (error) {
      console.error("Error getting score names:", error);
      return sendInternalError(res, "Failed to get score names");
    }
  });

  // 501 stub — must register before `/v1/scores/:scoreId` so Express
  // matches this literal path first instead of treating `aggregations` as a
  // score ID.
  app.get("/v1/scores/aggregations", (_req: Request, res: Response) => {
    sendNotImplemented(
      res,
      'Score aggregations are not available on the local dev server.',
      'Use --remote to target a hosted backend, or check available endpoints with: agentmark api capabilities',
    );
  });

  app.get("/v1/scores/:scoreId", async (req: Request, res: Response) => {
    const params = parseOrBadRequest(ScoreIdParamsSchema, req.params, res, 'params');
    if (!params.ok) return;
    try {
      const score = await service.getScoreById(localAppId, params.data.scoreId);
      if (!score) return sendNotFound(res, "Score not found");
      return res.json({ data: toScoreWire(score) });
    } catch (error) {
      console.error("Error getting score:", error);
      return sendInternalError(res, "Failed to get score");
    }
  });

  // ---------------------------------------------------------------------------
  // /v1/score-configs — read-only mirror of cloud's score config surface.
  //
  // Cloud syncs `agentmark.json`'s `scores` map to Supabase on deploy; the
  // OSS dev server reads that same JSON object directly from the project
  // root. Both project the data through the same canonical `ScoreConfig`
  // shape — see `oss/agentmark/packages/cli/cli-src/server/routes/score-configs/`.
  // ---------------------------------------------------------------------------

  app.get("/v1/score-configs", async (req: Request, res: Response) => {
    const query = parseOrBadRequest(ScoreConfigsListParamsSchema, req.query, res, 'query');
    if (!query.ok) return;
    try {
      const all = await readAllScoreConfigs(currentPath);
      const { limit, offset } = query.data as { limit: number; offset: number };
      const total = all.length;
      const page = all.slice(offset, offset + limit);
      return res.json({ data: page, pagination: { total, limit, offset } });
    } catch (error) {
      console.error("Error listing score configs:", error);
      return sendInternalError(res, "Failed to list score configs");
    }
  });

  app.get("/v1/score-configs/:name", async (req: Request, res: Response) => {
    const name = req.params.name;
    if (!name || typeof name !== 'string' || name.length === 0) {
      return res.status(400).json(
        structuredError('invalid_path_params', 'name is required'),
      );
    }
    try {
      const all = await readAllScoreConfigs(currentPath);
      const match = all.find((cfg) => cfg.name === name);
      if (!match) {
        return res.status(404).json(
          structuredError('score_config_not_found', `Score config '${name}' not found`),
        );
      }
      return res.json({ data: match });
    } catch (error) {
      console.error("Error getting score config:", error);
      return sendInternalError(res, "Failed to get score config");
    }
  });

  // ---------------------------------------------------------------------------
  // /v1/api-keys — 501 stubs.
  //
  // API key management requires Unkey (cloud-only secret) and the Supabase
  // `api_key` table. The local dev server has no auth surface to manage —
  // expose the endpoints for OpenAPI parity but reject at runtime so a
  // client moving from cloud → local sees a structured `not_available_locally`
  // instead of a 404 that hides the feature gap.
  // ---------------------------------------------------------------------------

  const apiKeysNotAvailableLocally = (_req: Request, res: Response) => {
    res.status(501).json(
      structuredError(
        'not_available_locally',
        'API key management is not available on the local dev server.',
        { hint: 'Use --remote to target a hosted backend, or check available endpoints with: agentmark api capabilities' },
      ),
    );
  };

  app.get("/v1/api-keys", apiKeysNotAvailableLocally);
  app.post("/v1/api-keys", apiKeysNotAvailableLocally);
  app.delete("/v1/api-keys/:apiKeyId", apiKeysNotAvailableLocally);

  // ---------------------------------------------------------------------------
  // /v1/deployments — 501 stubs (spec 053).
  //
  // Managed deployments are a cloud-only concept: the build pipeline runs on
  // Fly machines, the deployment row lives in Supabase, and the orchestrator
  // depends on a connected git repository. None of that is meaningful in
  // `agentmark dev` where the project IS the running code. A `?status=` for
  // the local server has nothing to enumerate. We return 501 with a
  // structured envelope so cloud↔local migrations surface the gap loudly.
  // ---------------------------------------------------------------------------

  const deploymentsNotAvailableLocally = (_req: Request, res: Response) => {
    res.status(501).json(
      structuredError(
        'not_available_locally',
        'Managed deployments are not available on the local dev server.',
        {
          hint:
            'Use --remote to target a hosted backend. The local server runs your project directly; there is no separate deploy lifecycle to inspect or trigger.',
        },
      ),
    );
  };

  app.get("/v1/deployments", deploymentsNotAvailableLocally);
  app.get("/v1/deployments/:deploymentId", deploymentsNotAvailableLocally);

  app.get("/v1/sessions", async (req: Request, res: Response) => {
    const query = parseOrBadRequest(SessionsListParamsSchema, req.query, res, 'query');
    if (!query.ok) return;
    try {
      const result = await service.getSessions(localAppId, query.data as any);
      return res.json(toSessionsListWire(result));
    } catch (error) {
      console.error("Error getting sessions:", error);
      return sendInternalError(res, "Failed to get sessions");
    }
  });

  // /v1/requests — paginated list of LLM-call records (GENERATION-type
  // traces with input/output, model, tokens, cost, latency). Same data
  // the cloud dashboard surfaces at `/api/analytics/requests`.
  app.get("/v1/requests", async (req: Request, res: Response) => {
    const query = parseOrBadRequest(RequestsListParamsSchema, req.query, res, 'query');
    if (!query.ok) return;
    try {
      // Map validated snake_case query → the service's camelCase params.
      // The local SQLite backend honours model/status/pagination today;
      // date-range, user_id, sort and the advanced `filter` DSL are part
      // of the wire contract (cloud honours them) but ignored locally —
      // same shape-vs-impl split as `/v1/traces`.
      const {
        start_date: startDate,
        end_date: endDate,
        user_id: userId,
        sort_by: sortField,
        sort_order: sortOrder,
        filter: _filter,
        ...rest
      } = query.data as any;
      const params: any = { ...rest };
      if (startDate) params.startDate = startDate;
      if (endDate) params.endDate = endDate;
      if (userId) params.userId = userId;
      if (sortField) params.sortField = sortField;
      if (sortOrder) params.sortOrder = sortOrder;

      const result = await service.getRequests(localAppId, params);
      return res.json(toRequestsListWire(result));
    } catch (error) {
      console.error("Error getting requests:", error);
      return sendInternalError(res, "Failed to get requests");
    }
  });

  // Deprecated: session-scoping is a filter, not a sub-resource.
  // Clients should migrate to `GET /v1/traces?session_id={id}`. RFC 9745
  // Deprecation/Sunset headers surface the replacement at runtime.
  app.get("/v1/sessions/:sessionId/traces", async (req: Request, res: Response) => {
    const params = parseOrBadRequest(SessionIdParamsSchema, req.params, res, 'params');
    if (!params.ok) return;
    try {
      const traces = await service.getSessionTraces(localAppId, params.data.sessionId);
      res.setHeader('Deprecation', 'true');
      res.setHeader('Sunset', 'Tue, 21 Oct 2026 00:00:00 GMT');
      res.setHeader('Link', '</v1/traces?session_id={sessionId}>; rel="successor-version"');
      return res.json({ data: traces });
    } catch (error) {
      console.error("Error getting traces for session:", error);
      return sendInternalError(res, "Failed to get traces for session");
    }
  });

  app.get("/v1/experiments", async (req: Request, res: Response) => {
    const query = parseOrBadRequest(ExperimentsListParamsSchema, req.query, res, 'query');
    if (!query.ok) return;
    try {
      const result = await service.getExperiments(localAppId, query.data as any);
      return res.json({ data: result.experiments, pagination: { total: result.total, limit: result.limit, offset: result.offset } });
    } catch (error) {
      console.error("Error getting experiments:", error);
      return sendInternalError(res, "Failed to get experiments");
    }
  });

  // Registered before `/v1/experiments/:experimentId` so the literal
  // "baseline" segment isn't captured as an experiment ID.
  app.get("/v1/experiments/baseline", async (req: Request, res: Response) => {
    const query = parseOrBadRequest(ExperimentBaselineParamsSchema, req.query, res, 'query');
    if (!query.ok) return;
    try {
      const result = await getBaselineScores(
        query.data.experiment_key,
        query.data.tree_hash,
        query.data.dataset_path,
      );
      return res.json({ data: result });
    } catch (error) {
      console.error("Error getting baseline scores:", error);
      return sendInternalError(res, "Failed to get baseline scores");
    }
  });

  app.get("/v1/experiments/:experimentId", async (req: Request, res: Response) => {
    const params = parseOrBadRequest(ExperimentIdParamsSchema, req.params, res, 'params');
    if (!params.ok) return;
    try {
      const result = await service.getExperimentDetail(localAppId, params.data.experimentId);
      if (!result) return sendNotFound(res, "Experiment not found");
      return res.json({ data: result });
    } catch (error) {
      console.error("Error getting experiment:", error);
      return sendInternalError(res, "Failed to get experiment");
    }
  });

  app.get("/v1/runs/:runId/traces", async (req: Request, res: Response) => {
    const params = parseOrBadRequest(RunIdParamsSchema, req.params, res, 'params');
    if (!params.ok) return;
    try {
      const detail = await service.getDatasetRunDetail(localAppId, params.data.runId);
      if (!detail) return sendNotFound(res, "Run not found");
      return res.json({ data: detail.items });
    } catch (error) {
      console.error("Error getting traces for run:", error);
      return sendInternalError(res, "Failed to get traces for run");
    }
  });

  app.get("/v1/capabilities", (_req: Request, res: Response) => {
    res.json({
      target: 'local',
      url: `http://localhost:${port}`,
      endpoints: {
        traces: true,
        spans: true,
        sessions: true,
        scores: true,
        score_analytics: false,
        metrics: false,
        experiments: true,
        datasets: true,
        prompts: true,
        runs: true,
        pricing: true,
      },
    });
  });

  // Per-model LLM pricing data. Public (no auth). Raw map shape keyed
  // by model ID — no { data } envelope.
  app.get("/v1/pricing", (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'public, max-age=86400');
    res.json(LOCAL_PRICING_MAP);
  });

  // 501 stubs — endpoints whose implementation is not available locally.
  app.get("/v1/metrics", (_req: Request, res: Response) => {
    sendNotImplemented(
      res,
      'Metrics are not available on the local dev server.',
      'Use --remote to target a hosted backend, or check available endpoints with: agentmark api capabilities',
    );
  });

  app.delete("/v1/scores/:scoreId", async (req: Request, res: Response) => {
    const params = parseOrBadRequest(ScoreIdParamsSchema, req.params, res, 'params');
    if (!params.ok) return;
    try {
      const deleted = await service.deleteScore(localAppId, params.data.scoreId);
      if (!deleted) return sendNotFound(res, "Score not found");
      return res.status(204).send();
    } catch (error) {
      console.error("Error deleting score:", error);
      return sendInternalError(res, "Failed to delete score");
    }
  });

  // Error handling middleware for NotAvailableLocallyError
  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err.name === 'NotAvailableLocallyError') {
      return sendNotImplemented(
        res,
        err.message,
        'Use --remote to target a hosted backend, or check available endpoints with: agentmark api capabilities',
      );
    }
    return next(err);
  });

  // Catch-all 404 for unknown /v1/* routes — Express's default returns
  // an HTML "Cannot GET /v1/foobar" body, which breaks JSON clients.
  // Emit the canonical envelope so consumers parsing JSON don't choke.
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (res.headersSent) return next();
    sendNotFound(res, `Cannot ${req.method} ${req.path}`);
  });

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
    server.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(
          `Port ${port} is already in use. Stop the existing server or set AGENTMARK_API_PORT to a different port.`,
        ));
      } else {
        reject(err);
      }
    });
  });
}
