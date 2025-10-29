import { Button } from "@mui/material";
import { useTraceDrawerContext } from "../../../trace-drawer-provider";
import { useEvaluationContext } from "./evaluation-provider";

export const AddAnnotations = () => {
  const { t } = useTraceDrawerContext();
  const { setOpenAddAnnotationDialog, canAddAnnotation } =
    useEvaluationContext();

  const handleAddAnnotation = () => {
    setOpenAddAnnotationDialog(true);
  };

  if (!canAddAnnotation) {
    return null;
  }

  return (
    <>
      <Button size="small" variant="outlined" onClick={handleAddAnnotation}>
        {t("addAnnotation")}
      </Button>
    </>
  );
};
