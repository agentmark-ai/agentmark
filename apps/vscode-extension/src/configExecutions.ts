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
  ch.show();
  ch.append("Text Prompt Results:\n");
  let entryIndex = 1;
  for await (const input of inputs) {
    if (entryIndex > 1) {
      // first entry does not need a header
      // subsequent entries should have a header to separate results
      ch.append(`\n--- Result for Entry ${entryIndex} ---\n`);
    }
    const { textStream, fullStream } = streamText(input);
    if (textStream) {
      for await (const chunk of textStream) {
        ch.append(chunk);
      }
    }
    for await (const chunk of fullStream) {
      if (chunk.type === "error") {
        throw chunk.error;
      }
    }
    entryIndex++;
  }
};
const handleObjectExecution = async (
  inputs: ReadableStream<any>,
  ch: vscode.OutputChannel
) => {
  ch.clear();
  ch.show();

  // 1. This buffer holds the results of all completed entries.
  let historyOutput = "Object Prompt Results:\n";
  ch.append(historyOutput);

  let entryIndex = 1;
  for await (const input of inputs) {
    // 2. This buffer will hold the JSON string of the object currently streaming.
    let currentObjectStr = "";
    let entryHeader = "";
    if (entryIndex > 1) {
      entryHeader = `\n--- Result for Entry ${entryIndex} ---\n`;
    }

    const { partialObjectStream: objectStream } = streamObject(input);

    // 3. Use a SINGLE loop to process the stream for the current entry.
    for await (const chunk of objectStream) {
      currentObjectStr = JSON.stringify(chunk, null, 2);

      // Re-render the entire output: the history + the streaming current object.
      ch.clear();
      ch.append(historyOutput + entryHeader + currentObjectStr);
    }

    // 4. AFTER the stream for this entry is finished, "commit" its final state
    historyOutput += entryHeader + currentObjectStr;

    // for await (const chunk of fullStream) {
    //   if (chunk.type === "error") {
    //     const errorMsg = `\n--- ERROR for Entry ${entryIndex}: ${chunk.error} ---\n`;
    //     ch.append(errorMsg); // Append the error to the output
    //     historyOutput += errorMsg; // Also add it to the history
    //   }
    // }
    entryIndex++;
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
