import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Stack,
  Skeleton,
} from "@mui/material";
import { useTraceDrawerContext } from "../../../trace-drawer-provider";
import { useEvaluationContext } from "./evaluation-provider";

export const EvaluationSkeleton = () => {
  const { canAddAnnotation, isLoading, scores } = useEvaluationContext();
  const { t } = useTraceDrawerContext();

  if (!isLoading || scores.length > 0) {
    return null;
  }

  return (
    <Box>
      <Stack
        direction="row"
        justifyContent="space-between"
        alignItems="center"
        sx={{ mb: 1 }}
      >
        <Box />
        {canAddAnnotation && (
          <Skeleton variant="rounded" width={120} height={32} />
        )}
      </Stack>
      <TableContainer component={Paper} variant="outlined">
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>{t("evaluationName")}</TableCell>
              <TableCell>{t("evaluationScore")}</TableCell>
              <TableCell>{t("evaluationLabel")}</TableCell>
              <TableCell>{t("evaluationReason")}</TableCell>
              <TableCell width={120}>Source</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {Array.from({ length: 3 }).map((_, index) => (
              <TableRow key={index}>
                <TableCell>
                  <Skeleton variant="text" width="60%" />
                </TableCell>
                <TableCell>
                  <Skeleton variant="text" width="40%" />
                </TableCell>
                <TableCell>
                  <Skeleton variant="text" width="50%" />
                </TableCell>
                <TableCell>
                  <Skeleton variant="text" width="80%" />
                </TableCell>
                <TableCell>
                  <Skeleton variant="text" width="60%" />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
};
