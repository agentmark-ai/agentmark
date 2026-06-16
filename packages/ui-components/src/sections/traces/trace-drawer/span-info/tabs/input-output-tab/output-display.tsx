import { OutputAccordion } from "../output-accordion";
import { RetrievalDocuments, RetrievalDocumentView } from "./retrieval-documents";

interface OutputDisplayProps {
  outputData: {
    text?: string;
    toolCalls?: string;
    toolCall?: any;
    objectResponse?: any;
    documents?: RetrievalDocumentView[];
  } | null;
}

export const OutputDisplay = ({ outputData }: OutputDisplayProps) => {
  if (!outputData) return null;

  // Retrieval / vector-store spans render a ranked retrieved-documents panel.
  if (outputData.documents && outputData.documents.length > 0) {
    return <RetrievalDocuments documents={outputData.documents} />;
  }

  return <OutputAccordion outputData={outputData} />;
};
