import * as vscode from "vscode";
import {
  streamText,
  streamObject,
  experimental_generateImage as generateImage,
  experimental_generateSpeech as generateSpeech,
} from "ai";
import { imageHtmlFormat, audioHtmlFormat } from "./formatWebView";

const handleTextExecution = async (
  inputs: ReadableStream<any>,
  ch: vscode.OutputChannel
) => {
  ch.clear();
  ch.append("Text Prompt Results:\n");
  ch.show();
  let entryIndex = 0;
  for await (const input of inputs) {
    entryIndex++;
    ch.append(`\n--- Result for Entry ${entryIndex} ---\n`);
    const { textStream } = streamText(input);
    if (textStream) {
      for await (const chunk of textStream) {
        ch.append(chunk);
      }
    }
  }
};

const handleObjectExecution = async (
  inputs: ReadableStream<any>,
  ch: vscode.OutputChannel
) => {
  ch.clear();
  ch.append("Object Prompt Results:\n");
  ch.show();
  let entryIndex = 0;
  for await (const input of inputs) {
    entryIndex++;
    const { partialObjectStream } = streamObject(input);
    let finalObject: any = null;
    for await (const chunk of partialObjectStream) {
      finalObject = chunk;
    }
    if (finalObject && Object.keys(finalObject).length > 0) {
      ch.append(`\n--- Result for Entry ${entryIndex} ---\n`);
      ch.append(JSON.stringify(finalObject, null, 2));
    }
  }
};

const handleImageExecution = async (inputs: ReadableStream<any>) => {
  for await (const input of inputs) {
    const result = await generateImage(input);
    const panel = vscode.window.createWebviewPanel(
      "agentmarkImageView",
      "Generated Image",
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    panel.webview.html = imageHtmlFormat(result.images);
  }
};

const handleSpeechExecution = async (inputs: ReadableStream<any>) => {
  for await (const input of inputs) {
    const result = await generateSpeech(input);
    const panel = vscode.window.createWebviewPanel(
      "agentmarkAudioView",
      "Generated Audio",
      vscode.ViewColumn.One,
      { enableScripts: true }
    );
    panel.webview.html = audioHtmlFormat(result.audio);
  }
};

export const executionHandlerMap = {
  text: handleTextExecution,
  object: handleObjectExecution,
  image: handleImageExecution,
  speech: handleSpeechExecution,
};
