import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { findPromptFiles } from '@agentmark/shared-utils';
import rateLimit from 'express-rate-limit';

function safePath(): string {
  try { return process.cwd(); } catch { return process.env.PWD || process.env.INIT_CWD || '.'; }
}

export async function createFileServer(port: number) {
  const app = express();

  // Set up rate limiter: 100 requests per 15 minutes per IP for heavy endpoints
  const templatesLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    standardHeaders: true, // Return rate limit info in the headers
    legacyHeaders: false, // Disable the X-RateLimit headers
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
