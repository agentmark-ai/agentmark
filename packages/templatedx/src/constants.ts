export const NODE_TYPES = {
  MDX_JSX_FLOW_ELEMENT: 'mdxJsxFlowElement',
  MDX_JSX_TEXT_ELEMENT: 'mdxJsxTextElement',
  MDX_JSX_ESM: 'mdxjsEsm',
  YAML: 'yaml',
  MDX_TEXT_EXPRESSION: 'mdxTextExpression',
  MDX_FLOW_EXPRESSION: 'mdxFlowExpression',
  LIST: 'list',
  LIST_ITEM: 'listItem',
  TEXT: 'text',
  PARAGRAPH: 'paragraph',
  HTML: 'html',
} as const;

export const MDX_JSX_ATTRIBUTE_TYPES = {
  MDX_JSX_ATTRIBUTE: 'mdxJsxAttribute',
  MDX_JSX_ATTRIBUTE_VALUE_EXPRESSION: 'mdxJsxAttributeValueExpression',
  MDX_JSX_EXPRESSION_ATTRIBUTE: 'mdxJsxExpressionAttribute',
} as const;