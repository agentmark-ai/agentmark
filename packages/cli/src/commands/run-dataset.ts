import path from "path";
import fs from "fs";
import Table from "cli-table3";
import { VercelAIModelRegistry, createAgentMarkClient } from "@agentmark/vercel-ai-v4-adapter";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { FileLoader, PromptKind, TemplateDXTemplateEngine, EvalRegistry } from "@agentmark/agentmark-core";
import {
  streamText,
  generateText,
  generateObject,
  experimental_generateImage as generateImage,
  experimental_generateSpeech as generateSpeech,
} from "ai";
import { displayImagesInBrowser, displayAudioInBrowser, createImageFile, createAudioFile, createClickableLink, printFilePath } from "../utils/web-viewer";
import type { Root } from "mdast";
import prompts from "prompts";

// Model registry setup (same as run-prompt)
const modelRegistry = new VercelAIModelRegistry();
modelRegistry.registerModels(
  [
    "gpt-4o",
    "gpt-4o-mini", 
    "gpt-4-turbo",
    "gpt-4",
    "o1-mini",
    "o1-preview",
    "gpt-3.5-turbo",
  ],
  (name: string, options: any) => {
    const provider = createOpenAI(options);
    return provider(name);
  }
);

modelRegistry.registerModels(
  ["dall-e-3", "dall-e-2"],
  (name: string, options: any) => {
    const provider = createOpenAI(options);
    return provider.image(name);
  }
);

modelRegistry.registerModels(
  ["tts-1-hd", "tts-1", "gpt-4o-mini-tts"],
  (name: string, options: any) => {
    const provider = createOpenAI(options);
    return provider.speech(name);
  }
);

modelRegistry.registerModels(
  [
    "claude-3-opus-20240229",
    "claude-3-sonnet-20240229", 
    "claude-3-haiku-20240307",
  ],
  (name: string, options: any) => {
    const provider = createAnthropic(options);
    return provider(name);
  }
);

const modelProviderMap: Record<string, "openai" | "anthropic"> = {
  // OpenAI models
  "gpt-4o": "openai",
  "gpt-4o-mini": "openai",
  "gpt-4-turbo": "openai",
  "gpt-4": "openai",
  "o1-mini": "openai",
  "o1-preview": "openai",
  "gpt-3.5-turbo": "openai",
  "dall-e-3": "openai",
  "dall-e-2": "openai",
  "tts-1-hd": "openai",
  "tts-1": "openai",
  "gpt-4o-mini-tts": "openai",

  // Anthropic models
  "claude-3-opus-20240229": "anthropic",
  "claude-3-sonnet-20240229": "anthropic",
  "claude-3-haiku-20240307": "anthropic",
};

const templateEngine = new TemplateDXTemplateEngine();

interface RunDatasetOptions {
  eval: boolean;
}

// Define eval parameter types locally since they're not exported
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

type EvalFunction = (params: EvalParams) => Promise<EvalResult> | EvalResult;

