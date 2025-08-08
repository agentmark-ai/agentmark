import { EvalRegistry } from "@agentmark/agentmark-core";

// Define eval parameter types locally since they're not exported from CLI
interface EvalParams {
  input: string | Record<string, unknown> | Array<Record<string, unknown> | string>;
  output: string | Record<string, unknown> | Array<Record<string, unknown> | string>;
  expectedOutput?: string;
}

interface EvalResult {
  score: number; // 0-1 scale
  label: string; // e.g., "correct", "incorrect", "partially_correct"
  reason: string; // explanation for the score
}

export type EvalFunction = (params: EvalParams) => Promise<EvalResult> | EvalResult;

export const createEvalRegistry = (): EvalRegistry => {
  const registry = new EvalRegistry();
  
  // Exact match evaluator (string to string)
  registry.register("exact_match", async ({ output, expectedOutput }: EvalParams) => {
    if (!expectedOutput) {
      return { score: 0, label: "no_expected", reason: "No expected output provided" };
    }
    
    const isMatch = String(output).trim() === String(expectedOutput).trim();
    return {
      score: isMatch ? 1 : 0,
      label: isMatch ? "correct" : "incorrect",
      reason: isMatch ? "Output matches expected exactly" : "Output does not match expected"
    };
  });
  
  // Exact match for JSON outputs (deep equality)
  registry.register("exact_match_json", async ({ output, expectedOutput }: EvalParams) => {
    if (expectedOutput == null) {
      return { score: 0, label: "no_expected", reason: "No expected output provided" };
    }
    try {
      const normalize = (val: any): any => {
        if (typeof val === 'string') {
          try {
            return JSON.parse(val);
          } catch {
            return val;
          }
        }
        return val;
      };
      const normalizedOutput = normalize(output);
      const normalizedExpected = normalize(expectedOutput);
      const isEqual = JSON.stringify(normalizedOutput) === JSON.stringify(normalizedExpected);
      return {
        score: isEqual ? 1 : 0,
        label: isEqual ? "correct" : "incorrect",
        reason: isEqual ? "JSON output matches expected" : "JSON output does not match expected"
      };
    } catch (err: any) {
      return { score: 0, label: "error", reason: `JSON compare error: ${err.message}` };
    }
  });
  
  // Contains evaluator (checks if output contains expected text)
  registry.register("contains", async ({ output, expectedOutput }: EvalParams) => {
    if (!expectedOutput) {
      return { score: 0, label: "no_expected", reason: "No expected output provided" };
    }
    
    const contains = String(output).toLowerCase().includes(String(expectedOutput).toLowerCase());
    return {
      score: contains ? 1 : 0,
      label: contains ? "correct" : "incorrect",
      reason: contains ? "Output contains expected text" : "Output does not contain expected text"
    };
  });
  
  // Length evaluator (checks if output length is reasonable)
  registry.register("length_check", async ({ output }: EvalParams) => {
    const length = String(output).length;
    const isReasonable = length > 0 && length < 10000;
    return {
      score: isReasonable ? 1 : 0,
      label: isReasonable ? "reasonable" : "unreasonable",
      reason: `Output length is ${length} characters`
    };
  });
  
  return registry;
};

export const runEvaluations = async (
  evalNames: string[],
  evalRegistry: EvalRegistry,
  input: any,
  output: any,
  expectedOutput?: string
): Promise<any[]> => {
  const results: any[] = [];
  
  for (const evalName of evalNames) {
    const evalFn = evalRegistry.get(evalName);
    if (evalFn) {
      try {
        const result = await evalFn({ input, output, expectedOutput });
        results.push({ name: evalName, ...result });
      } catch (error: any) {
        results.push({ name: evalName, score: 0, label: "error", reason: `Eval error: ${error.message}` });
      }
    } else {
      // Also emit a console error for visibility in CLI
      console.error(`❌ Eval not registered: '${evalName}'. Please register this eval before running.`);
      results.push({ name: evalName, score: 0, label: "not_found", reason: `Eval function '${evalName}' not found` });
    }
  }
  
  return results;
};
