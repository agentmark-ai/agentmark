import { useState, useCallback, useEffect } from "react";
import {
  Stack,
  Typography,
  TextField,
  ToggleButtonGroup,
  ToggleButton,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Divider,
} from "@mui/material";
import {
  toStoredScore,
} from "@agentmark-ai/prompt-core";
import type {
  SerializedScoreConfig,
  ScoreSchema,
} from "@agentmark-ai/prompt-core";

export interface AnnotationEntry {
  name: string;
  score: number;
  label: string;
  reason: string;
  dataType: "boolean" | "numeric" | "categorical";
}

interface Props {
  scoreConfigs: SerializedScoreConfig[];
  onChange: (annotations: AnnotationEntry[]) => void;
  disabled?: boolean;
}

interface ConfigFormState {
  value: boolean | number | string | null;
  reason: string;
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

function isFilled(config: SerializedScoreConfig, state: ConfigFormState): boolean {
  switch (config.schema.type) {
    case "boolean":
      return state.value !== null;
    case "categorical":
      return !!state.value;
    case "numeric":
      return true;
    default:
      return false;
  }
}

function toAnnotationEntry(
  config: SerializedScoreConfig,
  state: ConfigFormState,
): AnnotationEntry | null {
  if (!isFilled(config, state)) return null;

  // Convert form state → EvalResult shape, then use shared storage conversion
  const evalResult = config.schema.type === "boolean"
    ? { passed: state.value as boolean, reason: state.reason }
    : config.schema.type === "numeric"
    ? { score: state.value as number, reason: state.reason }
    : config.schema.type === "categorical"
    ? { label: state.value as string, reason: state.reason }
    : null;

  if (!evalResult) return null;

  const stored = toStoredScore(config.schema, evalResult);
  return { name: config.name, ...stored };
}

function BooleanControl({
  value,
  onChange,
  disabled,
}: {
  value: boolean | null;
  onChange: (value: boolean) => void;
  disabled?: boolean;
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
      disabled={disabled}
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
  disabled,
}: {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
}) {
  return (
    <TextField
      type="number"
      label="Score"
      size="small"
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      slotProps={{
        htmlInput: { min, max, step: "0.01" },
      }}
      helperText={
        min !== undefined || max !== undefined
          ? `Range: ${min ?? "-inf"} to ${max ?? "+inf"}`
          : undefined
      }
      fullWidth
      disabled={disabled}
    />
  );
}

function CategoricalControl({
  value,
  onChange,
  categories,
  disabled,
}: {
  value: string;
  onChange: (value: string) => void;
  categories: Array<{ label: string; value: number }>;
  disabled?: boolean;
}) {
  return (
    <FormControl size="small" fullWidth disabled={disabled}>
      <InputLabel>Category</InputLabel>
      <Select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        label="Category"
      >
        {categories.map((category) => (
          <MenuItem key={category.label} value={category.label}>
            {category.label}
          </MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function ConfigFields({
  config,
  state,
  onStateChange,
  disabled,
}: {
  config: SerializedScoreConfig;
  state: ConfigFormState;
  onStateChange: (state: ConfigFormState) => void;
  disabled?: boolean;
}) {
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
          onChange={(val) => onStateChange({ ...state, value: val })}
          disabled={disabled}
        />
      )}

      {config.schema.type === "numeric" && (
        <NumericControl
          value={state.value as number}
          onChange={(val) => onStateChange({ ...state, value: val })}
          min={config.schema.min}
          max={config.schema.max}
          disabled={disabled}
        />
      )}

      {config.schema.type === "categorical" && (
        <CategoricalControl
          value={state.value as string}
          onChange={(val) => onStateChange({ ...state, value: val })}
          categories={config.schema.categories}
          disabled={disabled}
        />
      )}

      <TextField
        label="Reason"
        size="small"
        multiline
        minRows={2}
        value={state.reason}
        onChange={(e) =>
          onStateChange({ ...state, reason: e.target.value })
        }
        fullWidth
        disabled={disabled}
      />
    </Stack>
  );
}

export function SchemaAnnotationForm({
  scoreConfigs,
  onChange,
  disabled,
}: Props) {
  const [formStates, setFormStates] = useState<Record<string, ConfigFormState>>(
    () => {
      const initial: Record<string, ConfigFormState> = {};
      for (const config of scoreConfigs) {
        initial[config.name] = {
          value: getInitialValue(config.schema),
          reason: "",
        };
      }
      return initial;
    },
  );

  const computeAnnotations = useCallback(
    (states: Record<string, ConfigFormState>) => {
      const annotations: AnnotationEntry[] = [];
      for (const config of scoreConfigs) {
        const state = states[config.name];
        if (state) {
          const entry = toAnnotationEntry(config, state);
          if (entry) annotations.push(entry);
        }
      }
      return annotations;
    },
    [scoreConfigs],
  );

  useEffect(() => {
    onChange(computeAnnotations(formStates));
  }, [formStates, onChange, computeAnnotations]);

  const handleStateChange = useCallback(
    (configName: string, newState: ConfigFormState) => {
      setFormStates((prev) => ({
        ...prev,
        [configName]: newState,
      }));
    },
    [],
  );

  if (scoreConfigs.length === 0) {
    return null;
  }

  return (
    <Stack spacing={2} divider={<Divider flexItem />}>
      {scoreConfigs.map((config) => (
        <ConfigFields
          key={config.name}
          config={config}
          state={formStates[config.name] ?? { value: null, reason: '' }}
          onStateChange={(state) => handleStateChange(config.name, state)}
          disabled={disabled}
        />
      ))}
    </Stack>
  );
}
