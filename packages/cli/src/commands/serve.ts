import { spawn } from "child_process";
import path from "path";

const serve = (options: { port?: number } = {}) => {
  const port = options.port || 9002;
  console.log(`Starting agentmark local cdn on port ${port}...`);
  const currentProjectPath = process.cwd();

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