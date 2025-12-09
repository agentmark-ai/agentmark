import jsep from 'jsep';
import jsepObject from '@jsep-plugin/object';
import {
  MdxJsxFlowElement,
  MdxJsxTextElement,
} from 'mdast-util-mdx';
import { NODE_TYPES, MDX_JSX_ATTRIBUTE_TYPES } from './constants';
import { OperatorFunction } from './types';
import { TagPluginRegistry } from './tag-plugin-registry';
import { PluginContext } from './tag-plugin';
import { hasFunctionBody, getFunctionBody } from './ast-utils';
import { stringifyValue } from './utils';
import {
  isMdxJsxElement,
  isMdxJsxFlowElement,
  isMdxJsxTextElement,
  isParentNode,
} from './ast-utils';
import { FilterRegistry } from './filter-registry';
import { Scope } from './scope';
import type { 
  Root,
  Node, 
  Parent, 
  RootContent,
} from 'mdast';
// Forward declaration to avoid circular dependency
import type { TemplateDX } from './templatedx-engine';
import { mdxToMarkdown } from "mdast-util-mdx";
import { toMarkdown, Options } from 'mdast-util-to-markdown';

jsep.plugins.register(jsepObject);

const options: Options = {
  extensions: [mdxToMarkdown()],
};
const toMdxMarkdown = (node: Root) => {
  return toMarkdown(node, options);
}

const nodeHelpers = {
  isMdxJsxElement,
  isMdxJsxFlowElement,
  isMdxJsxTextElement,
  isParentNode,
  toMarkdown: toMdxMarkdown,
  hasFunctionBody,
  getFunctionBody,
  NODE_TYPES,
};

export class NodeTransformer {
  private scope: Scope;
  private templatedx?: TemplateDX;

  constructor(scope: Scope, templatedx?: TemplateDX) {
    this.scope = scope;
    this.templatedx = templatedx;
  }

  async transformNode(node: Node): Promise<Node | Node[]> {
    if (
      node.type === NODE_TYPES.MDX_TEXT_EXPRESSION ||
      node.type === NODE_TYPES.MDX_FLOW_EXPRESSION
    ) {
      return this.evaluateExpressionNode(node);
    }

    if (isMdxJsxElement(node)) {
      return await this.processMdxJsxElement(node);
    }

    if (this.isFragmentNode(node)) {
      const processedChildren = await Promise.all(
        (node as Parent).children.map(async (child) => {
          const childTransformer = new NodeTransformer(this.scope);
          const result = await childTransformer.transformNode(child);
          return Array.isArray(result) ? result : [result];
        })
      );

      return processedChildren.flat();
    }

    if (isParentNode(node)) {
      const newNode = { ...node } as Parent;

      const processedChildren = await Promise.all(
        node.children.map(async (child) => {
          const childTransformer = new NodeTransformer(this.scope, this.templatedx);
          const result = await childTransformer.transformNode(child);
          return Array.isArray(result) ? result : [result];
        })
      );

      newNode.children = processedChildren.flat() as RootContent[];

      return newNode;
    }

    return node;
  }

  private isFragmentNode(node: Node): boolean {
    return (
      isMdxJsxElement(node) &&
      (node.name === null ||
        node.name === '' ||
        node.name === 'Fragment' ||
        node.name === 'React.Fragment')
    );
  }

  evaluateExpressionNode(node: Node): Node {
    const expression = (node as any).value;
    try {
      const evaluatedValue = this.resolveExpression(expression);
      return {
        type: NODE_TYPES.TEXT,
        value: stringifyValue(evaluatedValue),
      } as Node;
    } catch (error: any) {
      throw new Error(
        `Error evaluating expression "${expression}": ${error.message}`
      );
    }
  }

  resolveExpression(expression: string): any {
    expression = expression.trim();
    let ast: jsep.Expression;
    try {
      ast = jsep(expression);
    } catch (_e) {
      throw new Error(`Failed to parse expression: "${expression}"`);
    }
    return this.evaluateJsepExpression(ast);
  }

  evaluateJsepExpression(node: jsep.Expression): any {
    switch (node.type) {
      case 'BinaryExpression':
        return this.evaluateBinaryExpression(node as jsep.BinaryExpression);

      case 'UnaryExpression':
        return this.evaluateUnaryExpression(node as jsep.UnaryExpression);

      case 'Literal':
        return (node as jsep.Literal).value;

      case 'Identifier':
        return this.resolveVariable((node as jsep.Identifier).name);

      case 'MemberExpression':
        return this.evaluateMemberExpression(node as jsep.MemberExpression);

      case 'CallExpression':
        return this.evaluateCallExpression(node as jsep.CallExpression);

      case 'ArrayExpression':
        return this.evaluateArrayExpression(node as jsep.ArrayExpression);

      case 'ObjectExpression':
        return this.evaluateObjectExpression(node as any);

      default:
        throw new Error(`Unsupported node type: ${node.type}`);
    }
  }

  evaluateArrayExpression(node: jsep.ArrayExpression): any[] {
    return node.elements.map((element) => this.evaluateJsepExpression(element!));
  }

  evaluateObjectExpression(node: any): object {
    const obj: Record<string, any> = {};
    for (const property of node.properties) {
      let key: string;
      if (property.key.type === 'Identifier') {
        key = property.key.name;
      } else if (property.key.type === 'Literal') {
        key = property.key.value;
      } else {
        throw new Error(`Unsupported object key type: ${property.key.type}`);
      }
      const value = this.evaluateJsepExpression(property.value);
      obj[key] = value;
    }
    return obj;
  }

