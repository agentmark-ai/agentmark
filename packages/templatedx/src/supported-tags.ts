// Native HTML elements that are supported by MDX
// Based on MDX documentation and HTML5 specification
export const SUPPORTED_HTML_TAGS = new Set([
  // Document metadata
  'base',
  'head',
  'link',
  'meta',
  'style',
  'title',

  // Sectioning root
  'body',

  // Content sectioning
  'address',
  'article',
  'aside',
  'footer',
  'header',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hgroup',
  'main',
  'nav',
  'section',
  'search',

  // Text content
  'blockquote',
  'dd',
  'div',
  'dl',
  'dt',
  'figcaption',
  'figure',
  'hr',
  'li',
  'menu',
  'ol',
  'p',
  'pre',
  'ul',

  // Inline text semantics
  'a',
  'abbr',
  'b',
  'bdi',
  'bdo',
  'br',
  'cite',
  'code',
  'data',
  'dfn',
  'em',
  'i',
  'kbd',
  'mark',
  'q',
  'rp',
  'rt',
  'ruby',
  's',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'time',
  'u',
  'var',
  'wbr',

  // Image and multimedia
  'area',
  'audio',
  'img',
  'map',
  'track',
  'video',

  // Embedded content
  'embed',
  'fencedframe',
  'iframe',
  'object',
  'picture',
  'source',

  // Scripting
  'canvas',
  'noscript',
  'script',

  // Demarcating edits
  'del',
  'ins',

  // Table content
  'caption',
  'col',
  'colgroup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',

  // Forms
  'button',
  'datalist',
  'fieldset',
  'form',
  'input',
  'label',
  'legend',
  'meter',
  'optgroup',
  'option',
  'output',
  'progress',
  'select',
  'selectedcontent',
  'textarea',

  // Interactive elements
  'details',
  'dialog',
  'summary',

  // Web Components
  'slot',
  'template',

  // SVG and MathML (top-level elements)
  'svg',
  'math',

  // Common deprecated but still supported elements
  'center',
  'font',
  'strike',
  'tt',
]);

/**
 * Check if a tag name is a supported HTML element
 */
export function isSupportedHTMLTag(tagName: string): boolean {
  return SUPPORTED_HTML_TAGS.has(tagName.toLowerCase());
}