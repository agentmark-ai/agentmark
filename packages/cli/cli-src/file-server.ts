import express, { Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import fs from 'fs';
import path from 'path';
import { findPromptFiles } from '@agentmark/shared-utils';

function safePath(): string {
  try { return process.cwd(); } catch { return process.env.PWD || process.env.INIT_CWD || '.'; }
}

export async function createFileServer(port: number) {
  const app = express();

  // Set up rate limiter for expensive endpoints
  const templatesLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per window
    standardHeaders: true, 
    legacyHeaders: false,
  });
  
  const currentPath = safePath();
  const basePath = path.join(currentPath);
  let agentmarkTemplatesBase = path.join(basePath, 'agentmark');

  try {
    const jsonPath = path.join(currentPath, 'agentmark.json');
    if (fs.existsSync(jsonPath)) {
      const agentmarkJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
      if (agentmarkJson?.agentmarkPath) {
        agentmarkTemplatesBase = path.join(basePath, agentmarkJson.agentmarkPath, 'agentmark');
      }
    }
  } catch {}

  // Landing page for browser access
  app.get('/', async (_req: Request, res: Response) => {
    let promptsList = '';
    try {
      const promptFiles = await findPromptFiles(agentmarkTemplatesBase);
      if (promptFiles.length > 0) {
        const relativePaths = promptFiles.map((file) => path.relative(agentmarkTemplatesBase, file));
        promptsList = relativePaths.map(p => `      <li><code>${p}</code></li>`).join('\n');
      } else {
        promptsList = '      <li style="color: #64748b;">No prompts found</li>';
      }
    } catch {
      promptsList = '      <li style="color: #ef4444;">Error listing prompts</li>';
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AgentMark File Server</title>
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
  <h1>AgentMark File Server</h1>
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
    This is the <strong>AgentMark File Server</strong>, an internal development server that provides
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
    `.trim());
  });

  app.get('/v1/templates', templatesLimiter, async (req: Request, res: Response) => {
    const filePath = req.query.path;

    if (!filePath || typeof filePath !== 'string') {
        return res.status(400).json({ error: 'Path query parameter must be a single string value' });
    }

    // Reject absolute paths
    if (path.isAbsolute(filePath)) {
      return res.status(400).json({ error: 'Absolute paths are not allowed' });
    }

    // Normalize the path and remove leading ./
    const normalizedPath = path.normalize(filePath.startsWith('./') ? filePath.slice(2) : filePath);

    // Prevent path traversal with .. sequences
    if (normalizedPath.includes('..') || normalizedPath.startsWith('/')) {
      return res.status(400).json({ error: 'Invalid path: path traversal detected' });
    }

    // Join with base path
    let fullPath = path.join(agentmarkTemplatesBase, normalizedPath);

    // Verify the resolved path is still within the base directory
    const resolvedPath = path.resolve(fullPath);
    const resolvedBase = path.resolve(agentmarkTemplatesBase);
    if (!resolvedPath.startsWith(resolvedBase + path.sep) && resolvedPath !== resolvedBase) {
      return res.status(403).json({ error: 'Access denied: path outside allowed directory' });
    }

    // Try alternative path for .jsonl files in templates directory
    if (!fs.existsSync(fullPath) && filePath.endsWith('.jsonl')) {
      const altPath = path.join(agentmarkTemplatesBase, 'templates', path.basename(filePath));
      const resolvedAltPath = path.resolve(altPath);
      if (resolvedAltPath.startsWith(resolvedBase + path.sep) && fs.existsSync(altPath)) {
        fullPath = altPath;
      }
    }

    try {
        if (fullPath.endsWith('.jsonl')) {
            // Dataset: default to JSON array unless client explicitly requests NDJSON
            if (!fs.existsSync(fullPath)) return res.status(404).json({ error: 'Dataset not found' });
            const accept = (req.get('accept') || '').toLowerCase();
            const explicitlyNdjson = accept.includes('application/x-ndjson');
            const wantsJsonArray = req.query.format === 'json' || !explicitlyNdjson;
            if (wantsJsonArray) {
              try {
                const lines = fs.readFileSync(fullPath, 'utf-8').split(/\r?\n/).filter(Boolean);
                const arr = lines.map(l => JSON.parse(l));
                return res.json(arr);
              } catch (e) {
                return res.status(500).json({ error: 'Failed to read dataset' });
              }
            }
            res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
            return fs.createReadStream(fullPath).pipe(res);
        }
        // Prompt: parse and return AST (no datasetUrl coupling)
        const { parse } = await import('@agentmark/templatedx');
        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        const data = await parse(fileContent, path.dirname(fullPath), async (p) => {
            const resolved = path.isAbsolute(p) ? p : path.join(path.dirname(fullPath), p);
            // Validate that the resolved path is within the base directory
            const resolvedImportPath = path.resolve(resolved);
            const resolvedBase = path.resolve(agentmarkTemplatesBase);
            if (!resolvedImportPath.startsWith(resolvedBase + path.sep) && resolvedImportPath !== resolvedBase) {
              throw new Error('Access denied: import path outside allowed directory');
            }
            return fs.readFileSync(resolvedImportPath, 'utf-8');
        });
        return res.json({ data });
    } catch (error) {
        return res.status(404).json({ error: 'File not found or invalid' });
    }
});

  app.post('/v1/export-traces', (_req, res) => {
    return res.json({ success: true });
  });

  app.get('/v1/prompts', async (_req: Request, res: Response) => {
    try {
      const promptFiles = await findPromptFiles(agentmarkTemplatesBase);
      const paths = promptFiles.map((file) => path.relative(agentmarkTemplatesBase, file));
      res.json({ paths });
    } catch (error) {
      res.status(500).json({ error: 'Failed to list prompts' });
    }
  });

  return new Promise((resolve) => {
    const server = app.listen(port, () => {
      resolve(server);
    });
  });
}
