import { KeysWithKind, PromptShape } from "@agentmark/prompt-core";

export type StrictPick<T, K extends keyof T> = [K] extends [never]
  ? {} & Record<Exclude<keyof any, K>, never>
  : {
      [P in K]: T[P];
    };

export type OptionalPromptShape<T> = PromptShape<T> | undefined;
export type IfShapeIsUndefined<
  T extends OptionalPromptShape<T>,
  Do,
  Else
> = T extends undefined ? Do : Else;

export type FormatAgentProps<
  T extends OptionalPromptShape<T>,
  UsedProps extends Partial<T[K]["input"]>,
  K extends IfShapeIsUndefined<T, any, KeysWithKind<T, "text"> & string>
> = UsedProps &
  IfShapeIsUndefined<
    T,
    Record<string, unknown>,
    Record<Exclude<keyof UsedProps, keyof T[K]["input"]>, never>
  >;

export type FormatMessagesProps<
  T extends OptionalPromptShape<T>,
  UsedProps,
  M,
  K extends IfShapeIsUndefined<T, any, KeysWithKind<T, "text"> & string>
> = IfShapeIsUndefined<
  T,
  { [P in keyof M]: P extends keyof UsedProps ? never : M[P] },
  StrictPick<T[K]["input"], Exclude<keyof T[K]["input"], keyof UsedProps>>
>;
