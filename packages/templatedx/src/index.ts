import { transformTree } from "./transformer";
import { bundle } from "./bundler";
import {
  compressAst,
  stringify,
  getFrontMatter,
} from "./ast-utils";
import { TagPluginRegistry } from "./tag-plugin-registry";
import { TagPlugin, PluginContext } from "./tag-plugin";
import { FilterRegistry } from "./filter-registry";
import type { FilterFunction } from "./filter-registry";
import type { ContentLoader } from "./types";
import type { Root } from "mdast";
import { getDirname } from "./utils";
import type { BaseMDXProvidedComponents } from './types';
import './global.d';
import './register-builtin-plugins';

const readFile = async (path: string) => {
  // @ts-expect-error Deno is not defined in Node.js environments
  if (typeof Deno !== 'undefined') {
    // @ts-expect-error Deno is not defined in Node.js environments
    return await Deno.readTextFile(path);
  } else if (typeof require !== 'undefined') {
    const { readFile } = await import('fs/promises');
    return await readFile(path, 'utf8');
  } else {
    throw new Error('Unsupported environment');
  }
};

async function load (path: string) {
  const file = await readFile(path);
  const componentLoader = async (path: string) => readFile(path);
  return bundle(file, getDirname(path), componentLoader);
}

export type {
  ContentLoader,
  Root as Ast,
  PluginContext,
  FilterFunction,
  BaseMDXProvidedComponents
};
export {
  stringify,
  bundle as parse,
  getFrontMatter,
  compressAst,
  load,
  transformTree as transform,
  TagPluginRegistry,
  TagPlugin,
  FilterRegistry
};

// Export the new stateful engine
export { TemplateDX } from './templatedx-engine';