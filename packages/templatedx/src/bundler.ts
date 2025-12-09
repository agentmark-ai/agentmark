import { NODE_TYPES, MDX_JSX_ATTRIBUTE_TYPES } from './constants';
import { getDirname, resolvePath, cloneObject } from './utils';
import { visit } from 'unist-util-visit';
import type { Root, RootContent, Paragraph, Parent, Node } from 'mdast';
import type { ComponentASTs, ContentLoader } from './types';
import { SKIP } from 'unist-util-visit';
import {
  isMdxJsxElement,
  isParentNode,
  parse,
  stringify,
} from './ast-utils';
import { TagPluginRegistry } from './tag-plugin-registry';
import { isSupportedHTMLTag } from './supported-tags';
// Forward declaration to avoid circular dependency
import type { TemplateDX } from './templatedx-engine';

/**
 * Validates all JSX elements in the tree to ensure they are supported
 * @param tree - The AST tree to validate
 * @param componentASTs - Available imported components
 * @param templatedx - Optional TemplateDX instance for stateful tag registry
 * @throws Error if any unsupported tag is found
 */
function validateAllJsxElements(
  tree: Root,
  componentASTs: ComponentASTs,
  templatedx?: TemplateDX
): void {
  visit(tree, [NODE_TYPES.MDX_JSX_FLOW_ELEMENT, NODE_TYPES.MDX_JSX_TEXT_ELEMENT], (node: any) => {
    const componentName = node.name;
    
    // Allow fragments (no name)
    if (!componentName) {
      return;
    }

    // Skip validation for content inside Raw tags - they should be treated as literal text
    if (componentName === 'Raw') {
      return SKIP; // Skip visiting children of Raw tags
    }

    // Check if it's an imported component
    if (componentASTs[componentName]) {
      return;
    }

    // Check if it's a built-in tag plugin
    const tagRegistry = templatedx ? templatedx.getTagRegistry() : TagPluginRegistry;
    if (tagRegistry.get(componentName)) {
      return;
    }

    // Check if it's a supported HTML element
    if (isSupportedHTMLTag(componentName)) {
      return;
    }

    // If none of the above, it's unsupported
    throw new Error(
      `Unsupported tag '<${componentName}>'. ` +
      `Only native MDX elements, and registered tags are supported.`
    );
  });
}

export async function bundle(
  mdxContent: string,
  baseDir: string,
  contentLoader: ContentLoader,
  templatedx?: TemplateDX
): Promise<Root> {
  const processedFiles = new Set<string>();
  const mainAbsolutePath = resolvePath(baseDir, '__PROMPTDX_IGNORE__.mdx');

  const { tree: mainTree, componentASTs } = await processMdxContent(
    mdxContent,
    mainAbsolutePath,
    new Set(),
    processedFiles,
    contentLoader,
    templatedx
  );

  // Validate all JSX elements before processing
  validateAllJsxElements(mainTree, componentASTs, templatedx);

  inlineComponents(mainTree, componentASTs, templatedx);

  return mainTree;
}

async function processMdxContent(
  content: string,
  absolutePath: string,
  callStack: Set<string>,
  processedFiles: Set<string>,
  contentLoader: ContentLoader,
  templatedx?: TemplateDX
): Promise<{ tree: Root; componentASTs: ComponentASTs }> {
  if (processedFiles.has(absolutePath)) {
    return { tree: { type: 'root', children: [] }, componentASTs: {} };
  }

  if (callStack.has(absolutePath)) {
    throw new Error(
      `Circular import detected: ${[...callStack, absolutePath].join(' -> ')}`
    );
  }

  callStack.add(absolutePath);

  const tree = parse(content);
  removeComments(tree);
  const imports = extractImports(tree, absolutePath);
  const componentASTs: ComponentASTs = {};

  for (const [componentName, sourcePath] of Object.entries(imports)) {
    const importAbsolutePath = resolvePath(getDirname(absolutePath), sourcePath);
    const importedContent = await contentLoader(importAbsolutePath);

    const { tree: componentTree, componentASTs: nestedComponentASTs } =
      await processMdxContent(
        importedContent,
        importAbsolutePath,
        new Set(callStack),
        processedFiles,
        contentLoader,
        templatedx
      );

    Object.assign(componentASTs, nestedComponentASTs);
    componentASTs[componentName] = componentTree.children;
  }

  tree.children = tree.children.filter(
    (node: any) => node.type !== NODE_TYPES.MDX_JSX_ESM
  );
  processedFiles.add(absolutePath);
  callStack.delete(absolutePath);

  return { tree, componentASTs };
}

