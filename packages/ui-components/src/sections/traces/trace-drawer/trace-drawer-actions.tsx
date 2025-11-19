import { Iconify } from "@/components";
import { Button, Tooltip } from "@mui/material";
import { useMemo } from "react";
import { useTraceDrawerContext } from "./trace-drawer-provider";

interface AddToDatasetButtonProps {
  children: React.ReactNode;
  tooltipText?: string;
  disabled?: boolean;
}

export const TraceDrawerAddToDatasetButton = ({
  children,
  tooltipText,
  disabled,
}: AddToDatasetButtonProps) => {
  const handleAddToDataset = () => {
    // TODO: Implement add to dataset functionality
    // This should:
    // 1. Extract trace data (inputs, outputs, metadata)
    // 2. Open a modal to select target dataset
    // 3. Save trace as a dataset entry via API
    console.warn('Add to dataset functionality not yet implemented');
  };

  return (
    <Tooltip title={tooltipText}>
      <span>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Iconify icon="mdi:database-plus" />}
          onClick={handleAddToDataset}
          disabled={disabled}
        >
          {children}
        </Button>
      </span>
    </Tooltip>
  );
};

interface TestPromptButtonProps {
  children: React.ReactNode;
  tooltipText?: string;
}

export const TraceDrawerTestPromptButton = ({
  children,
  tooltipText,
}: TestPromptButtonProps) => {
  const { selectedSpan, navigateToFile } = useTraceDrawerContext();

  // TODO: Extract metadata from the span data
  const extractMetadata = useMemo(() => {
    return {
      promptName: selectedSpan?.data?.promptName,
      props: selectedSpan?.data?.props,
    };
  }, [selectedSpan]);

  const handleTestPrompt = () => {
    if (navigateToFile) {
      const storageKey = `editor_props_${Date.now()}`;
      localStorage.setItem(
        storageKey,
        JSON.stringify(extractMetadata.props) || ""
      );
      navigateToFile?.(`${extractMetadata.promptName}?props=${storageKey}`);
    }
  };

  return (
    <Tooltip title={tooltipText}>
      <span>
        <Button
          variant="outlined"
          size="small"
          startIcon={<Iconify icon="mdi:test-tube" />}
          onClick={handleTestPrompt}
          disabled={!!extractMetadata.promptName && !!extractMetadata.props}
        >
          {children}
        </Button>
      </span>
    </Tooltip>
  );
};
