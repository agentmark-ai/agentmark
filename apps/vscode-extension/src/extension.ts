import * as vscode from "vscode";
import { TemplateDXTemplateEngine } from "@agentmark/agentmark-core";
import { createAgentMarkClient } from "@agentmark/vercel-ai-v4-adapter";
import {
  experimental_generateImage as generateImage,
  experimental_generateSpeech as generateSpeech,
  streamObject,
  streamText,
} from "ai";
import { getFrontMatter, load } from "@agentmark/templatedx";
import { modelRegistry, modelProviderMap } from "./modelRegistry";
import { loadOldFormat } from "./loadOldFormat";
import { audioHtmlFormat, imageHtmlFormat } from "./formatWebView";
import type { Root } from "mdast";
import type { PromptKind } from "@agentmark/agentmark-core";

const templateEngine = new TemplateDXTemplateEngine();
export function activate(context: vscode.ExtensionContext) {
  const agentMark = createAgentMarkClient({
    modelRegistry,
  });

  // Create output channel once during activation
  const outputChannel = vscode.window.createOutputChannel("AgentMark");
  
  // Add output channel to subscriptions for automatic disposal
  context.subscriptions.push(outputChannel);

  const disposable = vscode.commands.registerCommand(
    "agentmark-extension.runInference",
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

      let ast: Root = await load(file);
      const frontmatter: any = getFrontMatter(ast);

      if (frontmatter?.metadata) {
        ast = await loadOldFormat({ file });
      }

      const compiledYaml = await templateEngine.compile({ template: ast });
      let promptKind: PromptKind | undefined;
      //TODO: Refactor to use a stricter type and rename config to settings
      let promptConfig: any;

      if (compiledYaml?.image_config) {
        promptKind = "image";
        promptConfig = compiledYaml.image_config;
      } else if (compiledYaml?.object_config) {
        promptKind = "object";
        promptConfig = compiledYaml.object_config;
      } else if (compiledYaml?.text_config) {
        promptKind = "text";
        promptConfig = compiledYaml.text_config;
      } else if (compiledYaml?.speech_config) {
        promptKind = "speech";
        promptConfig = compiledYaml.speech_config;
      } else {
        return vscode.window.showErrorMessage(
          "No config (image_config, object_config, text_config, or speech_config) found in the file."
        );
      }

      const modelName: string = promptConfig?.model_name || "";

      if (!modelProviderMap[modelName]) {
        return vscode.window.showErrorMessage(`Unsupported model name: ${modelName}`);
      }

      let apiKey = await context.secrets.get(
        `agentmark.${modelProviderMap[modelName]}`
      );
      if (!apiKey) {
        apiKey = await vscode.window.showInputBox({
          placeHolder: `Enter your ${modelProviderMap[modelName]} API key`,
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
        const props = frontmatter.test_settings?.props || {};
        outputChannel.clear();
        outputChannel.show();
        outputChannel.appendLine("Generating Response...");
        switch (promptKind) {
          case "image": {
            const prompt = await agentMark.loadImagePrompt(ast);
            const vercelInput = await prompt.format({ props, apiKey });
            const imageResult = await generateImage(vercelInput);

            const panel = vscode.window.createWebviewPanel(
              "agentmarkImageView",
              "Generated Image",
              vscode.ViewColumn.One,
              { enableScripts: true }
            );

            panel.webview.html = imageHtmlFormat(imageResult.images);
            break;
          }
          case "speech": {
            const prompt = await agentMark.loadSpeechPrompt(ast);
            const vercelInput = await prompt.format({ props, apiKey });
            const speechResult = await generateSpeech(vercelInput);
            const panel = vscode.window.createWebviewPanel(
              "agentmarkAudioView",
              "Generated Audio",
              vscode.ViewColumn.One,
              { enableScripts: true }
            );

            panel.webview.html = audioHtmlFormat(speechResult.audio);
            break;
          }
          case "object": {
            const prompt = await agentMark.loadObjectPrompt(ast);
            const vercelInput = await prompt.format({ props, apiKey });
            const { partialObjectStream: objectStream, fullStream } = streamObject(
              vercelInput as any
            );
            if (objectStream) {
              let isFirstChunk = true;
              let printed = false;

              for await (const chunk of objectStream) {
                if (isFirstChunk) {
                  outputChannel.clear();
                  outputChannel.append("RESULT:\n");
                  isFirstChunk = false;
                } else if (printed) {
                  // Clear and reprint the entire object on each update.
                  // While not the most efficient approach, this simulates a "live update" effect
                  // similar to a console refreshing its output, making the stream progression easier to follow.
                  outputChannel.clear();
                  outputChannel.append("RESULT:\n");
                }
                outputChannel.append(JSON.stringify(chunk, null, 2));
                printed = true;
              }
            }
            for await (const chunk of fullStream) {
              if (chunk.type === "error") {
                throw chunk.error
              }
            }
            break;
          }

          case "text": {
            const prompt = await agentMark.loadTextPrompt(ast);
            const vercelInput = await prompt.format({ props, apiKey });
            const { textStream, fullStream } = streamText(vercelInput);
            if (textStream) {
              let isFirstChunk = true;
              for await (const chunk of textStream) {
                if (isFirstChunk) {
                  outputChannel.clear();
                  outputChannel.append("TEXT: ");
                  isFirstChunk = false;
                }
                outputChannel.append(chunk);
              }
            }
            for await (const chunk of fullStream) {
              if (chunk.type === "error") {
                throw chunk.error
              }
            }
            break;
          }
        }
        context.secrets.store(
          `agentmark.${modelProviderMap[modelName]}`,
          apiKey
        );
      } catch (error: any) {
        vscode.window.showErrorMessage("Error: " + error.message);
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() { }
