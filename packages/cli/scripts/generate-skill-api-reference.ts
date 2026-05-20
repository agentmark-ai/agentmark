#!/usr/bin/env tsx
/**
 * Extracts the gateway API surface from `cli-src/server/openapi-spec.json`
 * and writes a deterministic markdown reference at
 * ../../../skills/agentmark/reference/api-commands.md
 *
 * specli converts OpenAPI tags to resource slugs (kebab-case, lowercase)
 * and uses operationIds as action names directly. This generator mirrors
 * that mapping so the skill examples never drift from what `npx agentmark
 * api <resource> <action>` actually accepts.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const HERE = dirname(new URL(import.meta.url).pathname);
const SPEC_PATH = resolve(HERE, '../cli-src/server/openapi-spec.json');
const OUTPUT_PATH = resolve(HERE, '../../../skills/agentmark/reference/api-commands.md');

interface ParamSpec {
  name: string;
  in: 'path' | 'query' | 'header';
  required?: boolean;
  description?: string;
}
interface Op {
  method: string;
  path: string;
  operationId: string;
  summary?: string;
  params: ParamSpec[];
}

function tagToSlug(tag: string): string {
  return tag
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function loadSpec(): { byResource: Map<string, Op[]> } {
  const spec = JSON.parse(readFileSync(SPEC_PATH, 'utf8')) as Record<string, unknown>;
  const paths = spec.paths as Record<string, Record<string, unknown>>;
  const byResource = new Map<string, Op[]>();

  for (const [pathStr, methods] of Object.entries(paths)) {
    for (const [method, opRaw] of Object.entries(methods)) {
      if (method.startsWith('x-') || method === 'parameters') continue;
      const op = opRaw as {
        operationId?: string;
        summary?: string;
        tags?: string[];
        parameters?: ParamSpec[];
      };
      if (!op || typeof op !== 'object' || !op.operationId) continue;
      const tag = op.tags?.[0] ?? 'untagged';
      const slug = tagToSlug(tag);
      const params = (op.parameters ?? []).filter(p => p.in === 'path' || p.in === 'query');
      const opObj: Op = {
        method: method.toUpperCase(),
        path: pathStr,
        operationId: op.operationId,
        summary: op.summary,
        params,
      };
      if (!byResource.has(slug)) byResource.set(slug, []);
      byResource.get(slug)!.push(opObj);
    }
  }

  // Stable ordering: alphabetical resource, alphabetical action
  for (const ops of byResource.values()) {
    // Codepoint-based sort (not localeCompare) so output is identical across
    // macOS and Linux CI runners. localeCompare honors the runtime locale.
    ops.sort((a, b) => (a.operationId < b.operationId ? -1 : a.operationId > b.operationId ? 1 : 0));
  }
  return { byResource };
}

function formatMarkdown(byResource: Map<string, Op[]>): string {
  const lines: string[] = [];
  lines.push('<!--');
  lines.push('  Auto-generated from oss/agentmark/packages/cli/cli-src/server/openapi-spec.json.');
  lines.push('  Do not hand-edit. Run `yarn generate-skill-api-reference` to regenerate.');
  lines.push('-->');
  lines.push('');
  lines.push('# AgentMark gateway API — `npx agentmark api` reference');
  lines.push('');
  lines.push('> Auto-generated from the OpenAPI spec. `npx agentmark api` is a specli wrapper — resource names are tag slugs (kebab-case), action names mirror `operationId` directly. **Always prefer `npx agentmark api <resource> --help`** for the live shape (cached for 24h; pass `--refresh` to invalidate).');
  lines.push('');
  lines.push('Add `--remote` to any command to target AgentMark Cloud instead of the local dev server (requires `agentmark login` + `agentmark link`).');
  lines.push('');
  lines.push('## Resources');
  lines.push('');
  const resources = [...byResource.keys()].sort();
  for (const r of resources) {
    lines.push(`- [\`${r}\`](#${r}) — ${byResource.get(r)!.length} action(s)`);
  }
  lines.push('');

  for (const r of resources) {
    lines.push('---');
    lines.push('');
    lines.push(`## \`${r}\``);
    lines.push('');
    lines.push('| Command | HTTP | Path | Summary |');
    lines.push('|---|---|---|---|');
    for (const op of byResource.get(r)!) {
      const cmd = '`npx agentmark api ' + r + ' ' + op.operationId + '`';
      const summary = (op.summary ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(`| ${cmd} | ${op.method} | \`${op.path}\` | ${summary} |`);
    }
    lines.push('');

    // Inline shape per op
    for (const op of byResource.get(r)!) {
      const pathParams = op.params.filter(p => p.in === 'path');
      const queryParams = op.params.filter(p => p.in === 'query');
      lines.push(`### \`${r} ${op.operationId}\``);
      lines.push('');
      if (op.summary) {
        lines.push(op.summary);
        lines.push('');
      }
      const positional = pathParams.map(p => `<${p.name}>`).join(' ');
      const usage = `npx agentmark api ${r} ${op.operationId}${positional ? ' ' + positional : ''} [--remote] [--refresh]`;
      lines.push('```bash');
      lines.push(usage);
      lines.push('```');
      lines.push('');
      if (pathParams.length > 0 || queryParams.length > 0) {
        lines.push('| Param | Where | Required? | Notes |');
        lines.push('|---|---|---|---|');
        for (const p of [...pathParams, ...queryParams]) {
          const safeDesc = (p.description ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
          lines.push(`| \`${p.name}\` | ${p.in} | ${p.required ? '✓' : ''} | ${safeDesc} |`);
        }
        lines.push('');
      }
    }
  }

  return lines.join('\n');
}

function main() {
  const { byResource } = loadSpec();
  if (byResource.size === 0) {
    console.error('No operations extracted from openapi-spec.json.');
    process.exit(1);
  }
  const md = formatMarkdown(byResource);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, md);
  const opCount = [...byResource.values()].reduce((n, ops) => n + ops.length, 0);
  console.log(`Wrote ${byResource.size} resources / ${opCount} operations to ${OUTPUT_PATH}`);
}

main();
