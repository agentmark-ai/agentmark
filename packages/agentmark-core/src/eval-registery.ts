import { IEvalRegistry, EvalFunction } from "./types";

export class EvalRegistry implements IEvalRegistry {
  private evals: Map<string, EvalFunction> = new Map();

  register(name: string | string[], evalFn: EvalFunction): this {
    if (typeof name === "string") {
      this.evals.set(name, evalFn);
    } else {
      name.forEach((n) => this.evals.set(n, evalFn));
    }
    return this;
  }

  get(name: string): EvalFunction | undefined {
    return this.evals.get(name);
  }
}
