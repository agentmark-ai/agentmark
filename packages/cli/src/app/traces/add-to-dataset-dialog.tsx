"use client";
import { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Stack,
  Alert,
  CircularProgress,
  Typography,
} from "@mui/material";
import { getDatasets, appendToDataset } from "../../lib/api/datasets";

const CREATE_NEW = "__create_new__";

interface AddToDatasetDialogProps {
  open: boolean;
  onClose: () => void;
  initialInput: Record<string, unknown> | null;
  initialExpectedOutput: unknown;
  t: (key: string) => string;
}

export const AddToDatasetDialog = ({
  open,
  onClose,
  initialInput,
  initialExpectedOutput,
  t,
}: AddToDatasetDialogProps) => {
  const [datasets, setDatasets] = useState<string[]>([]);
  const [selectedDataset, setSelectedDataset] = useState("");
  const [newDatasetName, setNewDatasetName] = useState("");
  const [inputJson, setInputJson] = useState("");
  const [expectedOutputJson, setExpectedOutputJson] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSuccess(false);
    setSelectedDataset("");
    setNewDatasetName("");
    setInputJson(initialInput ? JSON.stringify(initialInput, null, 2) : "{}");
    setExpectedOutputJson(
      initialExpectedOutput
        ? JSON.stringify(initialExpectedOutput, null, 2)
        : "{}"
    );

    setLoading(true);
    getDatasets()
      .then(setDatasets)
      .finally(() => setLoading(false));
  }, [open, initialInput, initialExpectedOutput]);

  const handleSubmit = async () => {
    setError(null);

    // Validate JSON
    let parsedInput: any;
    let parsedExpectedOutput: any;
    try {
      parsedInput = JSON.parse(inputJson);
    } catch {
      setError("Invalid JSON in Input field");
      return;
    }
    try {
      parsedExpectedOutput = JSON.parse(expectedOutputJson);
    } catch {
      setError("Invalid JSON in Expected Output field");
      return;
    }

    // Determine dataset path
    const isNew = selectedDataset === CREATE_NEW;
    let datasetPath = selectedDataset;

    if (isNew) {
      if (!newDatasetName.trim()) {
        setError("Please enter a dataset file name");
        return;
      }
      datasetPath = newDatasetName.trim();
      if (!datasetPath.endsWith(".jsonl")) {
        datasetPath += ".jsonl";
      }
      // Prefix with datasets/ if no directory specified
      if (!datasetPath.includes("/")) {
        datasetPath = `datasets/${datasetPath}`;
      }
    }

    if (!datasetPath || datasetPath === CREATE_NEW) {
      setError("Please select or create a dataset");
      return;
    }

    setSubmitting(true);
    try {
      await appendToDataset(datasetPath, {
        input: parsedInput,
        expected_output: parsedExpectedOutput,
      });
      setSuccess(true);
      setTimeout(() => onClose(), 1200);
    } catch (err: any) {
      setError(err.message || "Failed to add to dataset");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t("addToDatasetTitle")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          {success && (
            <Alert severity="success">Added to dataset successfully</Alert>
          )}
          {error && <Alert severity="error">{error}</Alert>}

          {loading ? (
            <CircularProgress size={24} />
          ) : (
            <FormControl fullWidth size="small">
              <InputLabel>{t("selectDataset")}</InputLabel>
              <Select
                value={selectedDataset}
                onChange={(e) => setSelectedDataset(e.target.value)}
                label={t("selectDataset")}
              >
                <MenuItem value={CREATE_NEW}>
                  <em>Create new dataset...</em>
                </MenuItem>
                {datasets.map((ds) => (
                  <MenuItem key={ds} value={ds}>
                    {ds}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          )}

          {selectedDataset === CREATE_NEW && (
            <TextField
              size="small"
              fullWidth
              label="Dataset file name"
              placeholder="e.g., my-golden-set.jsonl"
              value={newDatasetName}
              onChange={(e) => setNewDatasetName(e.target.value)}
              helperText="Saved in agentmark/datasets/"
            />
          )}

          <Stack spacing={1}>
            <Typography variant="subtitle2">Input</Typography>
            <TextField
              multiline
              minRows={4}
              maxRows={12}
              fullWidth
              value={inputJson}
              onChange={(e) => setInputJson(e.target.value)}
              InputProps={{
                sx: { fontFamily: "monospace", fontSize: "0.8rem" },
              }}
            />
          </Stack>

          <Stack spacing={1}>
            <Typography variant="subtitle2">Expected Output</Typography>
            <TextField
              multiline
              minRows={4}
              maxRows={12}
              fullWidth
              value={expectedOutputJson}
              onChange={(e) => setExpectedOutputJson(e.target.value)}
              InputProps={{
                sx: { fontFamily: "monospace", fontSize: "0.8rem" },
              }}
            />
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={submitting}>
          {t("cancel")}
        </Button>
        <Button
          variant="contained"
          onClick={handleSubmit}
          disabled={submitting || success}
          startIcon={submitting ? <CircularProgress size={16} /> : undefined}
        >
          {t("add")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};
