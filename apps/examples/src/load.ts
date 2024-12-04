import fs from 'fs';
import { parse } from "@puzzlet/agentmark";

const getMdxFile = async (path: string) => {
  const input = fs.readFileSync(path, 'utf-8');
  return input;
}

export const load = async (file: string) => {
  const mdx = await getMdxFile(file);
  const bundled = await parse(mdx, `prompts`, getMdxFile);
  return bundled;
}