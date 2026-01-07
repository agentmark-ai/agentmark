import path from "path";
import fs from "fs-extra";
import type { Root } from "mdast";
import { detectPromptTypeFromContent } from "../utils/prompt-detection.js";

function resolveAgainstCwdOrEnv(inputPath: string): string {
  if (path.isAbsolute(inputPath)) return inputPath;
  let base: string | undefined;
  try { base = process.cwd(); } catch { base = process.env.PWD; }
  if (!base) throw new Error('Invalid working directory. Provide an absolute path or set PWD.');
  return path.resolve(base, inputPath);
}

interface RunPromptOptions {
  props?: string;
  propsFile?: string;
  server?: string;
  saveOutput?: string;
}

/**
 * Loads an AST from either a pre-built JSON file or an MDX file.
 * @param resolvedFilepath - Absolute path to the file
 * @returns The AST and prompt name
 */
async function loadAst(resolvedFilepath: string): Promise<{ ast: Root; promptName?: string }> {
  if (resolvedFilepath.endsWith('.json')) {
    // Load pre-built AST from JSON file
    const content = fs.readFileSync(resolvedFilepath, 'utf-8');
    const built = JSON.parse(content);

    if (!built.ast) {
      throw new Error('Invalid pre-built prompt file: missing "ast" field');
    }

    return {
      ast: built.ast as Root,
      promptName: built.metadata?.name
    };
  } else if (resolvedFilepath.endsWith('.mdx')) {
    // Parse MDX file using prompt-core's TemplateDX instances (which have tags registered)
    const { getTemplateDXInstance } = await import("@agentmark-ai/prompt-core");

    // Read content to detect prompt type
    const content = fs.readFileSync(resolvedFilepath, 'utf-8');
    const parserType = detectPromptTypeFromContent(content);

    // Get the appropriate TemplateDX instance with AgentMark tags registered
    const templateDX = getTemplateDXInstance(parserType);

    // Create content loader for resolving imports
    const baseDir = path.dirname(resolvedFilepath);
    const contentLoader = async (filePath: string) => {
      const { readFile } = await import('fs/promises');
      const resolvedPath = path.resolve(baseDir, filePath);
      return readFile(resolvedPath, 'utf-8');
    };

    // Parse the MDX content
    const ast: Root = await templateDX.parse(content, baseDir, contentLoader);
    const frontmatter = templateDX.getFrontMatter(ast) as { name?: string };

    return {
      ast,
      promptName: frontmatter.name
    };
  } else {
    throw new Error('File must be an .mdx or .json file');
  }
}

