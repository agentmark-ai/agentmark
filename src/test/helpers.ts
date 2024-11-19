import fs from 'fs';
import { parse, ContentLoader } from "@puzzlet/templatedx";
import nodePath from 'path';

export const getMdxPrompt: ContentLoader = async (path: string) => {
  const input = fs.readFileSync(path, 'utf-8');
  return input;
}

export const getMdxAst = async (path: string) => {
  const mdx = await getMdxPrompt(path);
  const dirname = nodePath.dirname(path);
  const ast = await parse(mdx, dirname, getMdxPrompt);
  return ast;
} 