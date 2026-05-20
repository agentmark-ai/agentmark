#!/usr/bin/env tsx
/**
 * Extracts canonical chat/object-capable model IDs from the model-registry
 * and writes a deterministic markdown reference at
 * ../../../skills/agentmark/reference/models.md
 *
 * Source files (in priority order):
 *   - overrides.json    (hand-curated entries; authoritative for local models)
 *   - models.json       (litellm + openrouter mirror; 1300+ entries)
 *   - provider-labels.json (provider→display name)
 *
 * The full registry is too large to dump. We pick the chat-mode models for
 * the major providers users actually target. For everything else, agents
 * should run `npx agentmark pull-models` or fetch
 * https://docs.agentmark.co/configure/client-config.md.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const HERE = dirname(new URL(import.meta.url).pathname);
const REGISTRY_DIR = resolve(HERE, '../../model-registry');
const OUTPUT_PATH = resolve(HERE, '../../../skills/agentmark/reference/models.md');

const FEATURED_PROVIDERS = [
  'openai',
  'anthropic',
  'google',
  'vertex_ai',
  'xai',
  'groq',
  'mistral',
  'cohere',
  'deepseek',
  'bedrock',
  'ollama',
];

interface Model {
  id: string;
  provider: string;
  displayName?: string;
  mode?: string;
  source?: string;
}

function load(): { models: Model[]; labels: Record<string, string> } {
  const main = JSON.parse(readFileSync(`${REGISTRY_DIR}/models.json`, 'utf8')) as {
    models: Record<string, Omit<Model, 'id'>>;
  };
  const overrides = JSON.parse(readFileSync(`${REGISTRY_DIR}/overrides.json`, 'utf8')) as {
    models: Record<string, Omit<Model, 'id'>>;
  };
  const labels = JSON.parse(readFileSync(`${REGISTRY_DIR}/provider-labels.json`, 'utf8')) as Record<string, string>;
  const out: Model[] = [];
  for (const [id, m] of Object.entries(main.models)) out.push({ id, ...m });
  // Overrides win on duplicate id
  for (const [id, m] of Object.entries(overrides.models)) {
    const i = out.findIndex(x => x.id === id);
    if (i >= 0) out[i] = { id, ...m };
    else out.push({ id, ...m });
  }
  return { models: out, labels };
}

function formatMarkdown(models: Model[], labels: Record<string, string>): string {
  const lines: string[] = [];
  lines.push('<!--');
  lines.push('  Auto-generated from oss/agentmark/packages/model-registry/{models,overrides,provider-labels}.json.');
  lines.push('  Do not hand-edit. Run `yarn generate-skill-models-reference` to regenerate.');
  lines.push('-->');
  lines.push('');
  lines.push('# AgentMark model registry — canonical IDs');
  lines.push('');
  lines.push('> Generated from `@agentmark-ai/model-registry`. The full registry has 1000+ entries from litellm + openrouter mirrors; this file lists chat-mode models for the providers users most often target. For the full list, run `npx agentmark pull-models` or fetch [`configure/client-config.md`](https://docs.agentmark.co/configure/client-config.md).');
  lines.push('');
  lines.push('Use one of these IDs as `model_name` inside `text_config` / `object_config` (or `image_config` / `speech_config` for the matching modes — those have their own ID space; see the registry for full coverage).');
  lines.push('');

  const chatModels = models.filter(m => m.mode === 'chat' || m.mode === undefined);

  // Drop fine-tuned variants (`ft:*`) and date-stamped duplicates when a
  // non-dated equivalent exists. Keeps the reference compact enough for
  // an agent to scan without burning tokens.
  function compact(list: Model[]): Model[] {
    const filtered = list.filter(m => !m.id.startsWith('ft:'));
    const datePattern = /-\d{8}$/;
    const canonicalIds = new Set(filtered.filter(m => !datePattern.test(m.id)).map(m => m.id));
    return filtered.filter(m => {
      if (!datePattern.test(m.id)) return true;
      const base = m.id.replace(datePattern, '');
      // Keep the date-stamped variant only if no undated form exists.
      return !canonicalIds.has(base) && !canonicalIds.has(`${base}-latest`);
    });
  }

  for (const provider of FEATURED_PROVIDERS) {
    const raw = chatModels.filter(m => m.provider === provider);
    if (raw.length === 0) continue;
    // Codepoint-based sort (not localeCompare) so output is identical across
    // macOS and Linux CI runners. localeCompare honors the runtime locale.
    const list = compact(raw).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (list.length === 0) continue;
    const label = labels[provider] ?? provider;
    lines.push(`## ${label} (\`${provider}\`)`);
    lines.push('');
    const droppedNote = raw.length > list.length
      ? ` (${raw.length - list.length} fine-tuned / date-stamped duplicate${raw.length - list.length === 1 ? '' : 's'} filtered out)`
      : '';
    lines.push(`${list.length} canonical chat-mode model${list.length === 1 ? '' : 's'}${droppedNote}.`);
    lines.push('');
    lines.push('```');
    for (const m of list) lines.push(m.id);
    lines.push('```');
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const { models, labels } = load();
  if (models.length === 0) {
    console.error('No models loaded from registry.');
    process.exit(1);
  }
  const md = formatMarkdown(models, labels);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, md);
  console.log(`Wrote ${models.length} models to ${OUTPUT_PATH}`);
}

main();
