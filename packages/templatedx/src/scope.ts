export class Scope {
  private variables: Record<string, any>;
  private shared: Record<string, any>;
  private parent?: Scope;

  constructor(variables: Record<string, any> = {}, shared: Record<string, any>, parent?: Scope) {
    this.variables = variables;
    // shared = global scope
    this.shared = shared; 
    this.parent = parent;
  }

  get(key: string): any {
    if (key in this.variables) {
      return this.variables[key];
    } else if (this.parent) {
      return this.parent.get(key);
    } else if (key in this.shared) {
      return this.shared[key];
    } else {
      return undefined;
    }
  }

  getLocal(key: string): any {
    return this.variables[key];
  }

  getShared(key: string): any {
    return this.shared[key]
  }

  setShared(key: string, value: any): void {
    this.shared[key] = value;
  }

  setLocal(key: string, value: any): void {
    this.variables[key] = value;
  }

  createChild(variables: Record<string, any> = {}): Scope {
    return new Scope(variables, this.shared, this);
  }
}
