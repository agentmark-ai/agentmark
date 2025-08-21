import { spawn } from "child_process";
import path from "path";

function getSafeCwd(): string {
  try { return process.cwd(); } catch { return process.env.PWD || process.env.INIT_CWD || '.'; }
}

const serve = (options: { port?: number } = {}) => {
  const port = options.port || 9418;
  console.log(`Starting agentmark local cdn on port ${port}...`);
  const currentProjectPath = process.env.ROOT_AGENTMARK_PROJECT_PATH || getSafeCwd();

  const serverProcess = spawn('node', [path.join(__dirname, '../json-server.js')], {
    stdio: 'inherit',
    env: {
      ...process.env,
      ROOT_AGENTMARK_PROJECT_PATH: currentProjectPath,
      PORT: port.toString()
    }
  });

  serverProcess.on('error', (error) => {
    console.error('Failed to start server:', error);
  });

  process.on('SIGINT', () => {
    serverProcess.kill();
    process.exit();
  });
};

export default serve;