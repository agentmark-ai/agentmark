import { useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Stack,
} from "@mui/material";
import { LoadingButton } from "@mui/lab";
import * as Yup from "yup";
import { yupResolver } from "@hookform/resolvers/yup";
import { useForm } from "react-hook-form";
import { useTraceDrawerContext } from "../../../trace-drawer-provider";
import { FormProvider, RHFTextField } from "@/components";
import { useEvaluationContext } from "./evaluation-provider";
import {
  SchemaAnnotationForm,
  type AnnotationEntry,
} from "./schema-annotation-form";

type Props = {
  saveAnnotation: (data: {
    name: string;
    label: string;
    score: number;
    reason: string;
    resourceId: string;
  }) => Promise<{
    hasError: boolean;
  }>;
};

export function AddAnnotationDialog({ saveAnnotation }: Props) {
  const {
    setOpenAddAnnotationDialog,
    openAddAnnotationDialog,
    scoreConfigs,
  } = useEvaluationContext();
  const { t, selectedSpan } = useTraceDrawerContext();

  const hasSchemaConfigs = scoreConfigs.length > 0;

  // State for schema-based annotations (batch save)
  const [pendingAnnotations, setPendingAnnotations] = useState<
    AnnotationEntry[]
  >([]);
  const [isSavingAll, setIsSavingAll] = useState(false);

  const handleAnnotationsChange = useCallback(
    (annotations: AnnotationEntry[]) => {
      setPendingAnnotations(annotations);
    },
    [],
  );

  const handleSaveAll = async () => {
    if (pendingAnnotations.length === 0) return;

    setIsSavingAll(true);
    const resourceId = selectedSpan?.id || "";

    let hasAnyError = false;
    for (const annotation of pendingAnnotations) {
      const result = await saveAnnotation({
        name: annotation.name,
        score: annotation.score,
        label: annotation.label,
        reason: annotation.reason,
        resourceId,
      });
      if (result.hasError) {
        hasAnyError = true;
        break;
      }
    }

    setIsSavingAll(false);

    if (!hasAnyError) {
      handleClose();
    }
  };

  // Free-form annotation (no schema configs)
  const Schema = Yup.object().shape({
    name: Yup.string().required(t("annotationValidationError")),
    label: Yup.string().required(t("annotationValidationError")),
    score: Yup.number()
      .required(t("annotationValidationError"))
      .typeError(t("annotationValidationError")),
    reason: Yup.string().required(t("annotationValidationError")),
  });

  const methods = useForm({
    resolver: yupResolver(Schema),
    defaultValues: {
      name: "",
      label: "",
      score: 0,
      reason: "",
    },
  });

  const {
    handleSubmit,
    reset,
    formState: { isSubmitting },
  } = methods;

  const onSubmit = handleSubmit(async (data) => {
    const result = await saveAnnotation({
      name: data.name,
      label: data.label,
      score: data.score,
      reason: data.reason,
      resourceId: selectedSpan?.id || "",
    });
    if (result?.hasError) {
      return;
    }

    reset();
    handleClose();
  });

  const handleClose = () => {
    if (!isSubmitting && !isSavingAll) {
      reset();
      setPendingAnnotations([]);
      setOpenAddAnnotationDialog(false);
    }
  };

  return (
    <Dialog
      open={openAddAnnotationDialog}
      onClose={handleClose}
      fullWidth
      maxWidth="sm"
    >
      <DialogTitle>{t("addAnnotationTitle")}</DialogTitle>
      {hasSchemaConfigs ? (
        <>
          <DialogContent dividers>
            <SchemaAnnotationForm
              scoreConfigs={scoreConfigs}
              onChange={handleAnnotationsChange}
              disabled={isSavingAll}
            />
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleClose} disabled={isSavingAll}>
              {t("annotationCancel")}
            </Button>
            <LoadingButton
              variant="contained"
              loading={isSavingAll}
              disabled={pendingAnnotations.length === 0}
              onClick={handleSaveAll}
            >
              {t("annotationSave")}
            </LoadingButton>
          </DialogActions>
        </>
      ) : (
        <FormProvider methods={methods} onSubmit={onSubmit}>
          <DialogContent>
            <Stack spacing={2.5} sx={{ pt: 1 }}>
              <RHFTextField
                name="name"
                label={t("annotationName")}
                placeholder={t("annotationNamePlaceholder")}

                size="small"
              />
              <RHFTextField
                name="label"
                label={t("annotationLabel")}
                placeholder={t("annotationLabelPlaceholder")}

                size="small"
              />
              <RHFTextField
                name="score"
                label={t("annotationScore")}
                type="number"
                slotProps={{ htmlInput: { step: "0.01" } }}

                size="small"
              />
              <RHFTextField
                name="reason"
                label={t("annotationReason")}
                placeholder={t("annotationReasonPlaceholder")}
                multiline
                minRows={3}

                size="small"
              />
            </Stack>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2 }}>
            <Button onClick={handleClose} disabled={isSubmitting}>
              {t("annotationCancel")}
            </Button>
            <LoadingButton
              type="submit"
              variant="contained"
              loading={isSubmitting}
            >
              {t("annotationSave")}
            </LoadingButton>
          </DialogActions>
        </FormProvider>
      )}
    </Dialog>
  );
}
