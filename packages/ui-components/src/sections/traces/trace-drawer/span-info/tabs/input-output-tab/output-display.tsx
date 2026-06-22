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
  /**
   * Names of output fields (Output/OutputObject/ToolCalls) whose full value was
   * offloaded to object storage. Their inline column holds only a truncated
   * preview, so we suppress it here and let `OffloadedFields` render the full
   * value (media inline / full text) — no duplicated, broken base64 wall.
   */
  offloadedFields?: Set<string>;
}

export const OutputDisplay = ({ outputData, offloadedFields }: OutputDisplayProps) => {
  if (!outputData) return null;

  // Retrieval / vector-store spans render a ranked retrieved-documents panel.
  if (outputData.documents && outputData.documents.length > 0) {
    return <RetrievalDocuments documents={outputData.documents} />;
  }

  return <OutputAccordion outputData={outputData} offloadedFields={offloadedFields} />;
};
