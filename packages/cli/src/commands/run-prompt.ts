import path from "path";
import fs from "fs";
import { spawn } from "child_process";

type RunPromptOptions = {
  prompt: string;
  dataset?: boolean;
  props?: string;
  port?: number;
};

const startLocalServer = (port: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    const currentProjectPath = process.cwd();
    
    const serverProcess = spawn('node', [path.join(__dirname, '../json-server.js')], {
      stdio: 'pipe',
      env: {
        ...process.env,
        ROOT_AGENTMARK_PROJECT_PATH: currentProjectPath,
        PORT: port.toString()
      }
    });

    serverProcess.stdout?.on('data', (data) => {
      if (data.toString().includes(`Running on port ${port}`)) {
        resolve();
      }
    });

    serverProcess.on('error', (error) => {
      reject(error);
    });

    // Cleanup on process exit
    process.on('SIGINT', () => {
      serverProcess.kill();
      process.exit();
    });
  });
};

// Helper function to convert ReadableStream to async iterable
async function* streamToAsyncIterable<T>(stream: ReadableStream<T>): AsyncGenerator<T, void, unknown> {
  const reader = stream.getReader();
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield value;
    }
  } finally {
    reader.releaseLock();
  }
}

const handleTextExecution = async (inputs: ReadableStream<any>) => {
  console.log("Text Prompt Results:\n");
  let entryIndex = 1;
  
  for await (const input of streamToAsyncIterable(inputs)) {
    if (entryIndex > 1) {
      console.log(`\n--- Result for Entry ${entryIndex} ---\n`);
    }
    
    const { streamText } = await import("ai");
    const { textStream, fullStream } = streamText(input);
    
    if (textStream) {
      for await (const chunk of textStream) {
        process.stdout.write(chunk);
      }
    }
    
    for await (const chunk of fullStream) {
      if (chunk.type === "error") {
        throw chunk.error;
      }
    }
    
    console.log(); // New line after each entry
    entryIndex++;
  }
};

const handleObjectExecution = async (inputs: ReadableStream<any>) => {
  console.log("Object Prompt Results:\n");
  let entryIndex = 1;
  
  for await (const input of streamToAsyncIterable(inputs)) {
    if (entryIndex > 1) {
      console.log(`\n--- Result for Entry ${entryIndex} ---\n`);
    }
    
    const { generateObject } = await import("ai");
    const { object } = await generateObject(input);
    console.log(JSON.stringify(object, null, 2));
    entryIndex++;
  }
};

const handleImageExecution = async (inputs: ReadableStream<any>, port: number) => {
  console.log("Image Prompt Results:\n");
  let entryIndex = 1;
  
  for await (const input of streamToAsyncIterable(inputs)) {
    if (entryIndex > 1) {
      console.log(`\n--- Result for Entry ${entryIndex} ---\n`);
    }
    
    const { experimental_generateImage: generateImage } = await import("ai");
    const result = await generateImage(input);
    console.log(`Generated ${result.images.length} image(s)`);
    console.log(`View results at: http://localhost:${port}/v1/results/images/${entryIndex}`);
    entryIndex++;
  }
};

const handleSpeechExecution = async (inputs: ReadableStream<any>, port: number) => {
  console.log("Speech Prompt Results:\n");
  let entryIndex = 1;
  
  for await (const input of streamToAsyncIterable(inputs)) {
    if (entryIndex > 1) {
      console.log(`\n--- Result for Entry ${entryIndex} ---\n`);
    }
    
    const { experimental_generateSpeech: generateSpeech } = await import("ai");
    const result = await generateSpeech(input);
    console.log(`Generated audio file`);
    console.log(`View results at: http://localhost:${port}/v1/results/audio/${entryIndex}`);
    entryIndex++;
  }
};

const executionHandlerMap = {
  text: handleTextExecution,
  object: handleObjectExecution,
  image: (inputs: ReadableStream<any>, port: number) => handleImageExecution(inputs, port),
  speech: (inputs: ReadableStream<any>, port: number) => handleSpeechExecution(inputs, port),
};

