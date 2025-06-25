# CLI Dataset Streaming and Clickable Link Fixes

## Issues Fixed

### 1. Dataset Streaming in Terminal
**Problem**: Dataset results were not being streamed in the terminal as each row finished. Results would wait for everything to finish all at once.

**Solution**: 
- Created a new `run-prompt` CLI command that properly streams dataset results
- Implemented streaming for all prompt types (text, object, image, speech)
- Added real-time output as each dataset entry completes processing

### 2. Clickable Link Issue
**Problem**: Clickable links were not working (likely using `file://` protocol which doesn't work in browsers/terminals).

**Solution**:
- Replaced `file://` URLs with `http://localhost` URLs
- Added a local server that serves results via web interface
- Image and speech results now display clickable `http://localhost:PORT` links

## Changes Made

### New Files Created
1. **`packages/cli/src/commands/run-prompt.ts`**
   - New CLI command for running prompts with dataset support
   - Streams dataset results one by one as they complete
   - Supports all prompt types: text, object, image, speech
   - Uses proper localhost URLs for serving results

### Files Modified
1. **`packages/cli/src/index.ts`**
   - Added new `run-prompt` command to CLI
   - Command syntax: `agentmark run-prompt <prompt> [options]`
   - Options: `-d/--dataset`, `-p/--props`, `--port`

2. **`packages/cli/src/json-server.ts`**
   - Extended to serve image and audio results via HTTP endpoints
   - Added `/v1/results/images/:id` and `/v1/results/audio/:id` endpoints
   - Serves HTML pages with embedded media for easy viewing

3. **`packages/cli/package.json`**
   - Added required dependencies for AI SDK and AgentMark packages

## Usage Examples

### Stream Dataset Results
```bash
# Run a prompt with dataset streaming
agentmark run-prompt customer-reply.prompt.mdx --dataset

# Stream results and view on custom port
agentmark run-prompt image.prompt.mdx --dataset --port 9005
```

### Single Prompt Execution
```bash
# Run a single prompt with test props
agentmark run-prompt text.prompt.mdx

# Run with custom props
agentmark run-prompt text.prompt.mdx --props '{"name": "John", "age": 30}'
```

## Key Features

### Real-time Streaming
- Each dataset entry is processed and displayed immediately
- No waiting for all entries to complete
- Progress is visible as `--- Result for Entry N ---` headers

### Clickable Links
- Image results: `http://localhost:PORT/v1/results/images/ENTRY_ID`
- Audio results: `http://localhost:PORT/v1/results/audio/ENTRY_ID`
- Links open in browser with proper media display

### Error Handling
- Validates agentmark.json exists
- Checks for required API keys (OpenAI or Anthropic)
- Provides clear error messages for missing dependencies

### Model Registry
- Supports OpenAI models: gpt-4, gpt-4o, gpt-3.5-turbo
- Supports Anthropic models: claude-3-sonnet, claude-3-haiku
- Automatically configures based on available API keys

## Technical Implementation

### Streaming Approach
- Uses `ReadableStream` with custom async iterator conversion
- Processes each dataset entry individually
- Outputs results immediately without buffering

### Server Architecture
- Spawns local Express server on configurable port
- Serves static HTML pages for media results
- Uses data URIs for embedding images/audio directly in HTML

### Dynamic Imports
- Uses dynamic imports for ES module compatibility
- Handles CommonJS/ESM interop properly
- Lazy loads AI SDK modules as needed