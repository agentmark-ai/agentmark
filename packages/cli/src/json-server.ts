import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { findPromptFiles } from './commands/generate-types';

const app = express();
const PORT = parseInt(process.env.PORT || '9418', 10);
function safePath(): string {
  try { return process.cwd(); } catch { return process.env.PWD || process.env.INIT_CWD || '.'; }
}
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

app.get('/v1/templates', async (req: Request, res: Response) => {
    const filePath = req.query.path;

    if (!filePath || typeof filePath !== 'string') {
        return res.status(400).json({ error: 'Path query parameter must be a single string value' });
    }

    // Normalize path by removing leading ./ if present
    const normalizedPath = filePath.startsWith('./') ? filePath.slice(2) : filePath;
    let fullPath = path.join(agentmarkTemplatesBase, normalizedPath);
    if (!fs.existsSync(fullPath) && filePath.endsWith('.jsonl')) {
      const alt = path.join(agentmarkTemplatesBase, 'templates', path.basename(filePath));
      if (fs.existsSync(alt)) fullPath = alt;
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
            return fs.readFileSync(resolved, 'utf-8');
        });
        return res.json({ data });
    } catch (error) {
        return res.status(404).json({ error: 'File not found or invalid' });
    }
});

app.post('/v1/export-traces', (_req, res) => {
    return res.json({ success: true });
});

// Note: /v1/templates is the single endpoint; prompt vs dataset is inferred by extension

// Re-add prompts listing for type generation
app.get('/v1/prompts', async (_req: Request, res: Response) => {
  try {
    const promptFiles = await findPromptFiles(agentmarkTemplatesBase);
    const paths = promptFiles.map((file) => path.relative(agentmarkTemplatesBase, file));
    res.json({ paths });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list prompts' });
  }
});

app.listen(PORT, () => {
    console.log(`Running on port ${PORT}...`);
});