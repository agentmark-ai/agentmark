import { TagPlugin, PluginContext } from "@puzzlet/templatedx";
import { Node } from "mdast";

export class ExtractTextPlugin extends TagPlugin {
  async transform(
    _props: Record<string, any>,
    children: Node[],
    pluginContext: PluginContext
  ): Promise<Node[] | Node> {
    const { scope, tagName, createNodeTransformer, nodeHelpers } =
      pluginContext;

    if (!tagName) {
      throw new Error("elementName must be provided in pluginContext");
    }

    const promise = new Promise(async (resolve, reject) => {
      try {
        const childScope = scope.createChild();
        const transformer = createNodeTransformer(childScope);
        const processedChildren = await Promise.all(
          children.map(async (child) => {
            const result = await transformer.transformNode(child);
            return Array.isArray(result) ? result : [result];
          })
        );
        const flattenedChildren = processedChildren.flat();
        const extractedText = nodeHelpers.toMarkdown({
          type: "root",
          // @ts-ignore
          children: flattenedChildren,
        });
        resolve({ content: extractedText.trim(), name: tagName });
      } catch (error) {
        reject(error);
      }
    });

    const promises = scope.getShared("_puuzlet-extractTextPromises");
    if (!promises) {
      scope.setShared("_puuzlet-extractTextPromises", [promise]);
    } else {
      promises.push(promise);
    }
  
    return [];
  }
}
