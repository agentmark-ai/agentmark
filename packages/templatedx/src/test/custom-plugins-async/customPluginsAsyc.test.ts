import { getInput, getOutput } from "../helpers";
import { expect, test } from 'vitest'
import { stringify, TagPluginRegistry, transform } from "../../index";
import { parse } from "../../ast-utils";
import { Node } from "mdast";
import { TagPlugin } from "../../index";
import type { PluginContext } from "../../index";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class FetchDataPlugin extends TagPlugin {
  async transform(
    _props: Record<string, any>,
    children: Node[],
    context: PluginContext
  ): Promise<Node[] | Node> {
    // Introduce a delay of 10 milliseconds
    await delay(10);

    const { createNodeTransformer, scope } = context;
    const childScope = scope.createChild({ data: 42 });

    const nodeTransformer = createNodeTransformer(childScope);
    const processedChildren = await Promise.all(
      children.map(async (child) => {
        const transformed = await nodeTransformer.transformNode(child);
        return Array.isArray(transformed) ? transformed : [transformed];
      })
    );

    return processedChildren.flat();
  }
}
TagPluginRegistry.register(new FetchDataPlugin(), ['FetchData']);

test('async plugins should work', async () => {
  const input = getInput(__dirname);
  const tree = parse(input);
  const processed = await transform(tree);
  const compiled = stringify(processed);
  const output = getOutput(__dirname);
  expect(compiled).toEqual(output);
});