import * as vscode from "vscode";
import { createAgentMark, FileLoader, TemplateDXTemplateEngine, VercelAdapter, VercelModelRegistry } from "@puzzlet/agentmark";
import { openai } from '@ai-sdk/openai';
import { experimental_generateImage as generateImage, streamObject, streamText } from "ai";

const modelRegistry = new VercelModelRegistry();
modelRegistry.registerModel([
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4",
  "o1-mini",
  "o1-preview",
  "gpt-3.5-turbo",
], (name: string) => openai(name), "openai");
modelRegistry.registerModel('dall-e-3', (name: string) => openai.image(name), "openai");
// modelRegistry.registerModel('claude-3', (name: string) => createAnthropic(name), "anthropic");
const templateEngine = new TemplateDXTemplateEngine();

export function activate(context: vscode.ExtensionContext) {
  const editor = vscode.window.activeTextEditor;
  const loader = new FileLoader(context.extensionPath);
  const adapter = new VercelAdapter(modelRegistry);
  const agentMark = createAgentMark({ loader, adapter, templateEngine });
  const modelConfigMap = {
    "image_model": {generate: generateImage, load: agentMark.loadImagePrompt},
    "object_model": {generate: streamObject, load: agentMark.loadObjectPrompt},
    "text_model": {generate: streamText, load: agentMark.loadTextPrompt}
  }
  
  const disposable = vscode.commands.registerCommand(
    "prompt-dx-extension.runInference",
    async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor) {
        return;
      }

      const document = editor.document;
      const file = document.fileName;
      if (!document.fileName.endsWith(".mdx")) {
        return;
      }

      const loadedFile = await loader.load(file);
      const yaml = await templateEngine.compile(loadedFile);
      const modelEntries = [
        ["image_model", yaml.image_model],
        ["object_model", yaml.object_model],
        ["text_model", yaml.text_model]
      ].filter(([_, val]) => Boolean(val));
      
      if (modelEntries.length !== 1) {
        throw new Error("Only one model (image_model, object_model, or text_model) should be defined at a time.");
      }

      const [modelConfig, model] = modelEntries[0] as [keyof typeof modelConfigMap, any];
      const modelName = model?.model_name || '';

      let apiKey = await context.secrets.get(`prompt-dx.${modelRegistry.getProvider(modelName)}`);
      const modelConfigObj = modelConfigMap[modelConfig];

      if (!apiKey) {
        apiKey = await vscode.window.showInputBox({
          placeHolder: `Enter your ${modelRegistry.getProvider(modelName)} API key`,
          prompt: "Enter api key",
          ignoreFocusOut: true,
          password: true,
          validateInput(input: string) {
            if (!input) {
              return "Api key cannot be empty";
            }
            return undefined;
          },
        });
      }

      if (!apiKey) {
        return vscode.window.showErrorMessage(`Error: Could not set api key`);
      }

      try {
        const props = yaml.test_settings?.props || {};
        const prompt = await modelConfigObj.load(file);
        const ast = await prompt.format(props, {apiKey});
        const ch = vscode.window.createOutputChannel("AgentMark");

        switch (modelConfig) {
          case "image_model":
            ch.appendLine("Generating image...");
            // @ts-ignore
            const imageResult = await modelConfigObj.generate(ast);
            ch.appendLine(imageResult);
            break;
          case "object_model":
          case "text_model":
            // @ts-ignore
            const streamResult = await modelConfigObj.generate(ast);
            if (streamResult.resultStream) {
              let isFirstChunk = true;
              for await (const chunk of streamResult.resultStream) {
                if (typeof chunk === 'string') {
                  if (isFirstChunk) {
                    ch.append('RESULT: ');
                    ch.show();
                    isFirstChunk = false;
                  }
                  ch.append(chunk);
                } else {
                  if (isFirstChunk) {
                    ch.append('OBJECT:');
                    ch.show();
                    isFirstChunk = false;
                  }
                  ch.clear();
                  ch.appendLine(`${JSON.stringify(chunk, null, 2)}`);
                  // ch.appendLine(`OBJECT: ${JSON.stringify(chunk, null, 2)}`);
                }
              }
            }
        }
        context.secrets.store(`prompt-dx.${modelRegistry.getProvider(modelName)}`, apiKey);
        
      } catch (error: any) {
        vscode.window.showErrorMessage("Error: " + error.message);
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
