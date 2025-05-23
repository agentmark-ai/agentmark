import * as vscode from "vscode";
import { TemplateDXTemplateEngine } from "@agentmark/agentmark-core";
import { createAgentMarkClient } from "@agentmark/vercel-ai-v4-adapter";
import {
  experimental_generateImage as generateImage,
  streamObject,
  streamText,
} from "ai";
import { getFrontMatter, load } from "@agentmark/templatedx";
import { modelConfig, modelRegistry, modelProviderMap } from "./modelRegistry";
import { loadOldFormat } from "./loadOldFormat";

const templateEngine = new TemplateDXTemplateEngine();
export function activate(context: vscode.ExtensionContext) {
  const agentMark = createAgentMarkClient({
    modelRegistry,
  });

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

      let ast: any = await load(file);
      const frontmatter: any = getFrontMatter(ast);

      if (frontmatter?.metadata) {
        ast = await loadOldFormat({ file });
      }

      const compiledYaml = await templateEngine.compile(ast);

      let modelConfig: modelConfig | undefined;
      let model: any;

      if (compiledYaml?.image_config) {
        modelConfig = "image_config";
        model = compiledYaml.image_config;
      } else if (compiledYaml?.object_config) {
        modelConfig = "object_config";
        model = compiledYaml.object_config;
      } else if (compiledYaml?.text_config) {
        modelConfig = "text_config";
        model = compiledYaml.text_config;
      } else {
        return vscode.window.showErrorMessage(
          "No config (image_config, object_config, or text_config) found in the file."
        );
      }

      const modelName = model?.model_name || "";

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
        const ch = vscode.window.createOutputChannel("AgentMark");

        ch.appendLine("Generating Response...");
        switch (modelConfig) {
          case "image_config": {
            const prompt = await agentMark.loadImagePrompt(ast);
            const vercelInput = await prompt.format({ props, apiKey });
            const imageResult = await generateImage(vercelInput);
            ch.clear();
            ch.appendLine("RESULT:");
            ch.appendLine(JSON.stringify(imageResult, null, 2));
            ch.show();
            break;
          }

          case "object_config": {
            const prompt = await agentMark.loadObjectPrompt(ast);
            const vercelInput = await prompt.format({ props, apiKey });
            const { partialObjectStream: objectStream } = streamObject(
              vercelInput as any
            );
            if (objectStream) {
              let isFirstChunk = true;
              let printed = false;

              for await (const chunk of objectStream) {
                if (isFirstChunk) {
                  ch.clear();
                  ch.append("RESULT:\n");
                  ch.show();
                  isFirstChunk = false;
                } else if (printed) {
                  // Clear and reprint the entire object on each update.
                  // While not the most efficient approach, this simulates a "live update" effect
                  // similar to a console refreshing its output, making the stream progression easier to follow.
                  ch.clear();
                  ch.append("RESULT:\n");
                }
                ch.append(JSON.stringify(chunk, null, 2));
                printed = true;
              }
            }
            break;
          }

          case "text_config": {
            const prompt = await agentMark.loadTextPrompt(ast);
            const vercelInput = await prompt.format({ props, apiKey });
            const { textStream } = streamText(vercelInput);
            if (textStream) {
              let isFirstChunk = true;
              for await (const chunk of textStream) {
                if (isFirstChunk) {
                  ch.clear();
                  ch.append("TEXT: ");
                  ch.show();
                  isFirstChunk = false;
                }
                ch.append(chunk);
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

export function deactivate() {}
