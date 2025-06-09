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
import { PromptKind, FileLoader } from "@agentmark/agentmark-core";
import * as path from "path";

const templateEngine = new TemplateDXTemplateEngine();

const configRunner = async ({
  agentMark,
  ast,
  promptKind,
  props,
  apiKey,
  ch = vscode.window.createOutputChannel("AgentMark"),
}: {
  agentMark: ReturnType<typeof createAgentMarkClient>;
  ast: Root;
  promptKind: PromptKind;
  props: Record<string, any>;
  apiKey: string;
  ch?: vscode.OutputChannel;
}) => {
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

    case "text": {
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
};

const datasetConfigRunner = async ({
  agentMark,
  ast,
  promptKind,
  datasetPath,
  apiKey,
  ch = vscode.window.createOutputChannel("AgentMark"),
  fileLoader,
}: {
  agentMark: ReturnType<typeof createAgentMarkClient>;
  ast: Root;
  promptKind: PromptKind;
  datasetPath: string;
  apiKey: string;
  ch?: vscode.OutputChannel;
  fileLoader: FileLoader;
}) => {
  const datasetStream = fileLoader.loadDataset(datasetPath);
  switch (promptKind) {
    case "image": {
      const prompt = await agentMark.loadImagePrompt(ast);
      const vercelInputs = prompt.formatWithDatasetStream(datasetStream, {
        apiKey,
      });
      for await (const input of vercelInputs) {
        const imageResult = await generateImage(input);

        const panel = vscode.window.createWebviewPanel(
          "agentmarkImageView",
          "Generated Image",
          vscode.ViewColumn.One,
          { enableScripts: true }
        );

        panel.webview.html = imageHtmlFormat(imageResult.images);
      }
      break;
    }
    case "speech": {
      const prompt = await agentMark.loadSpeechPrompt(ast);
      const vercelInputs = prompt.formatWithDatasetStream(datasetStream, {
        apiKey,
      });
      for await (const input of vercelInputs) {
        const speechResult = await generateSpeech(input);
        const panel = vscode.window.createWebviewPanel(
          "agentmarkAudioView",
          "Generated Audio",
          vscode.ViewColumn.One,
          { enableScripts: true }
        );

        panel.webview.html = audioHtmlFormat(speechResult.audio);
      }
      break;
    }
    case "object": {
      const prompt = await agentMark.loadObjectPrompt(ast);
      const vercelInputs = prompt.formatWithDatasetStream(datasetStream, {
        apiKey,
      });
      ch.clear();
      ch.append("RESULT:\n");
      ch.show();
      let entryIndex = 0;

      for await (const input of vercelInputs) {
        entryIndex++;
        const { partialObjectStream: objectStream } = streamObject(
          input as any
        );

        if (objectStream) {
          let finalObject: unknown = null;

          for await (const chunk of objectStream) {
            finalObject = chunk;
          }

          if (
            finalObject &&
            Object.keys(finalObject).length &&
            Object.values(finalObject).some((v) => v !== "")
          ) {
            ch.append(`\n--- Result for Entry ${entryIndex} ---\n`);
            ch.append(JSON.stringify(finalObject, null, 2));
          }
        }
      }
      break;
    }
    case "text": {
      const prompt = await agentMark.loadTextPrompt(ast);
      const vercelInputs = prompt.formatWithDatasetStream(datasetStream, {
        apiKey,
      });
      ch.clear();
      ch.append("Text Prompt Results from Dataset:\n");
      ch.show();
      let entryIndex = 0;
      for await (const input of vercelInputs) {
        entryIndex++;
        ch.append(`\n--- Result for Entry ${entryIndex} ---\n`);

        const { textStream } = streamText(input);

        if (textStream) {
          for await (const chunk of textStream) {
            ch.append(chunk);
          }
          ch.append("\n");
        } else {
          ch.append("(No text generated for this entry)\n");
        }
      }
      ch.append("\n--- All dataset entries processed ---\n");
      break;
    }
  }
};

const runAgentMarkCommandHandler = async (
  context: vscode.ExtensionContext,
  agentMark: ReturnType<typeof createAgentMarkClient>,
  runMode: "default" | "dataset" = "default"
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
    const props = frontmatter.test_settings?.props || {};
    const datasetPath = frontmatter.test_settings?.dataset || "";
    const ch = vscode.window.createOutputChannel("AgentMark");

    ch.appendLine("Generating Response...");
    if (runMode === "default") {
      configRunner({
        agentMark,
        ast,
        promptKind,
        props,
        apiKey,
        ch,
      });
    } else if (runMode === "dataset") {
      datasetConfigRunner({
        agentMark,
        ast,
        promptKind,
        datasetPath,
        apiKey,
        ch,
        fileLoader,
      });
    }
    context.secrets.store(`agentmark.${modelProviderMap[modelName]}`, apiKey);
  } catch (error: any) {
    vscode.window.showErrorMessage("Error: " + error.message);
  }
};

export function activate(context: vscode.ExtensionContext) {
  const agentMark = createAgentMarkClient({
    modelRegistry,
  });

  const runInferenceDisposable = vscode.commands.registerCommand(
    "agentmark-extension.runInference",
    () => runAgentMarkCommandHandler(context, agentMark, "default")
  );

  const runInferenceWithDatasetDisposable = vscode.commands.registerCommand(
    "agentmark-extension.runInferenceWithDataset",
    () => runAgentMarkCommandHandler(context, agentMark, "dataset")
  );

  context.subscriptions.push(
    runInferenceDisposable,
    runInferenceWithDatasetDisposable
  );
}

export function deactivate() {}
