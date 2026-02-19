import fs from 'fs-extra';
import { getAnimalDrawingPrompt } from './animal-drawing-prompt.js';
import { getCustomerSupportPrompt } from './customer-support-prompt.js';
import { getPartyPlannerPrompt } from './party-planner-prompt.js';
import { getStoryTellerPrompt } from './story-teller-prompt.js';
import { getAnimalDataset, getCustomerQueryDataset, getPartyDataset, getStoryDataset } from './datasets.js';

/**
 * Creates example prompt files and returns the list of model IDs they use.
 * The returned array is the authoritative source for `builtInModels` in agentmark.json —
 * it reflects exactly which models were written, so the two can never drift apart.
 */
export const createExamplePrompts = (model: string, targetPath: string = ".", adapter: string = "ai-sdk"): string[] => {
  // Ensure the templates directory exists
  fs.ensureDirSync(`${targetPath}/agentmark`);

  const noImageSupport = ["mastra", "claude-agent-sdk", "pydantic-ai"];
  const noSpeechSupport = ["mastra", "claude-agent-sdk", "pydantic-ai"];
  const skipImagePrompts = noImageSupport.includes(adapter);
  const skipSpeechPrompts = noSpeechSupport.includes(adapter);

  const usedModels: string[] = [];

  // Create animal drawing prompt and dataset (uses image_config - skip for unsupported adapters)
  if (!skipImagePrompts) {
    const animalDrawingPrompt = getAnimalDrawingPrompt();
    fs.writeFileSync(`${targetPath}/agentmark/animal-drawing.prompt.mdx`, animalDrawingPrompt);
    const animalDataset = getAnimalDataset();
    fs.writeFileSync(`${targetPath}/agentmark/animal.jsonl`, animalDataset);
    usedModels.push('openai/dall-e-3');
  }

  // Create customer support prompt and dataset
  const customerSupportPrompt = getCustomerSupportPrompt(model);
  fs.writeFileSync(`${targetPath}/agentmark/customer-support-agent.prompt.mdx`, customerSupportPrompt);
  const customerQueryDataset = getCustomerQueryDataset();
  fs.writeFileSync(`${targetPath}/agentmark/customer-query.jsonl`, customerQueryDataset);
  usedModels.push(model);

  // Create party planner prompt and dataset
  const partyPlannerPrompt = getPartyPlannerPrompt(model);
  fs.writeFileSync(`${targetPath}/agentmark/party-planner.prompt.mdx`, partyPlannerPrompt);
  const partyDataset = getPartyDataset();
  fs.writeFileSync(`${targetPath}/agentmark/party.jsonl`, partyDataset);

  // Create story teller prompt and dataset (uses speech_config - skip for unsupported adapters)
  if (!skipSpeechPrompts) {
    const storyTellerPrompt = getStoryTellerPrompt();
    fs.writeFileSync(`${targetPath}/agentmark/story-teller.prompt.mdx`, storyTellerPrompt);
    const storyDataset = getStoryDataset();
    fs.writeFileSync(`${targetPath}/agentmark/story.jsonl`, storyDataset);
    usedModels.push('openai/tts-1-hd');
  }

  // Deduplicate in case the language model appears under multiple prompts
  return [...new Set(usedModels)];
};