const runPrompt = async (filepath: string, options: RunPromptOptions = {}) => {
  const resolvedFilepath = resolveAgainstCwdOrEnv(filepath);

  if (!fs.existsSync(resolvedFilepath)) {
    throw new Error(`File not found: ${resolvedFilepath}`);
  }

  if (!resolvedFilepath.endsWith('.mdx') && !resolvedFilepath.endsWith('.json')) {
    throw new Error('File must be an .mdx or .json file');
  }

  // Parse props from CLI or file
  let customProps: Record<string, any> | undefined;
  if (options.propsFile) {
    const propsFilePath = resolveAgainstCwdOrEnv(options.propsFile);
    if (!fs.existsSync(propsFilePath)) {
      throw new Error(`Props file not found: ${propsFilePath}`);
    }
    const content = fs.readFileSync(propsFilePath, 'utf-8');
    if (propsFilePath.endsWith('.json')) {
      customProps = JSON.parse(content);
    } else if (propsFilePath.endsWith('.yaml') || propsFilePath.endsWith('.yml')) {
      const { parse: parseYaml } = await import('yaml');
      customProps = parseYaml(content);
    } else {
      throw new Error('Props file must be .json, .yaml, or .yml');
    }
  } else if (options.props) {
    try {
      customProps = JSON.parse(options.props);
    } catch (_e) {
      throw new Error('Invalid JSON in --props argument');
    }
  }

  // Load webhook secret BEFORE changing directory
  // (so we get it from the project root, not the prompt directory)
  let webhookSecret = process.env.AGENTMARK_WEBHOOK_SECRET;
  if (!webhookSecret) {
    try {
      const { loadLocalConfig } = await import('../config.js');
      const config = loadLocalConfig();
      if (config && config.webhookSecret) {
        webhookSecret = config.webhookSecret;
      }
    } catch {
      // No config file, continue without signature
    }
  }

  // If current cwd is invalid, switch to the prompt's directory to stabilize deps that use process.cwd()
  try { process.chdir(path.dirname(resolvedFilepath)); } catch {
    // Ignore errors when changing directory
  }

  // Load AST from MDX or pre-built JSON file
  const { ast, promptName } = await loadAst(resolvedFilepath);

  // Determine prompt kind from frontmatter for better headers (Text/Object/Image/Speech)
  let promptHeader: 'Text' | 'Object' | 'Image' | 'Speech' = 'Text';
  try {
    const yamlNode = (ast as any)?.children?.find((n: any) => n?.type === 'yaml');
    if (yamlNode && typeof yamlNode.value === 'string') {
      const { parse: parseYaml } = await import('yaml');
      const fm = parseYaml(yamlNode.value) || {};
      if (fm.object_config) promptHeader = 'Object';
      else if (fm.image_config) promptHeader = 'Image';
      else if (fm.speech_config) promptHeader = 'Speech';
      else promptHeader = 'Text';
    }
  } catch {
    // Ignore errors when parsing frontmatter
  }
  // Ensure server resolves resources relative to the prompt file if it needs it in the AST
  try { process.env.AGENTMARK_ROOT = path.dirname(resolvedFilepath); } catch {
    // Ignore errors when setting environment variable
  }
  const server = options.server || process.env.AGENTMARK_WEBHOOK_URL || 'http://localhost:9417';
  if (!server || !/^https?:\/\//i.test(server)) {
    throw new Error('Server URL is required. Run your runner (e.g., npm run dev) and set --server if needed.');
  }

  try {
      console.log(customProps ? "Running prompt with custom props..." : "Running prompt with test props...");
      // Prefer streaming when available for better UX
      const body = JSON.stringify({ type: 'prompt-run', data: { ast, customProps, promptPath: promptName, options: { shouldStream: true } } });

      // Add webhook signature if secret is available
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };

      if (webhookSecret) {
        const { createSignature } = await import('@agentmark-ai/shared-utils');
        const signature = await createSignature(webhookSecret, body);
        headers['x-agentmark-signature-256'] = signature;
      }

      let res;
      try {
        res = await fetch(server, { method: 'POST', headers, body });
      } catch (fetchError: any) {
        // Network-level errors (server not running, connection refused, etc.)
        const isConnectionError =
          fetchError.message?.includes('ECONNREFUSED') ||
          fetchError.message?.includes('fetch failed') ||
          fetchError.cause?.code === 'ECONNREFUSED';

        if (isConnectionError) {
          throw new Error(
            `❌ Could not connect to AgentMark server at ${server}\n\n` +
            `The server is not running or not reachable.\n\n` +
            `To start the server, run:\n` +
            `  agentmark dev\n\n` +
            `Or specify a different server URL with:\n` +
            `  agentmark run-prompt <filepath> --server <url>`
          );
        }
        // Re-throw other network errors with context
        throw new Error(`Network error connecting to ${server}: ${fetchError.message}`);
      }

      if (!res.ok) {
        let raw = '';
        try { raw = await res.text(); } catch {
          // Ignore errors when reading response text
        }
        let parsed: any = null;
        try { parsed = JSON.parse(raw); } catch {
          // Ignore errors when parsing JSON
        }
        const ct = res.headers.get('content-type') || '';
        const statusLine = `${res.status}${res.statusText ? ' ' + res.statusText : ''}`;
        const errMsg = parsed?.error || parsed?.message || raw?.slice?.(0, 2000) || 'Unknown error';
        const details = `HTTP ${statusLine} — Content-Type: ${ct}`;
        const msg = `Runner request failed. ${details}\nURL: ${server}\nBody: ${errMsg}`;
        console.error(msg);
        throw new Error(msg);
      }
      const isStreaming = !!res.headers.get('AgentMark-Streaming');
      const resp = isStreaming ? { type: 'stream', stream: res.body! } : await res.json();
      // Ensure a visible header precedes results; for streams use prompt frontmatter, else fallback to response type
      const respType = (resp as any)?.type;
      const nonStreamHeader = respType === 'object' ? 'Object' : respType === 'image' ? 'Image' : respType === 'speech' ? 'Speech' : 'Text';
      const header = isStreaming ? promptHeader : nonStreamHeader;
      console.log(`\n=== ${header} Prompt Results ===`);
      if ((resp as any).type === 'stream') {
        const reader = (resp as any).stream.getReader();
        const decoder = new TextDecoder();
        let buffered = '';
        // Object streaming rendering state
        let lastObjectRenderLineCount = 0;
        let finalObjectString: string | undefined;
        let hasSeenToolResult = false;
        let hasPrintedFinalHeader = false;
        let usageInfo: any = null;
        let streamTraceId: string | undefined;
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffered += decoder.decode(value, { stream: true });
          let idx;
          while ((idx = buffered.indexOf("\n")) !== -1) {
            const line = buffered.slice(0, idx);
            buffered = buffered.slice(idx + 1);
            try {
              const evt = JSON.parse(line);
              if (evt.type === 'text' && typeof evt.result === 'string') {
                // Print separator before the first text after tool results
                if (hasSeenToolResult && !hasPrintedFinalHeader) {
                  process.stdout.write('\n📝 ');
                  hasPrintedFinalHeader = true;
                }
                process.stdout.write(evt.result);
              }
              if (evt.type === 'text' && evt.toolCall) {
                const tc = evt.toolCall;
                const argsStr = JSON.stringify(tc.args);
                process.stdout.write(`\n\n🔧→ ${tc.toolName}(${argsStr})\n`);
              }
              if (evt.type === 'text' && evt.toolResult) {
                const tr = evt.toolResult;
                const resultStr = JSON.stringify(tr.result);
                process.stdout.write(`🔧← ${resultStr}\n`);
                hasSeenToolResult = true;
              }
              if (evt.type === 'text' && evt.usage) {
                usageInfo = evt.usage;
              }
              if (evt.type === 'object' && evt.usage) {
                usageInfo = evt.usage;
              }
              if (evt.type === 'object' && evt.result) {
                const next = JSON.stringify(evt.result, null, 2);
                // Clear previously rendered object lines (if any), move cursor up, then render new object
                if (lastObjectRenderLineCount > 0) {
                  for (let i = 0; i < lastObjectRenderLineCount; i++) {
                    process.stdout.write('\x1b[1A'); // cursor up
                    process.stdout.write('\x1b[2K'); // clear line
                  }
                }
                process.stdout.write(next + '\n');
                lastObjectRenderLineCount = next.split('\n').length;
                finalObjectString = next;
              }
              if (evt.type === 'error' && evt.error) {
                const errorMsg = typeof evt.error === 'string'
                  ? evt.error
                  : (evt.error.message || JSON.stringify(evt.error, null, 2));
                console.error(`❌ ${errorMsg}`);
              }
              if (evt.type === 'done' && evt.traceId) streamTraceId = evt.traceId;
            } catch {
              // Ignore errors when parsing stream events
            }
          }
        }
        // Ensure final object is printed once (replacing the live-updated one)
        if (finalObjectString && lastObjectRenderLineCount > 0) {
          for (let i = 0; i < lastObjectRenderLineCount; i++) {
            process.stdout.write('\x1b[1A');
            process.stdout.write('\x1b[2K');
          }
          console.log(finalObjectString);
        }

        // Display token usage if available
        if (usageInfo) {
          const promptTokens = usageInfo.promptTokens || 0;
          const completionTokens = usageInfo.completionTokens || 0;
          const totalTokens = usageInfo.totalTokens || (promptTokens + completionTokens);
          console.log('\n' + '─'.repeat(60));
          console.log(`🪙 ${promptTokens.toLocaleString()} in, ${completionTokens.toLocaleString()} out, ${totalTokens.toLocaleString()} total`);
          console.log('─'.repeat(60));
        }
        // Display trace link (only for text or object prompts)
        if (streamTraceId && (promptHeader === 'Text' || promptHeader === 'Object')) {
          const { getAppPort } = await import('../config.js');
          const appPort = getAppPort();
          console.log(`\n📊 View trace: http://localhost:${appPort}/traces?traceId=${streamTraceId}`);
        }
        console.log('');
      } else {
        // Non-streaming responses
        if ((resp as any).type === 'text') {
          console.log(String((resp as any).result ?? '(no content)'));
        } else if ((resp as any).type === 'object') {
          console.log(JSON.stringify((resp as any).result, null, 2));
        } else if ((resp as any).type === 'image') {
          const outputs = (resp as any).result as Array<{ mimeType: string; base64: string }>;
          const outDir = path.join(process.cwd(), '.agentmark-outputs');
          fs.ensureDirSync(outDir);
          const saved: string[] = [];
          const timestamp = Date.now();
          outputs.forEach((img, idx) => {
            const ext = img.mimeType?.split('/')[1] || 'png';
            const filePath = path.join(outDir, `image-${idx + 1}-${timestamp}.${ext}`);
            fs.writeFileSync(filePath, Buffer.from(img.base64, 'base64'));
            saved.push(filePath);
          });
          console.log(saved.length ? `Saved ${saved.length} image(s) to:\n- ${saved.join('\n- ')}` : '(no content)');
        } else if ((resp as any).type === 'speech') {
          const audio = (resp as any).result as { mimeType?: string; base64: string; format?: string };
          const outDir = path.join(process.cwd(), '.agentmark-outputs');
          fs.ensureDirSync(outDir);
          const timestamp = Date.now();
          const ext = audio.format || (audio.mimeType?.split('/')[1] || 'mp3');
          const filePath = path.join(outDir, `audio-${timestamp}.${ext}`);
          fs.writeFileSync(filePath, Buffer.from(audio.base64, 'base64'));
          console.log(`Saved audio to: ${filePath}`);
        } else {
          console.log('(no content)');
        }

        // Display token usage for non-streaming responses
        const usage = (resp as any).usage;
        if (usage) {
          const promptTokens = usage.promptTokens || 0;
          const completionTokens = usage.completionTokens || 0;
          const totalTokens = usage.totalTokens || (promptTokens + completionTokens);
          console.log('\n' + '─'.repeat(60));
          console.log(`🪙 ${promptTokens.toLocaleString()} in, ${completionTokens.toLocaleString()} out, ${totalTokens.toLocaleString()} total`);
          console.log('─'.repeat(60));
        }
        // Display trace link (only for text or object prompts)
        if ((resp as any).traceId && (promptHeader === 'Text' || promptHeader === 'Object')) {
          const { getAppPort } = await import('../config.js');
          const appPort = getAppPort();
          console.log(`\n📊 View trace: http://localhost:${appPort}/traces?traceId=${(resp as any).traceId}`);
        }
        console.log('');
      }
  } catch (error: any) {
    throw new Error(`Error running prompt: ${error.message}`);
  }
};

export default runPrompt;
