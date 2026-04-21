import express, { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import fs from "fs";
import rateLimit from "express-rate-limit";
import path from "path";
import { findPromptFiles, normalizeOtlpSpans, type OtlpResourceSpans } from "@agentmark-ai/shared-utils";
import cors from "cors";
import { z } from "zod";
import {
  exportTraces,
  getTraceGraph,
  getSpans,
  searchSpans,
} from "./server/routes/traces";
import { createScore, createScoresBatch } from "./server/routes/scores";
import { LOCAL_PRICING_MAP } from "./server/routes/pricing";
import { LocalObservabilityService } from "./server/services/local-observability-service";
import { toTracesListResponseWire } from "./server/wire-mappers";
import db from "./server/database";
import { getTemplateDXInstance } from "@agentmark-ai/prompt-core";
import type { TraceForwarder } from "./forwarding/forwarder";
import {
  CreateScoreBodySchema,
  ScoresListParamsSchema,
  TracesListParamsSchema,
  SpansListParamsSchema,
  SessionsListParamsSchema,
  ExperimentsListParamsSchema,
} from "@agentmark-ai/api-schemas";
import {
  parseOrBadRequest,
  sendInternalError,
  sendNotFound,
} from "./api-helpers";

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

const DatasetRowBodySchema = z
  .record(z.string(), z.unknown())
  .refine((v) => v !== null && !Array.isArray(v), {
    message: "Request body must be a JSON object",
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

  // Serve the static OpenAPI spec
  app.get("/v1/openapi.json", (_req: Request, res: Response) => {
    try {
      const specPath = path.join(__dirname, 'server', 'openapi-spec.json');
      const spec = JSON.parse(fs.readFileSync(specPath, 'utf-8'));
      res.json(spec);
    } catch (error) {
      console.error("Error serving OpenAPI spec:", error);
      res.status(503).json({ error: "spec_unavailable", message: "Could not load OpenAPI spec" });
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
          path.relative(agentmarkTemplatesBase, file)
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

  // Rate limiter: 100 requests per 15 minutes per IP for file system endpoint
  const templatesRateLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: "Too many requests. Please try again later." },
  });

  app.get("/v1/templates", templatesRateLimiter, async (req: Request, res: Response) => {
    const filePath = req.query.path;

    if (!filePath || typeof filePath !== "string") {
      return res
        .status(400)
        .json({ error: "Path query parameter must be a single string value" });
    }

    // Reject absolute paths
    if (path.isAbsolute(filePath)) {
      return res.status(400).json({ error: "Absolute paths are not allowed" });
    }

    // Normalize the path and remove leading ./
    const normalizedPath = path.normalize(
      filePath.startsWith("./") ? filePath.slice(2) : filePath
    );

    // Prevent path traversal with .. sequences
    if (normalizedPath.includes("..") || normalizedPath.startsWith("/")) {
      return res
        .status(400)
        .json({ error: "Invalid path: path traversal detected" });
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
        .json({ error: "Access denied: path outside allowed directory" });
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
          return res.status(404).json({ error: "Dataset not found" });
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
            return res.status(500).json({ error: "Failed to read dataset" });
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
      return res.json({ data });
    } catch (_error) {
      return res.status(404).json({ error: "File not found or invalid" });
    }
  });

  // Accept both JSON and protobuf OTLP payloads
  app.post("/v1/traces", express.raw({ type: 'application/x-protobuf', limit: '10mb' }), async (req: Request, res: Response) => {
    try {
      let body: any;

      if (Buffer.isBuffer(req.body)) {
        // Protobuf payload — decode using OTLP proto definition
        try {
          const root = require("@opentelemetry/otlp-transformer/build/src/generated/root");
          const ExportTraceServiceRequest = root.opentelemetry.proto.collector.trace.v1.ExportTraceServiceRequest;
          const decoded = ExportTraceServiceRequest.decode(req.body);
          body = ExportTraceServiceRequest.toObject(decoded, {
            longs: String,
            bytes: String,
            defaults: true,
          });
        } catch (protoErr: any) {
          return res.status(400).json({ error: `Failed to decode protobuf: ${protoErr.message}` });
        }
      } else {
        // JSON payload (already parsed by express.json middleware)
        body = req.body;
      }

      if (!body || !body.resourceSpans || !Array.isArray(body.resourceSpans)) {
        return res.status(400).json({
          error: "Invalid OTLP payload: expected ExportTraceServiceRequest with resourceSpans array"
        });
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
      return res.status(500).json({ error: error.message || "Failed to export traces" });
    }
  });

  app.get("/v1/prompts", async (_req: Request, res: Response) => {
    try {
      const promptFiles = await findPromptFiles(agentmarkTemplatesBase);
      const paths = promptFiles.map((file) =>
        path.relative(agentmarkTemplatesBase, file)
      );
      res.json({ paths });
    } catch (_error) {
      res.status(500).json({ error: "Failed to list prompts" });
    }
  });

  // --- Dataset endpoints ---

  app.get("/v1/datasets", async (_req: Request, res: Response) => {
    try {
      const datasets: string[] = [];
      const walk = (dir: string) => {
        if (!fs.existsSync(dir)) return;
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
          if (entry.isDirectory()) {
            walk(path.join(dir, entry.name));
          } else if (entry.name.endsWith(".jsonl")) {
            datasets.push(path.relative(agentmarkTemplatesBase, path.join(dir, entry.name)));
          }
        }
      };
      walk(agentmarkTemplatesBase);
      res.json({ datasets });
    } catch (error) {
      console.error("Error listing datasets:", error);
      res.status(500).json({ error: "Failed to list datasets" });
    }
  });

  app.post("/v1/datasets/:datasetName/rows", async (req: Request, res: Response): Promise<void> => {
    const params = parseOrBadRequest(DatasetNameParamsSchema, req.params, res, 'params');
    if (!params.ok) return;
    const body = parseOrBadRequest(DatasetRowBodySchema, req.body, res, 'body');
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

      fs.appendFileSync(fullPath, JSON.stringify(body.data) + "\n");

      res.status(201).json({ data: { line_number: nextLineNumber } });
    } catch (error: any) {
      console.error("Error appending to dataset:", error);
      sendInternalError(res, error?.message || "Failed to append to dataset");
    }
  });

  app.get("/v1/traces", async (req: Request, res: Response) => {
    const query = parseOrBadRequest(TracesListParamsSchema, req.query, res, 'query');
    if (!query.ok) return;
    try {
      // Map validated snake_case query to the service's camelCase params.
      // Schema enforces `limit`, `offset`, `status`, `user_id`, `model`,
      // `dataset_run_id`, and date ranges — same contract as the cloud
      // gateway's `ListTraces` handler.
      const { dataset_run_id: datasetRunId, ...rest } = query.data as any;
      const params: any = { ...rest };
      if (datasetRunId) params.datasetRunId = datasetRunId;

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
      const trace = await service.getTraceDetail(localAppId, params.data.traceId);
      if (!trace) return sendNotFound(res, "Trace not found");
      return res.json({ data: trace });
    } catch (error) {
      console.error("Error getting trace:", error);
      return sendInternalError(res, "Failed to get trace");
    }
  });

  app.get("/v1/traces/:traceId/graph", async (req: Request, res: Response) => {
    const params = parseOrBadRequest(TraceIdParamsSchema, req.params, res, 'params');
    if (!params.ok) return;
    try {
      const graphData = await getTraceGraph(params.data.traceId);
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
        data: spans,
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
      return res.json({ data: spans });
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
      return res.json({ data: spanIO });
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
      return res.json({ data: result.scores, pagination: { total: result.total, limit: result.limit, offset: result.offset } });
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
    res.status(501).json({
      error: 'not_available_locally',
      message: 'Score aggregations are not available on the local dev server.',
      hint: 'Use --remote to target a hosted backend, or check available endpoints with: agentmark api capabilities',
    });
  });

  app.get("/v1/scores/:scoreId", async (req: Request, res: Response) => {
    const params = parseOrBadRequest(ScoreIdParamsSchema, req.params, res, 'params');
    if (!params.ok) return;
    try {
      const score = await service.getScoreById(localAppId, params.data.scoreId);
      if (!score) return sendNotFound(res, "Score not found");
      return res.json({
        data: {
          id: score.id,
          resource_id: score.resourceId,
          name: score.name,
          score: score.score,
          label: score.label,
          reason: score.reason,
          source: score.source,
          created_at: score.createdAt,
        },
      });
    } catch (error) {
      console.error("Error getting score:", error);
      return sendInternalError(res, "Failed to get score");
    }
  });

  app.get("/v1/sessions", async (req: Request, res: Response) => {
    const query = parseOrBadRequest(SessionsListParamsSchema, req.query, res, 'query');
    if (!query.ok) return;
    try {
      const result = await service.getSessions(localAppId, query.data as any);
      return res.json({ data: result.sessions, pagination: { total: result.total, limit: result.limit, offset: result.offset } });
    } catch (error) {
      console.error("Error getting sessions:", error);
      return sendInternalError(res, "Failed to get sessions");
    }
  });

  app.get("/v1/sessions/:sessionId/traces", async (req: Request, res: Response) => {
    const params = parseOrBadRequest(SessionIdParamsSchema, req.params, res, 'params');
    if (!params.ok) return;
    try {
      const traces = await service.getSessionTraces(localAppId, params.data.sessionId);
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
    res.status(501).json({
      error: 'not_available_locally',
      message: 'Metrics are not available on the local dev server.',
      hint: 'Use --remote to target a hosted backend, or check available endpoints with: agentmark api capabilities',
    });
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
      return res.status(501).json({
        error: 'not_available_locally',
        message: err.message,
        hint: 'Use --remote to target a hosted backend, or check available endpoints with: agentmark api capabilities',
      });
    }
    return next(err);
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
