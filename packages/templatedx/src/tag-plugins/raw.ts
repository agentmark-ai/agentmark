import { Node, Root } from "mdast";
import { TagPlugin, PluginContext } from "../tag-plugin";

export interface RawProps {
  children: any;
}

export const Tags = ['Raw'];

export class RawPlugin extends TagPlugin {
  async transform(
    _props: Record<string, any>,
    children: Node[],
    context: PluginContext
  ): Promise<Node[] | Node> {
    const { nodeHelpers } = context;
    const rawContent = nodeHelpers.toMarkdown({
        type: 'root',
        children: children,
    } as Root);
    return [
      {
        type: 'text',
        value: rawContent,
      } as Node,
    ];
  }
}