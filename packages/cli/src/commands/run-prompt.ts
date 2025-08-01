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
// Dynamic import for ESM module
import type { Root } from "mdast";
import prompts from "prompts";

// Model registry setup (similar to VSCode extension)
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

interface RunPromptOptions {
  input: "props" | "dataset";
  eval?: boolean;
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

const executeTextPropsPrompt = async (input: any) => {
  console.log("\n=== Text Prompt Results ===");
  
  try {
    const { textStream } = streamText(input);
    
    if (textStream) {
      for await (const chunk of textStream) {
        process.stdout.write(chunk);
      }
    }
    console.log("\n");
  } catch (error: any) {
    console.error(`❌ Error generating text: ${error.message}`);
    if (error.message.includes('401') || error.message.includes('API key')) {
      console.error('💡 Please check your API key is valid and has sufficient credits.');
    }
  }
};

const executeObjectPropsPrompt = async (input: any) => {
  console.log("\n=== Object Prompt Results ===");
  
  try {
    const { object } = await generateObject(input);
    console.log(JSON.stringify(object, null, 2));
  } catch (error: any) {
    console.error(`❌ Error generating object: ${error.message}`);
    if (error.message.includes('401') || error.message.includes('API key')) {
      console.error('💡 Please check your API key is valid and has sufficient credits.');
    }
  }
};

const executeImagePropsPrompt = async (input: any) => {
  console.log("\n=== Image Prompt Results ===");
  
  try {
    const result = await generateImage(input);
    console.log(`Generated ${result.images.length} image(s)`);
    
    // Display images in browser
    displayImagesInBrowser(result.images, "AgentMark Generated Images");
    
    // Also show summary in terminal
    result.images.forEach((image, index) => {
      const sizeKB = Math.round(image.base64.length * 0.75 / 1024);
      console.log(`Image ${index + 1}: ${image.mimeType} (${sizeKB}KB) - Opening in browser...`);
    });
  } catch (error: any) {
    console.error(`❌ Error generating images: ${error.message}`);
    if (error.message.includes('401') || error.message.includes('API key')) {
      console.error('💡 Please check your API key is valid and has sufficient credits.');
    }
  }
};

const executeSpeechPropsPrompt = async (input: any) => {
  console.log("\n=== Speech Prompt Results ===");
  
  try {
    const result = await generateSpeech(input);
    
    // Display audio in browser
    displayAudioInBrowser(result.audio, "AgentMark Generated Audio");
    
    // Also show summary in terminal
    const sizeKB = Math.round(result.audio.base64.length * 0.75 / 1024);
    console.log(`Generated audio: ${result.audio.mimeType} (${sizeKB}KB) - Opening in browser...`);
  } catch (error: any) {
    console.error(`❌ Error generating audio: ${error.message}`);
    if (error.message.includes('401') || error.message.includes('API key')) {
      console.error('💡 Please check your API key is valid and has sufficient credits.');
    }
  }
};

const executeTextDatasetPrompt = async (inputs: ReadableStream<any>, options?: RunPromptOptions) => {
  console.log("\n=== Text Dataset Results ===");
  console.log("🔄 Processing dataset entries...\n");
  
  const evalRegistry = createEvalRegistry();
  
  // Determine table structure based on eval option
  let tableHead = ['#', 'Input', 'Expected Output', 'AI Result'];
  let colWidths = [5, 40, 30, 40];
  
  if (options?.eval) {
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
        if (options?.eval && entry.evals && entry.evals.length > 0) {
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
        if (options?.eval) {
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
        const finalColWidths = options?.eval && allEvalNames.length > 0 ? 
          [5, 20, 15, 20, ...allEvalNames.map(() => 12)] : 
          [5, 40, 30, 40];
          
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
        const errorColWidths = options?.eval && allEvalNames.length > 0 ? 
          [5, 20, 15, 20, ...allEvalNames.map(() => 12)] : 
          [5, 40, 30, 40];
          
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
        if (options?.eval) {
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
  const footerWidth = options?.eval && allEvalNames.length > 0 ? 
    1 + 20 + 15 + 20 + (allEvalNames.length * 12) + (allEvalNames.length + 3) : 
    1 + 40 + 30 + 40 + 3;
  console.log('└' + '─'.repeat(footerWidth - 2) + '┘');
};

const executeObjectDatasetPrompt = async (inputs: ReadableStream<any>, options?: RunPromptOptions) => {
  console.log("\n=== Object Dataset Results ===");
  console.log("🔄 Processing dataset entries...\n");
  
  const evalRegistry = createEvalRegistry();
  
  // Determine table structure based on eval option
  let tableHead = ['#', 'Input', 'Expected Output', 'AI Result'];
  let colWidths = [5, 40, 30, 40];
  
  if (options?.eval) {
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
        const { object } = await generateObject(entry.formatted);
        
        const input = JSON.stringify(entry.dataset.input, null, 0);
        const expectedOutput = entry.dataset.expected_output || 'N/A';
        const aiResult = JSON.stringify(object, null, 0);
        
        // Run evaluations if enabled
        let evalResults: any[] = [];
        if (options?.eval && entry.evals && entry.evals.length > 0) {
          evalResults = await runEvaluations(entry.evals, evalRegistry, entry.dataset.input, object, entry.dataset.expected_output);
          
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
          aiResult
        ];
        
        // Add eval columns if enabled
        if (options?.eval) {
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
        const finalColWidths = options?.eval && allEvalNames.length > 0 ? 
          [5, 20, 15, 20, ...allEvalNames.map(() => 12)] : 
          [5, 40, 30, 40];
        
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
        console.error(`❌ Error generating object for entry ${index}: ${error.message}`);
        
        // Still print a table row showing the error
        const errorColWidths = options?.eval && allEvalNames.length > 0 ? 
          [5, 20, 15, 20, ...allEvalNames.map(() => 12)] : 
          [5, 40, 30, 40];
        
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
        if (options?.eval) {
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
  const footerWidth = options?.eval && allEvalNames.length > 0 ? 
    1 + 20 + 15 + 20 + (allEvalNames.length * 12) + (allEvalNames.length + 3) : 
    1 + 40 + 30 + 40 + 3;
  console.log('└' + '─'.repeat(footerWidth - 2) + '┘');
};

const executeImageDatasetPrompt = async (inputs: ReadableStream<any>) => {
  console.log("\n=== Image Dataset Results ===");
  console.log("� Processing dataset entries...\n");
  
  // Print table header immediately
  const headerTable = new Table({
    head: ['#', 'Input', 'Expected Output', 'AI Result'],
    colWidths: [5, 40, 30, 40],
    wordWrap: true
  });
  
  // Print just the header by creating empty table and getting header part
  console.log(headerTable.toString().split('\n').slice(0, 3).join('\n'));

  let index = 1;
  const reader = inputs.getReader();
  
  try {
    while (true) {
      const { done, value: entry } = await reader.read();
      if (done) break;
      
      try {
        const result = await generateImage(entry.formatted);
        
        const input = JSON.stringify(entry.dataset.input, null, 0);
        const expectedOutput = entry.dataset.expected_output || 'N/A';
        
        // Create HTML file for images but don't auto-open
        const title = `AgentMark Dataset Entry ${index} - Generated Images`;
        const htmlFile = createImageFile(result.images, title);
        
        // Create result text for the table with clickable link
        const imageCount = result.images.length;
        const totalSizeKB = result.images.reduce((sum, img) => sum + Math.round(img.base64.length * 0.75 / 1024), 0);
        const clickableLink = createClickableLink(htmlFile, "🖼️ View Images");
        const resultText = `${imageCount} image(s) (${totalSizeKB}KB)\n${clickableLink}`;
        
        // Create a single-row table for this entry and print immediately
        const rowTable = new Table({
          colWidths: [5, 40, 30, 40],
          wordWrap: true,
          style: { head: [] } // No header for individual rows
        });
        
        rowTable.push([
          index.toString(),
          input,
          expectedOutput,
          resultText
        ]);
        
        // Print just the data row (skip header lines)
        const tableString = rowTable.toString();
        const lines = tableString.split('\n');
        console.log(lines.slice(1, -1).join('\n'));
        
        // Print the file path outside the table for full visibility
        printFilePath(htmlFile, `Entry ${index} images:`);
        
      } catch (error: any) {
        console.error(`❌ Error generating images for entry ${index}: ${error.message}`);
        
        // Still print a table row showing the error
        const rowTable = new Table({
          colWidths: [5, 40, 30, 40],
          wordWrap: true,
          style: { head: [] }
        });
        
        const input = JSON.stringify(entry.dataset.input, null, 0);
        const expectedOutput = entry.dataset.expected_output || 'N/A';
        
        rowTable.push([
          index.toString(),
          input,
          expectedOutput,
          `❌ Error: ${error.message}`
        ]);
        
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
  console.log('└───┴──────────────────────────────────────┴─────────────────┴──────────────────────────────────────┘');
};

const executeSpeechDatasetPrompt = async (inputs: ReadableStream<any>) => {
  console.log("\n=== Speech Dataset Results ===");
  console.log("� Processing dataset entries...\n");
  
  // Print table header immediately
  const headerTable = new Table({
    head: ['#', 'Input', 'Expected Output', 'AI Result'],
    colWidths: [5, 40, 30, 40],
    wordWrap: true
  });
  
  // Print just the header by creating empty table and getting header part
  console.log(headerTable.toString().split('\n').slice(0, 3).join('\n'));

  let index = 1;
  const reader = inputs.getReader();
  
  try {
    while (true) {
      const { done, value: entry } = await reader.read();
      if (done) break;
      
      try {
        const result = await generateSpeech(entry.formatted);
        
        const input = JSON.stringify(entry.dataset.input, null, 0);
        const expectedOutput = entry.dataset.expected_output || 'N/A';
        
        // Create HTML file for audio but don't auto-open
        const title = `AgentMark Dataset Entry ${index} - Generated Audio`;
        const htmlFile = createAudioFile(result.audio, title);
        
        // Create result text for the table with clickable link
        const sizeKB = Math.round(result.audio.base64.length * 0.75 / 1024);
        const clickableLink = createClickableLink(htmlFile, "🔊 Play Audio");
        const resultText = `Audio: ${result.audio.mimeType} (${sizeKB}KB)\n${clickableLink}`;
        
        // Create a single-row table for this entry and print immediately
        const rowTable = new Table({
          colWidths: [5, 40, 30, 40],
          wordWrap: true,
          style: { head: [] } // No header for individual rows
        });
        
        rowTable.push([
          index.toString(),
          input,
          expectedOutput,
          resultText
        ]);
        
        // Print just the data row (skip header lines)
        const tableString = rowTable.toString();
        const lines = tableString.split('\n');
        console.log(lines.slice(1, -1).join('\n'));
        
        // Print the file path outside the table for full visibility
        printFilePath(htmlFile, `Entry ${index} audio:`);
        
      } catch (error: any) {
        console.error(`❌ Error generating audio for entry ${index}: ${error.message}`);
        
        // Still print a table row showing the error
        const rowTable = new Table({
          colWidths: [5, 40, 30, 40],
          wordWrap: true,
          style: { head: [] }
        });
        
        const input = JSON.stringify(entry.dataset.input, null, 0);
        const expectedOutput = entry.dataset.expected_output || 'N/A';
        
        rowTable.push([
          index.toString(),
          input,
          expectedOutput,
          `❌ Error: ${error.message}`
        ]);
        
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
  console.log('└───┴──────────────────────────────────────┴─────────────────┴──────────────────────────────────────┘');
};

const runPrompt = async (filepath: string, options: RunPromptOptions) => {
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
  const frontmatter: any = getFrontMatter(ast);

  if (frontmatter?.metadata) {
    console.log("Warning: Old format detected. Please consider updating to the new format.");
  }

  const compiledYaml = await templateEngine.compile({ template: ast });
  let promptKind: PromptKind;
  let promptConfig: any;

  // Determine prompt kind based on config
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
    throw new Error("No config (image_config, object_config, text_config, or speech_config) found in the file.");
  }

  const modelName: string = promptConfig?.model_name || "";

  if (!modelProviderMap[modelName]) {
    throw new Error(`Unsupported model name: ${modelName}`);
  }

  // Get API key from environment or prompt user
  const envVarName = `${modelProviderMap[modelName].toUpperCase()}_API_KEY`;
  let apiKey = process.env[envVarName];
  
  if (!apiKey) {
    const response = await prompts({
      type: 'password',
      name: 'apiKey',
      message: `Enter your ${modelProviderMap[modelName]} API key:`,
      validate: (value: string) => value.length > 0 ? true : 'API key cannot be empty'
    });
    
    if (!response.apiKey) {
      throw new Error('API key is required');
    }
    
    apiKey = response.apiKey;
  }

  // Create AgentMark client
  const agentMark = createAgentMarkClient({
    modelRegistry,
    loader: fileLoader,
  });

  // Load the appropriate prompt type
  const loaderMap: Record<PromptKind, (ast: Root) => any> = {
    text: (ast: Root) => agentMark.loadTextPrompt(ast),
    object: (ast: Root) => agentMark.loadObjectPrompt(ast),
    image: (ast: Root) => agentMark.loadImagePrompt(ast),
    speech: (ast: Root) => agentMark.loadSpeechPrompt(ast),
  };

  const promptLoader = loaderMap[promptKind];
  const prompt = await promptLoader(ast);

  try {
    if (options.input === "dataset") {
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
        await executeImageDatasetPrompt(resultsStream);
      } else if (promptKind === "speech") {
        await executeSpeechDatasetPrompt(resultsStream);
      }
    } else {
      console.log("Running prompt with test props...");
      if (options.eval) {
        console.log("⚠️  Warning: --eval flag is ignored when not using dataset input");
      }
      const result = await prompt.formatWithTestProps({ apiKey });
      
      // Execute with appropriate AI function based on prompt type
      if (promptKind === "text") {
        await executeTextPropsPrompt(result);
      } else if (promptKind === "object") {
        await executeObjectPropsPrompt(result);
      } else if (promptKind === "image") {
        await executeImagePropsPrompt(result);
      } else if (promptKind === "speech") {
        await executeSpeechPropsPrompt(result);
      }
    }
  } catch (error: any) {
    throw new Error(`Error running prompt: ${error.message}`);
  }
};

export default runPrompt;