import type { Root } from 'mdast';
import jsep from 'jsep';
import type { ForEachProps } from "./tag-plugins/for-each";
import type { IfProps, ElseIfProps, ElseProps } from "./tag-plugins/conditional";
import type { RawProps } from "./tag-plugins/raw";

export interface BaseMDXProvidedComponents {
  ForEach: <T = any>(props: ForEachProps<T>) => any;
  If: React.FC<IfProps>;
  ElseIf: React.FC<ElseIfProps>;
  Else: React.FC<ElseProps>;
  Raw: React.FC<RawProps>;
}

export interface ImportMap {
  [componentName: string]: string;
}

export interface ComponentASTs {
  [componentName: string]: Root['children'];
}

export type OperatorFunction = (
  left: any,
  nodeRight: jsep.Expression,
) => any;

export type ContentLoader = (modulePath: string) => Promise<string>;

export interface ExtractedField {
  name: string;
  value: any;
}
