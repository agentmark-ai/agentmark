/**
 * Platform-specific deployment templates for AgentMark
 */

export const getDeploymentGuideContent = () => {
  return `# Deploying AgentMark Webhooks

This guide explains how to deploy your AgentMark webhook server to production.

## Quick Start

Deploy your webhook using one of these platforms:

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