function removeComments(tree: Root): void {
  visit(tree, (node, index, parent) => {
    if (isCommentNode(node) && parent) {
      parent.children.splice(index!, 1);
      return [SKIP, index];
    }
  });
}

function isCommentNode(node: Node): boolean {
  if (
    node.type === NODE_TYPES.MDX_FLOW_EXPRESSION ||
    node.type === NODE_TYPES.MDX_TEXT_EXPRESSION
  ) {
    const value = (node as any).value.trim();
    return (
      (value.startsWith('/*') && value.endsWith('*/')) ||
      value.startsWith('//')
    );
  }
  return false;
}

function extractImports(tree: Root, absolutePath: string): Record<string, string> {
  const imports: Record<string, string> = {};

  visit(tree, NODE_TYPES.MDX_JSX_ESM, (node: any) => {
    const estree = node.data?.estree;

    if (!estree) {
      throw new Error(`No ESTree found in ${absolutePath}`);
    }

    for (const stmt of estree.body) {
      if (stmt.type === 'ImportDeclaration') {
        const defaultSpecifier = stmt.specifiers.find(
          (spec: any) => spec.type === 'ImportDefaultSpecifier'
        );

        if (
          stmt.specifiers.some(
            (spec: any) => spec.type !== 'ImportDefaultSpecifier'
          )
        ) {
          throw new Error(
            `Only default imports are supported. Invalid import in ${absolutePath}: ${node.value.trim()}`
          );
        }

        if (defaultSpecifier) {
          const importedName = defaultSpecifier.local.name;
          const source = stmt.source.value as string;
          imports[importedName] = source;
        } else {
          throw new Error(
            `Invalid import in ${absolutePath}: ${node.value.trim()}`
          );
        }
      } else if (stmt.type.startsWith('Export')) {
        throw new Error(
          `Exports are not supported. Found in ${absolutePath}: ${node.value.trim()}`
        );
      }
    }
  });

  return imports;
}

function inlineComponents(
  tree: Root,
  componentASTs: ComponentASTs,
  templatedx?: TemplateDX
): void {
  let hasReplacements: boolean;

  do {
    hasReplacements = inlineJsxElements(tree, componentASTs, {}, templatedx);
  } while (hasReplacements);
}



function processChildrenDirectly(
  children: any[],
  componentASTs: ComponentASTs,
  parentProps: Record<string, any> = {},
  templatedx?: TemplateDX
): boolean {
  let replaced = false;
  
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    
    if (isMdxJsxElement(child)) {
      const componentName = child.name;
      
      if (componentName && componentASTs[componentName]) {
        const componentNodes = cloneObject(componentASTs[componentName]);
        const props = extractRawProps(child, parentProps);
        const childrenContent = child.children || [];

        const processedComponentNodes = componentNodes.map((childNode: any) =>
          inlineComponentsAndResolveProps(
            childNode,
            props,
            childrenContent,
            componentASTs,
            templatedx
          )
        );

        children.splice(i, 1, ...processedComponentNodes.flat());
        replaced = true;
        i += processedComponentNodes.flat().length - 1;
      } else if (componentName && (templatedx ? templatedx.getTagRegistry().get(componentName) : TagPluginRegistry.get(componentName))) {
        if (child.children && child.children.length > 0) {
          const childrenProcessed = processChildrenDirectly(child.children, componentASTs, parentProps, templatedx);
          if (childrenProcessed) {
            replaced = true;
          }
        }
      }
    } else if (child.type === NODE_TYPES.MDX_FLOW_EXPRESSION || child.type === NODE_TYPES.MDX_TEXT_EXPRESSION) {
      const expressionProcessed = processSimpleJSXInExpression(child, componentASTs, templatedx);
      if (expressionProcessed) {
        replaced = true;
      }
    } else if (isParentNode(child)) {
      const childrenProcessed = processChildrenDirectly(child.children, componentASTs, parentProps, templatedx);
      if (childrenProcessed) {
        replaced = true;
      }
    }
  }
  
  return replaced;
}

