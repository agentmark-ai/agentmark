import fs from 'fs';
import { bundle, ContentLoader } from "@puzzlet/templatedx";

export const getMdxPrompt: ContentLoader = async (path: string) => {
  const input = fs.readFileSync(path, 'utf-8');
  return input;
}

export const getMdxAst = async (path: string) => {
  const mdx = await getMdxPrompt(path);
  const ast = await bundle(mdx, `${__dirname}/mdx`, getMdxPrompt);
  return ast;
}