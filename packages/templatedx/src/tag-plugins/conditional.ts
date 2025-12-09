import { Node } from "mdast";
import { TagPlugin, PluginContext } from "../tag-plugin";

export interface IfProps {
  condition: boolean;
  children: any;
}

export interface ElseIfProps {
  condition: boolean;
  children: any;
}

export interface ElseProps {
  children: any;
}

export const Tags = ['If', 'ElseIf', 'Else'];

export class ConditionalPlugin extends TagPlugin {
  async transform(
    props: Record<string, any>,
    children: Node[],
    context: PluginContext
  ): Promise<Node[] | Node> {
    const { scope, createNodeTransformer, tagName } = context;

    if (!tagName) {
      throw new Error("The 'tagName' must be provided in the context.");
    }

    let conditionMet = scope.getLocal("conditionMet");
    if (conditionMet === undefined) {
      scope.setLocal("conditionMet", false);
      conditionMet = false;
    }

    if (conditionMet) {
      return [];
    }

    let shouldRender = false;

    if (tagName === "If" || tagName === "ElseIf") {
      const condition = typeof props["condition"] === "boolean" ? props["condition"] : false;
      if (condition) {
        shouldRender = true;
      }
    } else if (tagName === "Else") {
      shouldRender = true;
    } else {
      throw new Error(`Unsupported element type: ${tagName}`);
    }

    if (shouldRender) {
      scope.setLocal("conditionMet", true);
      const childScope = scope.createChild();
      const transformer = createNodeTransformer(childScope);

      const results: Node[] = [];
      for (const child of children) {
        const transformed = await transformer.transformNode(child);
        if (Array.isArray(transformed)) {
          results.push(...transformed);
        } else if (transformed) {
          results.push(transformed);
        }
      }

      return results;
    }

    return [];
  }
}
