import { NODE_TYPES } from './constants';
import { unified } from 'unified';
import yaml from 'js-yaml';
import {
  MdxJsxFlowElement,
  MdxJsxTextElement,
} from 'mdast-util-mdx';
import type {
  Parent,
  Node,
  Root,
} from 'mdast';
import remarkParse from 'remark-parse';
import remarkMdx from 'remark-mdx';
import remarkFrontmatter from 'remark-frontmatter';
import remarkStringify from 'remark-stringify';

export const createBaseProcessor = () =>
  unified().use(remarkParse).use(remarkMdx).use(remarkFrontmatter);

export function isMdxJsxElement(
  node: Node
): node is MdxJsxFlowElement | MdxJsxTextElement {
  return isMdxJsxFlowElement(node) || isMdxJsxTextElement(node);
}

export function isMdxJsxFlowElement(node: Node): node is MdxJsxFlowElement {
  return node.type === NODE_TYPES.MDX_JSX_FLOW_ELEMENT;
}

export function isMdxJsxTextElement(node: Node): node is MdxJsxTextElement {
  return node.type === NODE_TYPES.MDX_JSX_TEXT_ELEMENT;
}

export function isParentNode(node: Node): node is Parent {
  return 'children' in node && Array.isArray(node.children);
}

export function compressAst(node: any): void {
  const propertiesToDelete = [
    'position',
    'start',
    'end',
    'loc',
    'range',
    'data',
    'meta',
    'raw',
    'extra',
    'comments',
  ];

  for (const prop of propertiesToDelete) {
    if (prop in node) {
      delete node[prop];
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      compressAst(child);
    }
  }

  if (Array.isArray(node.attributes)) {
    for (const attr of node.attributes) {
      compressAst(attr);
    }
  }

  for (const key in node) {
    if (
      Object.prototype.hasOwnProperty.call(node, key) &&
      typeof node[key] === 'object' &&
      node[key] !== null
    ) {
      compressAst(node[key]);
    }
  }
}

export const getFrontMatter = (tree: Root) => {
  const frontmatterNode = tree.children.find(
    (node) => node.type === NODE_TYPES.YAML
  );
  return yaml.load(frontmatterNode?.value || '');
};

export function parse(mdxContent: string): Root {
  const processor = unified().use(remarkParse).use(remarkMdx).use(remarkFrontmatter);
  return processor.parse(mdxContent) as Root;
}

export const stringify = (tree: Root): string => {
  const processor = createBaseProcessor().use(remarkStringify);
  return String(processor.stringify(tree));
};

export function hasFunctionBody(childNode: Node): boolean {
  if (childNode.type !== 'mdxFlowExpression') {
    return false;
  }

  const estree = (childNode as any).data?.estree;

  if (!estree || estree.body.length === 0) {
    return false;
  }

  const expression = estree.body[0].expression;

  return expression.type === 'ArrowFunctionExpression';
}

export function getFunctionBody(
  childNode: Node,
): { body: Node[]; argumentNames: string[] } {
  if (childNode.type !== 'mdxFlowExpression') {
    throw new Error('Expected a function as the child.');
  }

  const functionCode = (childNode as any).value;
  const estree = (childNode as any).data?.estree;
  if (!estree || estree.body.length === 0) {
    throw new Error('Invalid function expression.');
  }

  const functionExpression = estree.body[0].expression;
  if (functionExpression.type !== 'ArrowFunctionExpression') {
    throw new Error('Child must be an arrow function.');
  }

  const params = functionExpression.params;
  const argumentNames = params.map((param: any) => {
    if (param.type === 'Identifier') {
      return param.name;
    } else {
      throw new Error('Only simple identifiers are supported as function parameters.');
    }
  });

  if (argumentNames.length < 1) {
    throw new Error('Function must have at least one parameter.');
  }

  const arrowIndex = functionCode.indexOf('=>');
  if (arrowIndex === -1) {
    throw new Error('Invalid function expression.');
  }
  let functionBodyCode = functionCode.substring(arrowIndex + 2).trim();

  if (functionBodyCode.startsWith('(') && functionBodyCode.endsWith(')')) {
    functionBodyCode = functionBodyCode.substring(1, functionBodyCode.length - 1).trim();
  }
  const functionBodyTree = parse(functionBodyCode) as Root;
  const unwrappedNodes = unwrapFragments(functionBodyTree.children);

  return { body: unwrappedNodes, argumentNames };
}

function unwrapFragments(nodes: Node[]): Node[] {
  const unwrappedNodes: Node[] = [];

  for (const node of nodes) {
    if (isFragmentNode(node)) {
      if ((node as any).children) {
        const childNodes = unwrapFragments((node as any).children);
        unwrappedNodes.push(...childNodes);
      }
    } else {
      unwrappedNodes.push(node);
    }
  }

  return unwrappedNodes;
}


function isFragmentNode(node: Node): boolean {
  return (
    node.type === NODE_TYPES.MDX_JSX_FLOW_ELEMENT &&
    (node as any).name === null
  );
}