  evaluateCallExpression(node: jsep.CallExpression): any {
    const callee = node.callee;
    if (callee.type !== 'Identifier') {
      throw new Error(`Only calls to registered filters are allowed.`);
    }

    const functionName = (callee as jsep.Identifier).name;
    const filterFunction = this.templatedx 
      ? this.templatedx.getFilterRegistry().get(functionName)
      : FilterRegistry.get(functionName);
    if (!filterFunction) {
      throw new Error(`Filter "${functionName}" is not registered.`);
    }

    const args = node.arguments.map(arg => this.evaluateJsepExpression(arg));
    const [input, ...rest] = args;
    return filterFunction(input, ...rest);
  }

  resolveVariable(variablePath: string): any {
    if (!variablePath) {
      throw new Error(`Variable path cannot be empty.`);
    }

    const parts = variablePath.split('.');
    let value: any;

    try {
      value = this.scope.get(parts[0]);
    } catch (_error) {
      throw new Error(`Variable "${parts[0]}" is not defined in the scope.`);
    }

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i];
      if (value == null) {
        throw new Error(
          `Cannot access property "${part}" of null or undefined in "${variablePath}".`
        );
      }
      value = value[part];
    }

    return value;
  }

  evaluateBinaryExpression(node: jsep.BinaryExpression): any {
    const operatorFunctions: { [key: string]: OperatorFunction } = {
      '+': (left, right) => left + this.evaluateJsepExpression(right),
      '-': (left, right) => left - this.evaluateJsepExpression(right),
      '*': (left, right) => left * this.evaluateJsepExpression(right),
      '/': (left, right) => left / this.evaluateJsepExpression(right),
      '%': (left, right) => left % this.evaluateJsepExpression(right),
      '==': (left, right) => left == this.evaluateJsepExpression(right),
      '!=': (left, right) => left != this.evaluateJsepExpression(right),
      '>': (left, right) => left > this.evaluateJsepExpression(right),
      '>=': (left, right) => left >= this.evaluateJsepExpression(right),
      '<': (left, right) => left < this.evaluateJsepExpression(right),
      '<=': (left, right) => left <= this.evaluateJsepExpression(right),
      '&&': (left, right) => left && this.evaluateJsepExpression(right),
      '||': (left, right) => left || this.evaluateJsepExpression(right),
    };
    const operator = node.operator;

    const operation = operatorFunctions[operator];
    if (!operation) {
      throw new Error(`Operator "${operator}" is not allowed.`);
    }

    const left = this.evaluateJsepExpression(node.left);

    return operation(left, node.right);
  }

  evaluateUnaryExpression(node: jsep.UnaryExpression): any {
    const argument = this.evaluateJsepExpression(node.argument);
    switch (node.operator) {
      case '+':
        return +argument;
      case '-':
        return -argument;
      case '!':
        return !argument;
      default:
        throw new Error(`Unsupported operator: ${node.operator}`);
    }
  }

  evaluateMemberExpression(node: jsep.MemberExpression): any {
    const object = this.evaluateJsepExpression(node.object);
    const property = node.computed
      ? this.evaluateJsepExpression(node.property)
      : (node.property as jsep.Identifier).name;

    if (object && typeof object === 'object' && property in object) {
      if (object[property] === undefined) return '';
      return object[property];
    } else {
      return '';
    }
  }

  async processMdxJsxElement(
    node: MdxJsxFlowElement | MdxJsxTextElement
  ): Promise<Node | Node[]> {
    try {
      const tagName = node.name!;
      const plugin = this.templatedx 
        ? this.templatedx.getTagRegistry().get(tagName)
        : TagPluginRegistry.get(tagName);
      if (plugin) {
        const props = this.evaluateProps(node);
        const pluginContext: PluginContext = {
          createNodeTransformer: (scope: Scope) => new NodeTransformer(scope, this.templatedx),
          scope: this.scope,
          tagName,
          nodeHelpers,
        };
        const result = await plugin.transform(props, node.children, pluginContext);
        return result;
      } else {
        const newNode = { ...node } as Parent;

        const processedChildren = await Promise.all(
          node.children.map(async (child) => {
            const childTransformer = new NodeTransformer(this.scope, this.templatedx);
            const result = await childTransformer.transformNode(child);
            return Array.isArray(result) ? result : [result];
          })
        );

        newNode.children = processedChildren.flat() as RootContent[];
        return newNode;
      }
    } catch (error) {
      throw new Error(
        `Error processing MDX JSX Element: ${(error as Error).message}`
      );
    }
  }

  evaluateProps(node: any): Record<string, any> {
    const props: Record<string, any> = {};

    for (const attr of node.attributes) {
      if (attr.type === MDX_JSX_ATTRIBUTE_TYPES.MDX_JSX_ATTRIBUTE) {
        if (attr.value === null || typeof attr.value === 'string') {
          props[attr.name] = attr.value || '';
        } else if (
          attr.value.type ===
          MDX_JSX_ATTRIBUTE_TYPES.MDX_JSX_ATTRIBUTE_VALUE_EXPRESSION
        ) {
          const expression = attr.value.value;
          props[attr.name] = this.resolveExpression(expression);
        }
      } else if (
        attr.type === MDX_JSX_ATTRIBUTE_TYPES.MDX_JSX_EXPRESSION_ATTRIBUTE
      ) {
        throw new Error(
          `Unsupported attribute type in component <${node.name}>.`
        );
      }
    }

    return props;
  }
}

export const transformTree = async (
  tree: Root,
  props: Record<string, any> = {},
  shared: Record<string, any> = {},
  templatedx?: TemplateDX,
): Promise<Root> => {
  const scope = new Scope({ props }, shared);
  const transformer = new NodeTransformer(scope, templatedx);
  const processedTree = await transformer.transformNode(tree);
  return processedTree as Root;
};
