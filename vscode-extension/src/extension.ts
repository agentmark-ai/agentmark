import {
  runInference,
  registerDefaultPlugins,
  ModelPluginRegistry,
  getModel,
  parse,
  getRawConfig
} from "@puzzlet/promptdx";
import { ContentLoader, getFrontMatter } from "@puzzlet/templatedx";
import { createBoundedQueue } from "./boundedQueue";
import * as fs from 'fs';
import * as vscode from "vscode";
import * as path from 'path';
registerDefaultPlugins();

const promptHistoryMap: { [key: string]: any } = {};

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
      const basename = path.dirname(file);
      if (!document.fileName.endsWith(".mdx")) {
        return;
      }
      const contentLoader: ContentLoader = async (path) => fs.readFileSync(path, 'utf-8');
      const ast = await parse(document.getText(), basename, contentLoader);

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
        const result = await runInference(ast, testProps);
        if (!result) {
          throw new Error("Could not run inference.");
        }
        context.secrets.store(`prompt-dx.${plugin.provider}`, apiKey);

        const [output] = result;

        if ("output_type" in output) {
          const ch = vscode.window.createOutputChannel("promptDX");
          if (typeof output.data === "string") {
            ch.appendLine(output.data);
            if (chatSettings && chatSettings.useChat) {
              const rawConfig = await getRawConfig(ast, testProps);
              const queue = createBoundedQueue(chatSettings.maxSize || 10);
              rawConfig.messages.forEach((item) => queue.add({ role: item.role, message: item.content }));
              queue.add({ role: 'assistant', message: output.data });
              promptHistoryMap[name] = queue;
            }
          } else {
            ch.appendLine(JSON.stringify(output.data, null, 2));
          }
          ch.show();
        }
      } catch (error: any) {
        vscode.window.showErrorMessage("Error: " + error.message);
      }
    }
  );

  context.subscriptions.push(disposable);
}

export function deactivate() {}
