import path from "path";
import fs from "fs";
import Table from "cli-table3";
import { VercelAIModelRegistry, createAgentMarkClient } from "@agentmark/vercel-ai-v4-adapter";
import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { FileLoader, PromptKind, TemplateDXTemplateEngine } from "@agentmark/agentmark-core";
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
  evalNames?: string[]; // optional, used to predefine eval columns
}

import { createEvalRegistry, runEvaluations } from "../utils/evals";

// Compute responsive table layout based on terminal width
const getTerminalWidth = (): number => {
  const cols = process.stdout.columns;
  return typeof cols === 'number' && cols > 0 ? cols : 120;
};

type LayoutResult = { head: string[]; colWidths: number[]; stacked: boolean };

const computeLayout = (baseHead: string[], evalNames: string[] = []): LayoutResult => {
  const head = [...baseHead, ...evalNames];
  const numCols = head.length;
  const terminalWidth = getTerminalWidth();

  // Conservative overhead for borders and separators
  const overhead = (numCols + 1) * 3; // borders/joins

  // Minimal widths per column
  const mins: number[] = head.map((h, idx) => {
    if (idx === 0) return 3; // index
    if (h === 'Input') return 12;
    if (h === 'Expected Output') return 12;
    if (h === 'AI Result') return 12;
    // eval columns: ensure name fits within reason
    return Math.max(Math.min(h.length + 4, 18), 10);
  });

  const available = terminalWidth - overhead;
  const sumMins = mins.reduce((a, b) => a + b, 0);

  if (available <= sumMins) {
    // Too narrow: use stacked layout
    return { head, colWidths: mins, stacked: true };
  }

  // Weights to distribute extra space
  const weights: number[] = head.map((h, idx) => {
    if (idx === 0) return 1; // index
    if (h === 'Input') return 4;
    if (h === 'Expected Output') return 3;
    if (h === 'AI Result') return 4;
    return 2; // eval columns
  });

  const extra = available - sumMins;
  const weightSum = weights.reduce((a, b) => a + b, 0);
  const widths = mins.map((min, i) => min + Math.floor((extra * weights[i]) / weightSum));

  // Adjust rounding error on last column
  const diff = available - widths.reduce((a, b) => a + b, 0);
  widths[widths.length - 1] += diff;

  return { head, colWidths: widths, stacked: false };
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

const executeTextDatasetPrompt = async (inputs: ReadableStream<any>, options?: RunPromptOptions): Promise<{ totalEvals: number; passedEvals: number; }> => {
  console.log("\n=== Text Dataset Results ===");
  console.log("🔄 Processing dataset entries...\n");
  
  const evalRegistry = createEvalRegistry();
  let totalEvals = 0;
  let passedEvals = 0;
  
  // Pre-compute eval columns from options (do not add later)
  const initialEvalNames: string[] = options?.eval && options?.evalNames ? options.evalNames : [];
  let allEvalNames: string[] = [...initialEvalNames];
  
  // Determine table structure responsive to terminal width
  const layout = computeLayout(['#', 'Input', 'Expected Output', 'AI Result'], allEvalNames);
  const tableHead = layout.head;
  const colWidths = layout.colWidths;
  
  // Print table header immediately
  const headerTable = new Table({
    head: tableHead,
    colWidths: colWidths,
    wordWrap: true
  });
  
  console.log(headerTable.toString());

  let index = 1;
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
        if (options?.eval && allEvalNames.length > 0) {
          evalResults = await runEvaluations(allEvalNames, evalRegistry, entry.dataset.input, text, entry.dataset.expected_output);
        }
        
        // Create table row
        let rowData = [
          index.toString(),
          input,
          expectedOutput,
          text
        ];
        
        // Add eval columns if enabled
        if (options?.eval && allEvalNames.length > 0) {
          for (const evalName of allEvalNames) {
            const evalResult = evalResults.find(r => r.name === evalName);
            if (evalResult) {
              rowData.push(`${evalResult.score.toFixed(2)} (${evalResult.label})`);
              totalEvals += 1;
              if (evalResult.score >= 1 || ["correct", "reasonable"].includes(evalResult.label)) {
                passedEvals += 1;
              }
            } else {
              rowData.push('N/A');
            }
          }
        }
        
        // Create a single-row table for this entry and print immediately
        const finalColWidths = colWidths;
          
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
        const errorColWidths = colWidths;
          
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
        if (options?.eval && allEvalNames.length > 0) {
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
  return { totalEvals, passedEvals };
};

const executeObjectDatasetPrompt = async (inputs: ReadableStream<any>, options?: RunPromptOptions): Promise<{ totalEvals: number; passedEvals: number; }> => {
  console.log("\n=== Object Dataset Results ===");
  console.log("🔄 Processing dataset entries...\n");
  
  const evalRegistry = createEvalRegistry();
  let totalEvals = 0;
  let passedEvals = 0;
  
  const initialEvalNames: string[] = options?.eval && options?.evalNames ? options.evalNames : [];
  let allEvalNames: string[] = [...initialEvalNames];
  
  // Responsive columns
  const layout = computeLayout(['#', 'Input', 'Expected Output', 'AI Result'], allEvalNames);
  const tableHead = layout.head;
  const colWidths = layout.colWidths;
  
  // Print table header immediately
  const headerTable = new Table({
    head: tableHead,
    colWidths: colWidths,
    wordWrap: true
  });
  
  console.log(headerTable.toString());

  let index = 1;
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
        if (options?.eval && allEvalNames.length > 0) {
          evalResults = await runEvaluations(allEvalNames, evalRegistry, entry.dataset.input, object, entry.dataset.expected_output);
        }
        
        // Create table row
        let rowData = [
          index.toString(),
          input,
          expectedOutput,
          aiResult
        ];
        
        // Add eval columns if enabled
        if (options?.eval && allEvalNames.length > 0) {
          for (const evalName of allEvalNames) {
            const evalResult = evalResults.find(r => r.name === evalName);
            if (evalResult) {
              rowData.push(`${evalResult.score.toFixed(2)} (${evalResult.label})`);
              totalEvals += 1;
              if (evalResult.score >= 1 || ["correct", "reasonable"].includes(evalResult.label)) {
                passedEvals += 1;
              }
            } else {
              rowData.push('N/A');
            }
          }
        }
        
        // Create a single-row table for this entry and print immediately
        const finalColWidths = colWidths;
        
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
        const errorColWidths = colWidths;
        
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
        if (options?.eval && allEvalNames.length > 0) {
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
  return { totalEvals, passedEvals };
};

const executeImageDatasetPrompt = async (inputs: ReadableStream<any>): Promise<{ totalEvals: number; passedEvals: number; }> => {
  console.log("\n=== Image Dataset Results ===");
  console.log("� Processing dataset entries...\n");
  
  // Print table header immediately
  const imgLayout = computeLayout(['#', 'Input', 'Expected Output', 'AI Result']);
  const headerTable = new Table({
    head: imgLayout.head,
    colWidths: imgLayout.colWidths,
    wordWrap: true
  });
  
  // Print just the header by creating empty table and getting header part
  console.log(headerTable.toString());

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
          colWidths: imgLayout.colWidths,
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
          colWidths: imgLayout.colWidths,
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
  // Footer not required when printing rows independently
  return { totalEvals: 0, passedEvals: 0 };
};

const executeSpeechDatasetPrompt = async (inputs: ReadableStream<any>): Promise<{ totalEvals: number; passedEvals: number; }> => {
  console.log("\n=== Speech Dataset Results ===");
  console.log("� Processing dataset entries...\n");
  
  // Print table header immediately
  const spLayout = computeLayout(['#', 'Input', 'Expected Output', 'AI Result']);
  const headerTable = new Table({
    head: spLayout.head,
    colWidths: spLayout.colWidths,
    wordWrap: true
  });
  
  // Print just the header by creating empty table and getting header part
  console.log(headerTable.toString());

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
          colWidths: spLayout.colWidths,
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
          colWidths: spLayout.colWidths,
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
  // Footer not required when printing rows independently
  return { totalEvals: 0, passedEvals: 0 };
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
        await executeTextDatasetPrompt(resultsStream, { ...options, evalNames: (compiledYaml as any)?.test_settings?.evals || [] });
      } else if (promptKind === "object") {
        await executeObjectDatasetPrompt(resultsStream, { ...options, evalNames: (compiledYaml as any)?.test_settings?.evals || [] });
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

export const runExperiment = async (
  filepath: string,
  options: { skipEval?: boolean; thresholdPercent?: number }
) => {
  // Always run with dataset, evals enabled unless skipped
  const evalEnabled = !options.skipEval;
  const resolvedFilepath = path.resolve(process.cwd(), filepath);
  if (!fs.existsSync(resolvedFilepath)) {
    throw new Error(`File not found: ${resolvedFilepath}`);
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

  const agentMark = createAgentMarkClient({ modelRegistry, loader: fileLoader });
  const loaderMap: Record<PromptKind, (ast: Root) => any> = {
    text: (ast: Root) => agentMark.loadTextPrompt(ast),
    object: (ast: Root) => agentMark.loadObjectPrompt(ast),
    image: (ast: Root) => agentMark.loadImagePrompt(ast),
    speech: (ast: Root) => agentMark.loadSpeechPrompt(ast),
  };
  const prompt = await loaderMap[promptKind](ast);

  const resultsStream = await prompt.formatWithDataset({ apiKey });
  const evalNames = (compiledYaml as any)?.test_settings?.evals || [];
  const execOptions = { input: 'dataset' as const, eval: evalEnabled, evalNames };
  let counters = { totalEvals: 0, passedEvals: 0 };
  if (promptKind === 'text') {
    counters = await executeTextDatasetPrompt(resultsStream, execOptions);
  } else if (promptKind === 'object') {
    counters = await executeObjectDatasetPrompt(resultsStream, execOptions);
  } else if (promptKind === 'image') {
    counters = await executeImageDatasetPrompt(resultsStream);
  } else if (promptKind === 'speech') {
    counters = await executeSpeechDatasetPrompt(resultsStream);
  }

  const { totalEvals, passedEvals } = counters;
  if (options.thresholdPercent !== undefined) {
    const t = options.thresholdPercent;
    if (!Number.isFinite(t) || t < 0 || t > 100) {
      throw new Error(`Invalid threshold: ${t}. Threshold must be between 0 and 100.`);
    }
  }
  if (evalEnabled && totalEvals > 0 && options.thresholdPercent !== undefined) {
    const passPct = Math.floor((passedEvals / totalEvals) * 100);
    const threshold = options.thresholdPercent;
    if (passPct < threshold) {
      throw new Error(`Experiment failed: ${passPct}% < threshold ${threshold}% (${passedEvals}/${totalEvals} evals passed)`);
    }
    console.log(`✅ Experiment passed threshold: ${passPct}% >= ${threshold}% (${passedEvals}/${totalEvals})`);
  }
};