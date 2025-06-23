import * as fs from 'fs-extra';
import { getCustomerReplyPrompt } from './customer-reply-prompt';
import { getResponseQualityEvalPrompt } from './response-quality-eval-prompt';

export const createExamplePrompts = (model: string, targetPath: string = ".") => {
  // Ensure the templates directory exists
  fs.ensureDirSync(`${targetPath}/agentmark`);
  
  // Create customer reply prompt
  const customerReplyPrompt = getCustomerReplyPrompt(model);
  fs.writeFileSync(`${targetPath}/agentmark/customer-reply.prompt.mdx`, customerReplyPrompt);
  
  // Create response quality evaluation prompt
  const responseQualityEvalPrompt = getResponseQualityEvalPrompt(model);
  fs.writeFileSync(`${targetPath}/agentmark/response-quality-eval.prompt.mdx`, responseQualityEvalPrompt);
  
  console.log('✅ Example prompts created in agentmark folder');
};