#!/usr/bin/env tsx
/**
 * Extracts prompt frontmatter schema from `@agentmark-ai/prompt-core`'s
 * Zod definitions and writes a deterministic markdown reference at
 * ../../../skills/agentmark/reference/frontmatter-schema.md
 *
 * Source of truth: prompt-core/src/schemas.ts. This is RUNTIME truth — the
 * shape the SDK actually parses. If the published docs disagree, prefer
 * the docs (they're what users read) and file an issue noting the drift.
 */

import * as ts from 'typescript';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const HERE = dirname(new URL(import.meta.url).pathname);
const SOURCE_PATH = resolve(HERE, '../../prompt-core/src/schemas.ts');
const OUTPUT_PATH = resolve(HERE, '../../../skills/agentmark/reference/frontmatter-schema.md');

interface Field {
  name: string;
  type: string;
  optional: boolean;
  comment?: string;
}

interface Schema {
  name: string;
  fields: Field[];
}

/**
 * Walk the AST looking for `export const Xxx = z.object({...})` declarations.
 * Capture the field name, type expression text, and any leading JSDoc comment.
 */
function extractSchemas(source: ts.SourceFile, raw: string): Schema[] {
  const schemas: Schema[] = [];

  function fieldType(expr: ts.Expression): { type: string; optional: boolean } {
    const t = expr.getText();
    const optional = /\.optional\(\)\s*$/.test(t) || /\.nullable\(\)\s*\.optional\(\)\s*$/.test(t);
    let cleaned = t
      .replace(/\.optional\(\)\s*$/, '')
      .replace(/\.nullable\(\)\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    // Compact a couple of common shapes for readability
    cleaned = cleaned
      .replace(/^z\.string\(\)$/, 'string')
      .replace(/^z\.number\(\)(?:\.min\([^)]*\))?(?:\.max\([^)]*\))?$/, 'number')
      .replace(/^z\.boolean\(\)$/, 'boolean')
      .replace(/^z\.array\(z\.string\(\)\)$/, 'string[]')
      .replace(/^z\.array\(([^)]+)\)$/, '$1[]')
      .replace(/^z\.record\(z\.string\(\),\s*z\.any\(\)\)$/, 'Record<string, any>')
      .replace(/^z\.enum\(\[([^\]]+)\]\)$/, 'enum($1)');
    return { type: cleaned, optional };
  }

  function leadingComment(node: ts.Node): string | undefined {
    const ranges = ts.getLeadingCommentRanges(raw, node.getFullStart());
    if (!ranges || ranges.length === 0) return undefined;
    const last = ranges[ranges.length - 1];
    const text = raw.slice(last.pos, last.end);
    // Strip block-comment markers and leading * per line
    return text
      .replace(/^\/\*+/, '')
      .replace(/\*+\/$/, '')
      .split('\n')
      .map(l => l.replace(/^\s*\*\s?/, '').trim())
      .filter(Boolean)
      .join(' ');
  }

  function visit(node: ts.Node) {
    if (
      ts.isVariableStatement(node) &&
      node.modifiers?.some(m => m.kind === ts.SyntaxKind.ExportKeyword)
    ) {
      for (const decl of node.declarationList.declarations) {
        if (!ts.isIdentifier(decl.name)) continue;
        const schemaName = decl.name.text;
        if (!/Schema$|^.*Config$|TestSettingsSchema$/.test(schemaName)) continue;
        const init = decl.initializer;
        if (!init || !ts.isCallExpression(init)) continue;
        // Want z.object({...})
        const callee = init.expression;
        if (
          !ts.isPropertyAccessExpression(callee) ||
          callee.name.text !== 'object' ||
          !ts.isIdentifier(callee.expression) ||
          callee.expression.text !== 'z'
        ) {
          continue;
        }
        const objArg = init.arguments[0];
        if (!objArg || !ts.isObjectLiteralExpression(objArg)) continue;

        const fields: Field[] = [];
        for (const prop of objArg.properties) {
          if (!ts.isPropertyAssignment(prop)) continue;
          if (!ts.isIdentifier(prop.name) && !ts.isStringLiteral(prop.name)) continue;
          const fname = ts.isIdentifier(prop.name) ? prop.name.text : prop.name.text;
          const { type, optional } = fieldType(prop.initializer);
          fields.push({
            name: fname,
            type,
            optional,
            comment: leadingComment(prop),
          });
        }
        schemas.push({ name: schemaName, fields });
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return schemas;
}

/**
 * Markdown table cells use `|` as a column separator. Backslashes must be
 * escaped first; CodeQL `js/incomplete-sanitization` flags pipe-escapes
 * that don't precede with a backslash-escape.
 */
function escapeTableCell(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/\|/g, '\\|')
    .replace(/\n/g, ' ');
}

function formatMarkdown(schemas: Schema[]): string {
  const lines: string[] = [];
  lines.push('<!--');
  lines.push('  Auto-generated from oss/agentmark/packages/prompt-core/src/schemas.ts.');
  lines.push('  Do not hand-edit. Run `yarn generate-skill-frontmatter-reference` to regenerate.');
  lines.push('-->');
  lines.push('');
  lines.push('# AgentMark prompt frontmatter — runtime schema');
  lines.push('');
  lines.push('> Generated from `@agentmark-ai/prompt-core`\'s Zod schemas. This is the **runtime truth** — the shape `loadTextPrompt` and friends actually parse. If [the published docs](https://docs.agentmark.co/build/syntax.md) disagree, prefer the docs and file an issue against `agentmark-ai/agentmark` noting the drift.');
  lines.push('');
  lines.push('## Schema index');
  lines.push('');
  for (const s of schemas) {
    lines.push(`- [\`${s.name}\`](#${s.name.toLowerCase()})`);
  }
  lines.push('');

  for (const s of schemas) {
    lines.push(`## \`${s.name}\``);
    lines.push('');
    lines.push('| Field | Type | Required? | Notes |');
    lines.push('|---|---|---|---|');
    for (const f of s.fields) {
      const type = '`' + escapeTableCell(f.type) + '`';
      const required = f.optional ? '' : '✓';
      const notes = escapeTableCell(f.comment ?? '');
      lines.push(`| \`${f.name}\` | ${type} | ${required} | ${notes} |`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

function main() {
  const raw = readFileSync(SOURCE_PATH, 'utf8');
  const sourceFile = ts.createSourceFile(SOURCE_PATH, raw, ts.ScriptTarget.Latest, true);
  const schemas = extractSchemas(sourceFile, raw);
  if (schemas.length === 0) {
    console.error('No schemas extracted. Did the layout of schemas.ts change?');
    process.exit(1);
  }
  const md = formatMarkdown(schemas);
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, md);
  console.log(`Wrote ${schemas.length} schemas to ${OUTPUT_PATH}`);
}

main();
