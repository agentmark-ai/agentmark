import path from "path";
import fs from "fs";
import { pathToFileURL } from "url";

export const resolveRunner = async () => {
  const cwd = process.cwd();
  const provided = process.env.AGENTMARK_RUNNER;
  const baseCandidates = [
    provided,
    "agentmark.runner.ts",
    "agentmark.runner.mts",
    "agentmark.runner.mjs",
    "agentmark.runner.js",
    "agentmark.runner.cjs",
  ].filter(Boolean) as string[];

  // Expand to absolute paths and filter to existing files
  const candidates: string[] = [];
  for (const c of baseCandidates) {
    const abs = path.isAbsolute(c) ? c : path.resolve(cwd, c);
    if (fs.existsSync(abs)) candidates.push(abs);
  }

  for (const filePath of candidates) {
    const lower = filePath.toLowerCase();
    // Prefer native ESM import for .mjs/.mts
    if (lower.endsWith(".mjs") || lower.endsWith(".mts")) {
      try {
        const mod = await import(pathToFileURL(filePath).href);
        if ((mod as any)?.runner) return (mod as any).runner;
      } catch {}
    }
    // Try jiti for TS/JS/CJS seamlessly
    try {
      const jitiFactory = await import('jiti').then((m) => (m as any).default || (m as any));
      const j = jitiFactory(__filename, { interopDefault: true, esmResolve: true });
      const mod = j(filePath);
      if (mod?.runner) return mod.runner;
      if (mod?.default?.runner) return mod.default.runner;
    } catch {}
    // Fallback to dynamic import with file URL
    try {
      const mod = await import(pathToFileURL(filePath).href);
      if ((mod as any)?.runner) return (mod as any).runner;
    } catch {}
  }

  throw new Error('Unable to resolve AgentMark runner. Provide --runner or AGENTMARK_RUNNER, or create agentmark.runner.ts');
};
