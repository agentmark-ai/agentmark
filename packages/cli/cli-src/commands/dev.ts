import { spawn, ChildProcess } from "child_process";
import path from "path";
import fs from "fs";
import net from "net";
import { createApiServer } from "../api-server";
import { createTunnel, type TunnelInfo } from "../tunnel";
import { loadLocalConfig, getTunnelSubdomain, setAppPort } from "../config";
import type { LocalConfig } from "../config";
import { IS_WINDOWS, killProcessTree, getPythonPaths } from "../utils/platform";
import { loadForwardingConfig, isKeyExpired, saveForwardingConfig } from "../forwarding/config";
import { TraceForwarder } from "../forwarding/forwarder";
import { ForwardingStatusReporter } from "../forwarding/status";
import { attemptAutoLink } from "../auth/auto-link";
import { setForwarder } from "../api-server";
import { loadCredentials } from "../auth/credentials";
import { DEFAULT_PLATFORM_URL } from "../auth/constants";
import login from "./login";

function getSafeCwd(): string {
  try { return process.cwd(); } catch { return process.env.PWD || process.env.INIT_CWD || '.'; }
}

type ProjectLanguage = "typescript" | "python";

function detectProjectLanguage(cwd: string): ProjectLanguage {
  // Check for Python project indicators
  const pyprojectPath = path.join(cwd, 'pyproject.toml');
  const agentmarkClientPy = path.join(cwd, 'agentmark_client.py');
  const pythonDevServer = path.join(cwd, '.agentmark', 'dev_server.py');

  if (fs.existsSync(pyprojectPath) || fs.existsSync(agentmarkClientPy) || fs.existsSync(pythonDevServer)) {
    return "python";
  }

  // Default to TypeScript
  return "typescript";
}

/**
 * Find Python executable, preferring virtual environment if present.
 * Checks .venv and venv directories in the project root.
 */
function findPythonExecutable(cwd: string): string {
  const { binDir, pythonExe, pythonCmd } = getPythonPaths();

  // Check common virtual environment directories
  const venvDirs = ['.venv', 'venv'];
  for (const venvDir of venvDirs) {
    const venvPython = path.join(cwd, venvDir, binDir, pythonExe);
    if (fs.existsSync(venvPython)) {
      console.log(`Using virtual environment: ${venvDir}/`);
      return venvPython;
    }
  }

  // Fallback to system Python
  return pythonCmd;
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port);
  });
}

function getConfigDaysRemaining(config: LocalConfig): number {
  if (!config.createdAt) return 30;
  const createdDate = new Date(config.createdAt);
  const daysSinceCreation = (Date.now() - createdDate.getTime()) / (1000 * 60 * 60 * 24);
  return Math.ceil(30 - daysSinceCreation);
}

