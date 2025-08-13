import path from "path";
import fs from "fs";
import type { Root } from "mdast";
import { resolveRunner } from "../utils/resolve-runner";

// For non-text/object types, print JSON result


const runPrompt = async (filepath: string) => {
  const resolvedFilepath = path.resolve(process.cwd(), filepath);
  
  if (!fs.existsSync(resolvedFilepath)) {
    throw new Error(`File not found: ${resolvedFilepath}`);
  }
  
  if (!resolvedFilepath.endsWith('.mdx')) {
    throw new Error('File must be an .mdx file');
  }

  const { load } = await import("@agentmark/templatedx");
  
  let ast: Root = await load(resolvedFilepath);
  const runner = await resolveRunner();

  try {
      console.log("Running prompt with test props...");
      // Prefer streaming when available for better UX
      const resp = await runner.runPrompt(ast as any, { shouldStream: true });
      // Ensure a visible header precedes results
      console.log("\n=== Text Prompt Results ===");
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
        const outDir = path.resolve(process.cwd(), 'agentmark-output');
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
        const outDir = path.resolve(process.cwd(), 'agentmark-output');
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
