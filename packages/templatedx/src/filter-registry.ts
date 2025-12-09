export type FilterFunction<
  Input = any,
  Output = any,
  Args extends any[] = any[]
> = (input: Input, ...args: Args) => Output;

export class FilterRegistry {
  private static filters: Map<string, FilterFunction> = new Map();
  private filters: Map<string, FilterFunction> = new Map();

  // Static methods for backwards compatibility
  static register(name: string, filterFunction: FilterFunction): void {
    this.filters.set(name, filterFunction);
  }

  static get(name: string): FilterFunction | undefined {
    return this.filters.get(name);
  }

  static getAll(): Map<string, FilterFunction> {
    return new Map(this.filters);
  }

  static remove(name: string): void {
    this.filters.delete(name);
  }

  static removeAll(): void {
    this.filters.clear();
  }

  // Instance methods for stateful usage
  register(name: string, filterFunction: FilterFunction): void {
    this.filters.set(name, filterFunction);
  }

  get(name: string): FilterFunction | undefined {
    return this.filters.get(name);
  }

  getAll(): Map<string, FilterFunction> {
    return new Map(this.filters);
  }

  remove(name: string): void {
    this.filters.delete(name);
  }

  removeAll(): void {
    this.filters.clear();
  }

  // Copy static filters to instance (useful for inheriting built-ins)
  copyFromStatic(): void {
    FilterRegistry.filters.forEach((filter, name) => {
      this.filters.set(name, filter);
    });
  }
}
