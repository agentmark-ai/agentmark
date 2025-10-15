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

  // Check if agentmark.config.ts exists
  const configPath = path.join(cwd, 'agentmark.config.ts');
  if (!fs.existsSync(configPath)) {
    console.error('Error: agentmark.config.ts not found in current directory');
    console.error('Run this command from your AgentMark project root');
    process.exit(1);
  }

  // Try to extract adapter name from the client's adapter
  let adapterName = 'Unknown SDK';
  try {
    // Dynamically import the config to read the adapter name
    const jiti = require('jiti')(cwd, { interopDefault: true });
    const configModule = jiti(configPath);
    const client = configModule.client || configModule.default?.client;

    if (client?.getAdapter) {
      const adapter = client.getAdapter();
      const name = adapter?.__name;
      // Convert adapter name to friendly display name
      if (name === 'vercel-ai-v4') {
        adapterName = 'Vercel AI SDK v4';
      } else if (name) {
        adapterName = name;
      }
    }
  } catch (e) {
    // Fallback to unknown if can't read adapter
  }

  console.log('\n' + '─'.repeat(60));
  console.log('Starting AgentMark Development Servers');
  console.log(`Running with ${adapterName}`);
  console.log('─'.repeat(60));

  // Start file server directly (json-server)
  const fileServer = spawn('node', [path.join(__dirname, '../json-server.js')], {
    stdio: 'pipe',
    env: {
      ...process.env,
      PORT: fileServerPort.toString()
    }
  });

  let fileServerStarted = false;

  fileServer.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.includes('Running on port') && !fileServerStarted) {
      fileServerStarted = true;
      console.log(`  Files served on:  http://localhost:${fileServerPort}`);
    }
  });

  fileServer.stderr.on('data', (data) => {
    console.error(`[File Server Error] ${data}`);
  });

  fileServer.on('error', (error) => {
    console.error('Failed to start file server:', error.message);
    process.exit(1);
  });

  // Wait a bit for file server to start, then start runner
  setTimeout(() => {
    const runner = spawn('npx', ['tsx', '--watch', 'agentmark.config.ts'], {
      stdio: 'pipe',
      env: { ...process.env },
      cwd
    });

    let runnerStarted = false;

    runner.stdout.on('data', (data) => {
      const output = data.toString();
      if (output.includes('listening on') && !runnerStarted) {
        runnerStarted = true;
        console.log(`  CLI served on:    http://localhost:${runnerPort}`);
        console.log('─'.repeat(60) + '\n');
        console.log('Ready! Use these CLI commands:');
        console.log('  $ agentmark run-prompt agentmark/<your-prompt>.prompt.mdx');
        console.log('  $ agentmark run-experiment agentmark/<your-prompt>.prompt.mdx');
        console.log('\nPress Ctrl+C to stop all servers\n');
      } else {
        // Pass through other output
        process.stdout.write(output);
      }
    });

    runner.stderr.on('data', (data) => {
      process.stderr.write(data);
    });

    runner.on('error', (error) => {
      console.error('Failed to start runner:', error.message);
      fileServer.kill();
      process.exit(1);
    });

    runner.on('exit', (code) => {
      console.log(`\nRunner exited with code ${code}`);
      fileServer.kill();
      process.exit(code || 0);
    });

    // Handle process termination
    process.on('SIGINT', () => {
      console.log('\nShutting down servers...');
      runner.kill();
      fileServer.kill();
      process.exit(0);
    });

    process.on('SIGTERM', () => {
      runner.kill();
      fileServer.kill();
      process.exit(0);
    });
  }, 1000);

  fileServer.on('exit', (code) => {
    console.log(`\nFile server exited with code ${code}`);
    process.exit(code || 0);
  });
};

export default dev;