function processSimpleJSXInExpression(
  expressionNode: any,
  componentASTs: ComponentASTs,
  templatedx?: TemplateDX
): boolean {
  // For expressions containing JSX components, parse and process them properly
  if (!expressionNode.value || typeof expressionNode.value !== 'string') {
    return false;
  }

  // Check if expression contains any known component names
  const hasComponents = Object.keys(componentASTs).some(name => 
    expressionNode.value.includes(`<${name}`)
  );
  
  if (!hasComponents) {
    return false;
  }

  try {
    const tempTree = parse(expressionNode.value);
    let wasModified = false;

    visit(tempTree, [NODE_TYPES.MDX_JSX_FLOW_ELEMENT, NODE_TYPES.MDX_JSX_TEXT_ELEMENT], (node: any, index, parent) => {
      const componentName = node.name;
      if (!componentName || !parent || index === null) {
        return;
      }
      
      if (componentASTs[componentName]) {
        const componentNodes = cloneObject(componentASTs[componentName]);
        const props = extractRawProps(node, {});
        
        const processedComponentNodes = componentNodes.map((childNode: any) =>
          inlineComponentsAndResolveProps(childNode, props, [], componentASTs, templatedx)
        );
        const flatProcessedNodes = processedComponentNodes.flat();
        
        const parentIsFragment = parent.type === NODE_TYPES.MDX_JSX_FLOW_ELEMENT && parent.name === null;
        
        if (parentIsFragment) {
          parent.children.splice(index, 1, ...flatProcessedNodes);
        } else {
          const fragment = createFragment(flatProcessedNodes);
          parent.children.splice(index, 1, fragment);
        }
        
        wasModified = true;
        return [SKIP, index];
      }
    });

    if (wasModified) {
      expressionNode.value = stringify(tempTree).trim();
    }

    return wasModified;
  } catch (_e) {
    return false;
  }
}

function createFragment(children: Node[]): Node {
  return {
    type: NODE_TYPES.MDX_JSX_FLOW_ELEMENT,
    name: null, // null name indicates a fragment
    attributes: [],
    children: children as RootContent[],
  } as any;
}

function inlineJsxElements(
  tree: Root | Parent,
  componentASTs: ComponentASTs,
  parentProps: Record<string, any> = {},
  templatedx?: TemplateDX
): boolean {
  let replaced = false;

  visit(
    tree,
    [NODE_TYPES.MDX_JSX_FLOW_ELEMENT, NODE_TYPES.MDX_JSX_TEXT_ELEMENT],
    (node: any, index, parent) => {
      const componentName = node.name;
      if (!componentName || index === null || !parent) {
        return;
      }
      
      if (componentASTs[componentName]) {
        const componentNodes = cloneObject(componentASTs[componentName]);
        const props = extractRawProps(node, parentProps);
        const childrenContent = node.children || [];

        const processedComponentNodes = componentNodes.map((childNode: any) =>
          inlineComponentsAndResolveProps(
            childNode,
            props,
            childrenContent,
            componentASTs,
            templatedx
          )
        ).flat();

        parent.children.splice(index, 1, ...processedComponentNodes);
        
        replaced = true;
      } else if (templatedx ? templatedx.getTagRegistry().get(componentName) : TagPluginRegistry.get(componentName)) {
        if (node.children && node.children.length > 0) {
          const childrenProcessed = processChildrenDirectly(node.children, componentASTs, parentProps, templatedx);
          if (childrenProcessed) {
            replaced = true;
          }
        }
      }
    }
  );

  return replaced;
}

function extractRawProps(
  node: any,
  parentProps: Record<string, any>
): Record<string, any> {
  const props: Record<string, any> = {};

  for (const attr of node.attributes) {
    if (attr.type === MDX_JSX_ATTRIBUTE_TYPES.MDX_JSX_ATTRIBUTE) {
      if (attr.value === null || typeof attr.value === 'string') {
        props[attr.name] = JSON.stringify(attr.value || '');
      } else if (attr.value.type === MDX_JSX_ATTRIBUTE_TYPES.MDX_JSX_ATTRIBUTE_VALUE_EXPRESSION) {
        const { value: resolvedValue } = substitutePropsInExpression(
          attr.value.value,
          parentProps
        );
        props[attr.name] = resolvedValue;
      }
    } else if (attr.type === MDX_JSX_ATTRIBUTE_TYPES.MDX_JSX_EXPRESSION_ATTRIBUTE) {
      throw new Error(
        `Only literal attribute values are supported. Invalid attribute in component <${node.name}>.`
      );
    }
  }

  return props;
}

