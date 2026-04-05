import { useState } from "react";
import {
  Stack,
  Typography,
  TextField,
  Button,
  ToggleButtonGroup,
  ToggleButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
  CircularProgress,
} from "@mui/material";
import type {
  SerializedScoreConfig,
  ScoreSchema,
} from "@agentmark-ai/prompt-core";

interface Props {
  scoreConfigs: SerializedScoreConfig[];
  onSave: (data: {
    name: string;
    score: number;
    label: string;
    reason: string;
    resourceId: string;
  }) => Promise<{ hasError: boolean }>;
  resourceId: string;
}

interface ConfigFormState {
  value: boolean | number | string | null;
  reason: string;
  isSaving: boolean;
}

function getInitialValue(schema: ScoreSchema): boolean | number | string | null {
  switch (schema.type) {
    case "boolean":
      return null;
    case "numeric":
      return schema.min ?? 0;
    case "categorical":
      return "";
    default:
      return null;
  }
}

function BooleanControl({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (value: boolean) => void;
}) {
  const selected = value === null ? null : value ? "pass" : "fail";

  return (
    <ToggleButtonGroup
      exclusive
      value={selected}
      onChange={(_, newValue: string | null) => {
        if (newValue !== null) {
          onChange(newValue === "pass");
        }
      }}
      size="small"
    >
      <ToggleButton
        value="pass"
        sx={{
          "&.Mui-selected": {
            bgcolor: "success.main",
            color: "success.contrastText",
            "&:hover": { bgcolor: "success.dark" },
          },
        }}
      >
        Pass
      </ToggleButton>
      <ToggleButton
        value="fail"
        sx={{
          "&.Mui-selected": {
            bgcolor: "error.main",
            color: "error.contrastText",
            "&:hover": { bgcolor: "error.dark" },
          },
        }}
      >
        Fail
      </ToggleButton>
    </ToggleButtonGroup>
  );
}

function NumericControl({
  value,
  onChange,
  min,
  max,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <TextField
      type="number"
      label="Score"
      size="small"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      inputProps={{
        min,
        max,
        step: "0.01",
      }}
      helperText={
        min !== undefined || max !== undefined
          ? `Range: ${min ?? "-inf"} to ${max ?? "+inf"}`
          : undefined
      }
      fullWidth
    />
  );
}

function CategoricalControl({
  value,
  onChange,
  categories,
}: {
  value: string;
  onChange: (value: string) => void;
  categories: string[];
}) {
  return (
    <FormControl size="small" fullWidth>
      <InputLabel>Category</InputLabel>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        label="Category"
      >
        {categories.map((category) => (
          <MenuItem key={category} value={category}>
            {category}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function ConfigForm({
  config,
  onSave,
  resourceId,
}: {
  config: SerializedScoreConfig;
  onSave: Props["onSave"];
  resourceId: string;
}) {
  const [state, setState] = useState<ConfigFormState>({
    value: getInitialValue(config.schema),
    reason: "",
    isSaving: false,
  });

  const handleSave = async () => {
    let score: number;
    let label: string;

    switch (config.schema.type) {
      case "boolean": {
        if (state.value === null) return;
        const boolValue = state.value as boolean;
        score = boolValue ? 1 : 0;
        label = boolValue ? "PASS" : "FAIL";
        break;
      }
      case "numeric": {
        score = state.value as number;
        label = String(state.value);
        break;
      }
      case "categorical": {
        if (!state.value) return;
        score = 1;
        label = state.value as string;
        break;
      }
    }

    setState((prev) => ({ ...prev, isSaving: true }));

    const result = await onSave({
      name: config.name,
      score,
      label,
      reason: state.reason,
      resourceId,
    });

    setState((prev) => ({ ...prev, isSaving: false }));

    if (!result.hasError) {
      setState({
        value: getInitialValue(config.schema),
        reason: "",
        isSaving: false,
      });
    }
  };

  const isDisabled =
    state.isSaving ||
    (config.schema.type === "boolean" && state.value === null) ||
    (config.schema.type === "categorical" && !state.value);

  return (
    <Stack spacing={1.5}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <Typography variant="subtitle2">{config.name}</Typography>
        {config.description && (
          <Typography variant="caption" color="text.secondary">
            {config.description}
          </Typography>
        )}
      </Stack>

      {config.schema.type === "boolean" && (
        <BooleanControl
          value={state.value as boolean | null}
          onChange={(val) => setState((prev) => ({ ...prev, value: val }))}
        />
      )}

      {config.schema.type === "numeric" && (
        <NumericControl
          value={state.value as number}
          onChange={(val) => setState((prev) => ({ ...prev, value: val }))}
          min={config.schema.min}
          max={config.schema.max}
        />
      )}

      {config.schema.type === "categorical" && (
        <CategoricalControl
          value={state.value as string}
          onChange={(val) => setState((prev) => ({ ...prev, value: val }))}
          categories={config.schema.categories}
        />
      )}

      <TextField
        label="Reason"
        size="small"
        multiline
        minRows={2}
        value={state.reason}
        onChange={(e) =>
          setState((prev) => ({ ...prev, reason: e.target.value }))
        }
        fullWidth
      />

      <Stack direction="row" justifyContent="flex-end">
        <Button
          variant="contained"
          size="small"
          onClick={handleSave}
          disabled={isDisabled}
          startIcon={
            state.isSaving ? <CircularProgress size={16} /> : undefined
          }
        >
          Save
        </Button>
      </Stack>
    </Stack>
  );
}

export function SchemaAnnotationForm({
  scoreConfigs,
  onSave,
  resourceId,
}: Props) {
  if (scoreConfigs.length === 0) {
    return null;
  }

  return (
    <Stack spacing={2} divider={<Divider flexItem />}>
      {scoreConfigs.map((config) => (
        <ConfigForm
          key={config.name}
          config={config}
          onSave={onSave}
          resourceId={resourceId}
        />
      ))}
    </Stack>
  );
}
