import { ScopeTransformer } from './types';

export class TransformerRegistry {
    private transformers: Map<string, ScopeTransformer> = new Map();
    private defaultTransformer: ScopeTransformer | null = null;

    register(scope: string, transformer: ScopeTransformer): void {
        this.transformers.set(scope, transformer);
    }

    setDefault(transformer: ScopeTransformer): void {
        this.defaultTransformer = transformer;
    }

    getTransformer(scope: string): ScopeTransformer | null {
        return this.transformers.get(scope) || this.defaultTransformer;
    }
}

export const registry = new TransformerRegistry();
