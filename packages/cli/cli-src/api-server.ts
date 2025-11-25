import express, { Request, Response } from "express";
import fs from "fs";
import rateLimit from "express-rate-limit";
import path from "path";
import { findPromptFiles } from "@agentmark/shared-utils";
import cors from "cors";
import {
  exportTraces,
  getRequests,
  getTraces,
  getTraceById,
  getTraceGraph,
  getSessions,
  getTracesBySessionId,
} from "./server/routes/traces";
import { createScore, getScoresByResourceId } from "./server/routes/scores";

function safePath(): string {
  try {
    return process.cwd();
  } catch {
    return process.env.PWD || process.env.INIT_CWD || ".";
  }
}

export async function createApiServer(port: number) {
  const app = express();
  app.use(express.json());
  app.use(cors());
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
      /v1/export-traces
    </div>
    <div class="endpoint-desc">
      Accept telemetry traces (no-op in local development)
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
      /v1/score?resourceId=xxx
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
      const { parse } = await import("@agentmark/templatedx");
      const fileContent = fs.readFileSync(fullPath, "utf-8");
      const data = await parse(
        fileContent,
        path.dirname(fullPath),
        async (p) => {
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
        }
      );
      return res.json({ data });
    } catch (_error) {
      return res.status(404).json({ error: "File not found or invalid" });
    }
  });

  app.post("/v1/export-traces", async (req: Request, res: Response) => {
    try {
      await exportTraces(req.body);
      return res.json({ success: true });
    } catch (_error) {
      return res.status(500).json({ error: "Failed to export traces" });
    }
  });

  app.get("/v1/requests", async (_req: Request, res: Response) => {
    try {
      const requests = await getRequests();
      return res.json({ requests });
    } catch (error) {
      console.error("Error getting requests:", error);
      return res.status(500).json({ error: "Failed to get requests" });
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

  app.get("/v1/traces", async (_req: Request, res: Response) => {
    try {
      const traces = await getTraces();
      return res.json({ traces });
    } catch (error) {
      console.error("Error getting traces:", error);
      return res.status(500).json({ error: "Failed to get traces" });
    }
  });

  app.get("/v1/traces/:traceId", async (req: Request, res: Response) => {
    try {
      const { traceId } = req.params;
      if (!traceId) {
        return res.status(400).json({ error: "traceId parameter is required" });
      }
      const trace = await getTraceById(traceId);
      if (!trace) {
        return res.status(404).json({ error: "Trace not found" });
      }
      return res.json({ trace });
    } catch (error) {
      console.error("Error getting trace:", error);
      return res.status(500).json({ error: "Failed to get trace" });
    }
  });

  app.get("/v1/traces/:traceId/graph", async (req: Request, res: Response) => {
    try {
      const { traceId } = req.params;
      if (!traceId) {
        return res.status(400).json({ error: "traceId parameter is required" });
      }
      const graphData = await getTraceGraph(traceId);
      return res.json({ graphData });
    } catch (error) {
      console.error("Error getting trace graph:", error);
      return res.status(500).json({ error: "Failed to get trace graph" });
    }
  });

  app.post("/v1/score", async (req: Request, res: Response) => {
    try {
      const body = req.body;
      if (!body.resourceId) {
        return res.status(400).json({ error: "resourceId is required" });
      }
      const result = await createScore(body);
      return res.json(result);
    } catch (error: any) {
      console.error("Error creating score:", error);
      return res
        .status(500)
        .json({ error: error.message || "Failed to create score" });
    }
  });

  app.get("/v1/score", async (req: Request, res: Response) => {
    try {
      const resourceId = req.query.resourceId as string;
      if (!resourceId) {
        return res
          .status(400)
          .json({ error: "resourceId query parameter is required" });
      }
      const scores = await getScoresByResourceId(resourceId);
      return res.json({ scores });
    } catch (error) {
      console.error("Error getting scores:", error);
      return res.status(500).json({ error: "Failed to get scores" });
    }
  });

  app.get("/v1/sessions", async (_req: Request, res: Response) => {
    try {
      const sessions = await getSessions();
      return res.json({ sessions });
    } catch (error) {
      console.error("Error getting sessions:", error);
      return res.status(500).json({ error: "Failed to get sessions" });
    }
  });

  app.get("/v1/sessions/:sessionId/traces", async (req: Request, res: Response) => {
    try {
      const { sessionId } = req.params;
      if (!sessionId) {
        return res.status(400).json({ error: "sessionId parameter is required" });
      }
      const traces = await getTracesBySessionId(sessionId);
      return res.json({ traces });
    } catch (error) {
      console.error("Error getting traces for session:", error);
      return res.status(500).json({ error: "Failed to get traces for session" });
    }
  });

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
  });
}
