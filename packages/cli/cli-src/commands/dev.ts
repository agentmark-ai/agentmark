import { spawn, ChildProcess } from "child_process";
import path from "path";
import net from "net";
import { createApiServer } from "../api-server";
import { loadLocalConfig, setAppPort } from "../config";
import { IS_WINDOWS, killProcessTree, getPythonPaths, findProjectPython } from "../utils/platform";
import { loadForwardingConfig, isKeyExpired, saveForwardingConfig } from "../forwarding/config";
import { TraceForwarder } from "../forwarding/forwarder";
import { ForwardingStatusReporter } from "../forwarding/status";
import { attemptAutoLink } from "../auth/auto-link";
import { setForwarder } from "../api-server";
import { loadCredentials } from "../auth/credentials";
import { getPlatformUrl } from "../auth/constants";
import { detectProjectLanguage } from "../utils/project";
import {
  clientFilePresent,
  clientNotFoundMessages,
  resolveDevEntry,
  devEntryNotFoundMessages,
} from "../utils/setup-files";
import { buildDevServerEnv, buildPythonDevEnv, hasCloudCreds } from "./dev-env";

function getSafeCwd(): string {
  try { return process.cwd(); } catch { return process.env.PWD || process.env.INIT_CWD || '.'; }
}

/**
 * Find Python executable, preferring virtual environment if present.
 * Checks .venv and venv directories in the project root.
 */
function findPythonExecutable(cwd: string): string {
  const python = findProjectPython(cwd);
  const { pythonCmd } = getPythonPaths();
  if (python !== pythonCmd) {
    const venvDir = python.includes('.venv') ? '.venv' : 'venv';
    console.log(`Using virtual environment: ${venvDir}/`);
  }
  return python;
}

/**
 * One-shot reachability probe for the trace-forwarding endpoint. Any HTTP
 * response (even 401/404) counts as reachable — we're detecting a dead
 * host/port (stale dev-config.json), not validating auth.
 */
async function probeForwardingEndpoint(baseUrl: string, timeoutMs = 3000): Promise<boolean> {
  try {
    await fetch(baseUrl, { method: 'HEAD', signal: AbortSignal.timeout(timeoutMs) });
    return true;
  } catch {
    return false;
  }
}

function isPortFree(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const tester = net.createServer()
      .once('error', () => resolve(false))
      .once('listening', () => tester.close(() => resolve(true)))
      .listen(port);
  });
}

