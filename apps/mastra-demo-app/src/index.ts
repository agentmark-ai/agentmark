import "dotenv/config";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";
import { FileLoader } from "@agentmark/agentmark-core";
import { 
  createAgentMarkClient, 
  MastraModelRegistry,
  AgentCreator,
  AgentConfig
} from "@agentmark/mastra-adapter";
import { Agent } from "@mastra/core";
import { openai } from "@ai-sdk/openai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Type definitions for our prompts
type DemoPromptTypes = {
  "math-solver.prompt.mdx": {
    input: { problem: string };
    output: {
      step_by_step_solution: string[];
      final_answer: string;
      confidence: number;
    };
  };
  "creative-writer.prompt.mdx": {
    input: {
      topic: string;
      style: "poem" | "short story" | "essay" | "blog post";
      tone: "serious" | "humorous" | "inspiring" | "mysterious";
    };
    output: never;
  };
  "image-generator.prompt.mdx": {
    input: {
      subject: string;
      style: "realistic" | "artistic" | "cartoon" | "abstract" | "photographic";
      setting: string;
      additional_details?: string;
    };
    output: never;
  };
  "speech-narrator.prompt.mdx": {
    input: {
      text_to_speak: string;
      voice: "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
    };
    output: never;
  };
};

// Agent creator function that works with Mastra
const createMastraAgent: AgentCreator = (name, config, options) => {
  console.log(`🤖 Creating Mastra agent: ${name}`);
  
  return new Agent({
    name: name,
    instructions: config.instructions || "You are a helpful AI assistant.",
    model: config.model || openai("gpt-4o-mini"),
    tools: config.tools,
    memory: config.memory,
    ...options,
  });
};

async function runDemo() {
  console.log("🚀 Starting Mastra + AgentMark Demo");
  console.log("=====================================\n");

  // Verify OpenAI API key
  if (!process.env.OPENAI_API_KEY) {
    console.error("❌ OPENAI_API_KEY environment variable is required");
    console.log("Please set your OpenAI API key in a .env file:");
    console.log("OPENAI_API_KEY=your_api_key_here");
    process.exit(1);
  }

  // Setup AgentMark with Mastra adapter
  const promptsDir = resolve(__dirname, "prompts");
  const fileLoader = new FileLoader(promptsDir);
  
  const modelRegistry = new MastraModelRegistry();
  
  // Register different models with the same creator
  modelRegistry.registerModels([
    "gpt-4o-mini",
    "dall-e-3", 
    "tts-1"
  ], createMastraAgent);
  
  const agentMark = createAgentMarkClient<DemoPromptTypes>({
    loader: fileLoader,
    modelRegistry,
  });

  try {
    // Demo 1: Object Output - Math Problem Solving
    console.log("📊 Demo 1: Object Output - Math Problem Solving");
    console.log("------------------------------------------------");
    
    const mathPrompt = await agentMark.loadObjectPrompt("math-solver.prompt.mdx");
    const mathResult = await mathPrompt.format({
      props: {
        problem: "If a train travels 120 miles in 3 hours, what is its average speed? Then, how long would it take to travel 200 miles at the same speed?"
      }
    });
    
    console.log("Math Problem:", "Train speed calculation");
    console.log("Adapted for Mastra:");
    console.log("- Messages:", mathResult.messages.length);
    console.log("- Output Schema:", mathResult.output ? "✅ Defined" : "❌ Missing");
    console.log("- Temperature:", mathResult.options?.temperature);
    console.log("- Max Tokens:", mathResult.options?.maxTokens);
    console.log();

    // Demo 2: Text Output - Creative Writing
    console.log("✍️  Demo 2: Text Output - Creative Writing");
    console.log("------------------------------------------");
    
    const writerPrompt = await agentMark.loadTextPrompt("creative-writer.prompt.mdx");
    const writerResult = await writerPrompt.format({
      props: {
        topic: "artificial intelligence",
        style: "poem",
        tone: "inspiring"
      }
    });
    
    console.log("Writing Request:", "AI-themed inspirational poem");
    console.log("Adapted for Mastra:");
    console.log("- Messages:", writerResult.messages.length);
    console.log("- Temperature:", writerResult.options?.temperature);
    console.log("- Max Tokens:", writerResult.options?.maxTokens);
    console.log();

    // Demo 3: Image Generation
    console.log("🎨 Demo 3: Image Generation");
    console.log("-----------------------------");
    
    const imagePrompt = await agentMark.loadImagePrompt("image-generator.prompt.mdx");
    const imageResult = await imagePrompt.format({
      props: {
        subject: "a robot teaching a classroom",
        style: "artistic",
        setting: "futuristic school",
        additional_details: "warm lighting, students engaged"
      }
    });
    
    console.log("Image Request:", "Artistic robot teacher scene");
    console.log("Adapted for Mastra:");
    console.log("- Prompt:", imageResult.prompt);
    console.log("- Size:", imageResult.options?.size);
    console.log("- Num Images:", imageResult.options?.n);
    console.log();

    // Demo 4: Speech Synthesis
    console.log("🎙️  Demo 4: Speech Synthesis");
    console.log("-----------------------------");
    
    const speechPrompt = await agentMark.loadSpeechPrompt("speech-narrator.prompt.mdx");
    const speechResult = await speechPrompt.format({
      props: {
        text_to_speak: "Welcome to the future of AI development with AgentMark and Mastra!",
        voice: "nova"
      }
    });
    
    console.log("Speech Request:", "Welcome message");
    console.log("Adapted for Mastra:");
    console.log("- Text:", speechResult.text);
    console.log("- Voice:", speechResult.options?.voice);
    console.log("- Output Format:", speechResult.options?.outputFormat);
    console.log();

    // Demo 5: Runtime Configuration & Telemetry
    console.log("⚙️  Demo 5: Runtime Configuration & Telemetry");
    console.log("----------------------------------------------");
    
    const telemetryResult = await mathPrompt.format({
      props: {
        problem: "What is 15% of 240?"
      },
      telemetry: {
        isEnabled: true,
        functionId: "demo-math-1",
        metadata: {
          demo_type: "percentage_calculation",
          user_id: "demo_user"
        }
      },
      apiKey: "custom-api-key-demo"
    });
    
    console.log("Math Problem with Telemetry:", "Percentage calculation");
    console.log("Telemetry Config:", telemetryResult.options?.experimental_telemetry ? "✅ Enabled" : "❌ Disabled");
    if (telemetryResult.options?.experimental_telemetry) {
      console.log("- Function ID:", telemetryResult.options.experimental_telemetry.functionId);
      console.log("- Metadata Keys:", Object.keys(telemetryResult.options.experimental_telemetry.metadata || {}));
    }
    console.log();

    console.log("✅ Demo completed successfully!");
    console.log("\n🎯 Key Features Demonstrated:");
    console.log("- ✅ Object output with structured schema");
    console.log("- ✅ Text generation with custom parameters");
    console.log("- ✅ Image generation with detailed prompts");
    console.log("- ✅ Speech synthesis with voice selection");
    console.log("- ✅ Runtime configuration and telemetry");
    console.log("- ✅ Model registry with pattern matching");
    console.log("- ✅ Type-safe AgentMark integration");
    
  } catch (error) {
    console.error("❌ Demo failed:", error);
    
    if (error instanceof Error) {
      console.error("Error details:", error.message);
      if (error.stack) {
        console.error("Stack trace:", error.stack);
      }
    }
    
    process.exit(1);
  }
}

// Error handling for unhandled promises
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the demo
runDemo().catch(console.error);