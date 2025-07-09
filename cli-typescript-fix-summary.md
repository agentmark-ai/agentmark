# CLI TypeScript Fix Summary

## Problem
After upgrading agentmark-core to use templatedx 0.8.0 with stateful TemplateDX instances, the CLI package was failing to build with TypeScript errors:

```
error TS2339: Property 'speech_config' does not exist on type 'AgentmarkConfig'.
error TS2339: Property 'image_config' does not exist on type 'AgentmarkConfig'.
error TS2339: Property 'object_config' does not exist on type 'AgentmarkConfig'.
error TS2339: Property 'text_config' does not exist on type 'AgentmarkConfig'.
```

## Root Cause
The issue was in `packages/cli/src/commands/run-prompt.ts` where the code was attempting to access specific configuration properties on the `AgentmarkConfig` union type:

```typescript
// This was causing TypeScript errors:
if (compiledYaml?.image_config) {
  promptKind = "image";
  promptConfig = compiledYaml.image_config;
} else if (compiledYaml?.object_config) {
  promptKind = "object";
  promptConfig = compiledYaml.object_config;
} // ... etc
```

The problem was that `AgentmarkConfig` is a union type:
```typescript
export type AgentmarkConfig =
  | ObjectConfig
  | ImageConfig
  | SpeechConfig
  | TextConfig;
```

TypeScript couldn't guarantee that the specific config properties existed on all members of the union, even though they logically should exist on their respective types.

## Solution
The fix was to use the `in` operator for proper type narrowing instead of optional chaining (`?.`):

```typescript
// Fixed version using 'in' operator:
if ('image_config' in compiledYaml) {
  promptKind = "image";
  promptConfig = compiledYaml.image_config;
} else if ('object_config' in compiledYaml) {
  promptKind = "object";
  promptConfig = compiledYaml.object_config;
} else if ('text_config' in compiledYaml) {
  promptKind = "text";
  promptConfig = compiledYaml.text_config;
} else if ('speech_config' in compiledYaml) {
  promptKind = "speech";
  promptConfig = compiledYaml.speech_config;
} else {
  throw new Error("No config found in the file.");
}
```

## Why This Works
The `in` operator acts as a type guard that narrows the union type. When TypeScript sees `'image_config' in compiledYaml`, it knows that `compiledYaml` must be of type `ImageConfig` (the only member of the union that has an `image_config` property), allowing safe access to `compiledYaml.image_config`.

## Results
After applying this fix:
- ✅ All packages build successfully
- ✅ All 12 tests in agentmark-core pass
- ✅ All tests across all packages pass
- ✅ No breaking changes to existing functionality

## Files Modified
- `packages/cli/src/commands/run-prompt.ts` - Updated type narrowing logic

This fix ensures proper TypeScript type safety while maintaining the same runtime behavior.