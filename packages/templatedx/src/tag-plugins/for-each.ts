import { Node, Parent } from 'mdast';
import { TagPlugin, PluginContext } from '../tag-plugin';

export const Tags = ['ForEach'];

export interface ForEachProps<T = any> {
  children: (item: T, index: number) => any;
  arr: Array<T>;
}

export class ForEachPlugin extends TagPlugin {
  async transform(
    props: Record<string, any>,
    children: Node[],
    context: PluginContext
  ): Promise<Node[] | Node> {
    const {
      scope,
      createNodeTransformer,
      nodeHelpers
    } = context;

    const { hasFunctionBody, getFunctionBody, NODE_TYPES } = nodeHelpers;

    function areAllListItems(resultNodesPerItem: Node[][]): boolean {
      return resultNodesPerItem.every((processedNodes) =>
        processedNodes.every(
          (n: Node) =>
            n.type === NODE_TYPES.LIST || n.type === NODE_TYPES.LIST_ITEM
        )
      );
    }

    function collectListItems(resultNodesPerItem: Node[][]): Node[] {
      return resultNodesPerItem.flatMap((processedNodes) =>
        processedNodes.flatMap((n: Node) => {
          if (n.type === NODE_TYPES.LIST) {
            return (n as Parent).children;
          } else if (n.type === NODE_TYPES.LIST_ITEM) {
            return n;
          } else {
            return [];
          }
        })
      );
    }


    if (children.length !== 1) {
      throw new Error(`ForEach expects exactly one child function.`);
    }
    const childNode = children[0];
    if (!hasFunctionBody(childNode)) {
      throw new Error('ForEach expects a function as its child.');
    }
    const { body, argumentNames } = getFunctionBody(childNode);
    const arr = Array.isArray(props['arr']) ? props['arr'] : [];

    const itemParamName = argumentNames[0];
    const indexParamName = argumentNames[1];
    const resultNodesPerItem = await Promise.all(
      arr.map(async (item: any, index: number) => {
        const itemScope = scope.createChild({
          ...(itemParamName && { [itemParamName]: item }),
          ...(indexParamName && { [indexParamName]: index }),
        });
        const itemTransformer = createNodeTransformer(itemScope);
        const processedChildren = await Promise.all(
          body.map(async (child) => {
            const result = await itemTransformer.transformNode(child);
            return Array.isArray(result) ? result : [result];
          })
        );
        return processedChildren.flat();
      })
    );
    const resultNodes = resultNodesPerItem.flat();
    if (areAllListItems(resultNodesPerItem)) {
      return [
        {
          type: NODE_TYPES.LIST,
          ordered: false,
          spread: false,
          children: collectListItems(resultNodesPerItem),
        } as Node,
      ];
    } else {
      return resultNodes;
    }
  }
}
