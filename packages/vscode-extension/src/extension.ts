import {
  ModelPluginRegistry,
  getModel,
  load,
  getRawConfig,
  streamInference,
} from "@puzzlet/agentmark";
import { getFrontMatter } from "@puzzlet/templatedx";
import { createBoundedQueue } from "./boundedQueue";
import AllModelPlugins from '@puzzlet/all-models';
import * as vscode from "vscode";

const promptHistoryMap: { [key: string]: any } = {};

ModelPluginRegistry.registerAll(AllModelPlugins);

type ChatSettings = {
  chatField: string;
  useChat: boolean;
  maxSize: number;
}

export function activate(context: vscode.ExtensionContext) {
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
      const ast = await load(file);

      const model = getModel(ast);

      const plugin = ModelPluginRegistry.getPlugin(model);

      if (!plugin) {
        return vscode.window.showErrorMessage(`Error: No Support for ${model}`);
      }

      let apiKey = await context.secrets.get(`prompt-dx.${plugin.provider}`);

      if (!apiKey) {
        apiKey = await vscode.window.showInputBox({
          placeHolder: `Enter your ${plugin.provider} API key`,
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

      plugin.setApiKey(apiKey);

      try {
        const frontMatter = getFrontMatter(ast) as any;
        const testProps = frontMatter.test_settings?.props || {};
        const name = frontMatter.name as string;
        const chatSettings: ChatSettings = frontMatter.test_settings?.chat || {};
        const chatFieldKey = chatSettings.chatField;
        if (chatSettings && chatSettings.useChat) {
          if (promptHistoryMap[name]) {
            testProps[chatFieldKey] = promptHistoryMap[name].getItems();
          } else {
            testProps[chatFieldKey] = [];
          }
        }
        const result = await streamInference<any, any>(ast, testProps);
        if (!result) {
          throw new Error("Could not run inference.");
        }
        context.secrets.store(`prompt-dx.${plugin.provider}`, apiKey);

        const output = result;

        const ch = vscode.window.createOutputChannel("agentMark");
        if (output.resultStream) {
          let isFirstChunk = true;
          for await (const chunk of output.resultStream) {
            if (typeof chunk === 'string') {
              if (isFirstChunk) {
                ch.append('TEXT: ');
                ch.show();
                isFirstChunk = false;
              }
              ch.append(chunk);
              if (chatSettings && chatSettings.useChat) {
                const rawConfig = await getRawConfig(ast, testProps);
                const queue = createBoundedQueue(chatSettings.maxSize || 10);
                rawConfig.messages.forEach((item) => queue.add({ role: item.role, message: item.content }));
                queue.add({ role: 'assistant', message: chunk });
                promptHistoryMap[name] = queue;
              }
            } else {
              ch.appendLine(`OBJECT: ${JSON.stringify(chunk, null, 2)}`);
            }
          }
        }
        
        if (output.tools) {
          const tools = await output.tools;
          if (tools.length) {
            ch.appendLine(`TOOLS: ${JSON.stringify(tools, null, 2)}`);
          }
        }
      } catch (error: any) {
        vscode.window.showErrorMessage("Error: " + error.message);
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
