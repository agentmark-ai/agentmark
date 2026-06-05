export interface VectorFile<TCase = unknown> {
  description: string;
  cases: TCase[];
}

export interface DatasetItemNameCase {
  name: string;
  input: unknown;
  index: number;
  expected: string;
}

export interface FinalizeUsageCase {
  name: string;
  input: {
    inputTokens: number | null;
    outputTokens: number | null;
    totalTokens: number | null;
  };
  expected: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
  } | null;
}

export interface NormalizeErrorCase {
  name: string;
  input: unknown;
  expected: string;
}

export type KnownVectorName = "dataset-item-name" | "finalize-usage" | "normalize-error";

export function loadVector<TCase = unknown>(name: KnownVectorName): VectorFile<TCase>;
export function loadVector<TCase = unknown>(name: string): VectorFile<TCase>;

export const vectorsDir: string;
