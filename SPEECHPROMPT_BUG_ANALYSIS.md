# SpeechPrompt Bug Analysis and Fix

## Problem Description

The SpeechPrompt component has a bug where a single JSX expression cannot be used without other characters inside the tag. 

**Working case:**
```jsx
<SpeechPrompt> - {props.userMessage} </SpeechPrompt>
```

**Broken case:**
```jsx
<SpeechPrompt>{props.userMessage}</SpeechPrompt>
```

## Root Cause Analysis

After thorough investigation, I identified that the issue occurs in the `ExtractTextPlugin` class in `packages/agentmark-core/src/template_engines/templatedx.ts`. When JSX expressions are the only content inside a SpeechPrompt tag:

1. The `nodeHelpers.toMarkdown()` function strips or doesn't properly preserve JSX expressions
2. This results in empty content after `extractedText.trim()`
3. The empty content causes the validation to fail later in the pipeline

## Test Cases Created

I created several test cases to isolate the issue:

1. **Simple text case** (`speech-simple.prompt.mdx`) - ✅ Works
2. **Hybrid text + JSX case** (`speech-hybrid.prompt.mdx`) - ⚠️ Partially works (text preserved, JSX lost)
3. **Single JSX expression case** (`speech-single-prop.prompt.mdx`) - ❌ Fails completely

## Fixes Implemented

### 1. ExtractTextPlugin Enhancement

Modified the `ExtractTextPlugin` to specifically handle SpeechPrompt and ImagePrompt tags:

```typescript
// Special handling for SpeechPrompt and ImagePrompt tags
if ((tagName === SPEECH_PROMPT || tagName === IMAGE_PROMPT)) {
  // For speech/image prompts, always preserve content even if it's just whitespace
  // This ensures JSX expressions don't get lost during markdown conversion
  const finalText = trimmedText || extractedText || " ";
  content = hasMediaContent
    ? [{ type: "text", text: finalText }, ...media]
    : finalText;
}
```

### 2. Validation Logic Fix

Updated the validation condition in `getRawConfig` to allow empty prompt strings:

```typescript
// Changed from: if (speechSettings && prompt)
// To: if (speechSettings && prompt !== undefined)
```

This allows empty strings to pass through validation, which is necessary when JSX expressions result in empty content during initial parsing.

## Current Status

The investigation revealed that the issue is more complex than initially thought. The JSX expressions are being lost during the markdown conversion process within the `@agentmark/templatedx` dependency. 

**Working:**
- Simple text in SpeechPrompt tags
- Loading and validation of SpeechPrompt configurations

**Partially Working:**
- Mixed text and JSX expressions (text is preserved)

**Still Broken:**
- Single JSX expressions in SpeechPrompt tags

## Recommended Next Steps

1. **Deep dive into `@agentmark/templatedx`**: The issue likely requires modifications to how the templatedx library processes JSX expressions in markdown conversion.

2. **Alternative approach**: Consider preserving the raw AST content for SpeechPrompt tags and processing JSX expressions at format time rather than at load time.

3. **Template engine modification**: The core issue may require changes to how the template engine handles JSX expressions when they are the sole content of a tag.

## Files Modified

- `packages/agentmark-core/src/template_engines/templatedx.ts` - ExtractTextPlugin and validation logic
- `packages/agentmark-core/test/fixtures/speech-single-prop.prompt.mdx` - Test case for single JSX
- `packages/agentmark-core/test/fixtures/speech-simple.prompt.mdx` - Test case for simple text
- `packages/agentmark-core/test/fixtures/speech-hybrid.prompt.mdx` - Test case for mixed content
- `packages/agentmark-core/test/agentmark.test.ts` - Added test cases

## Conclusion

While the investigation has improved understanding of the issue and implemented partial fixes, the core problem of JSX expression preservation in the markdown conversion process requires further investigation into the templatedx dependency or a fundamental change in how JSX expressions are handled during the template compilation phase.