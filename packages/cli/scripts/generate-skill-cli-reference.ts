#!/usr/bin/env tsx
/**
 * Extracts CLI command definitions from cli-src/index.ts and writes
 * a deterministic markdown reference at
 * ../../../skills/agentmark/reference/cli-commands.md
 *
 * Run on every CLI release. Do not hand-edit the output.
 */

import * as ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

const HERE = dirname(new URL(import.meta.url).pathname);
const SOURCE_PATH = resolve(HERE, '../cli-src/index.ts');
const OUTPUT_PATH = resolve(HERE, '../../../skills/agentmark/reference/cli-commands.md');

interface Option {
  flag: string;
  description: string;
}

interface Command {
  name: string;
  args: string;
  description: string;
  options: Option[];
}

function extractCommands(sourceFile: ts.SourceFile): Command[] {
  const commands: Command[] = [];

  function visit(node: ts.Node) {
    // Look for the start of a chain: program.command("name [args]")
    if (
      ts.isCallExpression(node) &&
      ts.isPropertyAccessExpression(node.expression) &&
      node.expression.name.text === 'command' &&
      ts.isIdentifier(node.expression.expression) &&
      node.expression.expression.text === 'program'
    ) {
      const arg0 = node.arguments[0];
      if (!arg0 || !ts.isStringLiteral(arg0)) return;
      const raw = arg0.text.trim();
      const spaceIdx = raw.indexOf(' ');
      const name = spaceIdx === -1 ? raw : raw.slice(0, spaceIdx);
      const args = spaceIdx === -1 ? '' : raw.slice(spaceIdx + 1);

      const cmd: Command = { name, args, description: '', options: [] };

      // Walk up the chain by following parent pointers through the
      // chained PropertyAccess + CallExpression pairs.
      let cursor: ts.Node = node;
      while (
        cursor.parent &&
        ts.isPropertyAccessExpression(cursor.parent) &&
        cursor.parent.parent &&
        ts.isCallExpression(cursor.parent.parent)
      ) {
        const methodName = cursor.parent.name.text;
        const callExpr = cursor.parent.parent;
        const callArgs = callExpr.arguments;

        if (methodName === 'description' && callArgs[0] && ts.isStringLiteral(callArgs[0])) {
          cmd.description = callArgs[0].text;
        } else if (methodName === 'option' && callArgs[0] && ts.isStringLiteral(callArgs[0])) {
          const flag = callArgs[0].text;
          const desc = callArgs[1] && ts.isStringLiteral(callArgs[1]) ? callArgs[1].text : '';
          cmd.options.push({ flag, description: desc });
        }

        cursor = callExpr;
      }

      commands.push(cmd);
      return;
    }
    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return commands;
}

/**
 * Markdown table cells use `|` as a column separator. Backslashes must be
 * escaped first, otherwise `\|` in the source would render as a literal
 * `\|` rather than an escaped pipe. CodeQL `js/incomplete-sanitization`
 * flags any pipe-escape that doesn't precede with a backslash-escape.
 */
function escapeTableCell(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

function formatMarkdown(commands: Command[], cliVersion: string): string {
  const lines: string[] = [];
  lines.push('<!--');
  lines.push('  Auto-generated from oss/agentmark/packages/cli/cli-src/index.ts.');
  lines.push('  Do not hand-edit. Run `yarn generate-skill-cli-reference` to regenerate.');
  lines.push('-->');
  lines.push('');
  lines.push('# AgentMark CLI commands');
  lines.push('');
  lines.push(`> Reference for \`@agentmark-ai/cli@${cliVersion}\`. Always prefer \`npx agentmark <cmd> --help\` for the most current flag set.`);
  lines.push('');
  lines.push('## Command index');
  lines.push('');
  for (const cmd of commands) {
    const anchor = cmd.name.replace(/[^a-z0-9]/gi, '-').toLowerCase();
    lines.push(`- [\`agentmark ${cmd.name}\`](#agentmark-${anchor}) — ${cmd.description || '(no description)'}`);
  }
  lines.push('');

  for (const cmd of commands) {
    lines.push('---');
    lines.push('');
    lines.push(`## \`agentmark ${cmd.name}\``);
    lines.push('');
    if (cmd.description) {
      lines.push(cmd.description);
      lines.push('');
    }
    const usage = cmd.args
      ? `npx agentmark ${cmd.name} ${cmd.args} [options]`
      : `npx agentmark ${cmd.name} [options]`;
    lines.push('```bash');
    lines.push(usage);
    lines.push('```');
    lines.push('');

    if (cmd.options.length > 0) {
      lines.push('| Flag | Description |');
      lines.push('|---|---|');
      for (const opt of cmd.options) {
        lines.push(`| \`${opt.flag}\` | ${escapeTableCell(opt.description)} |`);
      }
      lines.push('');
    }
  }

  lines.push('---');
  lines.push('');
  lines.push('## Headless programmatic access');
  lines.push('');
  lines.push('The CLI is intentionally narrow. For programmatic access to the full AgentMark Cloud API surface (apps, deployments, alerts, datasets, experiments, scores, traces, …), run the `agentmark-mcp` MCP server alongside your IDE agent, or call the gateway REST endpoints directly with an `AGENTMARK_API_KEY`. See `workflows/headless-with-mcp.md` in the agentmark skill, or the gateway OpenAPI spec at `api.agentmark.co/v1/openapi.json`.');
  lines.push('');

  return lines.join('\n');
}

function main() {
  const source = readFileSync(SOURCE_PATH, 'utf8');
  const sourceFile = ts.createSourceFile(SOURCE_PATH, source, ts.ScriptTarget.Latest, true);
  const commands = extractCommands(sourceFile);

  if (commands.length === 0) {
    console.error('No commands extracted. Did the AST shape change in cli-src/index.ts?');
    process.exit(1);
  }

  const pkgJson = JSON.parse(readFileSync(join(HERE, '../package.json'), 'utf8')) as { version: string };
  const markdown = formatMarkdown(commands, pkgJson.version);

  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, markdown);

  console.log(`Wrote ${commands.length} commands to ${OUTPUT_PATH}`);
}

main();
