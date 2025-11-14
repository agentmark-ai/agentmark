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
    fetchEvaluationsCallback,
  } = useEvaluationContext();
  const { t, selectedSpan } = useTraceDrawerContext();

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

    if (fetchEvaluationsCallback) {
      await fetchEvaluationsCallback(selectedSpan?.id || "");
    }

    reset();
    handleClose();
  });

  const handleClose = () => {
    if (!isSubmitting) {
      reset();
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
      <FormProvider methods={methods} onSubmit={onSubmit}>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <RHFTextField
              name="name"
              label={t("annotationName")}
              placeholder={t("annotationNamePlaceholder")}
            />
            <RHFTextField
              name="label"
              label={t("annotationLabel")}
              placeholder={t("annotationLabelPlaceholder")}
            />
            <RHFTextField
              name="score"
              label={t("annotationScore")}
              type="number"
              inputProps={{ step: "0.01" }}
            />
            <RHFTextField
              name="reason"
              label={t("annotationReason")}
              placeholder={t("annotationReasonPlaceholder")}
              multiline
              minRows={3}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
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
    </Dialog>
  );
}
