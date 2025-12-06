import { OutputAccordion } from "../output-accordion";

interface OutputDisplayProps {
  outputData: {
    text?: string;
    toolCalls?: string;
    toolCall?: any;
    objectResponse?: any;
  } | null;
}

export const OutputDisplay = ({ outputData }: OutputDisplayProps) => {
  if (!outputData) return null;

  return <OutputAccordion outputData={outputData} />;
};
