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
  // TODO: Implement add to dataset
  const handleAddToDataset = () => {
    console.log("add to dataset");
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
