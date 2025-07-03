import * as fs from 'fs-extra';
import { getAnimalDrawingPrompt } from './animal-drawing-prompt';
import { getCustomerSupportPrompt } from './customer-support-prompt';
import { getPartyPlannerPrompt } from './party-planner-prompt';
import { getStoryTellerPrompt } from './story-teller-prompt';
import { getAnimalDataset, getCustomerQueryDataset, getPartyDataset, getStoryDataset } from './datasets';

export const createExamplePrompts = (model: string, targetPath: string = ".") => {
  // Ensure the templates directory exists
  fs.ensureDirSync(`${targetPath}/agentmark`);
  
  // Create animal drawing prompt and dataset
  const animalDrawingPrompt = getAnimalDrawingPrompt();
  fs.writeFileSync(`${targetPath}/agentmark/animal-drawing.prompt.mdx`, animalDrawingPrompt);
  const animalDataset = getAnimalDataset();
  fs.writeFileSync(`${targetPath}/agentmark/animal.jsonl`, animalDataset);
  
  // Create customer support prompt and dataset
  const customerSupportPrompt = getCustomerSupportPrompt(model);
  fs.writeFileSync(`${targetPath}/agentmark/customer-support.prompt.mdx`, customerSupportPrompt);
  const customerQueryDataset = getCustomerQueryDataset();
  fs.writeFileSync(`${targetPath}/agentmark/customer-query.jsonl`, customerQueryDataset);
  
  // Create party planner prompt and dataset
  const partyPlannerPrompt = getPartyPlannerPrompt(model);
  fs.writeFileSync(`${targetPath}/agentmark/party-planner.prompt.mdx`, partyPlannerPrompt);
  const partyDataset = getPartyDataset();
  fs.writeFileSync(`${targetPath}/agentmark/party.jsonl`, partyDataset);
  
  // Create story teller prompt and dataset
  const storyTellerPrompt = getStoryTellerPrompt();
  fs.writeFileSync(`${targetPath}/agentmark/story-teller.prompt.mdx`, storyTellerPrompt);
  const storyDataset = getStoryDataset();
  fs.writeFileSync(`${targetPath}/agentmark/story.jsonl`, storyDataset);
  
  console.log('✅ Example prompts and datasets created in agentmark folder');
};