import * as vscode from "vscode";
import { TemplateDXTemplateEngine } from "@agentmark/agentmark-core";
import { createAgentMarkClient } from "@agentmark/vercel-ai-v4-adapter";
import { getFrontMatter, load } from "@agentmark/templatedx";
import { modelRegistry, modelProviderMap } from "./modelRegistry";
import { loadOldFormat } from "./loadOldFormat";
import type { Root } from "mdast";
import { PromptKind, FileLoader } from "@agentmark/agentmark-core";
import * as path from "path";
import { executionHandlerMap } from "./configExecutions";

const templateEngine = new TemplateDXTemplateEngine();
const agentMark = createAgentMarkClient({
  modelRegistry,
});
const loaderMap = {
  text: (ast: Root) => agentMark.loadTextPrompt(ast),
  object: (ast: Root) => agentMark.loadObjectPrompt(ast),
  image: (ast: Root) => agentMark.loadImagePrompt(ast),
  speech: (ast: Root) => agentMark.loadSpeechPrompt(ast),
};

const runPrompt = async ({
  ast,
  promptKind,
  apiKey,
  ch,
  runMode,
  fileLoader,
}: {
  ast: Root;
  promptKind: PromptKind;
  apiKey: string;
  ch: vscode.OutputChannel;
  runMode: "default" | "dataset";
  fileLoader: FileLoader;
}) => {
  agentMark.setLoader(fileLoader);
  const promptLoader = loaderMap[promptKind];
  const prompt = await promptLoader(ast);

  let vercelInputs: ReadableStream<any>;

  if (runMode === "dataset") {
    vercelInputs = prompt.formatWithDataset({ apiKey });
  } else {
    // Treat a single run as a stream with one item
    const vercelInput = await prompt.formatWithTestProps({ apiKey });
    vercelInputs = new ReadableStream({
      start(controller) {
        controller.enqueue(vercelInput);
        controller.close();
      },
    });
  }

  const configExecute = executionHandlerMap[promptKind];
  await configExecute(vercelInputs, ch);
};

const runAgentMarkCommandHandler = async (
  context: vscode.ExtensionContext,
  runMode: "default" | "dataset" = "default",
  ch: vscode.OutputChannel = vscode.window.createOutputChannel("AgentMark")
) => {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    return;
  }

  const document = editor.document;
  const file = document.fileName;
  const fileDirectory = path.dirname(file);
  const fileLoader = new FileLoader(fileDirectory);
  if (!document.fileName.endsWith(".mdx")) {
    return;
  }

  let ast: Root = await load(file);
  const frontmatter: any = getFrontMatter(ast);

  if (frontmatter?.metadata) {
    ast = await loadOldFormat({ file });
  }

  const compiledYaml = await templateEngine.compile({ template: ast });
  let promptKind: PromptKind;
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
    return vscode.window.showErrorMessage(
      `Unsupported model name: ${modelName}`
    );
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
    const datasetPath = frontmatter.test_settings?.dataset || "";
    await runPrompt({
      ast,
      promptKind,
      apiKey,
      ch,
      runMode,
      fileLoader,
    });
    context.secrets.store(`agentmark.${modelProviderMap[modelName]}`, apiKey);
  } catch (error: any) {
    vscode.window.showErrorMessage("Error: " + error.message);
  }
};

export function activate(context: vscode.ExtensionContext) {
  // Create output channel once during activation
  const outputChannel = vscode.window.createOutputChannel("AgentMark");

  const runInferenceDisposable = vscode.commands.registerCommand(
    "agentmark-extension.runInference",
    () => runAgentMarkCommandHandler(context, "default", outputChannel)
  );

  const runInferenceWithDatasetDisposable = vscode.commands.registerCommand(
    "agentmark-extension.runInferenceWithDataset",
    () => runAgentMarkCommandHandler(context, "dataset", outputChannel)
  );

  context.subscriptions.push(
    runInferenceDisposable,
    runInferenceWithDatasetDisposable,
    outputChannel
  );
}

export function deactivate() {}
