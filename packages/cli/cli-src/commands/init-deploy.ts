import fs from 'fs';
import path from 'path';
import prompts from 'prompts';

interface DeploymentPlatform {
  name: string;
  files: Array<{ filename: string; content: string }>;
  instructions: string;
}

const getRailwayConfig = () => `{
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

const getRenderConfig = () => `services:
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

const getDockerfile = () => `FROM node:20-alpine

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

const platforms: Record<string, DeploymentPlatform> = {
  railway: {
    name: 'Railway',
    files: [
      { filename: 'railway.json', content: getRailwayConfig() }
    ],
    instructions: `
🚀 Next steps to deploy to Railway:

1. Install Railway CLI:
   npm install -g @railway/cli

2. Login and initialize:
   railway login
   railway init

3. Set your webhook secret:
   railway variables set AGENTMARK_WEBHOOK_SECRET=$(openssl rand -hex 32)

4. Deploy:
   railway up

Your webhook will be live at: https://your-project.railway.app
`
  },
  render: {
    name: 'Render',
    files: [
      { filename: 'render.yaml', content: getRenderConfig() }
    ],
    instructions: `
🚀 Next steps to deploy to Render:

1. Push your code to GitHub:
   git add .
   git commit -m "Add Render deployment config"
   git push

2. Go to render.com and:
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Render will auto-detect render.yaml and deploy

Or use the Render CLI:
   render deploy

Your webhook will be live at: https://your-service.onrender.com
`
  },
  docker: {
    name: 'Docker',
    files: [
      { filename: 'Dockerfile', content: getDockerfile() }
    ],
    instructions: `
🚀 Next steps to deploy with Docker:

1. Build the image:
   docker build -t agentmark-webhook .

2. Test locally:
   docker run -p 9417:9417 \\
     -e AGENTMARK_WEBHOOK_SECRET=your-secret-here \\
     agentmark-webhook

3. Deploy to your platform:

   Fly.io:
   fly launch
   fly deploy

   Google Cloud Run:
   gcloud run deploy agentmark-webhook \\
     --source . \\
     --platform managed \\
     --region us-central1 \\
     --set-env-vars AGENTMARK_WEBHOOK_SECRET=your-secret

   AWS ECS, Azure Container Instances, etc.
`
  },
  all: {
    name: 'All platforms',
    files: [
      { filename: 'railway.json', content: getRailwayConfig() },
      { filename: 'render.yaml', content: getRenderConfig() },
      { filename: 'Dockerfile', content: getDockerfile() }
    ],
    instructions: `
✅ All deployment configurations created!

See DEPLOYMENT.md for detailed instructions on deploying to each platform.
`
  }
};

const initDeploy = async () => {
  const cwd = process.cwd();

  // Check if agentmark.client.ts exists
  const clientConfigPath = path.join(cwd, 'agentmark.client.ts');
  if (!fs.existsSync(clientConfigPath)) {
    console.error('❌ Error: agentmark.client.ts not found');
    console.error('Run this command from your AgentMark project root');
    console.error('Or create a new project with: npx create-agentmark');
    process.exit(1);
  }

  console.log('🚀 AgentMark Deployment Setup\n');
  console.log('This will create deployment configuration files for your chosen platform(s).\n');

  const response = await prompts({
    type: 'select',
    name: 'platform',
    message: 'Which platform do you want to deploy to?',
    choices: [
      { title: 'Railway (recommended - fastest setup)', value: 'railway' },
      { title: 'Render (auto-deploy from GitHub)', value: 'render' },
      { title: 'Docker (deploy anywhere)', value: 'docker' },
      { title: 'All platforms (create all configs)', value: 'all' },
      { title: 'Cancel', value: 'cancel' }
    ],
    initial: 0
  });

  if (!response.platform || response.platform === 'cancel') {
    console.log('Deployment setup cancelled.');
    return;
  }

  const selectedPlatform = platforms[response.platform];

  console.log(`\n📝 Creating ${selectedPlatform.name} deployment files...\n`);

  // Check for existing files
  const existingFiles = selectedPlatform.files.filter(file =>
    fs.existsSync(path.join(cwd, file.filename))
  );

  if (existingFiles.length > 0) {
    const overwrite = await prompts({
      type: 'confirm',
      name: 'value',
      message: `The following files already exist: ${existingFiles.map(f => f.filename).join(', ')}. Overwrite?`,
      initial: false
    });

    if (!overwrite.value) {
      console.log('Deployment setup cancelled.');
      return;
    }
  }

  // Create the files
  for (const file of selectedPlatform.files) {
    const filePath = path.join(cwd, file.filename);
    fs.writeFileSync(filePath, file.content);
    console.log(`✅ Created ${file.filename}`);
  }

  console.log(selectedPlatform.instructions);

  // Update .gitignore to ensure deployment files are NOT ignored
  const gitignorePath = path.join(cwd, '.gitignore');
  if (fs.existsSync(gitignorePath)) {
    let gitignore = fs.readFileSync(gitignorePath, 'utf-8');

    // Remove any lines that would ignore deployment files
    const filesToKeep = ['railway.json', 'render.yaml', 'Dockerfile'];
    const lines = gitignore.split('\n');
    const filteredLines = lines.filter(line => {
      const trimmed = line.trim();
      return !filesToKeep.some(file =>
        trimmed === file || trimmed === `/${file}` || trimmed === `./${file}`
      );
    });

    gitignore = filteredLines.join('\n');

    // Add comment if not present
    if (!gitignore.includes('# Deployment configs')) {
      gitignore += '\n# Deployment configs should be committed\n';
    }

    fs.writeFileSync(gitignorePath, gitignore);
  }

  console.log('\n💡 Tip: Read DEPLOYMENT.md for detailed deployment instructions');
};

export default initDeploy;