const dev = async (options: { apiPort?: number; webhookPort?: number; appPort?: number; remote?: boolean; tunnel?: boolean; forward?: boolean } = {}) => {
  const apiPort = options.apiPort || 9418;
  const webhookPort = options.webhookPort || 9417;
  const appPort = options.appPort || 3000;
  const cwd = getSafeCwd();

  // Resolve mode flags:
  // --remote: enables tunnel + forwarding (login + link + forwarding + tunnel)
  // --tunnel: legacy flag, enables tunnel only (no forwarding)
  // --no-forward: disables forwarding when used with --remote
  let useRemote = options.remote || false;
  const legacyTunnel = options.tunnel || false;
  let useTunnel = useRemote || legacyTunnel;
  let useForwarding = useRemote ? (options.forward !== false) : false;

  // Inline login when --remote is used
  if (useRemote) {
    try {
      await login();
    } catch {
      console.log('⚠️  Login failed. Continuing in local-only mode.\n');
      useRemote = false;
      useTunnel = legacyTunnel;
      useForwarding = false;
    }
  }

  // Load or create local config with webhook secret
  const config = loadLocalConfig();

  // Set webhook secret from local config if not already set
  // This is the source of truth for local development
  if (!process.env.AGENTMARK_WEBHOOK_SECRET && config.webhookSecret) {
    process.env.AGENTMARK_WEBHOOK_SECRET = config.webhookSecret;
  }

  // For local-only mode, skip signature verification for convenience
  if (!useTunnel) {
    process.env.AGENTMARK_WEBHOOK_SECRET = '';
  }

  // Detect project language
  const projectLanguage = detectProjectLanguage(cwd);
  console.log(`Detected ${projectLanguage} project`);

  // Check for appropriate client config file based on language
  if (projectLanguage === "python") {
    const pythonConfigPath = path.join(cwd, 'agentmark_client.py');
    if (!fs.existsSync(pythonConfigPath)) {
      console.error('Error: agentmark_client.py not found in current directory');
      console.error('Run this command from your AgentMark Python project root');
      process.exit(1);
    }
  } else {
    const configPath = path.join(cwd, 'agentmark.client.ts');
    if (!fs.existsSync(configPath)) {
      console.error('Error: agentmark.client.ts not found in current directory');
      console.error('Run this command from your AgentMark project root');
      process.exit(1);
    }
  }

  // Determine which dev server entry point to use based on language
  let devServerFile: string;

  if (projectLanguage === "python") {
    const customPythonDevServer = path.join(cwd, 'dev_server.py');
    const autoGeneratedPythonEntry = path.join(cwd, '.agentmark', 'dev_server.py');

    if (fs.existsSync(customPythonDevServer)) {
      console.log('Using custom dev_server.py');
      devServerFile = customPythonDevServer;
    } else if (fs.existsSync(autoGeneratedPythonEntry)) {
      devServerFile = autoGeneratedPythonEntry;
    } else {
      console.error('Error: No Python dev server entry point found.');
      console.error('Expected .agentmark/dev_server.py to be created during initialization.');
      console.error('Please run "npx create-agentmark --python" to set up a new project.');
      process.exit(1);
    }
  } else {
    // Check locations in priority order:
    // 1. Custom dev-server.ts (user override)
    // 2. Project root dev-entry.ts (new default location, version controlled)
    // 3. .agentmark/dev-entry.ts (legacy location for backward compatibility)
    const customDevServer = path.join(cwd, 'dev-server.ts');
    const projectRootEntry = path.join(cwd, 'dev-entry.ts');
    const legacyEntry = path.join(cwd, '.agentmark', 'dev-entry.ts');

    if (fs.existsSync(customDevServer)) {
      console.log('Using custom dev-server.ts');
      devServerFile = customDevServer;
    } else if (fs.existsSync(projectRootEntry)) {
      devServerFile = projectRootEntry;
    } else if (fs.existsSync(legacyEntry)) {
      console.log('Using legacy .agentmark/dev-entry.ts (consider moving to project root)');
      devServerFile = legacyEntry;
    } else {
      console.error('Error: No dev server entry point found.');
      console.error('Expected dev-entry.ts at project root or .agentmark/dev-entry.ts.');
      console.error('Please run "npx create-agentmark" to set up a new project.');
      process.exit(1);
    }
  }

  // Start API server directly
  let apiServerInstance: any;
  try {
    console.log(`Starting...`);
    apiServerInstance = await createApiServer(apiPort);
  } catch (error: any) {
    console.error('Failed to start API server:', error.message);
    console.error(error.stack);
    process.exit(1);
  }

  // Track shutdown state to suppress exit messages during intentional shutdown
  let isShuttingDown = false;

  // Start webhook server based on project language
  let webhookServer: ChildProcess;

  if (projectLanguage === "python") {
    // For Python projects, spawn the Python dev server
    // Find Python executable (prefers virtual environment if present)
    const pythonCommand = findPythonExecutable(cwd);

    webhookServer = spawn(pythonCommand, [
      devServerFile,
      `--webhook-port=${webhookPort}`,
      `--api-server-port=${apiPort}`
    ], {
      stdio: 'inherit',
      cwd,
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: '1', // Prevent __pycache__ creation
        PYTHONUNBUFFERED: '1', // Ensure real-time output
      }
    });
  } else {
    // For TypeScript projects, use tsx with watch mode
    const tsxPath = path.join(require.resolve('tsx'), '../../dist/cli.mjs');
    webhookServer = spawn(process.execPath, [tsxPath, '--watch', devServerFile, 'agentmark.client.ts', 'agentmark/**/*', `--webhook-port=${webhookPort}`, `--api-server-port=${apiPort}`], {
      stdio: 'inherit',
      cwd
    });
  }

  webhookServer.on('error', (error) => {
    console.error('Failed to start webhook server:', error.message);
    if (apiServerInstance) {
      try { apiServerInstance.close(); } catch {
        // Ignore errors when closing API server
      }
    }
    process.exit(1);
  });

  webhookServer.on('exit', (code) => {
    // Only log if not shutting down intentionally
    if (!isShuttingDown) {
      if (code === 0 || code === null) {
        console.log('\nWebhook server stopped');
      } else {
        console.error(`\n❌ Webhook server exited with error code ${code}`);
        console.error('Check the output above for error details');
      }
      if (apiServerInstance) {
        try { apiServerInstance.close(); } catch {
          // Ignore errors when closing API server
        }
      }
      process.exit(code || 0);
    }
  });

  // Start AgentMark UI app (Next.js production server)
  const nextCwd = path.join(__dirname, '..', '..');
  let actualAppPort = appPort;
  let uiServer: ReturnType<typeof spawn> | null = null;

  async function startAgentMarkServer() {
    while (!(await isPortFree(actualAppPort))) {
      console.warn(`Port ${actualAppPort} is busy, trying ${actualAppPort + 1}`);
      actualAppPort++;
    }

    // Save the actual app port to config so run-prompt/run-experiment can use it
    setAppPort(actualAppPort);

    uiServer = spawn('npm', ['start', '--', '-p', `${actualAppPort}`], {
      stdio: 'pipe',
      cwd: nextCwd,
      shell: IS_WINDOWS, // Required for Windows to resolve npm.cmd
      env: {
        ...process.env,
        NEXT_PUBLIC_AGENTMARK_API_PORT: String(apiPort)
      },
    });

    // Capture output for debugging
    uiServer.stdout?.on('data', () => {
      // Silently consume stdout
    });

    uiServer.stderr?.on('data', (data) => {
      console.error(`AgentMark UI error: ${data.toString()}`);
    });

    uiServer.on('exit', (code) => {
      // Only log if not shutting down intentionally
      if (!isShuttingDown) {
        console.log(`AgentMark UI server exited with code ${code}`);
        process.exit(code || 0);
      }
    });

    uiServer.on('error', (err) => {
      console.error('Failed to start AgentMark UI server:', err.message);
      process.exit(1);
    });
  }

  // Start the AgentMark app
  startAgentMarkServer();

  // Store tunnel info, forwarder, and status reporter for cleanup
  let tunnelInfo: TunnelInfo | null = null;
  let forwarder: TraceForwarder | null = null;
  let statusReporter: ForwardingStatusReporter | null = null;

  // Give servers time to start, then print summary and optionally setup tunnel
  setTimeout(async () => {
    // Verify webhook server is still running before showing success message
    if (webhookServer.exitCode !== null) {
      console.error('\n❌ Webhook server failed to start');
      console.error('The API server is running, but the webhook server did not start successfully');
      return;
    }

    // Setup tunnel if requested
    if (useTunnel) {
      try {
        const subdomain = getTunnelSubdomain();
        tunnelInfo = await createTunnel(webhookPort, subdomain);
      } catch (error: any) {
        const errorMsg = error?.message || String(error);
        console.error('\n⚠️  Could not establish tunnel:', errorMsg);
        if (errorMsg.includes('Download') || errorMsg.includes('consent')) {
          console.error('   Run again with --tunnel to retry download.');
        }
        console.error('   Continuing in local-only mode...\n');
      }
    }

    // Setup trace forwarding if not disabled
    let forwardingStatus: 'active' | 'inactive' | 'disabled' | 'expired' = 'inactive';
    let forwardingAppName = '';
    let forwardingBaseUrl = '';

    if (useForwarding) {
      // Check if already linked
      let forwardingConfig = loadForwardingConfig();

      // If not linked but user is logged in, attempt auto-link
      if (!forwardingConfig) {
        await attemptAutoLink();
        forwardingConfig = loadForwardingConfig();
      }

      // Check if key is expired or about to expire (within 7 days)
      if (forwardingConfig && isKeyExpired(forwardingConfig)) {
        console.log('⚠️  Dev API key expired. Run `agentmark link` to refresh.\n');
        forwardingStatus = 'expired';
      } else if (forwardingConfig?.expiresAt) {
        // Check if key is within 7 days of expiry
        const expiryDate = new Date(forwardingConfig.expiresAt);
        const daysUntilExpiry = (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

        if (daysUntilExpiry < 7 && daysUntilExpiry > 0) {
          // Attempt to refresh the key
          console.log('⚠️  Dev API key expires soon, attempting refresh...');
          const credentials = loadCredentials();
          if (credentials && forwardingConfig.apiKeyId) {
            try {
              const platformUrl = DEFAULT_PLATFORM_URL;
              const refreshUrl = `${platformUrl}/api/cli/dev-key/${forwardingConfig.apiKeyId}/refresh`;
              const response = await fetch(refreshUrl, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${credentials.access_token}`,
                },
              });

              if (response.ok) {
                const newKeyData = await response.json() as { key: string; key_id: string; expires_at: string };
                // Update forwarding config with new key
                saveForwardingConfig({
                  ...forwardingConfig,
                  apiKey: newKeyData.key,
                  apiKeyId: newKeyData.key_id,
                  expiresAt: newKeyData.expires_at,
                });
                // Reload the config for use
                forwardingConfig = loadForwardingConfig()!;
                console.log('✓ Dev API key refreshed\n');
              } else {
                console.log('⚠️  Failed to refresh key automatically. Run `agentmark link` to refresh.\n');
              }
            } catch (error) {
              console.log('⚠️  Failed to refresh key automatically. Run `agentmark link` to refresh.\n');
            }
          }
        }
      }

      if (forwardingConfig?.apiKey && forwardingConfig?.baseUrl && forwardingConfig?.appId) {
        // Create forwarder and inject into API server
        try {
          forwarder = new TraceForwarder(forwardingConfig);
          setForwarder(forwarder);

          // Create status reporter
          statusReporter = new ForwardingStatusReporter(forwarder);

          forwardingStatus = 'active';
          forwardingAppName = forwardingConfig.appName || 'Unknown App';
          // Tenant info is available in forwardingConfig.tenantId if needed
          forwardingBaseUrl = forwardingConfig.baseUrl;
        } catch (error) {
          console.error('⚠️  Failed to initialize trace forwarding:', (error as Error).message);
          forwardingStatus = 'inactive';
        }
      }
    } else {
      forwardingStatus = 'disabled';
    }

    console.log('\n' + '═'.repeat(70));
    console.log('🚀 AgentMark Development Servers Running');
    console.log('═'.repeat(70));

    console.log(`\n  API:           http://localhost:${apiPort}`);
    console.log(`  Webhook:       http://localhost:${webhookPort}`);
    console.log(`  App:           http://localhost:${actualAppPort}`);

    if (useRemote) {
      // Consolidated remote section
      console.log('\n  Remote:        ✓ Connected');
      if (tunnelInfo) {
        console.log(`    Tunnel:      ${tunnelInfo.url}`);
      } else {
        console.log(`    Tunnel:      ⚠️  Failed to establish`);
      }
      if (forwardingStatus === 'active') {
        console.log(`    Forwarding:  ✓ Active → ${forwardingAppName} (${forwardingBaseUrl})`);
      } else if (forwardingStatus === 'disabled') {
        console.log(`    Forwarding:  ○ Disabled (--no-forward)`);
      } else if (forwardingStatus === 'expired') {
        console.log(`    Forwarding:  ⚠️  Expired (run 'agentmark link' to refresh)`);
      } else {
        console.log(`    Forwarding:  ⚠️  Not linked (run 'agentmark link')`);
      }
    } else if (legacyTunnel && tunnelInfo) {
      // Legacy --tunnel mode
      console.log('\n  Public Webhook:');
      console.log(`    URL:    ${tunnelInfo.url}`);
      console.log(`    Secret: ${config.webhookSecret}`);
      console.log(`    Valid:  ${getConfigDaysRemaining(config)} days remaining`);
    } else {
      console.log('\n  Tip: Use --remote to connect to the platform');
    }

    console.log('\n' + '─'.repeat(70));
    console.log('How to run prompts and experiments:');
    console.log('─'.repeat(70));
    console.log('\n  Open a new terminal window and run:');
    console.log('\n  Run a prompt:');
    console.log('  $ npm run prompt ./agentmark/party-planner.prompt.mdx');
    console.log('\n  Run an experiment:');
    console.log('  $ npm run experiment ./agentmark/party-planner.prompt.mdx');
    console.log('\n  (Replace with any prompt file in ./agentmark/)');

    console.log('\n' + '═'.repeat(70));
    console.log('Press Ctrl+C in this terminal to stop the servers');
    console.log('═'.repeat(70) + '\n');
  }, 3000);

  // Handle process termination
  const cleanup = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\nShutting down servers...');

    // Stop status reporter polling
    if (statusReporter) {
      statusReporter.stop();
    }

    // Flush trace forwarder first (with 5s timeout)
    if (forwarder) {
      try {
        console.log('  Flushing trace buffer...');
        const unflushed = await forwarder.flush(5000);
        if (unflushed > 0) {
          console.log(`  ⚠️  ${unflushed} traces could not be forwarded`);
        } else {
          console.log('  ✓ All buffered traces sent');
        }
        forwarder.stop();
      } catch (error) {
        console.error('  Error flushing traces:', error);
      }
    }

    // Close tunnel
    if (tunnelInfo) {
      try {
        console.log('  Stopping tunnel...');
        await tunnelInfo.disconnect();
      } catch (error) {
        console.error('  Error disconnecting tunnel:', error);
      }
    }

    // Close API server with force close on all connections
    if (apiServerInstance) {
      try {
        console.log('  Stopping API server...');
        // Force close all connections
        await new Promise<void>((resolve) => {
          apiServerInstance.closeAllConnections?.();
          apiServerInstance.close(() => {
            resolve();
          });
          // Timeout in case close hangs
          setTimeout(resolve, 1000);
        });
      } catch (error) {
        console.error('  Error stopping API server:', error);
      }
    }

    // Kill webhook server process tree
    if (webhookServer.pid) {
      console.log('  Stopping webhook server...');
      killProcessTree(webhookServer.pid);
    }

    // Kill UI server process tree
    if (uiServer && uiServer.pid) {
      console.log('  Stopping UI server...');
      killProcessTree(uiServer.pid);
    }

    console.log('Servers stopped.');

    // Give processes time to die, then force exit
    // Increased timeout to allow for graceful shutdown
    setTimeout(() => {
      process.exit(0);
    }, 1000);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);

  // Don't use exit handler - it causes issues with async cleanup
  // The SIGINT/SIGTERM handlers will trigger process.exit()
};

export default dev;
