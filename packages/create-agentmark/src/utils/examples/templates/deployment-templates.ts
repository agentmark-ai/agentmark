/**
 * Platform-specific deployment templates for AgentMark
 */

export const getNextJsApiRouteContent = (adapterName: string, handlerClassName: string) => {
  return `// AgentMark API Route for Next.js App Router
// This file handles prompt execution requests

import { createNextAppHandler } from '@agentmark/cli/runner-server/adapters/nextjs';
import { ${handlerClassName} } from '@agentmark/${adapterName}-adapter/runner';
import { client } from '../../../agentmark.client.js';

// Create webhook handler instance
const handler = new ${handlerClassName}(client as any);

// Export Next.js App Router handler
export const POST = createNextAppHandler(handler);

// Optional: Health check endpoint
export async function GET() {
  return Response.json({
    status: 'healthy',
    service: 'AgentMark Webhook',
    timestamp: new Date().toISOString()
  });
}
`;
};

export const getNextJsReadmeContent = (folderName: string) => {
  return `# ${folderName}

An AgentMark application deployed with Next.js.

## Getting Started

1. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

2. **Set up environment variables:**
   Edit \`.env.local\` with your API keys

3. **Run development server:**
   \`\`\`bash
   npm run dev
   \`\`\`

4. **Test your prompts:**
   Visit \`http://localhost:3000/api/agentmark\` or use the demo app

## Deployment

### Deploy to Vercel

\`\`\`bash
npx vercel deploy
\`\`\`

## API Endpoints

- \`POST /api/agentmark\` - Execute AgentMark prompts
- \`GET /api/agentmark\` - Health check

## Learn More

- [AgentMark Documentation](https://docs.agentmark.co)
- [Platform Adapters Guide](https://github.com/agentmark/agentmark/blob/main/PLATFORM_ADAPTERS.md)
- [Next.js Documentation](https://nextjs.org/docs)
`;
};

export const getExpressServerContent = (adapterName: string, handlerClassName: string) => {
  return `// AgentMark Express Server
// This file creates a standalone Express server for AgentMark

import express from 'express';
import { createExpressMiddleware } from '@agentmark/cli/runner-server/adapters/express';
import { ${handlerClassName} } from '@agentmark/${adapterName}-adapter/runner';
import { client } from './agentmark.client.js';

const app = express();
const PORT = process.env.PORT || 3000;

// Create webhook handler instance
const handler = new ${handlerClassName}(client as any);

// Parse JSON bodies
app.use(express.json());

// Mount AgentMark webhook handler at /api/agentmark
app.post('/api/agentmark', createExpressMiddleware(handler));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'AgentMark Express Server',
    timestamp: new Date().toISOString()
  });
});

// Start server
app.listen(PORT, () => {
  console.log(\`🚀 AgentMark server running on http://localhost:\${PORT}\`);
  console.log(\`   API endpoint: http://localhost:\${PORT}/api/agentmark\`);
  console.log(\`   Health check: http://localhost:\${PORT}/api/health\`);
});
`;
};


export const getDeploymentReadmeContent = (platform: string, folderName: string) => {
  const readmes: Record<string, string> = {
    'express-custom': `# ${folderName}

An AgentMark application with a custom Express server.

## Getting Started

1. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

2. **Run development server:**
   \`\`\`bash
   npm run dev
   \`\`\`

3. **Run production server:**
   \`\`\`bash
   npm run build
   npm start
   \`\`\`

## API Endpoints

- \`POST /api/agentmark\` - Execute AgentMark prompts
- \`GET /api/health\` - Health check

## Deployment

This Express app can be deployed to:
- Traditional Node.js servers
- Docker containers
- Cloud platforms (AWS EC2, Azure VMs, Google Compute Engine)
- Platform-as-a-Service (Heroku, Railway, Render)

See \`DEPLOYMENT.md\` for platform-specific deployment guides.

## Learn More

- [AgentMark Documentation](https://docs.agentmark.co)
- [Platform Adapters Guide](https://github.com/agentmark/agentmark/blob/main/PLATFORM_ADAPTERS.md)
- [Express Documentation](https://expressjs.com/)
`
  };

  return readmes[platform] || '';
};
