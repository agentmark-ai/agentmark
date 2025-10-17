import { spawn } from "child_process";
import path from "path";
import fs from "fs";

function getSafeCwd(): string {
  try { return process.cwd(); } catch { return process.env.PWD || process.env.INIT_CWD || '.'; }
}

const dev = async (options: { port?: number; runnerPort?: number } = {}) => {
  const fileServerPort = options.port || 9418;
  const runnerPort = options.runnerPort || 9417;
  const cwd = getSafeCwd();

  // Check if dev-server.ts exists
  const devServerPath = path.join(cwd, 'dev-server.ts');
  if (!fs.existsSync(devServerPath)) {
    console.error('Error: dev-server.ts not found in current directory');
    console.error('Run this command from your AgentMark project root');
    process.exit(1);
  }

  // Check if agentmark.config.ts exists
  const configPath = path.join(cwd, 'agentmark.config.ts');
  if (!fs.existsSync(configPath)) {
    console.error('Error: agentmark.config.ts not found in current directory');
    console.error('Run this command from your AgentMark project root');
    process.exit(1);
  }

  let adapterName = 'Unknown SDK';
  try {
    const jiti = require('jiti')(cwd, { interopDefault: true });
    const configModule = jiti(configPath);
    const client = configModule.client || configModule.default?.client;

    if (client?.getAdapter) {
      const adapter = client.getAdapter();
      const name = adapter?.__name;
      if (name) adapterName = name;
    }
  } catch (e) {}

  console.log('\n' + '─'.repeat(60));
  console.log('Starting AgentMark Development Servers');
  console.log(`Running with ${adapterName}`);
  console.log('─'.repeat(60));

  // Start dev server
  const devServer = spawn('npx', ['tsx', '--watch', 'dev-server.ts', `--runner-port=${runnerPort}`, `--file-port=${fileServerPort}`], {
    stdio: 'inherit',
    cwd
  });

  devServer.on('error', (error) => {
    console.error('Failed to start dev server:', error.message);
    process.exit(1);
  });

  devServer.on('exit', (code) => {
    console.log(`\nDev server exited with code ${code}`);
    process.exit(code || 0);
  });

  // Handle process termination
  process.on('SIGINT', () => {
    console.log('\nShutting down servers...');
    devServer.kill();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    devServer.kill();
    process.exit(0);
  });
};

export default dev;
