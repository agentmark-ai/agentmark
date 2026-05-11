"use client";

import {
  Alert,
  Box,
  Button,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { useEffect, useMemo, useRef, useState } from "react";
// Import Iconify by its file path rather than via the components barrel —
// the barrel pulls in data-grid + codemirror, which fails to load under
// the jsdom test environment because of CSS side-effect imports.
import { Iconify } from "@/components/iconify";
import { buildRunPromptCommand } from "./build-cli-command";

export interface TestPromptDialogProps {
  open: boolean;
  onClose: () => void;
  /** Frontmatter `name` of the prompt this trace was generated from. */
  promptName: string;
  /** Template variables (`data.props`) — pre-fills the JSON editor. */
  initialProps: Record<string, unknown> | null;
  /**
   * Resolves a prompt name to a relative file path inside the agentmark
   * templates dir. The dialog handles loading + null states; resolvers
   * should not throw — return null to mean "not found."
   *
   * **Must be referentially stable** (module-level export or `useCallback`).
   * The resolution effect uses this function as a dep, so an inline arrow
   * will re-fire the resolver — and hammer the listing endpoint — on every
   * render of the host.
   */
  resolveFilePath?: (promptName: string) => Promise<string | null>;
  /**
   * Optional handler for "Open file." When provided AND a path resolved,
   * the button is enabled. The dialog closes after invocation.
   */
  onOpenFile?: (filePath: string) => void;
  t: (key: string) => string;
}

interface ResolvedFile {
  status: "idle" | "loading" | "resolved" | "missing" | "error";
  path: string | null;
}

/**
 * "Test prompt" dialog — pluggable replacement for the dashboard's
 * editor-routing flow. In OSS the user runs prompts via CLI, so the dialog
 * surfaces:
 *   1. The resolved prompt file path (or a "missing" state)
 *   2. An editable JSON props pane prefilled from the trace
 *   3. A copy-pasteable `agentmark run-prompt` command that updates live
 *   4. An optional "Open file" hook for editor integrations
 */
export function TestPromptDialog({
  open,
  onClose,
  promptName,
  initialProps,
  resolveFilePath,
  onOpenFile,
  t,
}: TestPromptDialogProps) {
  const initialPropsJson = useMemo(
    () => (initialProps ? JSON.stringify(initialProps, null, 2) : "{}"),
    [initialProps]
  );

  const [propsText, setPropsText] = useState(initialPropsJson);
  const [resolved, setResolved] = useState<ResolvedFile>({ status: "idle", path: null });
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState(false);
  // Track the in-flight feedback timeout so we can cancel it if the dialog
  // unmounts (or the user clicks Copy again before the previous tick fires).
  // Without this, a fast unmount-then-state-update would silently set state
  // on a torn-down tree.
  const copyFeedbackTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset editor + resolution state every time the dialog opens for a different
  // span. We key on `open` and `initialPropsJson` so reopening with the same
  // span doesn't blow away in-flight edits.
  useEffect(() => {
    if (!open) {
      setCopied(false);
      setCopyError(false);
      return;
    }
    setPropsText(initialPropsJson);
    setCopied(false);
    setCopyError(false);
  }, [open, initialPropsJson]);

  // Cancel any pending copy-feedback timer on unmount. (`open` flipping to
  // false unmounts the Dialog children in MUI, so this also covers the
  // close-while-feedback-showing case.)
  useEffect(() => {
    return () => {
      if (copyFeedbackTimeoutRef.current != null) {
        clearTimeout(copyFeedbackTimeoutRef.current);
        copyFeedbackTimeoutRef.current = null;
      }
    };
  }, []);

  // Resolve the prompt → file path. Tracks an `ignore` flag so a slow resolver
  // can't overwrite a newer dialog state if the user reopens with a different
  // prompt.
  useEffect(() => {
    if (!open) return;
    if (!resolveFilePath) {
      setResolved({ status: "idle", path: null });
      return;
    }

    let ignore = false;
    setResolved({ status: "loading", path: null });
    resolveFilePath(promptName)
      .then((path) => {
        if (ignore) return;
        if (path) {
          setResolved({ status: "resolved", path });
        } else {
          setResolved({ status: "missing", path: null });
        }
      })
      .catch(() => {
        if (ignore) return;
        setResolved({ status: "error", path: null });
      });

    return () => {
      ignore = true;
    };
  }, [open, promptName, resolveFilePath]);

  const parsedProps = useMemo<{ value: Record<string, unknown> | null; error: string | null }>(() => {
    const trimmed = propsText.trim();
    if (trimmed.length === 0) return { value: null, error: null };
    try {
      const value = JSON.parse(trimmed);
      if (value && typeof value === "object" && !Array.isArray(value)) {
        return { value: value as Record<string, unknown>, error: null };
      }
      return { value: null, error: t("testPromptInvalidJsonObject") };
    } catch {
      return { value: null, error: t("testPromptInvalidJson") };
    }
  }, [propsText, t]);

  const cliCommand = useMemo(
    () =>
      buildRunPromptCommand({
        filePath: resolved.path,
        props: parsedProps.value,
      }),
    [resolved.path, parsedProps.value]
  );

  const handleCopy = async () => {
    // Headless browsers and embedded webviews can deny clipboard write.
    // Treat a failure as a soft state — the command is still visible on
    // screen — instead of letting the rejection surface as a console error.
    if (typeof navigator === "undefined" || !navigator.clipboard) {
      setCopyError(true);
      return;
    }
    if (copyFeedbackTimeoutRef.current != null) {
      clearTimeout(copyFeedbackTimeoutRef.current);
      copyFeedbackTimeoutRef.current = null;
    }
    try {
      await navigator.clipboard.writeText(cliCommand);
      setCopied(true);
      setCopyError(false);
      copyFeedbackTimeoutRef.current = setTimeout(() => {
        setCopied(false);
        copyFeedbackTimeoutRef.current = null;
      }, 1500);
    } catch {
      setCopyError(true);
      copyFeedbackTimeoutRef.current = setTimeout(() => {
        setCopyError(false);
        copyFeedbackTimeoutRef.current = null;
      }, 2500);
    }
  };

  const handleOpenFile = () => {
    if (resolved.path && onOpenFile) {
      onOpenFile(resolved.path);
      onClose();
    }
  };

  const canOpenFile = !!onOpenFile && resolved.status === "resolved" && !!resolved.path;

  return (
    <Dialog open={open} onClose={onClose} maxWidth="md" fullWidth>
      <DialogTitle>{t("testPromptTitle")}</DialogTitle>
      <DialogContent>
        <Stack spacing={2.5} sx={{ mt: 1 }}>
          <Stack direction="row" spacing={1} alignItems="center">
            <Typography variant="subtitle2">{t("promptName")}:</Typography>
            <Chip size="small" label={promptName} />
          </Stack>

          <Stack spacing={0.5} data-testid="test-prompt-file-path">
            <Typography variant="subtitle2">{t("testPromptFile")}</Typography>
            {resolved.status === "loading" && (
              <Stack direction="row" spacing={1} alignItems="center">
                <CircularProgress size={16} />
                <Typography variant="body2" color="text.secondary">
                  {t("testPromptResolving")}
                </Typography>
              </Stack>
            )}
            {resolved.status === "resolved" && resolved.path && (
              <Typography
                variant="body2"
                sx={{ fontFamily: "monospace", wordBreak: "break-all" }}
              >
                {resolved.path}
              </Typography>
            )}
            {resolved.status === "missing" && (
              <Alert severity="warning" sx={{ py: 0.5 }}>
                {t("testPromptMissingFile")}
              </Alert>
            )}
            {resolved.status === "error" && (
              <Alert severity="error" sx={{ py: 0.5 }}>
                {t("testPromptResolveError")}
              </Alert>
            )}
            {resolved.status === "idle" && !resolveFilePath && (
              <Typography variant="body2" color="text.secondary">
                {t("testPromptNoResolver")}
              </Typography>
            )}
          </Stack>

          <Stack spacing={1}>
            <Typography variant="subtitle2">{t("testPromptProps")}</Typography>
            <TextField
              multiline
              minRows={4}
              maxRows={12}
              fullWidth
              value={propsText}
              onChange={(e) => setPropsText(e.target.value)}
              error={!!parsedProps.error}
              helperText={parsedProps.error ?? undefined}
              inputProps={{ "data-testid": "test-prompt-props-input" }}
              InputProps={{
                sx: { fontFamily: "monospace", fontSize: "0.8rem" },
              }}
            />
          </Stack>

          <Stack spacing={1}>
            <Stack direction="row" alignItems="center" justifyContent="space-between">
              <Typography variant="subtitle2">{t("testPromptCommand")}</Typography>
              <Tooltip
                title={
                  copyError
                    ? t("testPromptCopyFailed")
                    : copied
                    ? t("testPromptCopied")
                    : t("testPromptCopy")
                }
              >
                <IconButton
                  size="small"
                  onClick={handleCopy}
                  data-testid="test-prompt-copy"
                  aria-label={t("testPromptCopy")}
                >
                  <Iconify icon={copied ? "mdi:check" : "mdi:content-copy"} />
                </IconButton>
              </Tooltip>
            </Stack>
            <Box
              data-testid="test-prompt-cli"
              sx={{
                p: 1.5,
                borderRadius: 1,
                backgroundColor: "action.hover",
                fontFamily: "monospace",
                fontSize: "0.8rem",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
              }}
            >
              {cliCommand}
            </Box>
          </Stack>
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>{t("close")}</Button>
        {onOpenFile && (
          <Button
            variant="contained"
            disabled={!canOpenFile}
            onClick={handleOpenFile}
            data-testid="test-prompt-open-file"
          >
            {t("testPromptOpenFile")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
}
