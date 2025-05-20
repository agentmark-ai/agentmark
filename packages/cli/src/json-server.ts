import express, { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { findPromptFiles } from './commands/generate-types';

const app = express();
const PORT = parseInt(process.env.PORT || '9002', 10);
const currentPath = process.env.ROOT_AGENTMARK_PROJECT_PATH!;
const basePath = path.join(currentPath);
const agentmarkJson = JSON.parse(fs.readFileSync(`${currentPath}/agentmark.json`, 'utf-8'));
const agentmarkTemplatesBase = path.join(basePath, agentmarkJson.agentmarkPath, 'agentmark');

app.get('/v1/templates', async (req: Request, res: Response) => {
    const filePath = req.query.path as string;

    if (!filePath) {
        return res.status(400).json({ error: 'Path query parameter is required' });
    }

    const fullPath = path.join(agentmarkTemplatesBase, filePath);

    try {
        const { parse } = await import('@agentmark/templatedx');
        const fileContent = fs.readFileSync(fullPath, 'utf-8');
        const data = await parse(fileContent, path.dirname(fullPath), async (path) => {
            return fs.readFileSync(path, 'utf-8');
        });
        return res.json({ data });
    } catch (error) {
        console.error('Error loading template:', error);
        return res.status(404).json({ error: 'File not found or invalid' });
    }
});

app.post('/v1/export-traces', (req, res) => {
    return res.json({ success: true });
});

app.get('/v1/prompts', async (req: Request, res: Response) => {
  try {
    const promptFiles = await findPromptFiles(agentmarkTemplatesBase);
    const paths = promptFiles.map(file => 
      path.relative(agentmarkTemplatesBase, file)
    );
    res.json({ paths });
  } catch (error) {
    res.status(500).json({ error: 'Failed to list prompts' });
  }
});

app.listen(PORT, () => {
    console.log(`Running on port ${PORT}...`);
});