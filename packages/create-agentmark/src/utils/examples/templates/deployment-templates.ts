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


export const getRailwayJsonContent = () => {
  return `{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "yarn install && yarn build"
  },
  "deploy": {
    "startCommand": "cd packages/cli && npm start",
    "restartPolicyType": "ON_FAILURE",
    "restartPolicyMaxRetries": 10
  }
}
`;
};

export const getRenderYamlContent = () => {
  return `services:
  - type: web
    name: agentmark-webhook
    env: node
    region: oregon
    plan: free
    buildCommand: yarn install && yarn build
    startCommand: cd packages/cli && npm start
    envVars:
      - key: NODE_VERSION
        value: 20
      - key: AGENTMARK_WEBHOOK_SECRET
        generateValue: true
        sync: false
    healthCheckPath: /
`;
};

export const getDockerfileContent = () => {
  return `FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
COPY yarn.lock ./

# Install dependencies
RUN yarn install --production=false

# Copy source
COPY . .

# Build
RUN yarn build

# Expose port
EXPOSE 9417

# Start server
CMD ["node", "packages/cli/dist/deploy-server.js"]
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

export const getDeploymentGuideContent = () => {
  return `# Deploying AgentMark Webhooks

This guide explains how to deploy your AgentMark webhook server to production.

## Setup Deployment Configuration

First, generate deployment configuration files for your chosen platform:

\`\`\`bash
agentmark init-deploy
\`\`\`

This interactive command will create the necessary files for Railway, Render, Docker, or all platforms.

## Quick Start

Deploy your webhook in minutes with one command:

### Railway (Recommended)
\`\`\`bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login and init
railway login
railway init

# 3. Set your webhook secret
railway variables set AGENTMARK_WEBHOOK_SECRET=$(openssl rand -hex 32)

# 4. Deploy
railway up
\`\`\`

Your webhook will be live at: \`https://your-project.railway.app\`

### Render
\`\`\`bash
# 1. Push code to GitHub

# 2. Go to render.com and connect your repository
# Render will auto-detect render.yaml and deploy

# Or use the CLI:
render deploy
\`\`\`

### Docker
\`\`\`bash
# Build and run locally
docker build -t agentmark-webhook .
docker run -p 9417:9417 \\
  -e AGENTMARK_WEBHOOK_SECRET=your-secret-here \\
  agentmark-webhook

# Deploy to any platform (Fly.io, GCP Cloud Run, etc.)
\`\`\`

## Configuration

### Required Environment Variables

| Variable | Description | Example |
|----------|-------------|---------|
| \`AGENTMARK_WEBHOOK_SECRET\` | Webhook signature secret (32+ chars) | \`abc123...\` (64 chars) |
| \`PORT\` | Server port (auto-set by platforms) | \`9417\` |

### Generating a Webhook Secret

\`\`\`bash
# macOS/Linux
openssl rand -hex 32

# Or use Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
\`\`\`

## Platform Comparison

| Platform | Free Tier | Cold Starts | Setup Time | Best For |
|----------|-----------|-------------|------------|----------|
| Railway | $5/month credit | No | 2 minutes | Fastest setup |
| Render | 750 hours/month | No | 3 minutes | GitHub auto-deploy |
| Fly.io | 3 VMs free | No | 5 minutes | Global distribution |
| Docker | N/A | No | 10 minutes | Any platform |

## Testing Your Deployment

### 1. Test from CLI

After deploying, test your webhook:

\`\`\`bash
export AGENTMARK_WEBHOOK_URL=https://your-webhook-url.com
export AGENTMARK_WEBHOOK_SECRET=your-production-secret

npm run prompt agentmark/your-prompt.prompt.mdx
\`\`\`

### 2. Test with curl

\`\`\`bash
# Generate signature
SECRET="your-webhook-secret"
BODY='{"type":"prompt-run","data":{"ast":{"type":"root","children":[]}}}'
SIGNATURE=$(echo -n "$BODY" | openssl dgst -sha256 -hmac "$SECRET" | sed 's/^.* //')

# Send request
curl -X POST https://your-webhook-url.com \\
  -H "Content-Type: application/json" \\
  -H "x-agentmark-signature-256: sha256=$SIGNATURE" \\
  -d "$BODY"
\`\`\`

## Security Best Practices

1. **Always use HTTPS** - All platforms provide free SSL
2. **Rotate secrets regularly** - Every 30-90 days
3. **Monitor requests** - Use platform logging
4. **Restrict access** - Use firewall rules when available

## Troubleshooting

### "Missing signature header" Error
Make sure you're setting the correct header: \`x-agentmark-signature-256\`

### "Could not load agentmark.client.ts" Error
Ensure \`agentmark.client.ts\` is in your project root and included in deployment.

### "No model function found" Error
Check your environment variables for API keys (OPENAI_API_KEY, etc.)

## Support

- **Documentation**: [docs.agentmark.co](https://docs.agentmark.co)
- **GitHub**: [github.com/agentmark/agentmark](https://github.com/agentmark/agentmark)
`;
};