const runPrompt = async (options: RunPromptOptions) => {
  const { prompt: promptPath, dataset = false, props, port = 9003 } = options;
  
  try {
    // Start local server for serving results
    console.log(`Starting local server on port ${port}...`);
    await startLocalServer(port);
    console.log(`Server running at http://localhost:${port}\n`);
    
    // Load the prompt
    const currentProjectPath = process.cwd();
    const agentmarkJsonPath = path.join(currentProjectPath, 'agentmark.json');
    
    if (!fs.existsSync(agentmarkJsonPath)) {
      throw new Error('agentmark.json not found. Please run "agentmark init" first.');
    }
    
    const agentmarkJson = JSON.parse(fs.readFileSync(agentmarkJsonPath, 'utf-8'));
    
    // Dynamic imports for ES modules
    const { FileLoader } = await import("@agentmark/agentmark-core");
    const { load, getFrontMatter } = await import("@agentmark/templatedx");
    const { createAgentMarkClient, VercelAIModelRegistry } = await import("@agentmark/vercel-ai-v4-adapter");
    
    // Create proper model registry
    const modelRegistry = new VercelAIModelRegistry();
    
    // Register OpenAI models
    const { createOpenAI } = await import("@ai-sdk/openai");
    modelRegistry.registerModels(
      ["gpt-4", "gpt-4o", "gpt-3.5-turbo"],
      (name: string, options) => {
        const provider = createOpenAI(options);
        return provider(name);
      }
    );
    
    // Register Anthropic models
    const { createAnthropic } = await import("@ai-sdk/anthropic");
    modelRegistry.registerModels(
      ["claude-3-sonnet-20240229", "claude-3-haiku-20240307"],
      (name: string, options) => {
        const provider = createAnthropic(options);
        return provider(name);
      }
    );
    
    const fileLoader = new FileLoader(agentmarkJson.agentmarkPath);
    
    const fullPromptPath = path.join(agentmarkJson.agentmarkPath, 'agentmark', promptPath);
    const content = fs.readFileSync(fullPromptPath, 'utf-8');
    const ast = await load(fullPromptPath);
    const frontmatter = getFrontMatter(content);
    
    if (!frontmatter || typeof frontmatter !== 'object') {
      throw new Error('No frontmatter found in prompt file');
    }
    
    const promptKind = (frontmatter as any).kind || 'text';
    const apiKey = process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY;
    
    if (!apiKey) {
      throw new Error('API key not found. Please set OPENAI_API_KEY or ANTHROPIC_API_KEY environment variable.');
    }
    
    // Create AgentMark client
    const agentMark = createAgentMarkClient({
      loader: fileLoader,
      modelRegistry,
    });
    
    const loaderMap = {
      text: (ast: any) => agentMark.loadTextPrompt(ast),
      object: (ast: any) => agentMark.loadObjectPrompt(ast),
      image: (ast: any) => agentMark.loadImagePrompt(ast),
      speech: (ast: any) => agentMark.loadSpeechPrompt(ast),
    };
    
    const promptLoader = loaderMap[promptKind as keyof typeof loaderMap];
    if (!promptLoader) {
      throw new Error(`Unsupported prompt kind: ${promptKind}`);
    }
    
    const prompt = await promptLoader(ast);
    
    let vercelInputs: ReadableStream<any>;
    
    if (dataset) {
      // Stream dataset results one by one
      vercelInputs = await prompt.formatWithDataset({ apiKey });
    } else {
      // Handle single execution with custom props if provided
      let formatOptions: any = { apiKey };
      
      if (props) {
        try {
          const customProps = JSON.parse(props);
          formatOptions.props = customProps;
        } catch (error) {
          throw new Error('Invalid JSON in props parameter');
        }
      }
      
      const vercelInput = await prompt.format(formatOptions);
      vercelInputs = new ReadableStream({
        start(controller) {
          controller.enqueue(vercelInput);
          controller.close();
        },
      });
    }
    
    // Execute with appropriate handler
    const configExecute = executionHandlerMap[promptKind as keyof typeof executionHandlerMap];
    if (typeof configExecute === 'function') {
      if (promptKind === 'image' || promptKind === 'speech') {
        await (configExecute as any)(vercelInputs, port);
      } else {
        await configExecute(vercelInputs);
      }
    }
    
  } catch (error) {
    console.error('Error running prompt:', error);
    process.exit(1);
  }
};

export default runPrompt;