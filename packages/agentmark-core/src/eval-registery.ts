import { IEvalRegistry, EvalFunction, EvalJudge } from "./types";

export class EvalRegistry implements IEvalRegistry {
  private evals: Map<string, { fn: EvalFunction; judge?: EvalJudge }> = new Map();

  register(name: string | string[], evalFn: EvalFunction, judge?: EvalJudge): this {
    if (typeof name === "string") {
      this.evals.set(name, { fn: evalFn, judge });
    } else {
      name.forEach((n) => this.evals.set(n, { fn: evalFn, judge }));
    }
    return this;
  }

  get(name: string): { fn: EvalFunction; judge?: EvalJudge } | undefined {
    return this.evals.get(name);
  }
}
