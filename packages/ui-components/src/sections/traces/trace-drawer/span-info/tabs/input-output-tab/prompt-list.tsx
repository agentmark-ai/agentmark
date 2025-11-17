import { Box } from "@mui/material";
import { SpanPrompt } from "../span-prompt";
import { LLMPrompt } from "@/sections/traces/types";

interface PromptListProps {
  prompts: LLMPrompt[];
}

export const PromptList = ({ prompts }: PromptListProps) => (
  <Box>
    {prompts.map((prompt, index) => (
      <SpanPrompt key={index} prompt={prompt} />
    ))}
  </Box>
);
