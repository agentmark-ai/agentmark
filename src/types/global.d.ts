import type { BaseMDXProvidedComponents } from '@puzzlet/templatedx';
import type { ReactElement, FC, ReactNode } from 'react';

interface IfProps {
  condition: boolean;
  children: ReactNode;
}

interface ForEachProps<T = any> {
  arr: T[];
  children: (item: T) => ReactNode;
}

type ForEachComponent = <T>(props: ForEachProps<T>) => ReactElement | null;

interface ExtractTextProps {
  children: ReactNode;
}

interface Components extends BaseMDXProvidedComponents {
  User: FC<ExtractTextProps>;
  Assistant: FC<ExtractTextProps>;
  System: FC<ExtractTextProps>;
}

declare global {
  interface MDXProvidedComponents extends Components {}
}

export function useMDXComponents(): MDXProvidedComponents {
  return components
}

export {};