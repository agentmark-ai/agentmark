import * as vscode from "vscode";
import { createAgentMark, TemplateDXTemplateEngine, VercelAdapter } from "@puzzlet/agentmark";
import { experimental_generateImage as generateImage, streamObject, streamText } from "ai";
import { getFrontMatter, load } from "@puzzlet/templatedx";
import { modelConfig, modelRegistry } from "./modelRegistry";
import { loadOldFormat } from "./loadOldFormat";

const adapter = new VercelAdapter(modelRegistry);
const templateEngine = new TemplateDXTemplateEngine();
export function activate(context: vscode.ExtensionContext) {
  const agentMark = createAgentMark({ adapter, templateEngine });

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

      let ast: any = await load(file);
      const frontmatter: any = getFrontMatter(ast);

      if (frontmatter?.metadata) {
        ast = await loadOldFormat({ file });
      }

      const compiledYaml = await templateEngine.compile(ast);
      const modelEntries = [
        ["image_config", compiledYaml?.image_config],
        ["object_config", compiledYaml?.object_config],
        ["text_config", compiledYaml?.text_config]
      ].filter(([_, val]) => Boolean(val)) as [modelConfig, any][];

      if (modelEntries.length !== 1) {
        const message = modelEntries.length === 0
          ? "No config (image_config, object_config, or text_config) found in the file."
          : "Only one config (image_config, object_config, or text_config) should be defined at a time.";
        return vscode.window.showErrorMessage(message);
      }

      const [modelConfig, model] = modelEntries[0];
      const modelName = model?.model_name || '';

      let apiKey = await context.secrets.get(`prompt-dx.${modelRegistry.getProvider(modelName)}`);
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
        const props = frontmatter.test_settings?.props || {};
        const ch = vscode.window.createOutputChannel("AgentMark");

        switch (modelConfig) {
          case "image_config": {
            const prompt = await agentMark.loadImagePrompt(ast);
            const vercelInput = await prompt.format(props, { apiKey });
            // It may take 1-2 minutes to generate the image, so show a message to the user.
            ch.clear();
            ch.appendLine("Generating image...");
            const imageResult = await generateImage(vercelInput);
            ch.appendLine("RESULT:");
            ch.appendLine(JSON.stringify(imageResult, null, 2));
            ch.show();
            break;
          }
        
          case "object_config": {
            const prompt = await agentMark.loadObjectPrompt(ast);
            const vercelInput = await prompt.format(props, { apiKey });
            const { partialObjectStream: objectStream } = await streamObject(vercelInput);
            if (objectStream) {
              let isFirstChunk = true;
              let printed = false;
            
              for await (const chunk of objectStream) {
                if (isFirstChunk) {
                  ch.clear();
                  ch.append('RESULT:\n');
                  ch.show();
                  isFirstChunk = false;
                } else if (printed) {
                  // Clear and reprint the entire object on each update.
                  // While not the most efficient approach, this simulates a "live update" effect
                  // similar to a console refreshing its output, making the stream progression easier to follow.
                  ch.clear();
                  ch.append('RESULT:\n');
                }
                ch.append(JSON.stringify(chunk, null, 2));
                printed = true;
              }
            }
            break;
          }
        
          case "text_config": {
            const prompt = await agentMark.loadTextPrompt(ast);
            const vercelInput = await prompt.format(props, { apiKey });
            const { textStream } = await streamText(vercelInput);
            if (textStream) {
              let isFirstChunk = true;
              for await (const chunk of textStream) {
                if (isFirstChunk) {
                  ch.append('TEXT: ');
                  ch.show();
                  isFirstChunk = false;
                }
                ch.append(chunk);
              }
            }
            break;
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

export function deactivate() { }