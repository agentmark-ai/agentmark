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

// Store results in memory for serving (in production, use proper storage)
const resultsStore: { [key: string]: any } = {};

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

// New endpoints for serving results
app.post('/v1/results/:type/:id', (req: Request, res: Response) => {
  const { type, id } = req.params;
  const key = `${type}-${id}`;
  resultsStore[key] = req.body;
  res.json({ success: true, id });
});

app.get('/v1/results/images/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const key = `images-${id}`;
  const result = resultsStore[key];
  
  if (!result) {
    return res.status(404).json({ error: 'Results not found' });
  }
  
  const imagesHtml = result.images?.map((image: any, index: number) => `
    <div class="image-container" style="margin-bottom: 20px;">
      <p>Image ${index + 1}</p>
      <img src="data:${image.mimeType};base64,${image.base64}" 
      alt="Image" style="max-width:100%;height:auto;" />
      <br />
    </div>
  `).join('') || '<p>No images found</p>';
  
  const html = `
    <html>
      <head><title>Generated Images - Entry ${id}</title></head>
      <body style="margin:0;padding:20px;font-family:sans-serif;">
        <h1>Generated Images - Entry ${id}</h1>
        ${imagesHtml}
      </body>
    </html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

app.get('/v1/results/audio/:id', (req: Request, res: Response) => {
  const { id } = req.params;
  const key = `audio-${id}`;
  const result = resultsStore[key];
  
  if (!result) {
    return res.status(404).json({ error: 'Results not found' });
  }
  
  const audioHtml = result.audio ? `
    <div class="audio-container" style="margin-bottom: 20px;">
      <p>Audio File</p>
      <audio controls style="width: 100%;">
        <source src="data:${result.audio.mimeType};base64,${result.audio.base64}" type="${result.audio.mimeType}">
        Your browser does not support the audio element.
      </audio>
    </div>
  ` : '<p>No audio found</p>';
  
  const html = `
    <html>
      <head><title>Generated Audio - Entry ${id}</title></head>
      <body style="margin:0;padding:20px;font-family:sans-serif;">
        <h1>Generated Audio - Entry ${id}</h1>
        ${audioHtml}
      </body>
    </html>
  `;
  
  res.setHeader('Content-Type', 'text/html');
  res.send(html);
});

app.listen(PORT, () => {
    console.log(`Running on port ${PORT}...`);
});