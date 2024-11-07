import type { BaseMDXProvidedComponents } from '@puzzlet/templatedx';

interface ExtractTextProps {
  children: any;
}

declare global {
  const myFilter: Filters['lower'];

  interface MDXProvidedComponents extends BaseMDXProvidedComponents {}
}
export {};