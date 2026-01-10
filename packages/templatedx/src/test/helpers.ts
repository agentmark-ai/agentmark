import fs from 'fs';

// Normalize line endings to LF for cross-platform compatibility
const normalizeLineEndings = (content: string) => content.replace(/\r\n/g, '\n');

export const getInput = (basePath: string) => {
  const input = fs.readFileSync(`${basePath}/input.mdx`, 'utf-8');
  return normalizeLineEndings(input);
}

export const getOutput = (basePath: string) => {
  const input = fs.readFileSync(`${basePath}/output.mdx`, 'utf-8');
  return normalizeLineEndings(input);
}

export const getNode = (basePath: string) => {
  const input = fs.readFileSync(`${basePath}/node.json`, 'utf-8');
  return input;
}

// @ts-expect-error tree type is intentionally loose for testing
export function removePosition(tree) {
  void [...walkThrough(tree)]

  return tree
}

export const print = (tree: object) => {
  return `${JSON.stringify(removePosition(tree), null, 2)}\n`
}

const walkThrough = function* (obj: object) {
  // @ts-expect-error walk function uses dynamic object access for testing
  const walk = function* (x: object & { position?: object, loc?: object, range?: object, start?: any, end?: any }, previous = []) {
    if (x) {
      for (const key of Object.keys(x)) {
        if (key === 'position' || key === 'loc' || key === 'range' || key === 'start' || key === 'end') {
          delete x[key]
        }
        // @ts-expect-error dynamic object access for testing
        if (typeof x[key] === 'object') yield* walk(x[key], [...previous, key])
        // @ts-expect-error dynamic object access for testing
        else yield [[...previous, key], x[key]]
      }
    }
  }
  yield* walk(obj)
}