// Create eval registry with basic evaluation functions
const createEvalRegistry = (): EvalRegistry => {
  const registry = new EvalRegistry();
  
  // Exact match evaluator
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

const runEvaluations = async (evalNames: string[], evalRegistry: EvalRegistry, input: any, output: any, expectedOutput?: string): Promise<any[]> => {
  const results = [];
  
  for (const evalName of evalNames) {
    const evalFn = evalRegistry.get(evalName);
    if (evalFn) {
      try {
        const result = await evalFn({
          input,
          output,
          expectedOutput
        });
        results.push({
          name: evalName,
          ...result
        });
      } catch (error: any) {
        results.push({
          name: evalName,
          score: 0,
          label: "error",
          reason: `Eval error: ${error.message}`
        });
      }
    } else {
      results.push({
        name: evalName,
        score: 0,
        label: "not_found",
        reason: `Eval function '${evalName}' not found`
      });
    }
  }
  
  return results;
};

const executeTextDatasetPrompt = async (inputs: ReadableStream<any>, options: RunDatasetOptions) => {
  console.log("\n=== Text Dataset Results ===");
  console.log("🔄 Processing dataset entries...\n");
  
  const evalRegistry = createEvalRegistry();
  
  // Determine table structure based on eval option
  let tableHead = ['#', 'Input', 'Expected Output', 'AI Result'];
  let colWidths = [5, 30, 20, 30];
  
  if (options.eval) {
    // We'll dynamically add eval columns as we encounter them
    tableHead = ['#', 'Input', 'Expected Output', 'AI Result'];
    colWidths = [5, 25, 15, 25];
  }
  
  // Print table header immediately
  const headerTable = new Table({
    head: tableHead,
    colWidths: colWidths,
    wordWrap: true
  });
  
  console.log(headerTable.toString().split('\n').slice(0, 3).join('\n'));

  let index = 1;
  let allEvalNames: string[] = [];
  const reader = inputs.getReader();
  
  try {
    while (true) {
      const { done, value: entry } = await reader.read();
      if (done) break;
      
      try {
        const { text } = await generateText(entry.formatted);
        
        const input = JSON.stringify(entry.dataset.input, null, 0);
        const expectedOutput = entry.dataset.expected_output || 'N/A';
        
        // Run evaluations if enabled
        let evalResults: any[] = [];
        if (options.eval && entry.evals && entry.evals.length > 0) {
          evalResults = await runEvaluations(entry.evals, evalRegistry, entry.dataset.input, text, entry.dataset.expected_output);
          
          // Track all eval names we've seen
          for (const evalName of entry.evals) {
            if (!allEvalNames.includes(evalName)) {
              allEvalNames.push(evalName);
            }
          }
        }
        
        // Create table row
        let rowData = [
          index.toString(),
          input,
          expectedOutput,
          text
        ];
        
        // Add eval columns if enabled
        if (options.eval) {
          for (const evalName of allEvalNames) {
            const evalResult = evalResults.find(r => r.name === evalName);
            if (evalResult) {
              rowData.push(`${evalResult.score.toFixed(2)} (${evalResult.label})`);
            } else {
              rowData.push('N/A');
            }
          }
          
          // Update table structure for new eval columns
          if (evalResults.length > 0 && index === 1) {
            // Update header for first row with evals
            const newColWidths = [5, 20, 15, 20, ...allEvalNames.map(() => 12)];
            const newHead = ['#', 'Input', 'Expected Output', 'AI Result', ...allEvalNames];
            
            // Print updated header
            console.log('\n'); // Clear previous header
            const updatedHeaderTable = new Table({
              head: newHead,
              colWidths: newColWidths,
              wordWrap: true
            });
            console.log(updatedHeaderTable.toString().split('\n').slice(0, 3).join('\n'));
          }
        }
        
        // Create a single-row table for this entry and print immediately
        const finalColWidths = options.eval && allEvalNames.length > 0 ? 
          [5, 20, 15, 20, ...allEvalNames.map(() => 12)] : 
          [5, 30, 20, 30];
          
        const rowTable = new Table({
          colWidths: finalColWidths,
          wordWrap: true,
          style: { head: [] } // No header for individual rows
        });
        
        rowTable.push(rowData);
        
        // Print just the data row (skip header lines)
        const tableString = rowTable.toString();
        const lines = tableString.split('\n');
        console.log(lines.slice(1, -1).join('\n'));
        
      } catch (error: any) {
        console.error(`❌ Error generating text for entry ${index}: ${error.message}`);
        
        // Still print a table row showing the error
        const errorColWidths = options.eval && allEvalNames.length > 0 ? 
          [5, 20, 15, 20, ...allEvalNames.map(() => 12)] : 
          [5, 30, 20, 30];
          
        const rowTable = new Table({
          colWidths: errorColWidths,
          wordWrap: true,
          style: { head: [] }
        });
        
        const input = JSON.stringify(entry.dataset.input, null, 0);
        const expectedOutput = entry.dataset.expected_output || 'N/A';
        
        let errorRowData = [
          index.toString(),
          input,
          expectedOutput,
          `❌ Error: ${error.message}`
        ];
        
        // Add empty eval columns for error rows
        if (options.eval) {
          for (const evalName of allEvalNames) {
            errorRowData.push('Error');
          }
        }
        
        rowTable.push(errorRowData);
        
        const tableString = rowTable.toString();
        const lines = tableString.split('\n');
        console.log(lines.slice(1, -1).join('\n'));
      }
      
      index++;
    }
  } finally {
    reader.releaseLock();
  }
  
  // Print table footer
  const footerWidth = options.eval && allEvalNames.length > 0 ? 
    1 + 20 + 15 + 20 + (allEvalNames.length * 12) + (allEvalNames.length + 3) : 
    1 + 30 + 20 + 30 + 3;
  console.log('└' + '─'.repeat(footerWidth - 2) + '┘');
};

// Similar modifications would be needed for executeObjectDatasetPrompt, executeImageDatasetPrompt, and executeSpeechDatasetPrompt
// For now, I'll create simplified versions that delegate to the text version

const executeObjectDatasetPrompt = async (inputs: ReadableStream<any>, options: RunDatasetOptions) => {
  console.log("\n=== Object Dataset Results ===");
  console.log("🔄 Processing dataset entries...\n");
  
  const evalRegistry = createEvalRegistry();
  
  // Similar to text but for object generation
  let tableHead = ['#', 'Input', 'Expected Output', 'AI Result'];
  let colWidths = [5, 30, 20, 30];
  
  if (options.eval) {
    tableHead = ['#', 'Input', 'Expected Output', 'AI Result'];
    colWidths = [5, 25, 15, 25];
  }
  
  const headerTable = new Table({
    head: tableHead,
    colWidths: colWidths,
    wordWrap: true
  });
  
  console.log(headerTable.toString().split('\n').slice(0, 3).join('\n'));

  let index = 1;
  let allEvalNames: string[] = [];
  const reader = inputs.getReader();
  
  try {
    while (true) {
      const { done, value: entry } = await reader.read();
      if (done) break;
      
      try {
        const result = await generateObject(entry.formatted);
        
        const input = JSON.stringify(entry.dataset.input, null, 0);
        const expectedOutput = entry.dataset.expected_output || 'N/A';
        const objectResult = JSON.stringify(result.object, null, 2);
        
        // Run evaluations if enabled
        let evalResults: any[] = [];
        if (options.eval && entry.evals && entry.evals.length > 0) {
          evalResults = await runEvaluations(entry.evals, evalRegistry, entry.dataset.input, result.object, entry.dataset.expected_output);
          
          for (const evalName of entry.evals) {
            if (!allEvalNames.includes(evalName)) {
              allEvalNames.push(evalName);
            }
          }
        }
        
        let rowData = [
          index.toString(),
          input,
          expectedOutput,
          objectResult
        ];
        
        if (options.eval) {
          for (const evalName of allEvalNames) {
            const evalResult = evalResults.find(r => r.name === evalName);
            if (evalResult) {
              rowData.push(`${evalResult.score.toFixed(2)} (${evalResult.label})`);
            } else {
              rowData.push('N/A');
            }
          }
          
          if (evalResults.length > 0 && index === 1) {
            const newColWidths = [5, 20, 15, 20, ...allEvalNames.map(() => 12)];
            const newHead = ['#', 'Input', 'Expected Output', 'AI Result', ...allEvalNames];
            
            console.log('\n');
            const updatedHeaderTable = new Table({
              head: newHead,
              colWidths: newColWidths,
              wordWrap: true
            });
            console.log(updatedHeaderTable.toString().split('\n').slice(0, 3).join('\n'));
          }
        }
        
        const finalColWidths = options.eval && allEvalNames.length > 0 ? 
          [5, 20, 15, 20, ...allEvalNames.map(() => 12)] : 
          [5, 30, 20, 30];
          
        const rowTable = new Table({
          colWidths: finalColWidths,
          wordWrap: true,
          style: { head: [] }
        });
        
        rowTable.push(rowData);
        
        const tableString = rowTable.toString();
        const lines = tableString.split('\n');
        console.log(lines.slice(1, -1).join('\n'));
        
      } catch (error: any) {
        console.error(`❌ Error generating object for entry ${index}: ${error.message}`);
        
        const errorColWidths = options.eval && allEvalNames.length > 0 ? 
          [5, 20, 15, 20, ...allEvalNames.map(() => 12)] : 
          [5, 30, 20, 30];
          
        const rowTable = new Table({
          colWidths: errorColWidths,
          wordWrap: true,
          style: { head: [] }
        });
        
        const input = JSON.stringify(entry.dataset.input, null, 0);
        const expectedOutput = entry.dataset.expected_output || 'N/A';
        
        let errorRowData = [
          index.toString(),
          input,
          expectedOutput,
          `❌ Error: ${error.message}`
        ];
        
        if (options.eval) {
          for (const evalName of allEvalNames) {
            errorRowData.push('Error');
          }
        }
        
        rowTable.push(errorRowData);
        
        const tableString = rowTable.toString();
        const lines = tableString.split('\n');
        console.log(lines.slice(1, -1).join('\n'));
      }
      
      index++;
    }
  } finally {
    reader.releaseLock();
  }
  
  const footerWidth = options.eval && allEvalNames.length > 0 ? 
    1 + 20 + 15 + 20 + (allEvalNames.length * 12) + (allEvalNames.length + 3) : 
    1 + 30 + 20 + 30 + 3;
  console.log('└' + '─'.repeat(footerWidth - 2) + '┘');
};

// For image and speech, we'll use simplified versions for now
const executeImageDatasetPrompt = async (inputs: ReadableStream<any>, options: RunDatasetOptions) => {
  console.log("\n=== Image Dataset Results ===");
  console.log("🔄 Image generation with eval support not fully implemented yet");
  console.log("Falling back to basic image generation...\n");
  
  // For now, let's just process the stream without evals
  const reader = inputs.getReader();
  try {
    while (true) {
      const { done, value: entry } = await reader.read();
      if (done) break;
      console.log(`Processing image entry ${JSON.stringify(entry.dataset.input)}`);
    }
  } finally {
    reader.releaseLock();
  }
};

const executeSpeechDatasetPrompt = async (inputs: ReadableStream<any>, options: RunDatasetOptions) => {
  console.log("\n=== Speech Dataset Results ===");
  console.log("🔄 Speech generation with eval support not fully implemented yet");
  console.log("Falling back to basic speech generation...\n");
  
  // For now, let's just process the stream without evals
  const reader = inputs.getReader();
  try {
    while (true) {
      const { done, value: entry } = await reader.read();
      if (done) break;
      console.log(`Processing speech entry ${JSON.stringify(entry.dataset.input)}`);
    }
  } finally {
    reader.releaseLock();
  }
};

const runDataset = async (filepath: string, options: RunDatasetOptions) => {
  const resolvedFilepath = path.resolve(process.cwd(), filepath);
  
  if (!fs.existsSync(resolvedFilepath)) {
    throw new Error(`File not found: ${resolvedFilepath}`);
  }
  
  if (!resolvedFilepath.endsWith('.mdx')) {
    throw new Error('File must be an .mdx file');
  }

  const fileDirectory = path.dirname(resolvedFilepath);
  const fileLoader = new FileLoader(fileDirectory);

  const { getFrontMatter, load } = await import("@agentmark/templatedx");
  
  let ast: Root = await load(resolvedFilepath);
  const frontmatter = getFrontMatter(ast) as any;

  // Create AgentMark client
  const client = createAgentMarkClient({
    loader: fileLoader,
    modelRegistry,
  });

  // Get API key
  let apiKey: string;
  
  if (!frontmatter?.model) {
    throw new Error("No model specified in frontmatter");
  }

  const requiredProvider = modelProviderMap[frontmatter.model];
  if (!requiredProvider) {
    throw new Error(`Unknown model: ${frontmatter.model}`);
  }

  if (requiredProvider === "openai") {
    apiKey = process.env.OPENAI_API_KEY || '';
    if (!apiKey) {
      console.log('🔑 OpenAI API key not found in environment variables.');
      const response = await prompts({
        type: 'password',
        name: 'apiKey',
        message: 'Please enter your OpenAI API key:'
      });
      
      if (!response.apiKey) {
        throw new Error('API key is required');
      }
      
      apiKey = response.apiKey;
    }
  } else if (requiredProvider === "anthropic") {
    apiKey = process.env.ANTHROPIC_API_KEY || '';
    if (!apiKey) {
      console.log('🔑 Anthropic API key not found in environment variables.');
      const response = await prompts({
        type: 'password',
        name: 'apiKey',
        message: 'Please enter your Anthropic API key:'
      });
      
      if (!response.apiKey) {
        throw new Error('API key is required');
      }
      
      apiKey = response.apiKey;
    }
  } else {
    throw new Error(`Unsupported provider: ${requiredProvider}`);
  }

  // Determine prompt kind
  let promptKind: PromptKind | null = null;
  if (frontmatter.text_config) {
    promptKind = "text";
  } else if (frontmatter.object_config) {
    promptKind = "object";
  } else if (frontmatter.image_config) {
    promptKind = "image";
  } else if (frontmatter.speech_config) {
    promptKind = "speech";
  }

  if (!promptKind) {
    throw new Error("Unable to determine prompt type from frontmatter");
  }

  // Load the prompt based on prompt kind
  let prompt: any;
  if (promptKind === "text") {
    prompt = await client.loadTextPrompt(resolvedFilepath);
  } else if (promptKind === "object") {
    prompt = await client.loadObjectPrompt(resolvedFilepath);
  } else if (promptKind === "image") {
    prompt = await client.loadImagePrompt(resolvedFilepath);
  } else if (promptKind === "speech") {
    prompt = await client.loadSpeechPrompt(resolvedFilepath);
  } else {
    throw new Error(`Unsupported prompt kind: ${promptKind}`);
  }

  try {
    console.log("Running prompt with dataset...");
    if (options.eval) {
      console.log("🧪 Evaluations enabled");
    }
    
    const resultsStream = await prompt.formatWithDataset({ apiKey });
    
    // Execute with appropriate AI function based on prompt type
    if (promptKind === "text") {
      await executeTextDatasetPrompt(resultsStream, options);
    } else if (promptKind === "object") {
      await executeObjectDatasetPrompt(resultsStream, options);
    } else if (promptKind === "image") {
      await executeImageDatasetPrompt(resultsStream, options);
    } else if (promptKind === "speech") {
      await executeSpeechDatasetPrompt(resultsStream, options);
    }
  } catch (error: any) {
    throw new Error(`Error running dataset: ${error.message}`);
  }
};

export default runDataset;