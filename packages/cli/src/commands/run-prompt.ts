import path from "path";
import fs from "fs";
import type { Root } from "mdast";
// HTTP-only: talk to server specified by AGENTMARK_SERVER

// For non-text/object types, print JSON result


function resolveAgainstCwdOrEnv(inputPath: string): string {
  if (path.isAbsolute(inputPath)) return inputPath;
  let base: string | undefined;
  try { base = process.cwd(); } catch { base = process.env.PWD; }
  if (!base) throw new Error('Invalid working directory. Provide an absolute path or set PWD.');
  return path.resolve(base, inputPath);
}

const runPrompt = async (filepath: string) => {
  const resolvedFilepath = resolveAgainstCwdOrEnv(filepath);
  
  if (!fs.existsSync(resolvedFilepath)) {
    throw new Error(`File not found: ${resolvedFilepath}`);
  }
  
  if (!resolvedFilepath.endsWith('.mdx')) {
    throw new Error('File must be an .mdx file');
  }

  const { load } = await import("@agentmark/templatedx");
  // If current cwd is invalid, switch to the prompt's directory to stabilize deps that use process.cwd()
  try { process.chdir(path.dirname(resolvedFilepath)); } catch {}
  
  let ast: Root = await load(resolvedFilepath);
  // Ensure server resolves resources relative to the prompt file if it needs it in the AST
  try { process.env.AGENTMARK_ROOT = path.dirname(resolvedFilepath); } catch {}
  const server = process.env.AGENTMARK_SERVER || 'http://localhost:9417';
  if (!server || !/^https?:\/\//i.test(server)) {
    throw new Error('AGENTMARK_SERVER is required. Run your runner (e.g., npm run serve) and set --server or AGENTMARK_SERVER.');
  }

  try {
      console.log("Running prompt with test props...");
      // Prefer streaming when available for better UX
      const body = JSON.stringify({ type: 'prompt-run', data: { ast, options: { shouldStream: true } } });
      const url = `${server.replace(/\/$/, '')}/v1/run`;
      if (process.env.AGENTMARK_DEBUG) {
        console.error(`[agentmark debug] POST ${url}`);
      }
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body });
      if (!res.ok) {
        let raw = '';
        try { raw = await res.text(); } catch {}
        let parsed: any = null;
        try { parsed = JSON.parse(raw); } catch {}
        const ct = res.headers.get('content-type') || '';
        const statusLine = `${res.status}${res.statusText ? ' ' + res.statusText : ''}`;
        const errMsg = parsed?.error || parsed?.message || raw?.slice?.(0, 2000) || 'Unknown error';
        const details = `HTTP ${statusLine} — Content-Type: ${ct}`;
        const msg = `Runner request failed. ${details}\nURL: ${url}\nBody: ${errMsg}`;
        console.error(msg);
        if (process.env.AGENTMARK_DEBUG) {
          console.error(`[agentmark debug] Response headers: ${JSON.stringify(Object.fromEntries(res.headers.entries()))}`);
        }
        throw new Error(msg);
      }
      const isStreaming = !!res.headers.get('AgentMark-Streaming');
      const resp = isStreaming ? { type: 'stream', stream: res.body! } : await res.json();
      // Ensure a visible header precedes results; determine by response type
      const respType = (resp as any)?.type;
      const header = respType === 'object' ? 'Object' : respType === 'image' ? 'Image' : respType === 'speech' ? 'Speech' : 'Text';
      console.log(`\n=== ${header} Prompt Results ===`);
      if ((resp as any).type === 'stream') {
        const reader = (resp as any).stream.getReader();
        const decoder = new TextDecoder();
        let buffered = '';
        // Object streaming rendering state
        let lastObjectRenderLineCount = 0;
        let finalObjectString: string | undefined;
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
              if (evt.type === 'text' && typeof evt.result === 'string') process.stdout.write(evt.result);
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
              if (evt.type === 'error' && evt.error) console.error(`❌ ${evt.error}`);
            } catch {}
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
        console.log('\n');
      } else if ((resp as any).type === 'text') {
        console.log(String((resp as any).result ?? '(no content)'));
      } else if ((resp as any).type === 'object') {
        console.log(JSON.stringify((resp as any).result, null, 2));
      } else if ((resp as any).type === 'image') {
        const outputs = (resp as any).result as Array<{ mimeType: string; base64: string }>;
        const outDir = path.resolve(path.dirname(resolvedFilepath), 'agentmark-output');
        try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
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
        const outDir = path.resolve(path.dirname(resolvedFilepath), 'agentmark-output');
        try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
        const timestamp = Date.now();
        const ext = audio.format || (audio.mimeType?.split('/')[1] || 'mp3');
        const filePath = path.join(outDir, `audio-${timestamp}.${ext}`);
        fs.writeFileSync(filePath, Buffer.from(audio.base64, 'base64'));
        console.log(`Saved audio to: ${filePath}`);
      } else {
        console.log('(no content)');
      }
  } catch (error: any) {
    throw new Error(`Error running prompt: ${error.message}`);
  }
};

export default runPrompt;
