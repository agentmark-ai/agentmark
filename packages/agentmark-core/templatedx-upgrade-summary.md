# TemplateDX 0.8.0 Upgrade Summary

This document summarizes the successful upgrade of agentmark-core from templatedx 0.6.3 to 0.8.0, including the refactoring to use stateful TemplateDX instances.

## Overview

The upgrade involved transitioning from static method usage to a new stateful architecture with three separate TemplateDX instances for different content types. A critical fix was implemented to ensure the correct TemplateDX instance is used during prompt validation.

## Key Changes

### 1. Dependency Update
- **File**: `package.json`
- **Change**: Updated `@agentmark/templatedx` from `^0.6.3` to `^0.8.0`
- **Status**: ✅ Complete

### 2. New Instance Architecture
- **File**: `src/template_engines/templatedx-instances.ts` (new file)
- **Purpose**: Created three dedicated TemplateDX instances:
  - `imageTemplateDX` - For image generation prompts (registers `ImagePrompt` tag)
  - `speechTemplateDX` - For speech generation prompts (registers `System`, `SpeechPrompt` tags)
  - `languageTemplateDX` - For text and object generation prompts (registers `User`, `System`, `Assistant`, `ImageAttachment`, `FileAttachment` tags)
- **Features**:
  - Each instance initialized without `includeBuiltins` (updated approach)
  - Specialized plugin registration per instance type
  - Helper functions for instance selection and prompt type determination
- **Status**: ✅ Complete

### 3. Plugin System Refactoring
- **Previous**: Static `TagPluginRegistry.register()` calls
- **New**: Instance-based `instance.registerTagPlugin()` calls
- **Plugins Registered**:
  - `ExtractTextPlugin` for role and prompt tags
  - `ExtractMediaPlugin` for attachment tags (only on `languageTemplateDX`)
- **Key Insight**: Each instance only registers the tags it needs to validate
- **Status**: ✅ Complete

### 4. **Critical Loader Fix**
- **File**: `src/loaders/file.ts`
- **Problem Identified**: The loader was not using the correct TemplateDX instance based on prompt type
- **Root Cause**: Validation happens during parsing, so the wrong instance would fail validation even if the correct instance had the required tags registered
- **Solution**: 
  1. **Updated `Loader` interface**: Added optional `promptType` parameter to `load()` method
  2. **Updated `AgentMark` class**: Modified `loadImagePrompt()`, `loadSpeechPrompt()`, `loadTextPrompt()`, and `loadObjectPrompt()` to pass the correct prompt type
  3. **Updated `FileLoader`**: Added mapping logic to convert `PromptKind` to appropriate TemplateDX instance type
- **Mapping Logic**:
  ```typescript
  'image' → imageTemplateDX
  'speech' → speechTemplateDX  
  'text'/'object' → languageTemplateDX
  ```
- **Status**: ✅ Complete

### 5. Template Engine Updates
- **File**: `src/template_engines/templatedx.ts`
- **Changes**:
  - Removed duplicate plugin class definitions (moved to instances file)
  - Simplified to focus on core transformation logic
  - Now imports instances from `templatedx-instances.ts`
  - Uses instance-based `transform()` method instead of static calls
- **Status**: ✅ Complete

## Technical Implementation Details

### Instance Selection Logic
```typescript
function mapPromptKindToInstanceType(promptKind: PromptKind): TemplatedXInstanceType {
  switch (promptKind) {
    case 'image': return 'image';
    case 'speech': return 'speech';
    case 'text':
    case 'object': return 'language';
    default: return 'language';
  }
}
```

### Tag Registration Strategy
Each instance registers only the tags it needs to validate:
- **imageTemplateDX**: `ImagePrompt`
- **speechTemplateDX**: `System`, `SpeechPrompt`  
- **languageTemplateDX**: `User`, `System`, `Assistant`, `ImageAttachment`, `FileAttachment`

### Critical Validation Fix
The key insight was that templatedx 0.8.0 validates tags during the bundling phase (called from `parse()` method). The solution ensures:
1. The correct TemplateDX instance is selected **before** parsing begins
2. Each instance has exactly the tags needed for its prompt type
3. Validation passes because the right tags are registered on the right instance

## Test Results

All 12 existing tests pass:
- ✅ Type safety validation
- ✅ Image prompt loading and compilation (now uses `imageTemplateDX`)
- ✅ Speech prompt loading and compilation (now uses `speechTemplateDX`)
- ✅ Object prompt loading and compilation (now uses `languageTemplateDX`)
- ✅ Rich content extraction with attachments (works with `languageTemplateDX`)
- ✅ Error handling for invalid tags and attachments
- ✅ Data formatting with props and datasets

## Build Status

- ✅ TypeScript compilation successful
- ✅ Bundle generation successful (CJS, ESM, DTS)
- ✅ No breaking changes to public API
- ✅ Backward compatibility maintained (fallback to language instance)

## Benefits Achieved

1. **Correct Validation**: Each prompt type now uses the appropriate TemplateDX instance with the right tags
2. **Modular Architecture**: Separate instances allow for specialized configuration per content type
3. **Future Extensibility**: Easy to add content-type-specific plugins or filters
4. **Improved Performance**: Instances can be optimized for their specific use cases
5. **Better Separation of Concerns**: Clear boundaries between image, speech, and language processing
6. **Maintained Backward Compatibility**: Existing API remains unchanged

## Files Modified

1. `src/types.ts` - Added `promptType` parameter to `Loader` interface
2. `src/agentmark.ts` - Updated load methods to pass prompt type
3. `src/loaders/file.ts` - Added prompt type mapping and instance selection
4. `src/template_engines/templatedx-instances.ts` - New instance management with specialized registrations
5. `src/template_engines/templatedx.ts` - Refactored core logic

## Conclusion

The upgrade to templatedx 0.8.0 was completed successfully with:
- **Zero breaking changes** to the public API
- **All tests passing** without modification
- **Correct instance selection** for each prompt type during validation
- **Improved architecture** with three specialized instances
- **Enhanced maintainability** and future extensibility

The critical loader fix ensures that validation works correctly by using the appropriate TemplateDX instance for each prompt type, resolving the tag validation issues that were preventing image and speech prompts from loading correctly.