function substitutePropsInExpression(
  expression: string,
  props: Record<string, any>,
): { value: string; isLiteral: boolean } {
  const propRegex = /props\.(\w+)/g;
  const visitedProps = new Set();
  let currentExpression = expression;

  const substitute = (expr: string): string => {
    return expr.replace(propRegex, (match, propName) => {
      if (visitedProps.has(propName)) {
        throw new Error(`Circular reference detected for property '${propName}'.`);
      }
      if (Object.prototype.hasOwnProperty.call(props, propName)) {
        visitedProps.add(propName);
        const propValue = props[propName];
        if (typeof propValue === 'string') {
          return substitute(propValue);
        } else {
          return String(propValue);
        }
      } else {
        return match;
      }
    });
  };

  try {
    currentExpression = substitute(currentExpression);
  } catch (error) {
    throw new Error(`Error substituting props in expression: ${(error as Error).message}`);
  }

  const isLiteral = /^['"].*['"]$|^\d+(\.\d+)?$/.test(currentExpression);

  return { value: currentExpression, isLiteral };
}

function inlineComponentsAndResolveProps(
  node: Node,
  props: Record<string, any>,
  childrenContent: RootContent[],
  componentASTs: ComponentASTs,
  templatedx?: TemplateDX
): Node | Node[] {
  if (
    node.type === NODE_TYPES.MDX_TEXT_EXPRESSION ||
    node.type === NODE_TYPES.MDX_FLOW_EXPRESSION
  ) {
    if ((node as any).value === 'props.children') {
      const childrenTree: Root = { type: 'root', children: [...childrenContent] };
      // TODO: This should be async but bundler doesn't support async well
      // For now, inline components synchronously 
      let hasReplacements: boolean;
      do {
        hasReplacements = inlineJsxElements(childrenTree, componentASTs, {}, templatedx);
      } while (hasReplacements);
      return combinedNodesIntoParagraph(childrenTree.children);
    } else if ((node as any).value.includes('props.')) {
      const { value: resolvedValue, isLiteral } = substitutePropsInExpression(
        (node as any).value,
        props
      );

      if (isLiteral) {
        return {
          type: NODE_TYPES.TEXT,
          value: JSON.parse(resolvedValue),
        } as Node;
      } else {
        return {
          type: node.type,
          value: resolvedValue,
        } as Node;
      }
    }
  }

  if (isMdxJsxElement(node)) {
    const componentName = node.name!;
    
    if (componentASTs[componentName]) {
      const componentNodes = cloneObject(componentASTs[componentName]);
      const newProps = extractRawProps(node, props);
      const childrenContent = node.children || [];

      const processedComponentNodes = componentNodes.map((childNode: any) =>
        inlineComponentsAndResolveProps(
          childNode,
          newProps,
          childrenContent,
          componentASTs,
          templatedx
        )
      );
      const flatProcessedNodes = processedComponentNodes.flat();

      return flatProcessedNodes;
    } else if (TagPluginRegistry.get(componentName)) {
      // For built-in tags, keep the tag but process its children
      const newNode = { ...node } as Parent;
      const processedChildren = newNode.children.map((child: any) =>
        inlineComponentsAndResolveProps(
          child,
          props,
          childrenContent,
          componentASTs,
          templatedx
        )
      );
      newNode.children = processedChildren.flat() as RootContent[];
      return newNode;
    }
  }

  if (isParentNode(node)) {
    const newNode = node as Parent;
    const processedChildren = newNode.children.map((child: any) =>
      inlineComponentsAndResolveProps(
        child,
        props,
        childrenContent,
        componentASTs,
        templatedx
      )
    );
    newNode.children = processedChildren.flat() as RootContent[];
  }

  return node;
}

function combinedNodesIntoParagraph(nodes: RootContent[]): RootContent[] {
  const contentChildren: RootContent[] = [];

  nodes.forEach((node, index) => {
    if (node.type === NODE_TYPES.PARAGRAPH || node.type === NODE_TYPES.LIST) {
      contentChildren.push(...(node as Parent).children);
    } else {
      contentChildren.push(node);
    }

    if (index !== nodes.length - 1) {
      contentChildren.push({ type: NODE_TYPES.TEXT, value: '\n' });
    }
  });

  if (contentChildren.length > 0) {
    return [
      {
        type: NODE_TYPES.PARAGRAPH,
        children: contentChildren,
      } as Paragraph,
    ];
  }

  return [];
}