const dev = async (options: { apiPort?: number; webhookPort?: number; appPort?: number; forward?: boolean; ui?: boolean; watch?: boolean } = {}) => {
  const apiPort = options.apiPort || 9418;
  const webhookPort = options.webhookPort || 9417;
  const appPort = options.appPort || 3000;
  const cwd = getSafeCwd();

  // --no-forward: disables trace forwarding even when linked.
  // --no-ui: skip the Next.js UI app for CI / headless / test contexts.
  // --no-watch: don't restart on file changes. Critical for headless/boot use
  //   (e.g. `doctor --smoke --boot`): under `tsx --watch` a dev-entry that throws
  //   at load is NOT fatal — tsx prints "waiting for file changes" and keeps the
  //   process alive, so the webhook port never opens and callers see an opaque
  //   "did not become ready" timeout instead of the actual crash. Without watch,
  //   the crash exits the process so the real error surfaces immediately.
  const useForwarding = options.forward !== false;
  const useUi = options.ui !== false;
  const useWatch = options.watch !== false;

  loadLocalConfig();

  const projectLanguage = detectProjectLanguage(cwd);
  console.log(`Detected ${projectLanguage} project`);

  if (!clientFilePresent(cwd, projectLanguage)) {
    for (const line of clientNotFoundMessages(projectLanguage)) console.error(line);
    process.exit(1);
  }

  const devEntry = resolveDevEntry(cwd, projectLanguage);
  if (!devEntry.exists) {
    for (const line of devEntryNotFoundMessages(projectLanguage)) console.error(line);
    process.exit(1);
  }
  if (devEntry.kind === "custom") {
    console.log(projectLanguage === "python" ? "Using custom dev_server.py" : "Using custom dev-server.ts");
  } else if (devEntry.kind === "legacy") {
    console.log("Using legacy .agentmark/dev-entry.ts (consider moving to project root)");
  }
  const devServerFile = devEntry.path as string;

  let apiServerInstance: any;
  try {
    console.log(`Starting...`);
    apiServerInstance = await createApiServer(apiPort);
  } catch (error: unknown) {
    console.error('Failed to start API server:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error) console.error(error.stack);
    process.exit(1);
  }

  let isShuttingDown = false;

  // `agentmark dev` is a LOCAL development server: it serves prompts and datasets
  // from the API server it starts on `apiPort`. Keep the spawned dev server pointed
  // there (see ./dev-env) — a project with cloud creds in its env would otherwise
  // load *deployed* data from api.agentmark.co and silently bypass local files.
  const devServerEnv = buildDevServerEnv(process.env, apiPort);
  if (hasCloudCreds(process.env)) {
    console.log(
      'ℹ️  Detected AGENTMARK_API_KEY/APP_ID in your environment — running the dev server in ' +
      'local mode so it loads your local prompts/datasets, not deployed copies. ' +
      'Forwarding traces to cloud still works via `npx @agentmark-ai/cli dev` + `link` ' +
      '(disable with --no-forward).'
    );
  }

  let webhookServer: ChildProcess;

  if (projectLanguage === "python") {
    const pythonCommand = findPythonExecutable(cwd);

    webhookServer = spawn(pythonCommand, [
      devServerFile,
      `--webhook-port=${webhookPort}`,
      `--api-server-port=${apiPort}`
    ], {
      stdio: 'inherit',
      cwd,
      // sys.path + bytecode-cache fixes live in buildPythonDevEnv — see its doc.
      env: buildPythonDevEnv(devServerEnv, cwd),
    });
  } else {
    const tsxPath = path.join(require.resolve('tsx'), '../../dist/cli.mjs');
    const tsxArgs = useWatch
      ? [tsxPath, '--watch', devServerFile, 'agentmark.client.ts', 'agentmark/**/*', `--webhook-port=${webhookPort}`, `--api-server-port=${apiPort}`]
      : [tsxPath, devServerFile, `--webhook-port=${webhookPort}`, `--api-server-port=${apiPort}`];
    webhookServer = spawn(process.execPath, tsxArgs, {
      stdio: 'inherit',
      cwd,
      env: devServerEnv,
    });
  }

  webhookServer.on('error', (error) => {
    console.error('Failed to start webhook server:', error.message);
    if (apiServerInstance) {
      try { apiServerInstance.close(); } catch { /* ignore */ }
    }
    process.exit(1);
  });

  webhookServer.on('exit', (code) => {
    if (!isShuttingDown) {
      if (code === 0 || code === null) {
        console.log('\nWebhook server stopped');
      } else {
        console.error(`\n❌ Webhook server exited with error code ${code}`);
        console.error('Check the output above for error details');
      }
      if (apiServerInstance) {
        try { apiServerInstance.close(); } catch { /* ignore */ }
      }
      process.exit(code || 0);
    }
  });

  const nextCwd = path.join(__dirname, '..', '..');
  let actualAppPort = appPort;
  let uiServer: ReturnType<typeof spawn> | null = null;

  async function startAgentMarkServer() {
    while (!(await isPortFree(actualAppPort))) {
      console.warn(`Port ${actualAppPort} is busy, trying ${actualAppPort + 1}`);
      actualAppPort++;
    }

    setAppPort(actualAppPort);

    uiServer = spawn('npm', ['start', '--', '-p', `${actualAppPort}`], {
      stdio: 'pipe',
      cwd: nextCwd,
      shell: IS_WINDOWS,
      env: {
        ...process.env,
        NEXT_PUBLIC_AGENTMARK_API_PORT: String(apiPort)
      },
    });

    uiServer.stdout?.on('data', () => { /* silent */ });

    uiServer.stderr?.on('data', (data) => {
      console.error(`AgentMark UI error: ${data.toString()}`);
    });

    uiServer.on('exit', (code) => {
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

  if (useUi) {
    startAgentMarkServer();
  }

  let forwarder: TraceForwarder | null = null;
  let statusReporter: ForwardingStatusReporter | null = null;

  setTimeout(async () => {
    if (webhookServer.exitCode !== null) {
      console.error('\n❌ Webhook server failed to start');
      console.error('The API server is running, but the webhook server did not start successfully');
      return;
    }

    let forwardingStatus: 'active' | 'inactive' | 'disabled' | 'expired' = 'inactive';
    let forwardingAppName = '';
    let forwardingBaseUrl = '';

    if (useForwarding) {
      let forwardingConfig = loadForwardingConfig();

      if (!forwardingConfig) {
        await attemptAutoLink();
        forwardingConfig = loadForwardingConfig();
      }

      if (forwardingConfig && isKeyExpired(forwardingConfig)) {
        console.log('⚠️  Dev API key expired. Run `npx @agentmark-ai/cli link` to refresh.\n');
        forwardingStatus = 'expired';
      } else if (forwardingConfig?.expiresAt) {
        const expiryDate = new Date(forwardingConfig.expiresAt);
        const daysUntilExpiry = (expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);

        if (daysUntilExpiry < 7 && daysUntilExpiry > 0) {
          console.log('⚠️  Dev API key expires soon, attempting refresh...');
          const credentials = loadCredentials();
          if (credentials && forwardingConfig.apiKeyId) {
            try {
              const platformUrl = getPlatformUrl();
              const refreshUrl = `${platformUrl}/api/cli/dev-key/${forwardingConfig.apiKeyId}/refresh`;
              const response = await fetch(refreshUrl, {
                method: 'POST',
                headers: {
                  Authorization: `Bearer ${credentials.access_token}`,
                },
              });

              if (response.ok) {
                const newKeyData = await response.json() as { key: string; key_id: string; expires_at: string };
                saveForwardingConfig({
                  ...forwardingConfig,
                  apiKey: newKeyData.key,
                  apiKeyId: newKeyData.key_id,
                  expiresAt: newKeyData.expires_at,
                });
                forwardingConfig = loadForwardingConfig()!;
                console.log('✓ Dev API key refreshed\n');
              } else {
                console.log('⚠️  Failed to refresh key automatically. Run `npx @agentmark-ai/cli link` to refresh.\n');
              }
            } catch {
              console.log('⚠️  Failed to refresh key automatically. Run `npx @agentmark-ai/cli link` to refresh.\n');
            }
          }
        }
      }

      // Start the forwarder when we have an app binding. The forwarder
      // resolves auth itself: session bearer from `agentmark login`
      // (preferred) or the legacy `apiKey` if a pre-refactor link still
      // wrote one. Requiring `apiKey` here would block every project
      // linked by current `agentmark link`, which no longer mints a key.
      if (forwardingConfig?.baseUrl && forwardingConfig?.appId) {
        try {
          forwarder = new TraceForwarder(forwardingConfig);
          setForwarder(forwarder);

          statusReporter = new ForwardingStatusReporter(forwarder);

          forwardingStatus = 'active';
          forwardingAppName = forwardingConfig.appName || 'Unknown App';
          forwardingBaseUrl = forwardingConfig.baseUrl;

          // The forwarder buffers and retries quietly, so a dead endpoint
          // (a stale dev-config.json pointing at a stack that no longer
          // runs, e.g. leftover test data) otherwise LOOKS active while
          // every trace silently queues. Probe once at startup and say so.
          const probeUrl = forwardingConfig.baseUrl;
          probeForwardingEndpoint(probeUrl).then((reachable) => {
            if (!reachable) {
              console.warn(
                `\n⚠️  Trace forwarding is configured for ${probeUrl}, but that endpoint is not reachable.` +
                `\n   Traces will buffer locally and never arrive. If this config is stale (an old linked` +
                `\n   app or leftover test data in .agentmark/dev-config.json), re-run \`npx @agentmark-ai/cli link\`` +
                `\n   — or start with --no-forward.\n`
              );
            }
          });
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

    if (forwardingStatus === 'active') {
      console.log(`\n  Forwarding:    ✓ Active → ${forwardingAppName} (${forwardingBaseUrl})`);
    } else if (forwardingStatus === 'disabled') {
      console.log(`\n  Forwarding:    ○ Disabled (--no-forward)`);
    } else if (forwardingStatus === 'expired') {
      console.log(`\n  Forwarding:    ⚠️  Expired (run 'npx @agentmark-ai/cli link' to refresh)`);
    } else {
      console.log(`\n  Forwarding:    ○ Not linked (run 'npx @agentmark-ai/cli link')`);
    }

    console.log('\n' + '─'.repeat(70));
    console.log('How to run prompts and experiments:');
    console.log('─'.repeat(70));
    console.log('\n  Open a new terminal window and run:');
    console.log('\n  Run a prompt:');
    console.log('  $ npx @agentmark-ai/cli run-prompt ./agentmark/<your-prompt>.prompt.mdx');
    console.log('\n  Run an experiment:');
    console.log('  $ npx @agentmark-ai/cli run-experiment ./agentmark/<your-prompt>.prompt.mdx');

    console.log('\n' + '═'.repeat(70));
    console.log('Press Ctrl+C in this terminal to stop the servers');
    console.log('═'.repeat(70) + '\n');
  }, 3000);

  const cleanup = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log('\nShutting down servers...');

    if (statusReporter) {
      statusReporter.stop();
    }

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

    if (apiServerInstance) {
      try {
        console.log('  Stopping API server...');
        await new Promise<void>((resolve) => {
          apiServerInstance.closeAllConnections?.();
          apiServerInstance.close(() => {
            resolve();
          });
          setTimeout(resolve, 1000);
        });
      } catch (error) {
        console.error('  Error stopping API server:', error);
      }
    }

    if (webhookServer.pid) {
      console.log('  Stopping webhook server...');
      killProcessTree(webhookServer.pid);
    }

    if (uiServer && uiServer.pid) {
      console.log('  Stopping UI server...');
      killProcessTree(uiServer.pid);
    }

    console.log('Servers stopped.');

    setTimeout(() => {
      process.exit(0);
    }, 1000);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
};

export default dev;
